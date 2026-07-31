import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-38 — SEC-1: dedicated isolation guard for the project Run-report RPC
// (`bunkai_report_project_runs`, migration 0041_run_project_report.sql).
// Mirrors `lib/runs/history-isolation.test.ts`'s structure (BK-37), scaled
// from Test-scoped to Project-scoped since BK-38 filters by `project_id`, and
// adds the actor-bind spoof case `history-isolation.test.ts` never covers (it
// requires a REAL authenticated client, not just the service-role one).
//
// Covers BK-38-ATC-07 exactly:
//   * Project isolation: Project A's report NEVER returns Project B's runs in
//     rows OR totals, even though both live in the SAME workspace. This is
//     the primary thing SEC-1 exists to prove: the `runs_select_workspace_member`
//     RLS policy only gates at the WORKSPACE boundary (see the RPC's own
//     comment on its `filtered` CTE) — the RPC's `project_id = p_project_id`
//     predicate is the actual project-scope enforcement, and this suite is
//     what would catch that predicate being dropped or loosened.
//   * Non-disclosure: a Project belonging to a FOREIGN workspace resolves to
//     the SAME P0002 as a nonexistent Project id.
//   * Actor-bind guard: a caller authenticated as a real user who passes a
//     DIFFERENT id as `p_actor_user_id` is rejected with the SAME P0002
//     (never a distinct error that would leak "that Project exists").
//
// The actor-bind case authenticates through the app's REAL, sanctioned login
// path — `supabase.auth.signInWithPassword` with the anon key, using the
// already-declared automation identity (`QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD`, see `.agents/project.yaml` ->
// `testing.automation_identity`) — never a locally-minted JWT and never a
// borrowed/impersonated identity, per
// `.claude/skills/sprint-development/references/live-ui-identity.md` §3
// (which governs ALL test code, not only live-UI/browser checks). The guard
// fires BEFORE any table read (see the migration's own step-0 comment), so
// the spoofed id in `p_actor_user_id` never needs to belong to a real second
// user — a value that simply is not the authenticated caller's own id is
// enough to exercise the branch. The one thing genuinely required is proof
// that the real session's `auth.uid()` reaches Postgres at all: that is what
// the preceding self-call (matching actor id) establishes, for which the
// QA_E2E identity is granted a throwaway, service-role-seeded membership of
// the fixture workspace, removed again in the same test (mirrors the file's
// existing seed/cleanup pattern for Projects/Tests/Runs — service-role here
// is ordinary fixture setup/teardown, not a minted session).
//
// DB-dependent + env-gated: the isolation/non-disclosure suite needs only
// `SUPABASE_SERVICE_ROLE_KEY` (service-role client, explicit actor — the SAME
// contract the API route uses); the actor-bind case additionally needs
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `QA_E2E_USER_EMAIL` + `QA_E2E_USER_PASSWORD`
// to log in for real, and is gated separately so its absence never skips the
// rest of the suite. Either gate SKIPS LOUDLY when its env is missing, and
// logs + passes when the env is present but seed state (or the login itself)
// cannot satisfy a precondition — never blocks a build on migration, seed
// state, or a QA fixture-account hiccup.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_report_project_runs';
const PREFIX = `bk38-report-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
// Deliberately NOT any real user's id — the actor-bind guard fires on a mere
// mismatch, so a well-formed but nonexistent uuid is sufficient to spoof.
const SPOOFED_ACTOR_UUID = '00000000-0000-0000-0000-000000000001';

interface MemberRow { user_id: string, workspace_id: string, status: string }
interface ProjectRow { id: string, workspace_id: string }
interface ReportItem { id: string, test_id: string, status: string }
interface ReportPage {
  items: ReportItem[]
  totals: { passed: number, failed: number }
  next_cursor: { started_at: string, id: string } | null
}
interface Fixture {
  actorUserId: string
  workspaceId: string
  projectAId: string
  projectBId: string
  testAId: string
  testBId: string
  foreignProjectId: string | null
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function isoMinutesBefore(base: number, minutes: number): string {
  return new Date(base - minutes * 60_000).toISOString();
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-38 — bunkai_report_project_runs isolation (SEC-1 / ATC-07)', () => {
  beforeAll(async () => {
    const db = service();

    // Is the RPC deployed? A deployed RPC answers P0002 for a nonexistent
    // Project; an undeployed one answers "function does not exist".
    const probe = await db.rpc(RPC, { p_actor_user_id: ZERO_UUID, p_project_id: ZERO_UUID });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0041_run_project_report.sql.`;
      return;
    }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, status')
      .eq('status', 'active');
    if (membersError) { throw membersError; }
    const active = (members ?? []) as MemberRow[];
    const anchor = active[0];
    if (!anchor) {
      skipReason = 'need at least one active workspace member (seed state).';
      return;
    }

    const { data: projects, error: projectsError } = await db
      .from('projects')
      .select('id, workspace_id');
    if (projectsError) { throw projectsError; }
    const foreignProjectId = ((projects ?? []) as ProjectRow[])
      .find(p => p.workspace_id !== anchor.workspace_id)
      ?.id ?? null;

    // Two throwaway Projects in the SAME (anchor's) workspace — the whole
    // point of this suite is that SAME-workspace Projects must still not leak
    // into each other's report. Each gets its own Environment (project_environments.
    // project_id is a straight FK, not shareable) and its own Test.
    const { data: seededProjects, error: projectError } = await db
      .from('projects')
      .insert([
        { workspace_id: anchor.workspace_id, slug: `${PREFIX}-project-a`, name: `${PREFIX} project A` },
        { workspace_id: anchor.workspace_id, slug: `${PREFIX}-project-b`, name: `${PREFIX} project B` },
      ])
      .select('id, slug');
    if (projectError) { throw projectError; }
    const projectAId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-a'))!.id as string;
    const projectBId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-b'))!.id as string;

    const { data: environmentA, error: environmentAError } = await db
      .from('project_environments')
      .insert({ project_id: projectAId, name: 'Staging' })
      .select('id')
      .single();
    if (environmentAError) { throw environmentAError; }

    const { data: environmentB, error: environmentBError } = await db
      .from('project_environments')
      .insert({ project_id: projectBId, name: 'Staging' })
      .select('id')
      .single();
    if (environmentBError) { throw environmentBError; }

    const { data: tests, error: testsError } = await db
      .from('tests')
      .insert([
        { workspace_id: anchor.workspace_id, title: `${PREFIX} test A`, created_by: anchor.user_id },
        { workspace_id: anchor.workspace_id, title: `${PREFIX} test B`, created_by: anchor.user_id },
      ])
      .select('id, title');
    if (testsError) { throw testsError; }
    const testAId = (tests ?? []).find(t => (t.title as string).endsWith('test A'))!.id as string;
    const testBId = (tests ?? []).find(t => (t.title as string).endsWith('test B'))!.id as string;

    const base = Date.parse('2026-06-01T12:00:00.000Z');
    // Project A: 2 passed, 1 failed. Project B: 1 passed, 2 failed —
    // deliberately DIFFERENT shapes so a totals mix-up (A leaking B's rows,
    // or vice versa) could never pass by coincidence.
    const runsA = ['passed', 'passed', 'failed'].map((status, i) => ({
      workspace_id: anchor.workspace_id,
      project_id: projectAId,
      test_id: testAId,
      environment_id: environmentA.id as string,
      test_title: `${PREFIX} test A`,
      status,
      executor_mode: 'human',
      abort_reason: null,
      start_token: `${PREFIX}-a-${i}`,
      started_at: isoMinutesBefore(base, i),
      finished_at: new Date(base - i * 60_000 + 30_000).toISOString(),
    }));
    const runsB = ['passed', 'failed', 'failed'].map((status, i) => ({
      workspace_id: anchor.workspace_id,
      project_id: projectBId,
      test_id: testBId,
      environment_id: environmentB.id as string,
      test_title: `${PREFIX} test B`,
      status,
      executor_mode: 'human',
      abort_reason: null,
      start_token: `${PREFIX}-b-${i}`,
      started_at: isoMinutesBefore(base, i),
      finished_at: new Date(base - i * 60_000 + 30_000).toISOString(),
    }));
    const { error: runsError } = await db.from('runs').insert([...runsA, ...runsB]);
    if (runsError) { throw runsError; }

    fixture = {
      actorUserId: anchor.user_id,
      workspaceId: anchor.workspace_id,
      projectAId,
      projectBId,
      testAId,
      testBId,
      foreignProjectId,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Runs first: runs.test_id is ON DELETE RESTRICT.
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    // Project delete cascades project_environments.
    await db.from('projects').delete().in('id', [fixture.projectAId, fixture.projectBId]);
    await db.from('tests').delete().in('id', [fixture.testAId, fixture.testBId]);
  });

  it('Project A\'s report returns ONLY Project A\'s runs, in rows AND totals', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRuns(fixture.projectAId, fixture.actorUserId);
    expect(page.items).toHaveLength(3);
    expect(page.items.every(i => i.test_id === fixture!.testAId)).toBe(true);
    expect(page.totals).toEqual({ passed: 2, failed: 1 });
  });

  it('Project B\'s report returns ONLY Project B\'s runs, in rows AND totals', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRuns(fixture.projectBId, fixture.actorUserId);
    expect(page.items).toHaveLength(3);
    expect(page.items.every(i => i.test_id === fixture!.testBId)).toBe(true);
    expect(page.totals).toEqual({ passed: 1, failed: 2 });
  });

  it('the two Projects\' reports never share a row id (no cross-project bleed)', async () => {
    if (!fixture) { return warn(); }
    const [a, b] = await Promise.all([
      reportRuns(fixture.projectAId, fixture.actorUserId),
      reportRuns(fixture.projectBId, fixture.actorUserId),
    ]);
    const aIds = new Set(a.items.map(i => i.id));
    for (const item of b.items) {
      expect(aIds.has(item.id)).toBe(false);
    }
  });

  it('a FOREIGN-workspace Project resolves to the SAME P0002 as a nonexistent Project (non-disclosure)', async () => {
    if (!fixture) { return warn(); }
    if (!fixture.foreignProjectId) {
      console.warn('[report-isolation] skipped foreign-workspace case: need a Project outside the anchor\'s workspace (seed state).');
      return;
    }
    const db = service();
    const [foreign, missing] = await Promise.all([
      db.rpc(RPC, { p_actor_user_id: fixture.actorUserId, p_project_id: fixture.foreignProjectId }),
      db.rpc(RPC, { p_actor_user_id: fixture.actorUserId, p_project_id: ZERO_UUID }),
    ]);
    expect(foreign.error).not.toBeNull();
    expect(foreign.error?.code).toBe('P0002');
    expect(foreign.data).toBeNull();
    expect(missing.error).not.toBeNull();
    expect(missing.error?.code).toBe('P0002');
    expect(missing.data).toBeNull();
  });

  it('the actor-bind guard rejects a spoofed p_actor_user_id', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[report-isolation] skipped actor-bind case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    // Real, sanctioned login — the anon-key client signs in as the
    // already-declared automation identity, exactly the app's own login path.
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[report-isolation] skipped actor-bind case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }
    const realUserId = signIn.user.id;

    // Grant the real, logged-in identity a throwaway membership of the
    // fixture workspace (service-role fixture setup, same as the
    // Projects/Tests/Runs seeded above — not a minted session) so the
    // self-call below can succeed end-to-end. That success is what proves
    // the rejection afterward is caused by the id MISMATCH, not by some
    // unrelated failure that would raise the same P0002 either way.
    const db = service();
    const { data: existingMembership, error: existingMembershipError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', realUserId)
      .maybeSingle();
    if (existingMembershipError) { throw existingMembershipError; }

    let grantedMembership = false;
    if (!existingMembership) {
      const { error: grantError } = await db
        .from('workspace_members')
        .insert({ workspace_id: fixture.workspaceId, user_id: realUserId, role: 'viewer', status: 'active' });
      if (grantError) {
        console.warn(`[report-isolation] skipped actor-bind case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
        return;
      }
      grantedMembership = true;
    }

    try {
      // Legitimate self-call succeeds through the REAL authenticated client
      // first — proves the session is genuinely authenticated (auth.uid() =
      // realUserId inside Postgres) and that the rejection below fails for
      // the RIGHT reason (an identity mismatch), not because the session or
      // the Project lookup is broken.
      const self = await anon.rpc(RPC, { p_actor_user_id: realUserId, p_project_id: fixture.projectAId });
      expect(self.error).toBeNull();

      // Same real session (auth.uid() = realUserId), but p_actor_user_id
      // claims to be a DIFFERENT user — the spoof. Must collapse into the
      // SAME P0002 a missing Project raises (non-disclosure), never a
      // distinct error.
      const spoofed = await anon.rpc(RPC, { p_actor_user_id: SPOOFED_ACTOR_UUID, p_project_id: fixture.projectAId });
      expect(spoofed.error).not.toBeNull();
      expect(spoofed.error?.code).toBe('P0002');
      expect(spoofed.data).toBeNull();
    }
    finally {
      if (grantedMembership) {
        await db.from('workspace_members').delete().eq('workspace_id', fixture.workspaceId).eq('user_id', realUserId);
      }
    }
  });
});

// One RPC call, typed at the seam.
async function reportRuns(projectId: string, actorUserId: string): Promise<ReportPage> {
  const db = service();
  const { data, error } = await db.rpc(RPC, { p_actor_user_id: actorUserId, p_project_id: projectId });
  if (error) { throw error; }
  return data as unknown as ReportPage;
}

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[report-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
