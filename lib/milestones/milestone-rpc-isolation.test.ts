import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-205 Slice 1 — dedicated isolation guard for `bunkai_create_milestone` /
// `bunkai_update_milestone` (migration 0064_milestones.sql), the mandatory
// DB-integration test per ADR-0012 / rpc-authorization.md §5 ("test against
// the real database, not a mock"). Mirrors
// `lib/bugs/assign-bug-isolation.test.ts`'s real-login fixture pattern.
//
// Both RPCs carry NO p_actor_user_id (Tech Lead Decision — ADR-0012's
// preferred outcome, mirrors 0023_module_activity_log.sql) — auth.uid() is
// read directly, so there is nothing to spoof. A service-role caller's
// auth.uid() is NULL and always fails bunkai_can_write_workspace, so EVERY
// case here goes through a REAL authenticated session
// (`supabase.auth.signInWithPassword` with the anon key, the declared
// `testing.automation_identity` — QA_E2E_USER_EMAIL / QA_E2E_USER_PASSWORD).
// This is deliberately NOT a fixture that seeds the `milestones` table
// directly and only reads it back — that would prove nothing about the RPC
// production code path actually writes. Every assertion below either calls
// the RPC through the real anon-signed-in session, or reads the row back
// through an INDEPENDENT service-role client to verify what the RPC actually
// persisted.
//
// Covers, at minimum:
//   (a) a real authenticated member+ create — persisted row is independently
//       readable, name is normalized (collapse-then-trim), and
//       activity_log.actor_user_id is the AUTHENTICATED caller's own uid
//       (milestone.created payload).
//   (b) a Viewer-role member cannot create (forbidden, 42501).
//   (c) a caller who is not a member of the project's workspace at all
//       cannot create (forbidden, 42501 — p_project_id is URL-known, so no
//       404 disclosure gate here, mirrors bunkai_create_environment).
//   (d) duplicate name (case-insensitive, internal-whitespace-collapsed) is
//       rejected (23505).
//   (e) name length bounds (45500) and description length bound (45501).
//   (f) target date in the past is rejected on create (45502); more than 5
//       years out is rejected (45503).
//   (g) update: a Viewer cannot edit (42501); a non-member sees not_found
//       (P0002, non-disclosure, distinct from (b)'s forbidden).
//   (h) update: editing ONLY the description of a past-dated milestone
//       succeeds (the date-bounds guard fires ONLY when target_date actually
//       changes) — proves the "distinct from" guard, not just its absence.
//   (i) update: moving the target date bumps milestone.updated with a
//       positive-projected payload containing ONLY the changed field.
//
// DB-dependent + fully env-gated (service AND real-login). Skips loudly when
// its env is missing, and logs + passes when seed state (or the login
// itself) cannot satisfy a precondition — never blocks a build on migration,
// seed state, or a QA fixture-account hiccup.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasFullEnv = Boolean(url && serviceKey && anonKey && qaEmail && qaPassword);
const describeOrSkip = hasFullEnv ? describe : describe.skip;

const CREATE_RPC = 'bunkai_create_milestone';
const UPDATE_RPC = 'bunkai_update_milestone';
const PREFIX = `bk205-milestone-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface MilestoneJson {
  id: string
  project_id: string
  name: string
  target_date: string
  description: string
  created_by: string | null
  created_at: string
}
interface ActivityRow { actor_user_id: string | null, action: string, payload: Record<string, unknown> }
interface Fixture {
  workspaceId: string
  projectId: string
  qaUserId: string
  ownerUserId: string // real, valid, deliberately never a member of this workspace
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

async function create(anon: ReturnType<typeof service>, args: { projectId: string, name: string, targetDate: string, description?: string }) {
  return anon.rpc(CREATE_RPC, {
    p_project_id: args.projectId,
    p_name: args.name,
    p_target_date: args.targetDate,
    p_description: args.description ?? '',
  });
}

async function update(anon: ReturnType<typeof service>, args: { milestoneId: string, name: string, targetDate: string, description?: string }) {
  return anon.rpc(UPDATE_RPC, {
    p_milestone_id: args.milestoneId,
    p_name: args.name,
    p_target_date: args.targetDate,
    p_description: args.description ?? '',
  });
}

// Grants QA_E2E the given role in the fixture workspace for the duration of
// `fn`, always revoking it again afterward — keeps every test self-contained
// regardless of execution order (mirrors assign-bug-isolation.test.ts).
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

async function latestActivity(db: ReturnType<typeof service>, milestoneId: string, action: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('actor_user_id, action, payload')
    .eq('entity_type', 'milestone')
    .eq('entity_id', milestoneId)
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

describeOrSkip('BK-205 — milestone RPC isolation (real auth write path, authz, normalization, date bounds)', () => {
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
    const probe = await anon.rpc(CREATE_RPC, { p_project_id: ZERO_UUID, p_name: 'probe', p_target_date: isoDate(1) });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `${CREATE_RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0064_milestones.sql.`;
      return;
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

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }

    fixture = {
      workspaceId,
      projectId: project.id as string,
      qaUserId,
      ownerUserId,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Cascades from workspaces (0001/0002/0064) cover projects/milestones/
    // workspace_members/activity_log — deleting the throwaway workspace alone
    // is sufficient.
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  it('(a) a real authenticated member+ create is independently readable, name normalized, activity_log records the AUTHENTICATED caller', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const targetDate = isoDate(30);
      // Internal whitespace (tabs + doubled spaces) must collapse to single
      // spaces AFTER trim-order (collapse then trim) — Tech Lead Decision 2.
      const { data, error } = await create(anon!, {
        projectId: fixture!.projectId,
        name: `  ${PREFIX}\tRelease   2.4  `,
        targetDate,
        description: 'Second summer cut',
      });
      expect(error).toBeNull();
      const milestone = data as unknown as MilestoneJson;
      expect(milestone.name).toBe(`${PREFIX} Release 2.4`);
      expect(milestone.target_date).toBe(targetDate);
      expect(milestone.created_by).toBe(fixture!.qaUserId);

      // Independent read through a SEPARATE service-role client — proves the
      // RPC wrote the row production code actually reads, not merely that
      // the RPC's own return value looked right.
      const { data: row, error: rowError } = await db
        .from('milestones')
        .select('id, project_id, name, target_date, description, created_by')
        .eq('id', milestone.id)
        .single();
      if (rowError) { throw rowError; }
      expect(row.name).toBe(`${PREFIX} Release 2.4`);
      expect(row.project_id).toBe(fixture!.projectId);
      expect(row.description).toBe('Second summer cut');
      expect(row.created_by).toBe(fixture!.qaUserId);

      const activity = await latestActivity(db, milestone.id, 'milestone.created');
      expect(activity).not.toBeNull();
      // There is no p_actor_user_id on this RPC at all — the only way
      // actor_user_id could be anything other than the REAL authenticated
      // caller's own uid is if the function read something other than
      // auth.uid(). This is the actor-bind property this suite exists to prove.
      expect(activity?.actor_user_id).toBe(fixture!.qaUserId);
      expect(activity?.payload.name).toBe(`${PREFIX} Release 2.4`);
      expect(activity?.payload.target_date).toBe(targetDate);

      await db.from('milestones').delete().eq('id', milestone.id);
    });
  });

  it('(b) a Viewer-role member cannot create (forbidden, 42501)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'viewer' }, async () => {
      const { data, error } = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}-viewer-blocked`, targetDate: isoDate(10) });
      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
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
      console.warn('[milestone-rpc-isolation] skipped (c): QA_E2E identity unexpectedly already a member of the throwaway workspace.');
      return;
    }

    const { data, error } = await create(anon, { projectId: fixture.projectId, name: `${PREFIX}-nonmember-blocked`, targetDate: isoDate(10) });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('(d) a duplicate name (case-insensitive, internal-whitespace-collapsed) is rejected (23505)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const first = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX} Dup Release`, targetDate: isoDate(5) });
      expect(first.error).toBeNull();
      const firstId = (first.data as unknown as MilestoneJson).id;

      // Differs only by case AND internal whitespace doubling — still a duplicate.
      const dup = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}  DUP   RELEASE`, targetDate: isoDate(6) });
      expect(dup.error?.code).toBe('23505');
      expect(dup.data).toBeNull();

      await db.from('milestones').delete().eq('id', firstId);
    });
  });

  it('(e) name length and description length bounds are enforced (45500 / 45501)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const tooLongName = await create(anon!, { projectId: fixture!.projectId, name: 'x'.repeat(101), targetDate: isoDate(5) });
      expect(tooLongName.error?.code).toBe('45500');
      expect(tooLongName.data).toBeNull();

      const emptyName = await create(anon!, { projectId: fixture!.projectId, name: '   ', targetDate: isoDate(5) });
      expect(emptyName.error?.code).toBe('45500');
      expect(emptyName.data).toBeNull();

      const tooLongDescription = await create(anon!, {
        projectId: fixture!.projectId,
        name: `${PREFIX}-desc-bound`,
        targetDate: isoDate(5),
        description: 'x'.repeat(501),
      });
      expect(tooLongDescription.error?.code).toBe('45501');
      expect(tooLongDescription.data).toBeNull();
    });
  });

  it('(f) target date in the past is rejected on create (45502); more than 5 years out is rejected (45503)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const past = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}-past-date`, targetDate: isoDate(-1) });
      expect(past.error?.code).toBe('45502');
      expect(past.data).toBeNull();

      const farFuture = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}-far-future`, targetDate: isoDate(365 * 5 + 30) });
      expect(farFuture.error?.code).toBe('45503');
      expect(farFuture.data).toBeNull();
    });
  });

  it('(g) update: a Viewer cannot edit (42501); a non-member sees not_found (P0002, non-disclosure, distinct from Viewer\'s forbidden)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    let milestoneId = '';
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const created = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}-edit-authz`, targetDate: isoDate(20) });
      expect(created.error).toBeNull();
      milestoneId = (created.data as unknown as MilestoneJson).id;
    });

    // Non-member (QA_E2E currently holds no role at all in this workspace).
    const notFound = await update(anon, { milestoneId, name: `${PREFIX}-edit-authz`, targetDate: isoDate(20) });
    expect(notFound.error?.code).toBe('P0002');
    expect(notFound.data).toBeNull();

    // Viewer — distinct forbidden, never confused with the non-member's not-found.
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'viewer' }, async () => {
      const forbidden = await update(anon!, { milestoneId, name: `${PREFIX}-edit-authz`, targetDate: isoDate(20) });
      expect(forbidden.error?.code).toBe('42501');
      expect(forbidden.data).toBeNull();
    });

    await db.from('milestones').delete().eq('id', milestoneId);
  });

  it('(h) update: editing ONLY the description of a past-dated milestone succeeds — the date-bounds guard fires only when target_date actually changes', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // Seed a past-dated milestone directly (the create RPC itself refuses a
    // past date — this fixture models a milestone that has become past-dated
    // by the simple passage of time, exactly the scenario business-rules.md
    // requires to stay editable).
    const { data: seeded, error: seedError } = await db
      .from('milestones')
      .insert({
        workspace_id: fixture.workspaceId,
        project_id: fixture.projectId,
        name: `${PREFIX} Past Dated`,
        target_date: isoDate(-10),
        description: 'original',
        created_by: fixture.ownerUserId,
      })
      .select('id, target_date')
      .single();
    if (seedError) { throw seedError; }

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      // Same (unchanged) past target_date, only the description differs.
      const { data, error } = await update(anon!, {
        milestoneId: seeded.id as string,
        name: `${PREFIX} Past Dated`,
        targetDate: seeded.target_date as string,
        description: 'updated description',
      });
      expect(error).toBeNull();
      const milestone = data as unknown as MilestoneJson;
      expect(milestone.description).toBe('updated description');
      expect(milestone.target_date).toBe(seeded.target_date);
    });

    await db.from('milestones').delete().eq('id', seeded.id as string);
  });

  it('(i) update: moving the target date bumps milestone.updated with a positive-projected payload containing ONLY the changed field', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    let milestoneId = '';
    const originalDate = isoDate(15);
    const newDate = isoDate(45);
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const created = await create(anon!, { projectId: fixture!.projectId, name: `${PREFIX}-replan`, targetDate: originalDate, description: 'same' });
      expect(created.error).toBeNull();
      milestoneId = (created.data as unknown as MilestoneJson).id;

      const { data, error } = await update(anon!, { milestoneId, name: `${PREFIX}-replan`, targetDate: newDate, description: 'same' });
      expect(error).toBeNull();
      expect((data as unknown as MilestoneJson).target_date).toBe(newDate);
    });

    const activity = await latestActivity(db, milestoneId, 'milestone.updated');
    expect(activity).not.toBeNull();
    expect(activity?.actor_user_id).toBe(fixture.qaUserId);
    // Positive projection: ONLY target_date changed, so ONLY target_date is
    // in the payload — name/description (unchanged) must be absent, never a
    // blanket copy of the whole row.
    expect(activity?.payload.target_date).toBe(newDate);
    expect(activity?.payload.name).toBeUndefined();
    expect(activity?.payload.description).toBeUndefined();

    await db.from('milestones').delete().eq('id', milestoneId);
  });
});

// The suite never fails on missing migration / seed state / login — it says
// why and passes.
function warn() {
  console.warn(`[milestone-rpc-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
