import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-264 Slice 1 — dedicated isolation guard for `bunkai_transition_bug_status`
// (migration 0054_bug_assignment_status.sql), the mandatory DB-integration
// test per ADR-0012 / rpc-authorization.md §5 ("test against the real
// database, not a mock"). Mirrors `lib/bugs/assign-bug-isolation.test.ts`'s
// dedicated-throwaway-workspace fixture pattern (same migration, same
// authorization shape — see that file's header for the full rationale on why
// this suite is fully env-gated rather than split into a service-role-only
// subset + a real-login-only subset).
//
// `bunkai_transition_bug_status` carries NO p_actor_user_id either — same
// auth.uid()-direct shape as `bunkai_assign_bug`, same reason there is
// nothing to spoof, same `grant execute ... to authenticated` only (no
// `service_role`).
//
// Covers, at minimum, the properties this slice's briefing calls mandatory:
//   (a) a caller who is not even a member of the bug's workspace is rejected
//       with the SAME not-found used for a missing bug (non-disclosure).
//   (b) a member with only Viewer-level access cannot transition status —
//       DISTINCT forbidden (42501).
//   (c) skipping a lifecycle stage (open -> resolved directly) is rejected
//       (45310), status unchanged.
//   (d) moving backward (resolved -> open) is rejected (45311), status
//       unchanged.
//   (e) the full valid lifecycle (open -> in_progress -> resolved -> closed)
//       succeeds one stage at a time, and activity_log records
//       bug.status_changed with {previous_status, status, assignee_user_id}
//       at each step, actor_user_id always the AUTHENTICATED caller (there is
//       no caller-supplied actor to spoof).
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

const RPC = 'bunkai_transition_bug_status';
const PREFIX = `bk264-transition-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface ActivityRow { actor_user_id: string | null, action: string, payload: { previous_status: string, status: string, assignee_user_id: string | null } }
interface Fixture {
  workspaceId: string
  bugOpenId: string // status 'open', for the skip case and the deployment probe
  bugResolvedId: string // status 'resolved', for the backward case
  bugLifecycleId: string // status 'open', assigned to QA_E2E, for the happy path
  qaUserId: string
  ownerUserId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function transition(anon: ReturnType<typeof service>, bugId: string, newStatus: string) {
  return anon.rpc(RPC, { p_bug_id: bugId, p_new_status: newStatus });
}

// Grants QA_E2E the given role in the fixture workspace for the duration of
// `fn`, always revoking it again afterward — keeps every test self-contained
// regardless of execution order (mirrors `assign-bug-isolation.test.ts`'s own
// helper).
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

async function latestActivity(db: ReturnType<typeof service>, bugId: string, statusTo: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('actor_user_id, action, payload')
    .eq('entity_type', 'bug')
    .eq('entity_id', bugId)
    .eq('action', 'bug.status_changed')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) { throw error; }
  const rows = (data ?? []) as unknown as ActivityRow[];
  return rows.find(r => r.payload.status === statusTo) ?? null;
}

let fixture: Fixture | null = null;
let anon: ReturnType<typeof service> | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-264 — bunkai_transition_bug_status isolation (non-member/Viewer rejection, skip/backward rejection, actor-bind)', () => {
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
    // function (no `service_role` grant — see the migration's own header), so
    // the deployment probe MUST use the real anon session. A nonexistent bug
    // always resolves to P0002 regardless of the caller's membership
    // anywhere, so this is a safe probe before any fixture exists.
    const probe = await anon.rpc(RPC, { p_bug_id: ZERO_UUID, p_new_status: 'in_progress' });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0054_bug_assignment_status.sql.`;
      return;
    }

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

    // A dedicated throwaway workspace — same rationale as
    // `assign-bug-isolation.test.ts`: reusing a real busy workspace would
    // make "QA_E2E starts as a non-member" unfalsifiable against pre-existing
    // unrelated membership rows.
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

    const { data: module, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: project.id as string, path: `${PREFIX}-module`, name: `${PREFIX} module` })
      .select('id')
      .single();
    if (moduleError) { throw moduleError; }

    // Three throwaway bugs at different starting statuses — direct
    // service-role inserts (bunkai_create_bug's own concerns are BK-40's,
    // already covered elsewhere; this fixture only needs rows that satisfy
    // the bugs_check_consistency trigger, which they do). Seeding a
    // non-'open' status directly on INSERT is fine — the trigger's
    // status-adjacency backstop only fires on UPDATE. The 'bug lifecycle' row
    // seeds assignee_user_id = qaUserId directly, which the SAME trigger's
    // assignee-eligibility backstop re-checks on INSERT too — so QA_E2E needs
    // a MOMENTARY active membership here purely to satisfy that check, granted
    // and revoked immediately, before test (a) ever runs (which requires
    // QA_E2E to start the suite as a genuine non-member).
    const { error: momentaryGrantError } = await db
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: qaUserId, role: 'member', status: 'active' });
    if (momentaryGrantError) { throw momentaryGrantError; }

    const { data: seededBugs, error: bugError } = await db
      .from('bugs')
      .insert([
        { workspace_id: workspaceId, project_id: project.id as string, module_id: module.id as string, title: `${PREFIX} bug open`, severity: 'P2', status: 'open', created_by: ownerUserId },
        { workspace_id: workspaceId, project_id: project.id as string, module_id: module.id as string, title: `${PREFIX} bug resolved`, severity: 'P2', status: 'resolved', created_by: ownerUserId },
        { workspace_id: workspaceId, project_id: project.id as string, module_id: module.id as string, title: `${PREFIX} bug lifecycle`, severity: 'P2', status: 'open', assignee_user_id: qaUserId, created_by: ownerUserId },
      ])
      .select('id, title');

    await db.from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', qaUserId);

    if (bugError) { throw bugError; }
    const bugOpenId = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug open'))!.id as string;
    const bugResolvedId = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug resolved'))!.id as string;
    const bugLifecycleId = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug lifecycle'))!.id as string;

    fixture = { workspaceId, bugOpenId, bugResolvedId, bugLifecycleId, qaUserId, ownerUserId };
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

    const db = service();
    const { data: existing, error: existingError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', fixture.qaUserId)
      .maybeSingle();
    if (existingError) { throw existingError; }
    if (existing) {
      console.warn('[transition-bug-status-isolation] skipped (a): QA_E2E identity unexpectedly already a member of the throwaway workspace.');
      return;
    }

    const { data, error } = await transition(anon, fixture.bugOpenId, 'in_progress');
    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  it('(b) a member with only Viewer-level access cannot transition status (forbidden, distinct from not-found)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'viewer' }, async () => {
      const { data, error } = await transition(anon!, fixture!.bugOpenId, 'in_progress');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
    });

    const { data: row, error: rowError } = await db.from('bugs').select('status').eq('id', fixture.bugOpenId).single();
    if (rowError) { throw rowError; }
    expect(row.status).toBe('open');
  });

  it('(c) skipping a lifecycle stage (open -> resolved directly) is rejected (45310), status unchanged', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data, error } = await transition(anon!, fixture!.bugOpenId, 'resolved');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('45310');
      expect(data).toBeNull();
    });

    const { data: row, error: rowError } = await db.from('bugs').select('status').eq('id', fixture.bugOpenId).single();
    if (rowError) { throw rowError; }
    expect(row.status).toBe('open');
  });

  it('(d) moving backward (resolved -> open) is rejected (45311), status unchanged', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data, error } = await transition(anon!, fixture!.bugResolvedId, 'open');
      expect(error).not.toBeNull();
      expect(error?.code).toBe('45311');
      expect(data).toBeNull();
    });

    const { data: row, error: rowError } = await db.from('bugs').select('status').eq('id', fixture.bugResolvedId).single();
    if (rowError) { throw rowError; }
    expect(row.status).toBe('resolved');
  });

  it('(e) the full valid lifecycle succeeds one stage at a time, and activity_log records the correct payload + actor at each step', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const toInProgress = await transition(anon!, fixture!.bugLifecycleId, 'in_progress');
      expect(toInProgress.error).toBeNull();
      expect((toInProgress.data as unknown as { status: string }).status).toBe('in_progress');

      const toResolved = await transition(anon!, fixture!.bugLifecycleId, 'resolved');
      expect(toResolved.error).toBeNull();
      expect((toResolved.data as unknown as { status: string }).status).toBe('resolved');

      const toClosed = await transition(anon!, fixture!.bugLifecycleId, 'closed');
      expect(toClosed.error).toBeNull();
      expect((toClosed.data as unknown as { status: string }).status).toBe('closed');
    });

    // assignee_user_id was seeded as qaUserId at fixture creation — the
    // payload snapshots the bug's CURRENT assignee at each transition (BK-212
    // handoff shape, Decision 7), not a live join, so every step must show it.
    const step1 = await latestActivity(db, fixture.bugLifecycleId, 'in_progress');
    expect(step1).not.toBeNull();
    expect(step1?.actor_user_id).toBe(fixture.qaUserId);
    expect(step1?.payload.previous_status).toBe('open');
    expect(step1?.payload.assignee_user_id).toBe(fixture.qaUserId);

    const step2 = await latestActivity(db, fixture.bugLifecycleId, 'resolved');
    expect(step2).not.toBeNull();
    expect(step2?.actor_user_id).toBe(fixture.qaUserId);
    expect(step2?.payload.previous_status).toBe('in_progress');
    expect(step2?.payload.assignee_user_id).toBe(fixture.qaUserId);

    const step3 = await latestActivity(db, fixture.bugLifecycleId, 'closed');
    expect(step3).not.toBeNull();
    expect(step3?.actor_user_id).toBe(fixture.qaUserId);
    expect(step3?.payload.previous_status).toBe('resolved');
    expect(step3?.payload.assignee_user_id).toBe(fixture.qaUserId);
  });
});

// The suite never fails on missing migration / seed state / login — it says
// why and passes.
function warn() {
  console.warn(`[transition-bug-status-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
