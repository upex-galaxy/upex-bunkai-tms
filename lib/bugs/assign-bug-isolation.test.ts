import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-264 Slice 1 — dedicated isolation guard for `bunkai_assign_bug`
// (migration 0054_bug_assignment_status.sql), the mandatory DB-integration
// test per ADR-0012 / rpc-authorization.md §5 ("test against the real
// database, not a mock"). Mirrors `lib/bugs/list-isolation.test.ts`'s
// dedicated-throwaway-workspace fixture pattern (safer than reusing an
// existing live workspace on this shared project).
//
// `bunkai_assign_bug` carries NO p_actor_user_id (Decision 1, ADR-0012's
// preferred outcome, mirrors 0023_module_activity_log.sql) — auth.uid() is
// read directly, so there is nothing to spoof. This means EVERY call under
// test (not only an actor-bind case) must go through a REAL authenticated
// session: a service-role caller's auth.uid() is NULL, which always fails
// bunkai_can_write_workspace, AND the function's `grant execute` goes to
// `authenticated` only, not `service_role` (service-role literally lacks
// EXECUTE on this function). There is therefore no service-role-only subset
// of this suite the way BK-40/BK-41's bugs isolation tests have — the whole
// describe block is gated on the real-login env, not just the service env.
//
// Covers, at minimum, the properties this slice's briefing calls mandatory:
//   (a) a caller who is not even a member of the bug's workspace is rejected
//       with the SAME not-found used for a missing bug (non-disclosure) —
//       proves the bunkai_is_workspace_member gate is checked BEFORE the
//       write-role gate, not folded into one generic 42501.
//   (b) a member with only Viewer-level access cannot assign a bug —
//       DISTINCT forbidden (42501), never confused with (a)'s not-found.
//   (c) assigning to a real, valid user id who is NOT a member of the bug's
//       own workspace is rejected (45312) even though the id itself is a
//       genuine, existing user — the eligibility check is scoped to THIS
//       workspace, not "is a member of some workspace anywhere".
//   (d) assigning to an active member whose role is 'viewer' is rejected
//       (45313) — distinct from (c)'s "not a member at all".
//   (e) a legitimate assign succeeds and activity_log.actor_user_id is the
//       AUTHENTICATED caller's own uid — there is no caller-supplied actor
//       parameter to spoof, so this proves auth.uid() (not any client input)
//       is what lands in the audit row.
//   (f) reassigning to a different eligible member updates the assignee and
//       records bug.reassigned with {previous_assignee_user_id, assignee_user_id}.
//   (g) unassigning clears the assignee and records bug.unassigned.
//   (h) repeated identical assign is a silent no-op — no duplicate
//       activity_log row (mirrors 0023's no-op convention).
//
// The real-login case authenticates through the app's REAL, sanctioned login
// path — `supabase.auth.signInWithPassword` with the anon key, using the
// already-declared automation identity (`QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD`, see `.agents/project.yaml` ->
// `testing.automation_identity`) — never a locally-minted JWT and never a
// borrowed/impersonated identity, per `live-ui-identity.md` §3 (governs ALL
// test code, not only live-UI/browser checks). QA_E2E's OWN workspace_members
// row in the throwaway fixture workspace is granted/revoked per-test (via the
// local `withQaRole` helper below) so each test is self-contained and the
// suite never depends on execution order. Two OTHER real user ids are
// borrowed purely as data values (never authenticated as) for the
// eligible-member / ineligible-viewer / foreign-non-member cases — the exact
// pattern `lib/bugs/list-isolation.test.ts` already uses for its throwaway
// workspace's owner_user_id.
//
// DB-dependent + fully env-gated (service AND real-login — there is no
// meaningful service-role-only subset here, see above). Skips loudly when
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

const RPC = 'bunkai_assign_bug';
const PREFIX = `bk264-assign-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface ActivityRow { actor_user_id: string | null, action: string, payload: { previous_assignee_user_id: string | null, assignee_user_id: string | null } }
interface Fixture {
  workspaceId: string
  bugId: string
  qaUserId: string
  ownerUserId: string // real, valid, deliberately never a member of this workspace
  viewerUserId: string // real, active member of this workspace, role 'viewer'
  memberUserId: string // real, active member of this workspace, role 'member'
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function assign(anon: ReturnType<typeof service>, bugId: string, assigneeUserId: string | null) {
  return anon.rpc(RPC, { p_bug_id: bugId, p_assignee_user_id: assigneeUserId });
}

// Grants QA_E2E the given role in the fixture workspace for the duration of
// `fn`, always revoking it again afterward — keeps every test self-contained
// regardless of execution order (mirrors the grant/try/finally-revoke pattern
// `lib/bugs/isolation.test.ts` already uses for its own actor-bind case).
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

async function latestActivity(db: ReturnType<typeof service>, bugId: string, action: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('actor_user_id, action, payload')
    .eq('entity_type', 'bug')
    .eq('entity_id', bugId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { throw error; }
  return data as unknown as ActivityRow | null;
}

async function countActivity(db: ReturnType<typeof service>, bugId: string, action: string) {
  const { count, error } = await db
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_type', 'bug')
    .eq('entity_id', bugId)
    .eq('action', action);
  if (error) { throw error; }
  return count ?? 0;
}

let fixture: Fixture | null = null;
let anon: ReturnType<typeof service> | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-264 — bunkai_assign_bug isolation (non-member/Viewer rejection, actor-bind, reassign/unassign)', () => {
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

    // Is the RPC deployed? Only `authenticated` holds EXECUTE on this
    // function (no `service_role` grant, by design — see the migration's own
    // header), so the deployment probe MUST use the real anon session too. A
    // nonexistent bug always resolves to P0002 regardless of the caller's
    // membership anywhere, so this is a safe probe before any fixture exists.
    const probe = await anon.rpc(RPC, { p_bug_id: ZERO_UUID, p_assignee_user_id: null });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0054_bug_assignment_status.sql.`;
      return;
    }

    // Three distinct real user ids, borrowed purely as data values (never
    // authenticated as), excluding QA_E2E's own id.
    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(20);
    if (membersError) { throw membersError; }
    const distinctIds = [...new Set((members ?? []).map(m => m.user_id as string))].filter(id => id !== qaUserId);
    if (distinctIds.length < 3) {
      skipReason = 'need at least 3 distinct real user ids (other than QA_E2E) among active workspace members (seed state).';
      return;
    }
    const [ownerUserId, viewerUserId, memberUserId] = distinctIds;

    // A dedicated throwaway workspace — this project's Supabase instance is
    // shared live infra across concurrent workers, and reusing a real busy
    // workspace would make "not a member of THIS workspace" unfalsifiable
    // against pre-existing unrelated membership rows.
    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    // viewerUserId / memberUserId are seeded as ordinary DATA members for the
    // whole suite (never authenticated as, so no revert needed). ownerUserId
    // is deliberately NEVER added to workspace_members — it stays a real,
    // valid, but foreign-to-this-workspace user id for case (c). QA_E2E
    // itself starts as a non-member (case (a) needs exactly this state) and
    // is granted/revoked per-test via withQaRole below.
    const { error: seedMembersError } = await db
      .from('workspace_members')
      .insert([
        { workspace_id: workspaceId, user_id: viewerUserId, role: 'viewer', status: 'active' },
        { workspace_id: workspaceId, user_id: memberUserId, role: 'member', status: 'active' },
      ]);
    if (seedMembersError) { throw seedMembersError; }

    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
      .select('id')
      .single();
    if (projectError) { throw projectError; }

    const { data: module, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: project.id as string, path: `${PREFIX}-module`, name: `${PREFIX} module` })
      .select('id')
      .single();
    if (moduleError) { throw moduleError; }

    const { data: bug, error: bugError } = await db
      .from('bugs')
      .insert({
        workspace_id: workspaceId,
        project_id: project.id as string,
        module_id: module.id as string,
        title: `${PREFIX} bug`,
        severity: 'P2',
        created_by: ownerUserId,
      })
      .select('id')
      .single();
    if (bugError) { throw bugError; }

    fixture = {
      workspaceId,
      bugId: bug.id as string,
      qaUserId,
      ownerUserId,
      viewerUserId,
      memberUserId,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Cascades from workspaces (0001/0002/0046) cover bugs/projects/modules/
    // workspace_members/activity_log — deleting the throwaway workspace alone
    // is sufficient.
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  it('(a) a caller who is not a member of the bug\'s workspace at all is rejected with the same not-found as a missing bug (non-disclosure)', async () => {
    if (!fixture || !anon) { return warn(); }

    // Sanity: QA_E2E must genuinely be a non-member here for this to prove
    // anything — it is never granted membership except inside withQaRole.
    const db = service();
    const { data: existing, error: existingError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', fixture.qaUserId)
      .maybeSingle();
    if (existingError) { throw existingError; }
    if (existing) {
      console.warn('[assign-bug-isolation] skipped (a): QA_E2E identity unexpectedly already a member of the throwaway workspace.');
      return;
    }

    const { data, error } = await assign(anon, fixture.bugId, fixture.memberUserId);
    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  it('(b) a member with only Viewer-level access cannot assign a bug (forbidden, distinct from not-found)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'viewer' }, async () => {
      const { data, error } = await assign(anon!, fixture!.bugId, fixture!.memberUserId);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
    });

    const { data: row, error: rowError } = await db.from('bugs').select('assignee_user_id').eq('id', fixture.bugId).single();
    if (rowError) { throw rowError; }
    expect(row.assignee_user_id).toBeNull();
  });

  it('(c) assigning to a real, valid user id who is NOT a member of THIS workspace is rejected (45312), even though the id is genuine', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      // ownerUserId is a real, existing user (it owns this very workspace's
      // owner_user_id FK) but was deliberately never added to
      // workspace_members for this workspace.
      const { data, error } = await assign(anon!, fixture!.bugId, fixture!.ownerUserId);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('45312');
      expect(data).toBeNull();
    });

    const { data: row, error: rowError } = await db.from('bugs').select('assignee_user_id').eq('id', fixture.bugId).single();
    if (rowError) { throw rowError; }
    expect(row.assignee_user_id).toBeNull();
  });

  it('(d) assigning to an active member whose role is Viewer is rejected (45313)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data, error } = await assign(anon!, fixture!.bugId, fixture!.viewerUserId);
      expect(error).not.toBeNull();
      expect(error?.code).toBe('45313');
      expect(data).toBeNull();
    });

    const { data: row, error: rowError } = await db.from('bugs').select('assignee_user_id').eq('id', fixture.bugId).single();
    if (rowError) { throw rowError; }
    expect(row.assignee_user_id).toBeNull();
  });

  it('(e) a legitimate assign succeeds and activity_log.actor_user_id is the authenticated caller, never a spoofed/caller-supplied value', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data, error } = await assign(anon!, fixture!.bugId, fixture!.memberUserId);
      expect(error).toBeNull();
      const bug = data as unknown as { assignee_user_id: string | null };
      expect(bug.assignee_user_id).toBe(fixture!.memberUserId);
    });

    const row = await latestActivity(db, fixture.bugId, 'bug.assigned');
    expect(row).not.toBeNull();
    // There is no p_actor_user_id on this RPC at all — the only way
    // actor_user_id could be anything other than the REAL authenticated
    // caller's own uid is if the function read something other than
    // auth.uid(). This is the actor-bind property this suite exists to prove.
    expect(row?.actor_user_id).toBe(fixture.qaUserId);
    expect(row?.payload.previous_assignee_user_id).toBeNull();
    expect(row?.payload.assignee_user_id).toBe(fixture.memberUserId);
  });

  it('(f) reassigning to a different eligible member updates the assignee and records bug.reassigned', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // Continues from (e)'s persisted state: the bug is currently assigned to
    // memberUserId. Reassign to QA_E2E itself (eligible while it holds
    // 'member' role for the duration of this call).
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data, error } = await assign(anon!, fixture!.bugId, fixture!.qaUserId);
      expect(error).toBeNull();
      const bug = data as unknown as { assignee_user_id: string | null };
      expect(bug.assignee_user_id).toBe(fixture!.qaUserId);
    });

    const row = await latestActivity(db, fixture.bugId, 'bug.reassigned');
    expect(row).not.toBeNull();
    expect(row?.actor_user_id).toBe(fixture.qaUserId);
    expect(row?.payload.previous_assignee_user_id).toBe(fixture.memberUserId);
    expect(row?.payload.assignee_user_id).toBe(fixture.qaUserId);
  });

  it('(g) unassigning clears the assignee and records bug.unassigned', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    // Continues from (f): the bug is currently assigned to QA_E2E itself.
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data, error } = await assign(anon!, fixture!.bugId, null);
      expect(error).toBeNull();
      const bug = data as unknown as { assignee_user_id: string | null };
      expect(bug.assignee_user_id).toBeNull();
    });

    const row = await latestActivity(db, fixture.bugId, 'bug.unassigned');
    expect(row).not.toBeNull();
    expect(row?.actor_user_id).toBe(fixture.qaUserId);
    expect(row?.payload.previous_assignee_user_id).toBe(fixture.qaUserId);
    expect(row?.payload.assignee_user_id).toBeNull();
  });

  it('(h) repeated identical assign is a silent no-op — no duplicate activity_log row', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      // First assign (bug is unassigned after (g)) — creates one row.
      const first = await assign(anon!, fixture!.bugId, fixture!.memberUserId);
      expect(first.error).toBeNull();
      const countBefore = await countActivity(db, fixture!.bugId, 'bug.assigned');
      expect(countBefore).toBeGreaterThan(0);

      // Identical assign again — must succeed but write NO new row.
      const second = await assign(anon!, fixture!.bugId, fixture!.memberUserId);
      expect(second.error).toBeNull();
      const countAfter = await countActivity(db, fixture!.bugId, 'bug.assigned');
      expect(countAfter).toBe(countBefore);
    });
  });
});

// The suite never fails on missing migration / seed state / login — it says
// why and passes.
function warn() {
  console.warn(`[assign-bug-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
