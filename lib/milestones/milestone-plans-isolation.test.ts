import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-206 — DB-integration guard for milestone plan membership and readiness
// (`bunkai_attach_plans_to_milestone`, `bunkai_detach_plan_from_milestone`,
// `bunkai_milestones_readiness`, migration 0112_milestone_plans.sql).
//
// The writers are SECURITY DEFINER with no identity parameter and the reader is
// SECURITY INVOKER: a mocked `db.rpc` proves nothing about any of them. This suite
// signs in through the app's real password path as the declared automation identity
// (`QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD`, `.agents/project.yaml` ->
// `testing.automation_identity`), never a minted JWT and never an impersonated
// account. Service-role is used ONLY for fixture seed, role flips and teardown.
//
// What it proves against the real database:
//   * readiness pools test counts (never a mean of percentages) and floors them;
//     no plan, plans with no tests and 0 passed are three different answers;
//   * a closed plan contributes its frozen snapshot, a closed plan without one
//     falls back to live progress;
//   * attach is all-or-nothing, rejects duplicates (45504), plans outside the
//     project, in another workspace or unknown (45505, no id echoed), an empty
//     selection (22023) and a 51st plan (45506); one plan may serve two milestones;
//   * detach is idempotent and never touches the plan or its membership;
//   * a viewer is refused (42501) and still reads readiness; a milestone in another
//     workspace answers P0002 and is left out of readiness; no session fails closed;
//   * history rows carry the authenticated caller; privileges keep the writers away
//     from anon and from the read-only QA role;
//   * the budget: readiness of a milestone with 50 attached plans under 2 seconds.
//
// FAIL-CLOSED GATE (same contract as plan-progress-isolation.test.ts). The file is
// SKIPPED, with a loud warning, in exactly two cases: no database environment at all,
// or the database answers that `bunkai_milestones_readiness` does not exist (0112 not
// applied). Every other problem FAILS the suite. A run counts as evidence only if its
// output shows zero skipped tests.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const TAG = '[milestone-plans-isolation]';
const ATTACH_RPC = 'bunkai_attach_plans_to_milestone';
const DETACH_RPC = 'bunkai_detach_plan_from_milestone';
const READINESS_RPC = 'bunkai_milestones_readiness';

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn(`${TAG} SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran.`);
}

// A deployed readiness function answers P0002 to a caller with no session (the
// service role). "Function does not exist" is the one legitimate reason to skip.
let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc(READINESS_RPC, { p_milestone_ids: [] });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`${TAG} SKIPPED ENTIRELY: ${READINESS_RPC} is not deployed (${code}). Apply migration 0112_milestone_plans.sql. No assertion in this file ran.`);
  }
  else {
    throw new Error(`${TAG} unexpected answer from the ${READINESS_RPC} deploy probe (${code}: ${probe.error?.message ?? 'no message'}). Expected P0002 (deployed) or 42883/PGRST202 (not deployed).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;
const PREFIX = `bk206-msplans-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const BUDGET_MS = 2000;

interface Counts { passed: number, failed: number, aborted: number, in_progress: number, not_run: number }
interface PlanRow { plan_id: string, name: string, status: string, frozen: boolean, member_count: number, passed_pct: number | null, counts: Counts }
interface Readiness { milestone_id: string, plan_count: number, member_count: number, passed_pct: number | null, counts: Counts, plans: PlanRow[] }
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  otherProjectId: string
  foreignProjectId: string
  envId: string
}
function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
type Client = ReturnType<typeof service>;

// Seed rows are read back by id only; the generic client types them loosely, so the
// helper answers a plain record (or a list of them).
type Seeded = Record<string, unknown> & { id: string };
function must(result: { data: unknown, error: { message: string } | null }, what: string): Seeded {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${TAG} fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data as Seeded;
}

function mustRows(result: { data: unknown, error: { message: string } | null }, what: string): Seeded[] {
  if (result.error || !Array.isArray(result.data)) {
    throw new Error(`${TAG} fixture seed failed at "${what}": ${result.error?.message ?? 'no rows returned'}`);
  }
  return result.data as Seeded[];
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

let fixture: Fixture | null = null;
let qa: Client;
const createdWorkspaceIds: string[] = [];

function need(): Fixture {
  if (!fixture) {
    throw new Error(`${TAG} the fixture was not seeded (see the beforeAll failure above); refusing to pass.`);
  }
  return fixture;
}

describeOrSkip('BK-206 — milestone plans and readiness against the real database', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error(`${TAG} QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.`);
    }
    const db = service();
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`${TAG} QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    const qaUserId = signIn.user.id;

    // Two workspaces seeded by the suite itself: the identity is an active member of
    // the first one and has no membership at all in the second.
    const ownWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'own workspace');
    const workspaceId = ownWs.id;
    createdWorkspaceIds.push(workspaceId);
    must(await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: qaUserId, role: 'member', status: 'active' }).select('user_id').single(), 'own membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'foreign workspace');
    const foreignWorkspaceId = foreignWs.id;
    createdWorkspaceIds.push(foreignWorkspaceId);

    const project = must(await db.from('projects').insert({ workspace_id: workspaceId, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const otherProject = must(await db.from('projects').insert({ workspace_id: workspaceId, slug: `${PREFIX}-q`, name: `${PREFIX} other project` }).select('id').single(), 'other project');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWorkspaceId, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');
    const env = must(await db.from('project_environments').insert({ project_id: project.id, name: 'Staging' }).select('id').single(), 'environment');

    fixture = {
      workspaceId,
      foreignWorkspaceId,
      qaUserId,
      projectId: project.id,
      otherProjectId: otherProject.id,
      foreignProjectId: foreignProject.id,
      envId: env.id,
    };
  });

  afterAll(async () => {
    if (createdWorkspaceIds.length === 0) { return; }
    const db = service();
    const ws = createdWorkspaceIds;
    // Children before parents: runs.test_id is ON DELETE RESTRICT; milestone_plans
    // cascades from milestones and plans; the workspaces cascade the rest.
    const failures: string[] = [];
    const attempt = async (what: string, op: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await op;
      if (error) { failures.push(`${what}: ${error.message}`); }
    };
    await attempt('runs', db.from('runs').delete().in('workspace_id', ws));
    await attempt('milestone_plans', db.from('milestone_plans').delete().in('workspace_id', ws));
    await attempt('milestones', db.from('milestones').delete().in('workspace_id', ws));
    await attempt('test_plans', db.from('test_plans').delete().in('workspace_id', ws));
    await attempt('tests', db.from('tests').delete().in('workspace_id', ws));
    await attempt('projects', db.from('projects').delete().in('workspace_id', ws));
    await attempt('workspace_members', db.from('workspace_members').delete().in('workspace_id', ws));
    await attempt('workspaces', db.from('workspaces').delete().in('id', ws));
    // Count zero at the end: nothing carrying the prefix survives.
    const { count, error } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (error) { failures.push(`leftover count: ${error.message}`); }
    else if ((count ?? 0) !== 0) { failures.push(`${count} workspaces with prefix ${PREFIX} survived`); }
    if (failures.length > 0) {
      throw new Error(`${TAG} teardown left fixtures behind (${PREFIX}): ${failures.join('; ')}`);
    }
  });

  // ---------------------------------------------------------------- seeding
  let counter = 0;
  let seq = 0;

  async function newMilestone(opts: { foreign?: boolean, targetDate?: string } = {}): Promise<string> {
    const f = need();
    const row = must(await service().from('milestones').insert({
      workspace_id: opts.foreign ? f.foreignWorkspaceId : f.workspaceId,
      project_id: opts.foreign ? f.foreignProjectId : f.projectId,
      name: `${PREFIX} milestone ${++counter}`,
      target_date: opts.targetDate ?? isoDate(30),
      created_by: f.qaUserId,
    }).select('id').single(), 'milestone');
    return row.id;
  }

  async function newPlan(opts: { project?: 'own' | 'other' | 'foreign', closed?: { snapshot: unknown } } = {}): Promise<string> {
    const f = need();
    const where = opts.project ?? 'own';
    const row = must(await service().from('test_plans').insert({
      workspace_id: where === 'foreign' ? f.foreignWorkspaceId : f.workspaceId,
      project_id: where === 'foreign' ? f.foreignProjectId : where === 'other' ? f.otherProjectId : f.projectId,
      name: `${PREFIX} plan ${++counter}`,
      status: opts.closed ? 'closed' : 'open',
      created_by: f.qaUserId,
      ...(opts.closed ? { verdict: 'passed', closed_at: new Date().toISOString(), progress_snapshot: opts.closed.snapshot } : {}),
    }).select('id').single(), 'plan');
    return row.id;
  }

  // `passed` member tests with a passed run, `failed` with a failed run, `notRun`
  // never run. Returns the plan id.
  async function planWith(spec: { passed?: number, failed?: number, notRun?: number }): Promise<string> {
    const f = need();
    const db = service();
    const planId = await newPlan();
    const outcomes = [
      ...Array.from({ length: spec.passed ?? 0 }, () => 'passed' as const),
      ...Array.from({ length: spec.failed ?? 0 }, () => 'failed' as const),
      ...Array.from({ length: spec.notRun ?? 0 }, () => null),
    ];
    if (outcomes.length === 0) { return planId; }
    const tests = mustRows(await db.from('tests').insert(outcomes.map((_, i) => ({
      workspace_id: f.workspaceId,
      title: `${PREFIX} t${++seq}-${i}`,
      created_by: f.qaUserId,
    }))).select('id'), 'tests');
    const testIds = tests.map(t => t.id);
    mustRows(await db.from('test_plan_tests').insert(testIds.map((testId: string) => ({
      test_plan_id: planId,
      test_id: testId,
      added_by: f.qaUserId,
    }))).select('id'), 'plan members');
    const runs = outcomes.flatMap((status, i) => status === null
      ? []
      : [{
          workspace_id: f.workspaceId,
          project_id: f.projectId,
          test_id: testIds[i],
          environment_id: f.envId,
          status,
          executor_mode: 'human',
          start_token: `${PREFIX}-${++seq}`,
          test_title: `${PREFIX} title`,
          started_at: '2026-06-01T09:00:00.000Z',
          finished_at: '2026-06-01T09:00:00.000Z',
        }]);
    if (runs.length > 0) {
      mustRows(await db.from('runs').insert(runs).select('id'), 'runs');
    }
    return planId;
  }

  async function attach(milestoneId: string, planIds: string[], client: Client = qa) {
    return client.rpc(ATTACH_RPC, { p_milestone_id: milestoneId, p_test_plan_ids: planIds });
  }

  async function detach(milestoneId: string, planId: string, client: Client = qa) {
    return client.rpc(DETACH_RPC, { p_milestone_id: milestoneId, p_test_plan_id: planId });
  }

  async function readiness(ids: string[], client: Client = qa): Promise<Readiness[]> {
    const { data, error } = await client.rpc(READINESS_RPC, { p_milestone_ids: ids });
    if (error) { throw error; }
    return data as unknown as Readiness[];
  }

  async function one(id: string): Promise<Readiness> {
    const [r] = await readiness([id]);
    if (!r) { throw new Error(`${TAG} readiness returned nothing for ${id}`); }
    return r;
  }

  async function memberships(milestoneId: string): Promise<string[]> {
    const { data, error } = await service().from('milestone_plans').select('test_plan_id').eq('milestone_id', milestoneId);
    if (error) { throw error; }
    return ((data ?? []) as Array<{ test_plan_id: string }>).map(r => r.test_plan_id).sort();
  }

  async function history(milestoneId: string, action: string) {
    const { data, error } = await service()
      .from('activity_log')
      .select('actor_user_id, payload')
      .eq('entity_type', 'milestone')
      .eq('entity_id', milestoneId)
      .eq('action', action);
    if (error) { throw error; }
    return data ?? [];
  }

  async function withRole<T>(role: 'viewer' | 'member', fn: () => Promise<T>): Promise<T> {
    const f = need();
    const db = service();
    const set = async (r: string) => {
      const { error } = await db.from('workspace_members').update({ role: r }).eq('workspace_id', f.workspaceId).eq('user_id', f.qaUserId);
      if (error) { throw error; }
    };
    await set(role);
    try {
      return await fn();
    }
    finally {
      await set('member');
    }
  }

  // ------------------------------------------------------------ AC1: attach
  it('attaches two plans in one call and pools them: 8 of 10 + 4 of 10 is 12 of 20, 60%', async () => {
    const f = need();
    const ms = await newMilestone();
    const regression = await planWith({ passed: 8, failed: 2 });
    const smoke = await planWith({ passed: 4, notRun: 6 });

    const { data, error } = await attach(ms, [regression, smoke]);
    expect(error).toBeNull();
    expect(data).toEqual({ milestone_id: ms, attached_count: 2, plan_count: 2 });

    const r = await one(ms);
    expect(r.plan_count).toBe(2);
    expect(r.member_count).toBe(20);
    expect(r.counts.passed).toBe(12);
    expect(r.passed_pct).toBe(60);
    // attach order, each plan with its own progress
    expect(r.plans.map(p => p.plan_id).sort()).toEqual([regression, smoke].sort());
    const byId = new Map(r.plans.map(p => [p.plan_id, p]));
    expect(byId.get(regression)).toMatchObject({ member_count: 10, passed_pct: 80, status: 'open', frozen: false });
    expect(byId.get(smoke)).toMatchObject({ member_count: 10, passed_pct: 40 });
    expect(byId.get(smoke)?.counts).toEqual({ passed: 4, failed: 0, aborted: 0, in_progress: 0, not_run: 6 });

    const log = await history(ms, 'milestone.plans_attached');
    expect(log).toHaveLength(1);
    expect(log[0].actor_user_id).toBe(f.qaUserId);
    expect((log[0].payload as { count: number }).count).toBe(2);
  });

  it('derives readiness from a single plan: 3 of 5 is 60%', async () => {
    const ms = await newMilestone();
    const plan = await planWith({ passed: 3, failed: 2 });
    expect((await attach(ms, [plan])).error).toBeNull();
    const r = await one(ms);
    expect(r).toMatchObject({ plan_count: 1, member_count: 5, passed_pct: 60 });
    expect(r.plans).toHaveLength(1);
  });

  it('pools counts instead of averaging percentages, and floors: 9/10 + 1/2 is 83, 7 of 12 is 58', async () => {
    const pooled = await newMilestone();
    expect((await attach(pooled, [await planWith({ passed: 9, failed: 1 }), await planWith({ passed: 1, failed: 1 })])).error).toBeNull();
    const a = await one(pooled);
    expect(a.counts.passed).toBe(10);
    expect(a.member_count).toBe(12);
    expect(a.passed_pct).toBe(83);

    const floored = await newMilestone();
    expect((await attach(floored, [await planWith({ passed: 4, failed: 2 }), await planWith({ passed: 3, failed: 3 })])).error).toBeNull();
    const b = await one(floored);
    expect(b.counts.passed).toBe(7);
    expect(b.member_count).toBe(12);
    expect(b.passed_pct).toBe(58);
  });

  it('keeps three states apart: no plan (null), plans with no tests (null), 0 of 15 (0)', async () => {
    const none = await newMilestone();
    const noTests = await newMilestone();
    const zero = await newMilestone();
    expect((await attach(noTests, [await newPlan(), await newPlan()])).error).toBeNull();
    expect((await attach(zero, [await planWith({ failed: 10 }), await planWith({ notRun: 5 })])).error).toBeNull();

    const byId = new Map((await readiness([none, noTests, zero])).map(r => [r.milestone_id, r]));
    expect(byId.get(none)).toMatchObject({ plan_count: 0, member_count: 0, passed_pct: null, plans: [] });
    expect(byId.get(noTests)).toMatchObject({ plan_count: 2, member_count: 0, passed_pct: null });
    expect(byId.get(noTests)?.plans.every(p => p.passed_pct === null)).toBe(true);
    expect(byId.get(zero)).toMatchObject({ plan_count: 2, member_count: 15, passed_pct: 0 });
  });

  it('reaches 100 only when every pooled test passed', async () => {
    const full = await newMilestone();
    expect((await attach(full, [await planWith({ passed: 10 }), await planWith({ passed: 5 })])).error).toBeNull();
    expect((await one(full)).passed_pct).toBe(100);

    const almost = await newMilestone();
    expect((await attach(almost, [await planWith({ passed: 99, failed: 1 })])).error).toBeNull();
    expect((await one(almost)).passed_pct).toBe(99);
  });

  it('counts a closed plan by its frozen snapshot, and falls back to live progress without one', async () => {
    const ms = await newMilestone();
    // Live progress of this plan would be 0 of 0: the snapshot says 10 of 10.
    const frozen = await newPlan({ closed: { snapshot: {
      plan_id: ZERO_UUID,
      member_count: 10,
      passed_pct: 100,
      counts: { passed: 10, failed: 0, aborted: 0, in_progress: 0, not_run: 0 },
      tests: [],
    } } });
    const closedNoSnapshot = await newPlan({ closed: { snapshot: null } });
    const open = await planWith({ passed: 1, failed: 1 });
    expect((await attach(ms, [frozen, closedNoSnapshot, open])).error).toBeNull();

    const r = await one(ms);
    const byId = new Map(r.plans.map(p => [p.plan_id, p]));
    expect(byId.get(frozen)).toMatchObject({ status: 'closed', frozen: true, member_count: 10, passed_pct: 100 });
    expect(byId.get(closedNoSnapshot)).toMatchObject({ status: 'closed', frozen: false, member_count: 0, passed_pct: null });
    expect(r.member_count).toBe(12);
    expect(r.counts.passed).toBe(11);
    expect(r.passed_pct).toBe(91);
  });

  it('lets one plan serve two milestones, each with its own readiness', async () => {
    const release = await newMilestone();
    const hotfix = await newMilestone();
    const smoke = await planWith({ passed: 4, failed: 6 });
    const other = await planWith({ passed: 10 });
    expect((await attach(release, [smoke, other])).error).toBeNull();
    expect((await attach(hotfix, [smoke])).error).toBeNull();
    const byId = new Map((await readiness([release, hotfix])).map(r => [r.milestone_id, r]));
    expect(byId.get(release)?.passed_pct).toBe(70);
    expect(byId.get(hotfix)?.passed_pct).toBe(40);
  });

  // ------------------------------------------------------------ AC1: refusals
  it('rejects a duplicate with 45504 and applies nothing of a mixed selection', async () => {
    const ms = await newMilestone();
    const a = await newPlan();
    const b = await newPlan();
    expect((await attach(ms, [a])).error).toBeNull();

    const again = await attach(ms, [a]);
    expect(again.error?.code).toBe('45504');
    const mixed = await attach(ms, [b, a]);
    expect(mixed.error?.code).toBe('45504');
    expect(await memberships(ms)).toEqual([a]);
    // the same id twice in one selection is one membership, not an error
    const c = await newPlan();
    const twice = await attach(ms, [c, c]);
    expect(twice.error).toBeNull();
    expect((twice.data as { attached_count: number }).attached_count).toBe(1);
    expect(await memberships(ms)).toEqual([a, c].sort());
  });

  it('rejects another project, another workspace, an unknown id and a null element with ONE 45505 that echoes no id', async () => {
    const ms = await newMilestone();
    const otherProjectPlan = await newPlan({ project: 'other' });
    const foreignPlan = await newPlan({ project: 'foreign' });
    const ownPlan = await newPlan();
    for (const ids of [[otherProjectPlan], [foreignPlan], [ZERO_UUID], [ownPlan, otherProjectPlan]]) {
      const res = await attach(ms, ids);
      expect(res.error?.code).toBe('45505');
      expect(res.error?.message).toBe('plan_outside_project');
      for (const id of ids) {
        expect(JSON.stringify(res.error)).not.toContain(id);
      }
    }
    const withNull = await qa.rpc(ATTACH_RPC, { p_milestone_id: ms, p_test_plan_ids: [ownPlan, null] as unknown as string[] });
    expect(withNull.error?.code).toBe('45505');
    expect(await memberships(ms)).toEqual([]);
  });

  it('rejects an empty selection with 22023', async () => {
    const ms = await newMilestone();
    const res = await attach(ms, []);
    expect(res.error?.code).toBe('22023');
    expect(await memberships(ms)).toEqual([]);
  });

  it('caps a milestone at 50 plans (45506), checked across calls and within one call', async () => {
    const f = need();
    const rows = Array.from({ length: 51 }, (_, i) => ({
      workspace_id: f.workspaceId,
      project_id: f.projectId,
      name: `${PREFIX} cap plan ${i}`,
      status: 'open',
      created_by: f.qaUserId,
    }));
    const plans = mustRows(await service().from('test_plans').insert(rows).select('id'), 'cap plans').map(p => p.id);

    const atOnce = await newMilestone();
    expect((await attach(atOnce, plans)).error?.code).toBe('45506');
    expect(await memberships(atOnce)).toEqual([]);

    const stepwise = await newMilestone();
    expect((await attach(stepwise, plans.slice(0, 50))).error).toBeNull();
    expect((await attach(stepwise, [plans[50]])).error?.code).toBe('45506');
    expect((await memberships(stepwise))).toHaveLength(50);

    // the budget (D6): readiness of a full milestone answers in under 2 seconds
    const started = performance.now();
    const r = await one(stepwise);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
    expect(r.plan_count).toBe(50);
  });

  // ------------------------------------------------------------ AC3: detach
  it('detaches one plan, recalculates from the rest, and leaves the plan itself untouched', async () => {
    const f = need();
    const ms = await newMilestone();
    const regression = await planWith({ passed: 8, failed: 2 });
    const smoke = await planWith({ passed: 4, failed: 6 });
    expect((await attach(ms, [regression, smoke])).error).toBeNull();
    const planBefore = must(await service().from('test_plans').select('*').eq('id', smoke).single(), 'plan before');
    const { count: membersBefore } = await service().from('test_plan_tests').select('id', { count: 'exact', head: true }).eq('test_plan_id', smoke);

    const res = await detach(ms, smoke);
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ milestone_id: ms, test_plan_id: smoke, detached: true, plan_count: 1 });
    const r = await one(ms);
    expect(r).toMatchObject({ plan_count: 1, member_count: 10, passed_pct: 80 });

    const planAfter = must(await service().from('test_plans').select('*').eq('id', smoke).single(), 'plan after');
    expect(planAfter).toEqual(planBefore);
    const { count: membersAfter } = await service().from('test_plan_tests').select('id', { count: 'exact', head: true }).eq('test_plan_id', smoke);
    expect(membersAfter).toBe(membersBefore);

    const log = await history(ms, 'milestone.plan_detached');
    expect(log).toHaveLength(1);
    expect(log[0].actor_user_id).toBe(f.qaUserId);

    // detaching the last plan returns the milestone to "no readiness"
    expect((await detach(ms, regression)).error).toBeNull();
    expect(await one(ms)).toMatchObject({ plan_count: 0, member_count: 0, passed_pct: null, plans: [] });
  });

  it('detach is idempotent: a repeat succeeds, writes nothing and logs nothing', async () => {
    const ms = await newMilestone();
    const plan = await newPlan();
    expect((await attach(ms, [plan])).error).toBeNull();
    expect((await detach(ms, plan)).error).toBeNull();
    const again = await detach(ms, plan);
    expect(again.error).toBeNull();
    expect((again.data as { detached: boolean }).detached).toBe(false);
    expect(await history(ms, 'milestone.plan_detached')).toHaveLength(1);
    // never attached at all
    const never = await detach(ms, await newPlan());
    expect(never.error).toBeNull();
    expect((never.data as { detached: boolean }).detached).toBe(false);
  });

  it('detaching from one milestone keeps the plan on the other', async () => {
    const release = await newMilestone();
    const hotfix = await newMilestone();
    const smoke = await planWith({ passed: 4, failed: 6 });
    expect((await attach(release, [smoke])).error).toBeNull();
    expect((await attach(hotfix, [smoke])).error).toBeNull();
    expect((await detach(release, smoke)).error).toBeNull();
    expect(await memberships(release)).toEqual([]);
    expect(await memberships(hotfix)).toEqual([smoke]);
    expect((await one(hotfix)).passed_pct).toBe(40);
  });

  // ------------------------------------------------------------ authorization
  it('refuses a viewer with 42501 on attach and detach, and still lets the viewer read readiness', async () => {
    const ms = await newMilestone();
    const attached = await planWith({ passed: 1, failed: 1 });
    const extra = await newPlan();
    expect((await attach(ms, [attached])).error).toBeNull();

    await withRole('viewer', async () => {
      expect((await attach(ms, [extra])).error?.code).toBe('42501');
      expect((await detach(ms, attached)).error?.code).toBe('42501');
      const r = await one(ms);
      expect(r.passed_pct).toBe(50);
    });
    expect(await memberships(ms)).toEqual([attached]);
    // the authorization runs before the input checks: a viewer learns nothing
    await withRole('viewer', async () => {
      expect((await attach(ms, [])).error?.code).toBe('42501');
      expect((await attach(ms, [attached])).error?.code).toBe('42501');
    });
  });

  it('answers P0002 for a milestone in another workspace and for an unknown one, and leaves them out of readiness', async () => {
    const foreignMs = await newMilestone({ foreign: true });
    const foreignPlan = await newPlan({ project: 'foreign' });
    expect((await attach(foreignMs, [foreignPlan])).error?.code).toBe('P0002');
    expect((await detach(foreignMs, foreignPlan)).error?.code).toBe('P0002');
    expect((await attach(ZERO_UUID, [foreignPlan])).error?.code).toBe('P0002');
    expect((await detach(ZERO_UUID, foreignPlan)).error?.code).toBe('P0002');
    expect(await memberships(foreignMs)).toEqual([]);

    // seeded directly so there is something to hide
    const f = need();
    must(await service().from('milestone_plans').insert({ workspace_id: f.foreignWorkspaceId, milestone_id: foreignMs, test_plan_id: foreignPlan }).select('id').single(), 'foreign membership');
    const own = await newMilestone();
    const rs = await readiness([own, foreignMs, ZERO_UUID]);
    expect(rs.map(r => r.milestone_id)).toEqual([own]);
    const { data: visible } = await qa.from('milestone_plans').select('id').eq('milestone_id', foreignMs);
    expect(visible).toEqual([]);
  });

  it('fails closed without a session: the service role and anon cannot attach, detach or read', async () => {
    const ms = await newMilestone();
    const plan = await newPlan();
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    // The service role keeps EXECUTE (Supabase default privileges) but has no
    // auth.uid(): it is a member of nothing, so the membership check refuses it.
    expect((await attach(ms, [plan], service())).error?.code).toBe('P0002');
    expect((await detach(ms, plan, service())).error?.code).toBe('P0002');
    expect((await service().rpc(READINESS_RPC, { p_milestone_ids: [ms] })).error?.code).toBe('P0002');
    // anon holds no EXECUTE at all (revoked in 0112).
    expect((await attach(ms, [plan], anon)).error?.code).toBe('42501');
    expect((await detach(ms, plan, anon)).error?.code).toBe('42501');
    expect((await anon.rpc(READINESS_RPC, { p_milestone_ids: [ms] })).error?.code).toBe('42501');
    expect(await memberships(ms)).toEqual([]);
  });

  it('keeps the writers away from anon and from the read-only QA role (privileges)', async () => {
    const pgUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
    if (!pgUrl) {
      throw new Error(`${TAG} POSTGRES_URL(_NON_POOLING) is missing, so the function privileges cannot be checked; refusing to pass.`);
    }
    const sql = new SQL(pgUrl);
    try {
      const rows = await sql`
        select p.proname,
               p.prosecdef as definer,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
               has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
               case when exists (select 1 from pg_roles where rolname = 'qa_inspector_ro')
                    then has_function_privilege('qa_inspector_ro', p.oid, 'EXECUTE')
                    else false end as qa_ro_exec
          from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.proname in (${ATTACH_RPC}, ${DETACH_RPC}, ${READINESS_RPC})`;
      expect(rows.length).toBe(3);
      for (const row of rows) {
        expect(row.auth_exec).toBe(true);
        expect(row.anon_exec).toBe(false);
        if (row.proname === READINESS_RPC) {
          expect(row.definer).toBe(false);
        }
        else {
          expect(row.definer).toBe(true);
          expect(row.qa_ro_exec).toBe(false);
        }
      }
    }
    finally {
      await sql.end();
    }
  });
});
