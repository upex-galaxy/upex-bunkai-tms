import { mintUserJwt } from '@lib/api/user-jwt';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-27 Step 9 — cross-workspace isolation guard for Tests (INV-3, TC-13).
// Cloned from the lib/api/rls-parity.test.ts pattern: it exercises the REAL
// code path — a user-scoped JWT minted exactly as resolveIdentity() does it,
// attached to an anon Supabase client — and asserts:
//
//   1. RLS SELECT: a member of workspace X sees ZERO `tests` and ZERO
//      `test_steps` rows belonging to a foreign workspace Y.
//   2. Non-disclosure: bunkai_create_test rejects a foreign-workspace ATC and
//      a nonexistent ATC with ONE byte-identical raise (45122,
//      'atc_not_in_workspace') — existence is never leaked (migration 0024).
//   3. Role gate: a viewer-role actor calling the RPC gets 42501 before any
//      ATC resolution happens (E1).
//
// DB-dependent: it self-discovers users/workspaces from seed state and seeds
// its own foreign `tests` fixture via the service client; everything it
// creates is deleted in afterAll (test_steps follow by ON DELETE CASCADE).
// When the Supabase env is absent (CI without DB creds) the suite SKIPS
// rather than fails. When present but the data preconditions can't be met it
// logs and passes (nothing to assert), so it never blocks a build on seed
// state.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasEnv = Boolean(url && anonKey && serviceKey && jwtSecret);

const describeOrSkip = hasEnv ? describe : describe.skip;

// Writer roles per the bunkai_create_test role gate (0024) / bunkai_can_write_workspace (0005).
const WRITER_ROLES = new Set(['member', 'admin', 'owner']);

// Unique-per-run titles so leftover rows from an aborted run can never make a
// fresh run pass (seed) or fail (RPC-leak probe) by accident.
const SEED_TITLE = `RLS isolation seed (BK-27) ${crypto.randomUUID()}`;
const RPC_ATTEMPT_TITLE = `RLS isolation RPC attempt (BK-27) ${crypto.randomUUID()}`;

function impersonating(token: string) {
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function admin() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

interface MemberRow {
  user_id: string
  workspace_id: string
  role: string
  status: string
}

describeOrSkip('BK-27 — tests/test_steps RLS isolation + non-disclosing create (INV-3)', () => {
  let service: ReturnType<typeof admin>;

  // Discovered fixture (undefined pieces = precondition unmet → that case logs and passes).
  let writerA: string | undefined; // user A, writer in homeWs
  let homeWs: string | undefined; // workspace X — A creates here
  let foreignWs: string | undefined; // workspace Y — A is NOT a member (any role/status)
  let foreignTestId: string | undefined; // seeded `tests` row living in Y
  let foreignAtcId: string | undefined; // non-archived ATC living in Y
  let viewerUser: string | undefined; // active member whose role fails the writer gate
  let viewerWs: string | undefined;
  const createdTestIds: string[] = [];

  beforeAll(async () => {
    service = admin();

    const { data: members, error } = await service
      .from('workspace_members')
      .select('user_id, workspace_id, role, status');
    if (error) { throw error; }
    const rows = (members ?? []) as MemberRow[];

    // ANY membership row (even inactive/viewer) disqualifies a workspace as
    // "foreign" — isolation must hold against strictly-outside users.
    const membershipByUser = new Map<string, Set<string>>();
    const writableByUser = new Map<string, Set<string>>();
    for (const m of rows) {
      if (!membershipByUser.has(m.user_id)) { membershipByUser.set(m.user_id, new Set()); }
      membershipByUser.get(m.user_id)!.add(m.workspace_id);
      if (m.status === 'active' && WRITER_ROLES.has(m.role)) {
        if (!writableByUser.has(m.user_id)) { writableByUser.set(m.user_id, new Set()); }
        writableByUser.get(m.user_id)!.add(m.workspace_id);
      }
      if (m.status === 'active' && !WRITER_ROLES.has(m.role) && !viewerUser) {
        viewerUser = m.user_id;
        viewerWs = m.workspace_id;
      }
    }

    // Map workspace → non-archived ATC ids (atcs are project-scoped: hop via projects).
    const { data: projects, error: projectsError } = await service.from('projects').select('id, workspace_id');
    if (projectsError) { throw projectsError; }
    const wsByProject = new Map((projects ?? []).map((p: { id: string, workspace_id: string }) => [p.id, p.workspace_id]));
    const { data: atcs, error: atcsError } = await service.from('atcs').select('id, project_id').is('archived_at', null);
    if (atcsError) { throw atcsError; }
    const atcsByWs = new Map<string, string[]>();
    for (const a of (atcs ?? []) as Array<{ id: string, project_id: string }>) {
      const ws = wsByProject.get(a.project_id);
      if (!ws) { continue; }
      if (!atcsByWs.has(ws)) { atcsByWs.set(ws, []); }
      atcsByWs.get(ws)!.push(a.id);
    }

    // Pick writer A + a foreign workspace Y, preferring a Y that owns an ATC
    // (enables both the test_steps seed and the foreign-ATC RPC case).
    const allWorkspaces = new Set(rows.map(m => m.workspace_id));
    for (const [user, writable] of writableByUser) {
      const mine = membershipByUser.get(user)!;
      const foreigns = [...allWorkspaces].filter(w => !mine.has(w));
      if (foreigns.length === 0) { continue; }
      const withAtc = foreigns.find(w => (atcsByWs.get(w) ?? []).length > 0);
      writerA = user;
      homeWs = [...writable][0];
      foreignWs = withAtc ?? foreigns[0];
      foreignAtcId = withAtc ? atcsByWs.get(withAtc)![0] : undefined;
      break;
    }
    if (!writerA || !homeWs || !foreignWs) { return; }

    // Seed one Test (+ one step when Y owns an ATC) INSIDE the foreign
    // workspace via the service client (bypasses RLS), so the zero-row
    // assertions have a concrete row to miss.
    const owner = rows.find(m => m.workspace_id === foreignWs)!.user_id;
    const { data: seeded, error: seedError } = await service
      .from('tests')
      .insert({ workspace_id: foreignWs, title: SEED_TITLE, created_by: owner })
      .select('id')
      .single();
    if (seedError) { throw seedError; }
    foreignTestId = (seeded as { id: string }).id;
    createdTestIds.push(foreignTestId);
    if (foreignAtcId) {
      const { error: stepError } = await service
        .from('test_steps')
        .insert({ test_id: foreignTestId, atc_id: foreignAtcId, position: 1 });
      if (stepError) { throw stepError; }
    }
  });

  afterAll(async () => {
    if (createdTestIds.length > 0) {
      await service.from('tests').delete().in('id', createdTestIds); // test_steps CASCADE
    }
    // Defensive: if a non-disclosure regression ever persisted an RPC attempt,
    // don't let the leaked row outlive the run.
    await service.from('tests').delete().eq('title', RPC_ATTEMPT_TITLE);
  });

  it('a workspace member sees zero foreign tests and zero foreign test_steps (RLS SELECT)', async () => {
    if (!writerA || !foreignWs || !foreignTestId) {
      console.warn('[rls-isolation] skipped: need a writer with at least one non-member workspace (seed state).');
      return;
    }

    // Positive control: the seeded row exists for the service client, so the
    // zero counts below cannot pass vacuously.
    const { data: viaService } = await service.from('tests').select('id').eq('id', foreignTestId);
    expect((viaService ?? []).length).toBe(1);

    const token = await mintUserJwt(writerA, jwtSecret!);
    const client = impersonating(token);

    const { data: visibleTests, error: testsError } = await client.from('tests').select('id, workspace_id');
    if (testsError) { throw testsError; }
    const visible = (visibleTests ?? []) as Array<{ id: string, workspace_id: string }>;
    expect(visible.some(t => t.workspace_id === foreignWs)).toBe(false);
    expect(visible.some(t => t.id === foreignTestId)).toBe(false);

    // Direct probes by id return nothing either (filtered, not just omitted).
    const { data: probedTest } = await client.from('tests').select('id').eq('id', foreignTestId);
    expect((probedTest ?? []).length).toBe(0);
    const { data: probedSteps } = await client.from('test_steps').select('id').eq('test_id', foreignTestId);
    expect((probedSteps ?? []).length).toBe(0);
  });

  it('foreign-workspace and nonexistent ATCs fail bunkai_create_test with one identical 45122 raise', async () => {
    if (!writerA || !homeWs || !foreignAtcId) {
      console.warn('[rls-isolation] skipped: need a foreign workspace owning at least one ATC (seed state).');
      return;
    }

    const token = await mintUserJwt(writerA, jwtSecret!);
    const client = impersonating(token);
    const base = { p_actor_user_id: writerA, p_workspace_id: homeWs, p_title: RPC_ATTEMPT_TITLE };

    const { data: foreignData, error: foreignError } = await client
      .rpc('bunkai_create_test', { ...base, p_atc_ids: [foreignAtcId] });
    expect(foreignData).toBeNull();
    expect(foreignError?.code).toBe('45122');
    expect(foreignError?.message).toBe('atc_not_in_workspace');
    expect(foreignError?.message).not.toContain(foreignAtcId); // no id echo

    const { data: ghostData, error: ghostError } = await client
      .rpc('bunkai_create_test', { ...base, p_atc_ids: [crypto.randomUUID()] });
    expect(ghostData).toBeNull();

    // Non-disclosure (INV-3): both rejections are byte-identical — same
    // SQLSTATE, same message — so a caller cannot tell "exists elsewhere"
    // from "does not exist".
    expect(ghostError?.code).toBe(foreignError?.code);
    expect(ghostError?.message).toBe(foreignError?.message);

    // And nothing was persisted by either attempt.
    const { data: leaked } = await service.from('tests').select('id').eq('title', RPC_ATTEMPT_TITLE);
    expect((leaked ?? []).length).toBe(0);
  });

  it('a viewer-role actor calling bunkai_create_test is rejected by the role gate (42501)', async () => {
    if (!viewerUser || !viewerWs) {
      console.warn('[rls-isolation] skipped: need an active member with a non-writer role (seed state).');
      return;
    }

    const token = await mintUserJwt(viewerUser, jwtSecret!);
    // The role gate fires FIRST (validation order is load-bearing, 0024), so a
    // random uuid chain never reaches ATC resolution.
    const { data, error } = await impersonating(token).rpc('bunkai_create_test', {
      p_actor_user_id: viewerUser,
      p_workspace_id: viewerWs,
      p_title: RPC_ATTEMPT_TITLE,
      p_atc_ids: [crypto.randomUUID()],
    });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
    expect(error?.message).toBe('forbidden');
  });
});
