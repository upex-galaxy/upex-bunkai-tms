import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-229 — DB-level integration guard for `bunkai_workspace_billing_overview`
// (migration 0072_workspace_billing_overview.sql). Required by
// `rpc-authorization.md` §5 (binding on the ticket, comment 12414 TQ2): "A
// route test that mocks `db.rpc` proves nothing." — this exercises the REAL
// server-side authorization gate and seat/project counting against a live
// database, through a REAL authenticated session, never a minted JWT
// (`live-ui-identity.md` §3).
//
// The RPC is `SECURITY INVOKER` with NO caller-supplied actor parameter — its
// own step-0 gate (`bunkai_is_workspace_admin`, itself `SECURITY DEFINER`,
// self-binds to `auth.uid()`) is what restricts the read. A service-role
// client's Postgres role bypasses RLS/`auth.uid()` entirely, so calling this
// RPC with `SUPABASE_SERVICE_ROLE_KEY` alone would prove nothing about the
// gate — it is used ONLY for fixture setup/teardown and for the
// deployment-probe/unknown-workspace checks below that do not depend on RLS.
// The load-bearing assertions (owner sees true counts, admin sees true
// counts, a member gets `null`) sign in for real via
// `QA_E2E_USER_EMAIL`/`QA_E2E_USER_PASSWORD`, the declared automation
// identity (`.agents/project.yaml` -> `testing.automation_identity`), through
// the app's own `signInWithPassword` path — never a hand-crafted session.
//
// FIXTURE SHAPE — a dedicated throwaway workspace (mirrors
// `lib/activity/list-activity-isolation.test.ts`), not an existing one: the
// live Supabase project is shared infra across concurrent workers, and this
// suite needs EXACT seat/project counts, which a busy pre-existing workspace
// cannot guarantee (BK-401's data-drift lesson). QA_E2E's own membership row
// in the throwaway workspace is mutated between `owner` -> `admin` ->
// `member` across the role assertions — same identity throughout, only its
// ROLE changes, never a different account and never a bypass of the app's
// login path.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_workspace_billing_overview';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const PREFIX = `bk229-billing-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface BillingOverview {
  plan: string
  active_seats: number
  project_count: number
  oldest_run_age_days: number | null
}

interface Fixture {
  workspaceId: string
  qaUserId: string
  extraActiveUserId: string | null
  projectAId: string
  projectBId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// A fresh, real authenticated session for QA_E2E — the declared automation
// identity, signed in through the app's own `signInWithPassword` path.
// Returns `null` when the real-login env is unavailable or the sign-in
// itself fails, so every call site can `warn()` and skip cleanly.
async function qaSession() {
  if (!hasRealLoginEnv) { return null; }
  const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
  return error ? null : client;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function callBilling(db: ReturnType<typeof service>, workspaceId: string) {
  return db.rpc(RPC, { p_workspace_id: workspaceId });
}

async function setQaRole(db: ReturnType<typeof service>, workspaceId: string, qaUserId: string, role: string) {
  const { error } = await db
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', workspaceId)
    .eq('user_id', qaUserId);
  if (error) { throw error; }
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-229 — bunkai_workspace_billing_overview isolation (rpc-authorization.md §5)', () => {
  beforeAll(async () => {
    const db = service();

    // 0. Is the RPC deployed? A deployed RPC answers `null` for a nonexistent
    //    workspace under a no-session (service-role) call — the step-0 gate
    //    reads `auth.uid()` as NULL and returns false, never raising.
    const probe = await db.rpc(RPC, { p_workspace_id: ZERO_UUID });
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0072_workspace_billing_overview.sql.`;
      return;
    }

    if (!hasRealLoginEnv) {
      skipReason = 'need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD for the real-session assertions.';
      return;
    }

    const probeSession = await qaSession();
    if (!probeSession) {
      skipReason = 'QA_E2E login failed.';
      return;
    }
    const { data: qaUser } = await probeSession.auth.getUser();
    const qaUserId = qaUser.user?.id;
    if (!qaUserId) {
      skipReason = 'QA_E2E login returned no user id.';
      return;
    }

    // A second distinct real user id, so `active_seats` counts more than
    // just the caller, and as the target for the invited/suspended
    // exclusion rows below. Falls back to omitting those rows (a weaker but
    // still valid fixture) if this live DB genuinely has only QA_E2E as a
    // distinct active member.
    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(50);
    if (membersError) { throw membersError; }
    const distinctUserIds = [...new Set((members ?? []).map(m => m.user_id as string))].filter(id => id !== qaUserId);
    const extraActiveUserId = distinctUserIds[0] ?? null;
    const invitedUserId = distinctUserIds[1] ?? null;
    const suspendedUserId = distinctUserIds[2] ?? null;

    // 1. Throwaway workspace, plan explicitly 'cloud' (not the default
    //    'community') so the fixture proves the RPC echoes the real stored
    //    plan literal rather than a hardcoded default.
    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: qaUserId, plan: 'cloud' })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    // 2. QA_E2E starts as 'owner', status 'active' — the real, sanctioned
    //    identity, membership row inserted directly (fixture setup, not
    //    simulating the invite flow — mirrors the activity-isolation
    //    precedent's direct `workspace_members` inserts).
    const memberRows = [{ workspace_id: workspaceId, user_id: qaUserId, role: 'owner', status: 'active' }];
    if (extraActiveUserId) {
      memberRows.push({ workspace_id: workspaceId, user_id: extraActiveUserId, role: 'member', status: 'active' });
    }
    if (invitedUserId) {
      memberRows.push({ workspace_id: workspaceId, user_id: invitedUserId, role: 'member', status: 'invited' });
    }
    if (suspendedUserId) {
      memberRows.push({ workspace_id: workspaceId, user_id: suspendedUserId, role: 'member', status: 'suspended' });
    }
    const { error: membersInsertError } = await db.from('workspace_members').insert(memberRows);
    if (membersInsertError) { throw membersInsertError; }

    // 3. Two throwaway projects — `project_count` must read exactly 2.
    const { data: projects, error: projectsError } = await db
      .from('projects')
      .insert([
        { workspace_id: workspaceId, slug: `${PREFIX}-proj-a`, name: `${PREFIX} A` },
        { workspace_id: workspaceId, slug: `${PREFIX}-proj-b`, name: `${PREFIX} B` },
      ])
      .select('id');
    if (projectsError) { throw projectsError; }
    const projectAId = projects[0].id;
    const projectBId = projects[1].id;

    // 4. One environment + one Test, so a Run row's FKs are satisfiable, plus
    //    two Runs at known ages — the oldest sets `oldest_run_age_days`.
    const { data: environment, error: environmentError } = await db
      .from('project_environments')
      .insert({ project_id: projectAId, name: `${PREFIX} env` })
      .select('id')
      .single();
    if (environmentError) { throw environmentError; }

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: workspaceId, title: `${PREFIX} test`, created_by: qaUserId })
      .select('id')
      .single();
    if (testError) { throw testError; }

    const runCommon = {
      workspace_id: workspaceId,
      project_id: projectAId,
      test_id: test.id,
      environment_id: environment.id,
      status: 'passed',
      executor_mode: 'human',
      executor_user_id: qaUserId,
      test_title: `${PREFIX} test`,
    };
    const { error: runsError } = await db.from('runs').insert([
      { ...runCommon, start_token: `${PREFIX}-run-old`, created_at: daysAgoIso(12), started_at: daysAgoIso(12) },
      { ...runCommon, start_token: `${PREFIX}-run-new`, created_at: daysAgoIso(2), started_at: daysAgoIso(2) },
    ]);
    if (runsError) { throw runsError; }

    fixture = { workspaceId, qaUserId, extraActiveUserId, projectAId, projectBId };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Cascades from deleting the workspace cover members/runs (ON DELETE
    // CASCADE via workspace_id), but delete explicitly first for
    // defensiveness against the FK shape ever changing to RESTRICT — mirrors
    // the activity-isolation precedent. Errors are surfaced (not thrown —
    // the suite's assertions already ran and passed/failed by this point,
    // and this is a SHARED live database, so a loud warning beats aborting
    // the whole run over a cleanup hiccup) so an orphaned fixture is visible
    // instead of silently leaking rows into shared infra.
    const cleanups = [
      () => db.from('runs').delete().eq('workspace_id', fixture!.workspaceId),
      () => db.from('project_environments').delete().eq('project_id', fixture!.projectAId),
      () => db.from('tests').delete().eq('workspace_id', fixture!.workspaceId),
      () => db.from('projects').delete().in('id', [fixture!.projectAId, fixture!.projectBId]),
      () => db.from('workspace_members').delete().eq('workspace_id', fixture!.workspaceId),
      () => db.from('workspaces').delete().eq('id', fixture!.workspaceId),
    ];
    const tables = ['runs', 'project_environments', 'tests', 'projects', 'workspace_members', 'workspaces'];
    for (const [i, cleanup] of cleanups.entries()) {
      const { error } = await cleanup();
      if (error) {
        console.error(`[billing-overview-isolation] cleanup of "${tables[i]}" failed for workspace ${fixture.workspaceId}: ${error.message}`);
      }
    }
  });

  it('an owner sees the true plan, active-seat, project, and retention counts', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    // Confirm the fixture is genuinely 'owner' before asserting — beforeAll
    // always seeds 'owner' first, this just documents the premise.
    await setQaRole(db, fixture.workspaceId, fixture.qaUserId, 'owner');

    const session = await qaSession();
    if (!session) { return warn(); }

    const { data, error } = await callBilling(session, fixture.workspaceId);
    expect(error).toBeNull();
    const overview = data as unknown as BillingOverview;
    expect(overview).not.toBeNull();
    expect(overview.plan).toBe('cloud');
    // 1 owner + 1 extra active member (when a second distinct real user
    // existed on this live DB) — invited/suspended never counted.
    expect(overview.active_seats).toBe(fixture.extraActiveUserId ? 2 : 1);
    expect(overview.project_count).toBe(2);
    // Oldest run is ~12 days old; allow a 1-day slop for clock/rounding.
    expect(overview.oldest_run_age_days).not.toBeNull();
    expect(overview.oldest_run_age_days!).toBeGreaterThanOrEqual(11);
    expect(overview.oldest_run_age_days!).toBeLessThanOrEqual(13);
  });

  it('an admin sees the same true counts (business rule: admins CAN view billing)', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    await setQaRole(db, fixture.workspaceId, fixture.qaUserId, 'admin');

    const session = await qaSession();
    if (!session) { return warn(); }

    const { data, error } = await callBilling(session, fixture.workspaceId);
    expect(error).toBeNull();
    const overview = data as unknown as BillingOverview;
    expect(overview).not.toBeNull();
    expect(overview.active_seats).toBe(fixture.extraActiveUserId ? 2 : 1);
    expect(overview.project_count).toBe(2);
  });

  it('a member (not owner/admin) gets null — not a wrong number, not a partial payload', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    await setQaRole(db, fixture.workspaceId, fixture.qaUserId, 'member');

    const session = await qaSession();
    if (!session) { return warn(); }

    const { data, error } = await callBilling(session, fixture.workspaceId);
    expect(error).toBeNull(); // the gate fails closed, never raises
    expect(data).toBeNull();

    // Restore 'owner' so any later ordering/reruns start from the same
    // documented premise as the first test.
    await setQaRole(db, fixture.workspaceId, fixture.qaUserId, 'owner');
  });

  it('a foreign, real workspace the caller does not belong to returns null — indistinguishable from unknown', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    // A real workspace QA_E2E has no membership row in — any OTHER workspace
    // than the throwaway fixture qualifies (QA_E2E is a dedicated fixture
    // account with no organic memberships).
    const { data: otherWorkspaces, error: otherError } = await db
      .from('workspaces')
      .select('id')
      .neq('id', fixture.workspaceId)
      .limit(1);
    if (otherError) { throw otherError; }
    const foreignWorkspaceId = otherWorkspaces?.[0]?.id as string | undefined;
    if (!foreignWorkspaceId) { return warn(); }

    const session = await qaSession();
    if (!session) { return warn(); }

    const { data, error } = await callBilling(session, foreignWorkspaceId);
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('an unknown workspace id returns null, same shape as a foreign one (non-disclosure)', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const { data, error } = await callBilling(db, ZERO_UUID);
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

function warn() {
  console.warn(`[billing-overview-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
