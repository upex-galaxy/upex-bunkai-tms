import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-202 — dedicated isolation guard for `bunkai_create_test_plan` /
// `bunkai_update_test_plan` (migration 0073_test_plans.sql), the mandatory
// DB-integration test per ADR-0012 / rpc-authorization.md §5 ("test against
// the real database, not a mock"). Mirrors
// `lib/milestones/milestone-rpc-isolation.test.ts`'s real-login fixture
// pattern.
//
// Both RPCs carry NO p_actor_user_id and no caller-supplied scope parameter
// (ADR-0012's preferred outcome — the class is removed by parameter removal,
// not defended against by a guard). auth.uid() is read inside the function,
// so there is nothing to spoof. A service-role caller's auth.uid() is NULL
// and always fails bunkai_can_write_workspace, so EVERY authorization case
// here goes through a REAL authenticated session
// (`supabase.auth.signInWithPassword` with the anon key, the declared
// `testing.automation_identity` — QA_E2E_USER_EMAIL / QA_E2E_USER_PASSWORD).
//
// This is deliberately NOT a fixture that seeds the `test_plans` table and
// reads it back — that would prove nothing about the path production takes.
// Every assertion below either calls the RPC through the real anon-signed-in
// session, or reads back through an INDEPENDENT service-role client to verify
// what the RPC actually persisted. In particular case (a) asserts on
// `activity_log.actor_user_id`, a column NO fixture in this file ever writes
// and which 18 migrations' worth of production RPCs are the only writers of.
// The one direct insert into `test_plans` is case (i)'s closed-plan seed,
// which models a state no shipped write path can produce yet — and it is
// labelled as such at the call site.
//
// Covers, at minimum:
//   (a) a real authenticated member+ create — persisted row is independently
//       readable, name AND goal are normalized (collapse-then-trim), status
//       is 'open', and activity_log.actor_user_id is the AUTHENTICATED
//       caller's own uid (test_plan.created payload).
//   (b) a Viewer-role member cannot create (forbidden, 42501) — AC 4.2/4.4.
//   (c) a caller who is not a member of the project's workspace at all
//       cannot create (forbidden, 42501 — p_project_id is URL-known, so no
//       404 disclosure gate here, mirroring bunkai_create_milestone).
//   (d) duplicate name, case-insensitive AND internal-whitespace-collapsed,
//       is rejected (23505) — AC 2.1 / 2.2.
//   (e) the SAME name in a DIFFERENT project succeeds — uniqueness is scoped
//       per project, not global (AC 2.3).
//   (f) name length bounds 100/101 and blank (45600), description bound
//       (45601), goal bound (45602) — AC 1.3 / 1.4 / 3.1.
//   (g) two concurrent creates of the same name resolve to exactly one
//       success and one 23505 — the race AC 2.6 describes, closed by the DB
//       index rather than an app-level check.
//   (h) update: rename into another plan's name is rejected (23505, AC 2.5)
//       while renaming a plan to the name it already holds succeeds
//       (self-exclusion); a member edits a plan ANOTHER member created
//       (AC 4.3).
//   (i) update: a Viewer cannot edit (42501); a non-member sees not_found
//       (P0002, non-disclosure); a non-open plan cannot be edited (45603).
//   (j) update: the activity payload is positively projected — only the
//       fields that actually changed appear.
//
// DB-dependent + fully env-gated (service AND real-login). Skips loudly when
// its env is missing, and logs + passes when seed state (or the login itself)
// cannot satisfy a precondition — never blocks a build on migration, seed
// state, or a QA fixture-account hiccup.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasFullEnv = Boolean(url && serviceKey && anonKey && qaEmail && qaPassword);
const describeOrSkip = hasFullEnv ? describe : describe.skip;

const CREATE_RPC = 'bunkai_create_test_plan';
const UPDATE_RPC = 'bunkai_update_test_plan';
const PREFIX = `bk202-plan-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface TestPlanJson {
  id: string
  project_id: string
  name: string
  description: string
  goal: string
  status: string
  created_by: string | null
  created_at: string
}
interface ActivityRow { actor_user_id: string | null, action: string, payload: Record<string, unknown> }
interface Fixture {
  workspaceId: string
  projectId: string
  otherProjectId: string
  qaUserId: string
  ownerUserId: string // real, valid, deliberately never a member of this workspace
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function create(anonClient: ReturnType<typeof service>, args: { projectId: string, name: string, description?: string, goal?: string }) {
  return anonClient.rpc(CREATE_RPC, {
    p_project_id: args.projectId,
    p_name: args.name,
    p_description: args.description ?? '',
    p_goal: args.goal ?? '',
  });
}

async function update(anonClient: ReturnType<typeof service>, args: { testPlanId: string, name: string, description?: string, goal?: string }) {
  return anonClient.rpc(UPDATE_RPC, {
    p_test_plan_id: args.testPlanId,
    p_name: args.name,
    p_description: args.description ?? '',
    p_goal: args.goal ?? '',
  });
}

// Grants QA_E2E the given role in the fixture workspace for the duration of
// `fn`, always revoking it again afterward — keeps every test self-contained
// regardless of execution order (mirrors milestone-rpc-isolation.test.ts).
async function withQaRole<T>(
  db: ReturnType<typeof service>,
  args: { workspaceId: string, userId: string, role: 'viewer' | 'member' },
  fn: () => Promise<T>,
): Promise<T> {
  const { error: grantError } = await db
    .from('workspace_members')
    .insert({ workspace_id: args.workspaceId, user_id: args.userId, role: args.role, status: 'active' });
  if (grantError) { throw grantError; }
  try {
    return await fn();
  }
  finally {
    await db.from('workspace_members').delete().eq('workspace_id', args.workspaceId).eq('user_id', args.userId);
  }
}

async function latestActivity(db: ReturnType<typeof service>, testPlanId: string, action: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('actor_user_id, action, payload')
    .eq('entity_type', 'test_plan')
    .eq('entity_id', testPlanId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { throw error; }
  return data as unknown as ActivityRow | null;
}

let fixture: Fixture | null = null;
let anon: ReturnType<typeof service> | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-202 — test plan RPC isolation (real auth write path, authz, normalization, uniqueness)', () => {
  beforeAll(async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`;
      return;
    }
    anon = client;
    const qaUserId = signIn.user.id;

    const db = service();

    // Is the RPC deployed? A nonexistent project always resolves to P0002
    // regardless of the caller's membership anywhere, so this is a safe probe
    // before any fixture exists.
    // A missing RPC is a DEPLOY defect, not a seed-state hiccup, so it FAILS
    // here rather than joining the soft-skip path. Letting it skip is exactly
    // the failure mode ADR-0012 §5 exists to close: the authorization gate
    // would report green against a database where the function it guards does
    // not exist.
    const probe = await anon.rpc(CREATE_RPC, { p_project_id: ZERO_UUID, p_name: 'probe' });
    if (probe.error && probe.error.code !== 'P0002') {
      throw new Error(
        `${CREATE_RPC} is not deployed (${probe.error.code ?? 'unknown'}: ${probe.error.message}). `
        + 'Apply migration 0073_test_plans.sql before running this suite.',
      );
    }

    // A real, valid user id, borrowed purely as the workspace's owner_user_id
    // value (never authenticated as), excluding QA_E2E's own id.
    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(20);
    if (membersError) { throw membersError; }
    const distinctIds = [...new Set((members ?? []).map(m => m.user_id as string))].filter(id => id !== qaUserId);
    if (distinctIds.length < 1) {
      skipReason = 'need at least 1 distinct real user id (other than QA_E2E) among active workspace members (seed state).';
      return;
    }
    const [ownerUserId] = distinctIds;

    // A dedicated throwaway workspace — this project's Supabase instance is
    // shared live infra across concurrent workers, and reusing a real busy
    // workspace would make "not a member of THIS workspace" unfalsifiable.
    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    // TWO projects in the same workspace — the second exists solely to prove
    // uniqueness is scoped per project rather than per workspace (AC 2.3).
    const { data: projects, error: projectError } = await db
      .from('projects')
      .insert([
        { workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` },
        { workspace_id: workspaceId, slug: `${PREFIX}-project-2`, name: `${PREFIX} project 2` },
      ])
      .select('id, slug')
      .order('slug', { ascending: true });
    if (projectError) { throw projectError; }
    if (!projects || projects.length !== 2) {
      skipReason = 'could not create the two throwaway projects the per-project uniqueness case needs.';
      return;
    }

    fixture = {
      workspaceId,
      projectId: projects[0].id as string,
      otherProjectId: projects[1].id as string,
      qaUserId,
      ownerUserId,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Cascades from workspaces (0001/0002/0073) cover projects/test_plans/
    // workspace_members/activity_log — deleting the throwaway workspace alone
    // is sufficient.
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  it('(a) a real authenticated member+ create is independently readable, name and goal normalized, activity_log records the AUTHENTICATED caller', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      // Internal whitespace (tabs + doubled spaces) must collapse to single
      // spaces after collapse-then-trim, on BOTH name and goal.
      const { data, error } = await create(anon!, {
        projectId: fixture!.projectId,
        name: `  ${PREFIX}\tRelease   2.4  regression `,
        description: 'Full regression before the 2.4 cut',
        goal: '  Release   2.4 ',
      });
      expect(error).toBeNull();
      const plan = data as unknown as TestPlanJson;
      expect(plan.name).toBe(`${PREFIX} Release 2.4 regression`);
      expect(plan.goal).toBe('Release 2.4');
      // A newly created plan always starts Open with no way to say otherwise.
      expect(plan.status).toBe('open');
      expect(plan.created_by).toBe(fixture!.qaUserId);

      // Independent read through a SEPARATE service-role client — proves the
      // RPC wrote the row production code actually reads, not merely that the
      // RPC's own return value looked right.
      const { data: row, error: rowError } = await db
        .from('test_plans')
        .select('id, project_id, workspace_id, name, description, goal, status, created_by')
        .eq('id', plan.id)
        .single();
      if (rowError) { throw rowError; }
      expect(row.name).toBe(`${PREFIX} Release 2.4 regression`);
      expect(row.project_id).toBe(fixture!.projectId);
      expect(row.workspace_id).toBe(fixture!.workspaceId);
      expect(row.description).toBe('Full regression before the 2.4 cut');
      expect(row.goal).toBe('Release 2.4');
      expect(row.status).toBe('open');
      expect(row.created_by).toBe(fixture!.qaUserId);

      const activity = await latestActivity(db, plan.id, 'test_plan.created');
      expect(activity).not.toBeNull();
      // There is no p_actor_user_id on this RPC at all — the only way
      // actor_user_id could be anything other than the REAL authenticated
      // caller's own uid is if the function read something other than
      // auth.uid(). This is the actor-bind property this suite exists to
      // prove, on a column no fixture here ever writes.
      expect(activity?.actor_user_id).toBe(fixture!.qaUserId);
      expect(activity?.payload.name).toBe(`${PREFIX} Release 2.4 regression`);
      expect(activity?.payload.goal).toBe('Release 2.4');

      await db.from('test_plans').delete().eq('id', plan.id);
    });
  });

  it('(b) a Viewer-role member cannot create (forbidden, 42501)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'viewer' }, async () => {
      const { data, error } = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}-viewer-blocked` });
      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();

      // And nothing was written — the gate is not merely a returned error.
      // Scoped to the attempted NAME, not to the whole project: a
      // project-wide count would turn any earlier test's cleanup failure into
      // a misleading failure here.
      const { count } = await db
        .from('test_plans')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', fixture!.projectId)
        .eq('name', `${PREFIX}-viewer-blocked`);
      expect(count ?? 0).toBe(0);
    });
  });

  it('(c) a caller who is not a member of the project\'s workspace at all cannot create (forbidden, 42501)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // Sanity: QA_E2E must genuinely be a non-member here.
    const { data: existing, error: existingError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', fixture.qaUserId)
      .maybeSingle();
    if (existingError) { throw existingError; }
    if (existing) {
      console.warn('[test-plan-rpc-isolation] skipped (c): QA_E2E identity unexpectedly already a member of the throwaway workspace.');
      return;
    }

    const { data, error } = await create(anon, { projectId: fixture.projectId, name: `${PREFIX}-nonmember-blocked` });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('(d) a duplicate name (case-insensitive, internal-whitespace-collapsed, space-padded) is rejected (23505)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const first = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX} Smoke pass` });
      expect(first.error).toBeNull();
      const firstId = (first.data as unknown as TestPlanJson).id;

      // AC 2.1 — differs only by case.
      const byCase = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX} SMOKE PASS` });
      expect(byCase.error?.code).toBe('23505');
      expect(byCase.data).toBeNull();

      // AC 2.2 — differs only by leading/trailing padding, proving the trim
      // rule applies to the uniqueness check itself and not only to the
      // min-length check.
      const byPadding = await create(anon!, { projectId: fixture!.projectId, name: `   ${PREFIX} Smoke pass   ` });
      expect(byPadding.error?.code).toBe('23505');
      expect(byPadding.data).toBeNull();

      // Internal whitespace doubling collapses to the same stored value too.
      const byInternal = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}  Smoke    pass` });
      expect(byInternal.error?.code).toBe('23505');

      await db.from('test_plans').delete().eq('id', firstId);
    });
  });

  it('(e) the same name in a DIFFERENT project succeeds — uniqueness is scoped per project (AC 2.3)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const name = `${PREFIX} Shared name`;
      const first = await create(anon!, { projectId: fixture!.projectId, name });
      expect(first.error).toBeNull();

      const second = await create(anon!, { projectId: fixture!.otherProjectId, name });
      expect(second.error).toBeNull();
      const secondPlan = second.data as unknown as TestPlanJson;
      expect(secondPlan.project_id).toBe(fixture!.otherProjectId);
      expect(secondPlan.name).toBe(name);

      await db.from('test_plans').delete().eq('id', (first.data as unknown as TestPlanJson).id);
      await db.from('test_plans').delete().eq('id', secondPlan.id);
    });
  });

  it('(f) name, description and goal length bounds are enforced (45600 / 45601 / 45602)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      // AC 1.3 — exactly 100 is accepted, the upper bound is inclusive.
      const atBound = await create(anon!, { projectId: fixture!.projectId, name: 'x'.repeat(100) });
      expect(atBound.error).toBeNull();
      expect((atBound.data as unknown as TestPlanJson).name).toHaveLength(100);
      await db.from('test_plans').delete().eq('id', (atBound.data as unknown as TestPlanJson).id);

      // AC 1.4 — 101 is rejected.
      const tooLongName = await create(anon!, { projectId: fixture!.projectId, name: 'x'.repeat(101) });
      expect(tooLongName.error?.code).toBe('45600');
      expect(tooLongName.data).toBeNull();

      // AC 3.1 / 3.3 — whitespace-only (spaces, and tab/newline) is blank.
      for (const blank of ['   ', '\t\n']) {
        const emptyName = await create(anon!, { projectId: fixture!.projectId, name: blank });
        expect(emptyName.error?.code).toBe('45600');
        expect(emptyName.data).toBeNull();
      }

      // AC 1.5 — a name that trims to exactly one character is accepted and
      // stored trimmed.
      const oneChar = await create(anon!, { projectId: fixture!.projectId, name: ' A ' });
      expect(oneChar.error).toBeNull();
      expect((oneChar.data as unknown as TestPlanJson).name).toBe('A');
      await db.from('test_plans').delete().eq('id', (oneChar.data as unknown as TestPlanJson).id);

      const tooLongDescription = await create(anon!, {
        projectId: fixture!.projectId,
        name: `${PREFIX}-desc-bound`,
        description: 'x'.repeat(501),
      });
      expect(tooLongDescription.error?.code).toBe('45601');
      expect(tooLongDescription.data).toBeNull();

      const tooLongGoal = await create(anon!, {
        projectId: fixture!.projectId,
        name: `${PREFIX}-goal-bound`,
        goal: 'x'.repeat(101),
      });
      expect(tooLongGoal.error?.code).toBe('45602');
      expect(tooLongGoal.data).toBeNull();
    });
  });

  it('(g) two concurrent creates of the same name resolve to exactly one success and one 23505 (AC 2.6)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const name = `${PREFIX} Regression X`;
      // Fired without awaiting in between — the unique index, not an
      // app-level check, is what makes the outcome deterministic.
      const [a, b] = await Promise.all([
        create(anon!, { projectId: fixture!.projectId, name }),
        create(anon!, { projectId: fixture!.projectId, name }),
      ]);

      const succeeded = [a, b].filter(r => r.error === null);
      const conflicted = [a, b].filter(r => r.error?.code === '23505');
      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(1);

      // And exactly one row exists, not two.
      const { count } = await db
        .from('test_plans')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', fixture!.projectId)
        .eq('name', name);
      expect(count).toBe(1);

      await db.from('test_plans').delete().eq('id', (succeeded[0].data as unknown as TestPlanJson).id);
    });
  });

  it('(h) update: renaming into another plan\'s name is rejected (23505, AC 2.5); renaming to its own name succeeds (self-exclusion); a member edits a plan another member created (AC 4.3)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const takenName = `${PREFIX} Release 2.4 regression`;
      const taken = await create(anon!, { projectId: fixture!.projectId, name: takenName });
      expect(taken.error).toBeNull();

      const mineName = `${PREFIX} Smoke pass`;
      const mine = await create(anon!, { projectId: fixture!.projectId, name: mineName });
      expect(mine.error).toBeNull();
      const minePlan = mine.data as unknown as TestPlanJson;

      // AC 2.5 — rename collision uses the SAME case-insensitive rule as
      // create, through the same index.
      const collision = await update(anon!, { testPlanId: minePlan.id, name: takenName.toLowerCase() });
      expect(collision.error?.code).toBe('23505');
      expect(collision.data).toBeNull();

      // Self-exclusion: renaming a row to the value it already holds is not a
      // conflict, because it is the same row. No app-layer guard does this.
      const noop = await update(anon!, { testPlanId: minePlan.id, name: mineName, description: 'Updated for sprint 12' });
      expect(noop.error).toBeNull();
      expect((noop.data as unknown as TestPlanJson).description).toBe('Updated for sprint 12');

      // AC 4.3 — `created_by` is never an authorization input. Reassign the
      // row's creator to somebody else entirely and the same member still
      // edits it.
      await db.from('test_plans').update({ created_by: fixture!.ownerUserId }).eq('id', minePlan.id);
      const otherOwnersEdit = await update(anon!, { testPlanId: minePlan.id, name: mineName, description: 'Edited by a non-creator' });
      expect(otherOwnersEdit.error).toBeNull();
      expect((otherOwnersEdit.data as unknown as TestPlanJson).description).toBe('Edited by a non-creator');

      await db.from('test_plans').delete().eq('id', minePlan.id);
      await db.from('test_plans').delete().eq('id', (taken.data as unknown as TestPlanJson).id);
    });
  });

  it('(i) update: a Viewer cannot edit (42501); a non-member sees not_found (P0002); a non-open plan cannot be edited (45603)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    let planId = '';
    const name = `${PREFIX}-edit-authz`;
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const created = await create(anon!, { projectId: fixture!.projectId, name });
      expect(created.error).toBeNull();
      planId = (created.data as unknown as TestPlanJson).id;
    });

    // Non-member (QA_E2E currently holds no role at all in this workspace) —
    // not_found, indistinguishable from an absent row, never "forbidden".
    const notFound = await update(anon, { testPlanId: planId, name });
    expect(notFound.error?.code).toBe('P0002');
    expect(notFound.data).toBeNull();

    // Viewer — distinct forbidden, never confused with the non-member's
    // not-found (AC 4.4).
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'viewer' }, async () => {
      const forbidden = await update(anon!, { testPlanId: planId, name });
      expect(forbidden.error?.code).toBe('42501');
      expect(forbidden.data).toBeNull();
    });

    // The edit-while-open guard. Nothing BK-202 ships can close a plan, so
    // this state is seeded directly through the service-role client — it
    // models what Close (the sibling story) will produce, and proves the
    // guard exists BEFORE that story can forget it.
    await db.from('test_plans').update({ status: 'closed' }).eq('id', planId);
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const closed = await update(anon!, { testPlanId: planId, name, description: 'should not persist' });
      expect(closed.error?.code).toBe('45603');
      expect(closed.data).toBeNull();
    });
    const { data: unchanged } = await db.from('test_plans').select('description').eq('id', planId).single();
    expect(unchanged?.description).toBe('');

    await db.from('test_plans').delete().eq('id', planId);
  });

  it('(j) update: the activity payload is positively projected — only the fields that actually changed appear', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    let planId = '';
    const name = `${PREFIX}-projection`;
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const created = await create(anon!, { projectId: fixture!.projectId, name, description: 'same', goal: 'R1' });
      expect(created.error).toBeNull();
      planId = (created.data as unknown as TestPlanJson).id;

      // Only the goal changes.
      const { data, error } = await update(anon!, { testPlanId: planId, name, description: 'same', goal: 'R2' });
      expect(error).toBeNull();
      expect((data as unknown as TestPlanJson).goal).toBe('R2');
    });

    const activity = await latestActivity(db, planId, 'test_plan.updated');
    expect(activity).not.toBeNull();
    expect(activity?.actor_user_id).toBe(fixture.qaUserId);
    expect(activity?.payload.goal).toBe('R2');
    expect(activity?.payload.name).toBeUndefined();
    expect(activity?.payload.description).toBeUndefined();

    await db.from('test_plans').delete().eq('id', planId);
  });
  it('(k) RLS scopes the READ: a non-member\'s own session sees none of the project\'s plans, while a member sees them', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    let planId = '';
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const created = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}-read-scope` });
      expect(created.error).toBeNull();
      planId = (created.data as unknown as TestPlanJson).id;

      // A member DOES see it through their own RLS-scoped session — without
      // this half, the non-member assertion below would also pass against a
      // table that is simply empty or unreadable by everyone.
      const visible = await anon!.from('test_plans').select('id').eq('project_id', fixture!.projectId);
      expect(visible.error).toBeNull();
      expect((visible.data ?? []).map(r => r.id)).toContain(planId);
    });

    // Same session, no longer a member of that workspace: the rows vanish.
    const hidden = await anon.from('test_plans').select('id').eq('project_id', fixture.projectId);
    expect(hidden.error).toBeNull();
    expect(hidden.data ?? []).toHaveLength(0);

    await db.from('test_plans').delete().eq('id', planId);
  });

  it('(l) the table is default-deny on DIRECT writes: a member+ cannot INSERT, UPDATE or DELETE through PostgREST, only through the RPCs', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    let planId = '';
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const created = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}-direct-write` });
      expect(created.error).toBeNull();
      planId = (created.data as unknown as TestPlanJson).id;

      // `authenticated` holds INSERT/UPDATE/DELETE grants on every public
      // table by Supabase default, so the ONLY thing standing between a
      // member and a direct write is the absence of a write policy. That is
      // the property this case pins: without it, a member could set
      // status='closed' with no verdict and no activity_log row, and could
      // plant a row whose project_id belongs to a workspace they cannot see.
      const directInsert = await anon!.from('test_plans').insert({
        workspace_id: fixture!.workspaceId,
        project_id: fixture!.projectId,
        name: `${PREFIX}-direct-insert`,
      });
      expect(directInsert.error).not.toBeNull();

      const directClose = await anon!.from('test_plans').update({ status: 'closed' }).eq('id', planId);
      // PostgREST reports an RLS-filtered UPDATE as a no-op rather than an
      // error, so the assertion is on the STORED value, not on the response.
      expect(directClose.error).toBeNull();

      const directDelete = await anon!.from('test_plans').delete().eq('id', planId);
      expect(directDelete.error).toBeNull();

      const { data: after } = await db
        .from('test_plans')
        .select('id, status')
        .eq('id', planId)
        .maybeSingle();
      expect(after).not.toBeNull();
      expect(after?.status).toBe('open');

      const { count: plantedCount } = await db
        .from('test_plans')
        .select('id', { count: 'exact', head: true })
        .eq('name', `${PREFIX}-direct-insert`);
      expect(plantedCount ?? 0).toBe(0);
    });

    await db.from('test_plans').delete().eq('id', planId);
  });
});

// The suite never fails on seed state / login — it says why and passes. A
// MISSING MIGRATION is the deliberate exception and throws (see beforeAll).
function warn() {
  console.warn(`[test-plan-rpc-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
