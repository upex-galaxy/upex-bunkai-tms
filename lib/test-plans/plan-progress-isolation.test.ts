import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-204 — DB-integration guard for Test Plan progress
// (`bunkai_plan_progress` / `bunkai_plans_progress` / `bunkai_plan_progress_rows`,
// migration 0094_plan_progress.sql).
//
// All three functions are SECURITY INVOKER and take NO identity parameter: row-level
// security on the CALLER'S OWN client is the only authorization, so a mocked
// `db.rpc` proves nothing about them. This suite signs in through the app's real
// password path as the declared automation identity (`QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD`, `.agents/project.yaml` -> `testing.automation_identity`),
// never a minted JWT and never an impersonated account. Service-role is used ONLY
// for fixture seed and teardown, which is sanctioned: it obtains no session.
//
// What it proves against the real database:
//   * the rulebook: floor percentage, latest-start-wins, a running latest run
//     overriding an older finished one (and the reverse), the plan-agnostic window,
//     aborted and failed outcomes, executor parity, a never-run member, an empty plan
//     (null percentage) versus a plan with members and no runs (0%), a removed member
//     no longer counting;
//   * the batch function agrees with the single-plan function and leaves out plans
//     the caller cannot see;
//   * cross-workspace non-disclosure: a plan in a workspace the identity does not
//     belong to answers the SAME P0002 as a plan that does not exist;
//   * fail closed: a caller with no session (service role, which bypasses RLS) gets
//     no data, anon cannot execute, the internal helper is not executable by
//     service_role;
//   * read-only: runs and test_plan_tests are identical before and after;
//   * the budget: 200 members in one plan and 50 plans in one list, under 2 seconds.
//
// FAIL-CLOSED GATE. This file is evidence only when it EXECUTES. It is registered
// as SKIPPED, with a loud warning at module load, in exactly two legitimate cases:
//   1. there is no database environment at all (`NEXT_PUBLIC_SUPABASE_URL`,
//      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` absent: CI
//      without DB credentials), or
//   2. the database answers that `bunkai_plan_progress` does not exist (migration
//      0094 not applied yet).
// In EVERY other case the suite FAILS instead of passing quietly: a missing
// automation identity, a failed login, a fixture that cannot be seeded (the suite
// seeds its OWN two workspaces, it never borrows existing data), or an unexpected
// answer from the probe. Every test also asserts at least one expectation
// (`expect.hasAssertions()`). A run counts as evidence only if its output shows zero
// skipped tests.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[plan-progress-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran, so nothing here is evidence about the functions.');
}
const RPC = 'bunkai_plan_progress';
const BATCH_RPC = 'bunkai_plans_progress';
const HELPER_RPC = 'bunkai_plan_progress_rows';

// Is the function deployed? A deployed function answers P0002 to a caller with no
// session (the service role) for any id. "Function does not exist" (42883 /
// PGRST202) is the one legitimate reason to skip; ANY other answer is a failure of
// the file itself, never a quiet skip.
let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc(RPC, { p_plan_id: '00000000-0000-0000-0000-000000000000' });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[plan-progress-isolation] SKIPPED ENTIRELY: ${RPC} is not deployed (${code}). Apply migration 0094_plan_progress.sql. No assertion in this file ran, so nothing here is evidence about the functions.`);
  }
  else {
    throw new Error(`[plan-progress-isolation] unexpected answer from the ${RPC} deploy probe (${code}: ${probe.error?.message ?? 'no message'}). Expected P0002 (deployed) or 42883/PGRST202 (not deployed).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;
const PREFIX = `bk204-progress-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const BUDGET_MS = 2000;

type Outcome = 'passed' | 'failed' | 'aborted' | 'in_progress' | 'not_run';
type RunStatus = 'passed' | 'failed' | 'aborted' | 'running';
interface RunSpec { status: RunStatus, start: string, executor?: 'human' | 'agent' | 'ci' }
interface Counts { passed: number, failed: number, aborted: number, in_progress: number, not_run: number }
interface Summary { plan_id: string, member_count: number, passed_pct: number | null, counts: Counts }
interface PlanProgress extends Summary {
  tests: Array<{ test_id: string, outcome: Outcome, run_id: string | null, started_at: string | null }>
}
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  foreignProjectId: string
  envId: string
  foreignEnvId: string
  testRowIds: string[]
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// Seeding failures are test failures: every step throws, nothing is swallowed.
function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[plan-progress-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

let fixture: Fixture | null = null;
let qa: ReturnType<typeof service>;
const planIds: string[] = [];
// Every workspace id is recorded the moment it is inserted, so teardown still cleans
// when beforeAll throws midway (the `fixture` object only exists once seeding ends).
const createdWorkspaceIds: string[] = [];

// A test that runs while the fixture is missing FAILS (it never passes vacuously).
function need(): Fixture {
  if (!fixture) {
    throw new Error('[plan-progress-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

describeOrSkip('BK-204 — plan progress against the real database', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[plan-progress-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present (the functions are INVOKER: only a real session proves them).');
    }
    const db = service();

    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`[plan-progress-isolation] QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    const qaUserId = signIn.user.id;

    // The suite seeds BOTH workspaces itself, on the 'cloud' plan (the default
    // 'community' plan caps a workspace at 3 Projects). The identity is an active
    // member of the first one and has no membership at all in the second, so the
    // cross-workspace refusal never depends on what else lives in the database.
    const ownWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'own workspace');
    const workspaceId = ownWs.id as string;
    createdWorkspaceIds.push(workspaceId);
    must(await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id').single(), 'own membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'foreign workspace');
    const foreignWorkspaceId = foreignWs.id as string;
    createdWorkspaceIds.push(foreignWorkspaceId);

    const project = must(await db.from('projects').insert({ workspace_id: workspaceId, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const env = must(await db.from('project_environments').insert({ project_id: project.id, name: 'Staging' }).select('id').single(), 'environment');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWorkspaceId, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');
    const foreignEnv = must(await db.from('project_environments').insert({ project_id: foreignProject.id, name: 'Staging' }).select('id').single(), 'foreign environment');

    fixture = {
      workspaceId,
      foreignWorkspaceId,
      qaUserId,
      projectId: project.id as string,
      foreignProjectId: foreignProject.id as string,
      envId: env.id as string,
      foreignEnvId: foreignEnv.id as string,
      testRowIds: [],
    };
  });

  afterAll(async () => {
    if (createdWorkspaceIds.length === 0) { return; }
    const db = service();
    const ws = createdWorkspaceIds;
    // Children before parents: runs.test_id is ON DELETE RESTRICT; test_plan_tests
    // cascades from plans and tests; the workspaces cascade the rest. A delete that
    // fails is collected and thrown, never swallowed: leftover fixtures must be loud.
    const failures: string[] = [];
    const attempt = async (what: string, op: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await op;
      if (error) { failures.push(`${what}: ${error.message}`); }
    };
    await attempt('runs', db.from('runs').delete().in('workspace_id', ws));
    await attempt('test_plans', db.from('test_plans').delete().in('workspace_id', ws));
    await attempt('tests', db.from('tests').delete().in('workspace_id', ws));
    await attempt('projects', db.from('projects').delete().in('workspace_id', ws));
    await attempt('workspace_members', db.from('workspace_members').delete().in('workspace_id', ws));
    await attempt('workspaces', db.from('workspaces').delete().in('id', ws));
    if (failures.length > 0) {
      throw new Error(`[plan-progress-isolation] teardown left fixtures behind (${PREFIX}): ${failures.join('; ')}`);
    }
  });

  // ---------------------------------------------------------------- seeding
  let counter = 0;
  let seq = 0;
  async function newPlan(foreign = false): Promise<string> {
    const f = need();
    const { data, error } = await service().from('test_plans').insert({
      workspace_id: foreign ? f.foreignWorkspaceId : f.workspaceId,
      project_id: foreign ? f.foreignProjectId : f.projectId,
      name: `${PREFIX} plan ${++counter}`,
      status: 'open',
      created_by: f.qaUserId,
    }).select('id').single();
    if (error) { throw error; }
    planIds.push(data.id as string);
    return data.id as string;
  }

  // Creates `runsPerTest.length` tests, joins them to the plan (in order, one second
  // apart) and seeds each test's runs. `[]` means a never-run member.
  async function seedMembers(planId: string, runsPerTest: RunSpec[][], foreign = false): Promise<string[]> {
    const f = need();
    const db = service();
    const workspaceId = foreign ? f.foreignWorkspaceId : f.workspaceId;
    const tests = must(await db.from('tests').insert(runsPerTest.map((_, i) => ({
      workspace_id: workspaceId,
      title: `${PREFIX} t${++seq}-${i}`,
      created_by: f.qaUserId,
    }))).select('id'), 'tests');
    const testIds = tests.map(t => t.id as string);
    f.testRowIds.push(...testIds);
    const base = Date.parse('2026-06-01T00:00:00.000Z');
    must(await db.from('test_plan_tests').insert(testIds.map((testId, i) => ({
      test_plan_id: planId,
      test_id: testId,
      added_by: f.qaUserId,
      created_at: new Date(base + i * 1000).toISOString(),
    }))).select('id'), 'plan members');
    const runs = runsPerTest.flatMap((specs, i) => specs.map(spec => ({
      workspace_id: workspaceId,
      project_id: foreign ? f.foreignProjectId : f.projectId,
      test_id: testIds[i],
      environment_id: foreign ? f.foreignEnvId : f.envId,
      status: spec.status,
      executor_mode: spec.executor ?? 'human',
      abort_reason: spec.status === 'aborted' ? 'seeded abort' : null,
      start_token: `${PREFIX}-${++seq}`,
      test_title: `${PREFIX} title`,
      started_at: spec.start,
      finished_at: spec.status === 'running' ? null : spec.start,
    })));
    if (runs.length > 0) {
      must(await db.from('runs').insert(runs).select('id'), 'runs');
    }
    return testIds;
  }

  async function progress(planId: string): Promise<PlanProgress> {
    const { data, error } = await qa.rpc(RPC, { p_plan_id: planId });
    if (error) { throw error; }
    return data as unknown as PlanProgress;
  }

  async function summaries(ids: string[]): Promise<Summary[]> {
    const { data, error } = await qa.rpc(BATCH_RPC, { p_plan_ids: ids });
    if (error) { throw error; }
    return data as unknown as Summary[];
  }

  const run = (status: RunStatus, start: string, executor?: RunSpec['executor']): RunSpec => ({ status, start, executor });
  const outcomes = (p: PlanProgress) => p.tests.map(t => t.outcome);

  // ----------------------------------------------------------------- the rulebook
  it('worked example: five outcomes, counts add up, 1 of 5 passed floors to 20', async () => {
    const plan = await newPlan();
    const ids = await seedMembers(plan, [
      [run('passed', '2026-05-01T09:00:00.000Z')],
      [run('failed', '2026-05-01T09:00:00.000Z')],
      [run('aborted', '2026-05-01T09:00:00.000Z')],
      [run('running', '2026-05-01T09:00:00.000Z')],
      [],
    ]);
    const p = await progress(plan);
    expect(p.plan_id).toBe(plan);
    expect(p.member_count).toBe(5);
    expect(p.counts).toEqual({ passed: 1, failed: 1, aborted: 1, in_progress: 1, not_run: 1 });
    expect(p.passed_pct).toBe(20);
    expect(outcomes(p)).toEqual(['passed', 'failed', 'aborted', 'in_progress', 'not_run']);
    expect(p.tests.map(t => t.test_id)).toEqual(ids);
    const c = p.counts;
    expect(c.passed + c.failed + c.aborted + c.in_progress + c.not_run).toBe(p.member_count);
    // a never-run member carries no run and no time
    expect(p.tests[4].run_id).toBeNull();
    expect(p.tests[4].started_at).toBeNull();
    expect(p.tests[0].run_id).not.toBeNull();
    expect(p.tests[0].started_at).not.toBeNull();
  });

  it('floors the percentage: 2 of 3 is 66, 3 of 8 is 37, 7 of 8 is 87, 1 of 3 is 33', async () => {
    const ok = [run('passed', '2026-05-01T09:00:00.000Z')];
    const bad = [run('failed', '2026-05-01T09:00:00.000Z')];
    const cases: Array<[RunSpec[][], number]> = [
      [[ok, ok, bad], 66],
      [[ok, ok, ok, ...Array.from({ length: 5 }, () => bad)], 37],
      [[...Array.from({ length: 7 }, () => ok), bad], 87],
      [[ok, bad, bad], 33],
    ];
    for (const [members, expected] of cases) {
      const plan = await newPlan();
      await seedMembers(plan, members);
      const p = await progress(plan);
      expect(p.passed_pct).toBe(expected);
    }
  }, 60_000);

  it('reaches 100 only when every member passed', async () => {
    const ok = [run('passed', '2026-05-01T09:00:00.000Z')];
    const all = await newPlan();
    await seedMembers(all, [ok, ok, ok]);
    expect((await progress(all)).passed_pct).toBe(100);

    // 199 of 200 would round to 100 under round(); floor keeps it at 99.
    const nearly = await newPlan();
    await seedMembers(nearly, [...Array.from({ length: 199 }, () => ok), [run('failed', '2026-05-01T09:00:00.000Z')]]);
    expect((await progress(nearly)).passed_pct).toBe(99);
  }, 60_000);

  it('latest start wins: a newer failed run overrides an older passed one, and the reverse', async () => {
    const plan = await newPlan();
    await seedMembers(plan, [
      [run('passed', '2026-05-01T09:00:00.000Z'), run('failed', '2026-05-01T10:00:00.000Z')],
      [run('failed', '2026-05-01T09:00:00.000Z'), run('passed', '2026-05-01T10:00:00.000Z')],
    ]);
    const p = await progress(plan);
    expect(outcomes(p)).toEqual(['failed', 'passed']);
    expect(p.passed_pct).toBe(50);
  });

  it('equal started_at on both runs: the greater run id wins, whatever the statuses', async () => {
    const plan = await newPlan();
    const same = '2026-05-01T09:00:00.000Z';
    const [testId] = await seedMembers(plan, [[run('passed', same), run('failed', same)]]);
    const { data: seeded, error } = await service().from('runs').select('id, status').eq('test_id', testId);
    if (error) { throw error; }
    expect(seeded).toHaveLength(2);
    // uuid order in Postgres is bytewise, i.e. lowercase-hex string order
    const winner = [...seeded].sort((x, y) => (x.id < y.id ? 1 : -1))[0];
    const p = await progress(plan);
    expect(p.tests[0].run_id).toBe(winner.id);
    expect(p.tests[0].outcome).toBe(winner.status);
  });

  it('a running latest run shows in progress and overrides an older finished run; a newer finished run overrides an older running one', async () => {
    const plan = await newPlan();
    await seedMembers(plan, [
      [run('passed', '2026-05-01T09:00:00.000Z'), run('running', '2026-05-01T10:00:00.000Z')],
      [run('running', '2026-05-01T09:00:00.000Z'), run('passed', '2026-05-01T10:00:00.000Z')],
    ]);
    const p = await progress(plan);
    expect(outcomes(p)).toEqual(['in_progress', 'passed']);
    expect(p.counts.in_progress).toBe(1);
    expect(p.passed_pct).toBe(50);
  });

  it('reports the start time of the latest run, even for a running one', async () => {
    const plan = await newPlan();
    await seedMembers(plan, [
      [run('passed', '2026-05-01T09:00:00.000Z'), run('running', '2026-05-02T10:30:00.000Z')],
    ]);
    const p = await progress(plan);
    expect(new Date(p.tests[0].started_at!).toISOString()).toBe('2026-05-02T10:30:00.000Z');
  });

  it('is plan-agnostic: a run that finished long before the test joined the plan still counts', async () => {
    const plan = await newPlan();
    // The membership row is created "now" (above); the run is from 2020.
    await seedMembers(plan, [[run('passed', '2020-01-01T09:00:00.000Z')]]);
    const p = await progress(plan);
    expect(outcomes(p)).toEqual(['passed']);
    expect(p.passed_pct).toBe(100);
  });

  it('counts every executor alike: human, agent and ci runs', async () => {
    const plan = await newPlan();
    await seedMembers(plan, [
      [run('passed', '2026-05-01T09:00:00.000Z', 'human')],
      [run('passed', '2026-05-01T09:00:00.000Z', 'agent')],
      [run('failed', '2026-05-01T09:00:00.000Z', 'ci')],
    ]);
    const p = await progress(plan);
    expect(p.counts).toEqual({ passed: 2, failed: 1, aborted: 0, in_progress: 0, not_run: 0 });
  });

  it('keeps a test that is a member of two plans in step in both', async () => {
    const planA = await newPlan();
    const [testId] = await seedMembers(planA, [[run('failed', '2026-05-01T09:00:00.000Z')]]);
    const planB = await newPlan();
    must(await service().from('test_plan_tests').insert({ test_plan_id: planB, test_id: testId, added_by: need().qaUserId }).select('id'), 'second membership');
    expect(outcomes(await progress(planA))).toEqual(['failed']);
    expect(outcomes(await progress(planB))).toEqual(['failed']);
  });

  it('an empty plan has no percentage; a plan with members and no runs is 0 percent, not empty', async () => {
    const empty = await newPlan();
    const e = await progress(empty);
    expect(e.member_count).toBe(0);
    expect(e.passed_pct).toBeNull();
    expect(e.tests).toEqual([]);
    expect(e.counts).toEqual({ passed: 0, failed: 0, aborted: 0, in_progress: 0, not_run: 0 });

    const noRuns = await newPlan();
    await seedMembers(noRuns, [[], []]);
    const n = await progress(noRuns);
    expect(n.member_count).toBe(2);
    expect(n.passed_pct).toBe(0);
    expect(n.counts.not_run).toBe(2);
  });

  it('all members in progress: 0 percent passed and every member in progress', async () => {
    const plan = await newPlan();
    await seedMembers(plan, [[run('running', '2026-05-01T09:00:00.000Z')], [run('running', '2026-05-01T09:00:00.000Z')]]);
    const p = await progress(plan);
    expect(p.passed_pct).toBe(0);
    expect(p.counts.in_progress).toBe(2);
  });

  it('a test removed from the plan stops counting and the percentage recomputes', async () => {
    const plan = await newPlan();
    const ids = await seedMembers(plan, [
      [run('passed', '2026-05-01T09:00:00.000Z')],
      [run('passed', '2026-05-01T09:00:00.000Z')],
      [run('failed', '2026-05-01T09:00:00.000Z')],
      [run('failed', '2026-05-01T09:00:00.000Z')],
    ]);
    expect((await progress(plan)).passed_pct).toBe(50);
    const removed = await service().from('test_plan_tests').delete().eq('test_plan_id', plan).eq('test_id', ids[3]);
    expect(removed.error).toBeNull();
    const p = await progress(plan);
    expect(p.member_count).toBe(3);
    expect(p.passed_pct).toBe(66);
    expect(p.tests.map(t => t.test_id)).not.toContain(ids[3]);
  });

  // ----------------------------------------------------------------- the batch function
  it('the batch function agrees with the single-plan function and leaves out plans the caller cannot see', async () => {
    const own1 = await newPlan();
    await seedMembers(own1, [[run('passed', '2026-05-01T09:00:00.000Z')], [run('failed', '2026-05-01T09:00:00.000Z')], []]);
    const own2 = await newPlan();
    const foreign = await newPlan(true);
    await seedMembers(foreign, [[run('passed', '2026-05-01T09:00:00.000Z')]], true);

    const batch = await summaries([own1, own2, foreign, ZERO_UUID]);
    expect(batch.map(s => s.plan_id).sort()).toEqual([own1, own2].sort());
    const single1 = await progress(own1);
    const fromBatch1 = batch.find(s => s.plan_id === own1)!;
    expect(fromBatch1).toEqual({ plan_id: own1, member_count: single1.member_count, passed_pct: single1.passed_pct, counts: single1.counts });
    const fromBatch2 = batch.find(s => s.plan_id === own2)!;
    expect(fromBatch2.member_count).toBe(0);
    expect(fromBatch2.passed_pct).toBeNull();

    const none = await summaries([]);
    expect(none).toEqual([]);
  });

  // ----------------------------------------------------------------- access and read-only
  it('gives a plan in a workspace the identity does not belong to the SAME P0002 as a missing plan', async () => {
    const foreign = await newPlan(true);
    await seedMembers(foreign, [[run('passed', '2026-05-01T09:00:00.000Z')]], true);
    const [foreignResult, missingResult] = await Promise.all([qa.rpc(RPC, { p_plan_id: foreign }), qa.rpc(RPC, { p_plan_id: ZERO_UUID })]);
    expect(foreignResult.error?.code).toBe('P0002');
    expect(foreignResult.data).toBeNull();
    expect(missingResult.error?.code).toBe('P0002');
    expect(missingResult.data).toBeNull();
    expect(foreignResult.error?.message).toBe(missingResult.error?.message);
    // the service role CAN see that plan, so the refusal above came from the caller's
    // identity and not from the data being absent.
    const { data: visible } = await service().from('test_plans').select('id').eq('id', foreign).maybeSingle();
    expect(visible?.id).toBe(foreign);
  });

  it('fails closed for a caller with no session: service role bypasses RLS but gets no data, anon cannot execute, the helper is not executable by service role', async () => {
    const own = await newPlan();
    await seedMembers(own, [[run('passed', '2026-05-01T09:00:00.000Z')]]);

    const asService = await service().rpc(RPC, { p_plan_id: own });
    expect(asService.error?.code).toBe('P0002');
    expect(asService.data).toBeNull();
    const batchAsService = await service().rpc(BATCH_RPC, { p_plan_ids: [own] });
    expect(batchAsService.error?.code).toBe('P0002');
    expect(batchAsService.data).toBeNull();

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    for (const call of [
      anon.rpc(RPC, { p_plan_id: own }),
      anon.rpc(BATCH_RPC, { p_plan_ids: [own] }),
      anon.rpc(HELPER_RPC, { p_plan_ids: [own] }),
    ]) {
      const result = await call;
      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
      expect(['42501', 'PGRST202']).toContain(result.error?.code ?? '');
    }

    const helperAsService = await service().rpc(HELPER_RPC, { p_plan_ids: [own] });
    expect(helperAsService.error).not.toBeNull();
    expect(['42501', 'PGRST202']).toContain(helperAsService.error?.code ?? '');
  });

  it('the internal helper called with the user session is still scoped by RLS', async () => {
    const foreign = await newPlan(true);
    await seedMembers(foreign, [[run('passed', '2026-05-01T09:00:00.000Z')]], true);
    const own = await newPlan();
    await seedMembers(own, [[run('passed', '2026-05-01T09:00:00.000Z')]]);
    const { data, error } = await qa.rpc(HELPER_RPC, { p_plan_ids: [own, foreign] });
    expect(error).toBeNull();
    const rows = data as unknown as Array<{ plan_id: string }>;
    expect(rows.map(r => r.plan_id)).toEqual([own]);
  });

  it('writes nothing: runs and plan membership are identical after reading progress', async () => {
    const db = service();
    const plan = await newPlan();
    await seedMembers(plan, [[run('passed', '2026-05-01T09:00:00.000Z')], [run('running', '2026-05-01T10:00:00.000Z')], []]);
    const snapshot = async () => {
      const [runs, members] = await Promise.all([
        db.from('runs').select('*').eq('workspace_id', need().workspaceId).like('start_token', `${PREFIX}%`).order('id'),
        db.from('test_plan_tests').select('*').eq('test_plan_id', plan).order('id'),
      ]);
      return JSON.stringify([runs.data, members.data]);
    };
    const before = await snapshot();
    await progress(plan);
    await summaries([plan]);
    expect(await snapshot()).toBe(before);
  });

  // ----------------------------------------------------------------- budget
  it('answers a 200-member plan within the 2 second budget', async () => {
    const plan = await newPlan();
    await seedMembers(plan, Array.from({ length: 200 }, (_, i) => [
      run(i % 4 === 0 ? 'failed' : 'passed', '2026-05-01T09:00:00.000Z'),
      run('passed', '2026-05-02T09:00:00.000Z'),
    ]));
    const started = performance.now();
    const p = await progress(plan);
    const elapsed = performance.now() - started;
    console.warn(`[plan-progress-isolation] 200-member plan: ${elapsed.toFixed(0)} ms round trip (budget ${BUDGET_MS} ms).`);
    expect(p.member_count).toBe(200);
    expect(p.passed_pct).toBe(100);
    expect(elapsed).toBeLessThanOrEqual(BUDGET_MS);
  }, 60_000);

  it('answers a list of 50 plans within the 2 second budget', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      ids.push(await newPlan());
    }
    // 3 members each, seeded plan by plan.
    for (const id of ids) {
      await seedMembers(id, [[run('passed', '2026-05-01T09:00:00.000Z')], [run('failed', '2026-05-01T09:00:00.000Z')], []]);
    }
    const started = performance.now();
    const batch = await summaries(ids);
    const elapsed = performance.now() - started;
    console.warn(`[plan-progress-isolation] 50-plan list: ${elapsed.toFixed(0)} ms round trip (budget ${BUDGET_MS} ms).`);
    expect(batch).toHaveLength(50);
    expect(batch.every(s => s.member_count === 3 && s.passed_pct === 33)).toBe(true);
    expect(elapsed).toBeLessThanOrEqual(BUDGET_MS);
  }, 120_000);
});
