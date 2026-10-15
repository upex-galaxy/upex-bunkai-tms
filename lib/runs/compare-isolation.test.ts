import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-442 — DB-integration guard for the Run comparison
// (`bunkai_compare_run`, migration 0092_run_compare.sql).
//
// Unlike the sibling Run reads this function is SECURITY INVOKER and takes NO
// identity parameter: row-level security on the CALLER'S OWN client is the only
// authorization, so a mocked `db.rpc` proves nothing about it. This suite signs
// in through the app's real password path as the declared automation identity
// (`QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD`, `.agents/project.yaml` ->
// `testing.automation_identity`), never a minted JWT and never an impersonated
// account (`live-ui-identity.md` §3 governs test code too). Service-role is used
// ONLY for fixture seed and teardown, which is sanctioned: it obtains no session.
//
// What it proves against the real database:
//   * the rulebook: the 16-cell status matrix, the five counts adding up, pairing
//     (insert, delete, move, reorder, reword, repeated ATC, repeated wording,
//     null equal to empty), the baseline rules (Environment, overlap, running,
//     aborted, equal instants, a null finished_at) and the four states;
//   * cross-workspace non-disclosure: a Run in a workspace the identity does not
//     belong to answers the SAME P0002 as a Run that does not exist, on data the
//     identity could not otherwise see;
//   * fail closed: a caller with no session (service role, which bypasses RLS) and
//     an anonymous caller get no data;
//   * read-only: Runs, run_atcs, run_steps and the activity log are identical
//     before and after comparing;
//   * the occurrence-key trigger (including a Run started through
//     `bunkai_create_run`) and the backfill rule;
//   * the 500-step budget (2 seconds, the PO's target).
//
// FAIL-CLOSED GATE. This file is evidence only when it EXECUTES. It is registered
// as SKIPPED, with a loud warning at module load, in exactly two legitimate cases:
//   1. there is no database environment at all (`NEXT_PUBLIC_SUPABASE_URL`,
//      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` absent: CI
//      without DB credentials), or
//   2. the database answers that `bunkai_compare_run` does not exist (migration
//      0092 not applied yet).
// In EVERY other case the suite FAILS instead of passing quietly: a missing
// automation identity, a failed login, a fixture that cannot be seeded (the suite
// seeds its OWN two workspaces, it never borrows existing data), or an unexpected
// answer from the probe. Every test also asserts at least one expectation
// (`expect.hasAssertions()`), so a test body that returns early cannot pass.
// A run counts as evidence only if its output shows zero skipped tests.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[compare-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran, so nothing here is evidence about the function.');
}
const RPC = 'bunkai_compare_run';

// Is the function deployed? A deployed function answers P0002 to a caller with no
// session (the service role) for any id. "Function does not exist" (42883 /
// PGRST202) is the one legitimate reason to skip; ANY other answer is a failure of
// the file itself, never a quiet skip.
let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc(RPC, { p_run_id: '00000000-0000-0000-0000-000000000000' });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[compare-isolation] SKIPPED ENTIRELY: ${RPC} is not deployed (${code}). Apply migration 0092_run_compare.sql. No assertion in this file ran, so nothing here is evidence about the function.`);
  }
  else {
    throw new Error(`[compare-isolation] unexpected answer from the ${RPC} deploy probe (${code}: ${probe.error?.message ?? 'no message'}). Expected P0002 (deployed) or 42883/PGRST202 (not deployed).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;
const PREFIX = `bk442-compare-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const BUDGET_MS = 2000;

type StepStatus = 'passed' | 'failed' | 'blocked' | 'skipped' | 'pending';
interface StepSpec { content: string, status: StepStatus, input?: string | null, expected?: string | null }
interface AtcSpec { key: string | null, title: string, steps: StepSpec[] }
interface RunSpec {
  test: string
  env?: 'staging' | 'production'
  status?: 'passed' | 'failed' | 'aborted' | 'running'
  start: string
  finish?: string | null
  abort?: string
  atcs: AtcSpec[]
  workspace?: 'own' | 'foreign'
}
interface Row { group: string, content: string, status: string | null, previous_status: string | null, atc_title: string }
interface Comparison {
  state: 'compared' | 'no_previous' | 'in_progress' | 'unreliable'
  run: { id: string, status: string, total_steps: number, skipped_steps: number, abort_reason: string | null, environment_name: string | null }
  previous: { id: string, status: string, total_steps: number, skipped_steps: number, abort_reason: string | null } | null
  counts?: Record<'new_failure' | 'still_failing' | 'newly_fixed' | 'unchanged_pass' | 'not_comparable' | 'shared' | 'added' | 'removed', number>
  nothing_changed?: boolean
  no_common_steps?: boolean
  rows?: Row[]
}
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  foreignProjectId: string
  envIds: { staging: string, production: string }
  foreignEnvId: string
  foreignTestId: string
  atcId: string
  chainTestId: string
  testRowIds: string[]
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// Seeding failures are test failures: every step throws, nothing is swallowed.
function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[compare-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

let fixture: Fixture | null = null;
let qa: ReturnType<typeof service>;
const seededRunIds: string[] = [];
const keyA = crypto.randomUUID();
const keyB = crypto.randomUUID();

// A test that runs while the fixture is missing FAILS (it never passes vacuously).
function need(): Fixture {
  if (!fixture) {
    throw new Error('[compare-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

describeOrSkip('BK-442 — bunkai_compare_run against the real database', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[compare-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present (the function is INVOKER: only a real session proves it).');
    }
    const db = service();

    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`[compare-isolation] QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    const qaUserId = signIn.user.id;

    // The suite seeds BOTH workspaces itself. The identity is an active member of
    // the first one and has no membership at all in the second, so the
    // cross-workspace refusal never depends on what else lives in the database.
    const ownWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId }).select('id').single(), 'own workspace');
    const workspaceId = ownWs.id as string;
    must(await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id').single(), 'own membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId }).select('id').single(), 'foreign workspace');
    const foreignWorkspaceId = foreignWs.id as string;

    const project = must(await db.from('projects').insert({ workspace_id: workspaceId, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const envs = must(await db.from('project_environments')
      .insert([{ project_id: project.id, name: 'Staging' }, { project_id: project.id, name: 'Production' }])
      .select('id, name'), 'environments');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWorkspaceId, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');
    const foreignEnv = must(await db.from('project_environments').insert({ project_id: foreignProject.id, name: 'Staging' }).select('id').single(), 'foreign environment');
    const foreignTest = must(await db.from('tests').insert({ workspace_id: foreignWorkspaceId, title: `${PREFIX} foreign test`, created_by: qaUserId }).select('id').single(), 'foreign test');

    // One REAL ATC with two steps, chained into one Test: the Test a Run is started
    // on through `bunkai_create_run`, and the ATC the trigger case points at.
    const moduleRow = must(await db.from('modules').insert({ project_id: project.id, path: 'bk442', name: 'bk442' }).select('id').single(), 'module');
    const story = must(await db.from('user_stories').insert({ module_id: moduleRow.id, title: `${PREFIX} story` }).select('id').single(), 'user story');
    const atc = must(await db.from('atcs').insert({
      project_id: project.id,
      module_id: moduleRow.id,
      user_story_id: story.id,
      slug: `${PREFIX}-atc`,
      title: `${PREFIX} atc`,
      layer: 'UI',
    }).select('id').single(), 'atc');
    must(await db.from('atc_steps').insert([
      { atc_id: atc.id, position: 0, content: 'open the page' },
      { atc_id: atc.id, position: 1, content: 'check the result', expected: 'visible' },
    ]).select('id'), 'atc steps');
    const chainTest = must(await db.from('tests').insert({ workspace_id: workspaceId, title: `${PREFIX} chain`, created_by: qaUserId }).select('id').single(), 'chain test');
    must(await db.from('test_steps').insert({ test_id: chainTest.id, atc_id: atc.id, position: 1 }).select('id').single(), 'chain test step');

    fixture = {
      workspaceId,
      foreignWorkspaceId,
      qaUserId,
      projectId: project.id as string,
      foreignProjectId: foreignProject.id as string,
      envIds: {
        staging: envs.find(e => e.name === 'Staging')!.id as string,
        production: envs.find(e => e.name === 'Production')!.id as string,
      },
      foreignEnvId: foreignEnv.id as string,
      foreignTestId: foreignTest.id as string,
      atcId: atc.id as string,
      chainTestId: chainTest.id as string,
      testRowIds: [foreignTest.id as string, chainTest.id as string],
    };
  });

  afterAll(async () => {
    const f = fixture;
    if (!f) { return; }
    const db = service();
    // Children before parents: runs.test_id and test_steps.atc_id are ON DELETE
    // RESTRICT; run_atcs/run_steps cascade from runs; the workspaces cascade the rest.
    await db.from('runs').delete().in('workspace_id', [f.workspaceId, f.foreignWorkspaceId]);
    await db.from('tests').delete().in('id', f.testRowIds);
    await db.from('projects').delete().in('id', [f.projectId, f.foreignProjectId]);
    await db.from('workspace_members').delete().eq('workspace_id', f.workspaceId);
    await db.from('workspaces').delete().in('id', [f.workspaceId, f.foreignWorkspaceId]);
  });

  // ---------------------------------------------------------------- seeding
  // One Test row per case name, created on demand, so no case ever sees another
  // case's Runs as its baseline (the Previous run is scoped to the Test).
  const testsByName = new Map<string, string>();
  async function testFor(name: string): Promise<string> {
    const known = testsByName.get(name);
    if (known) { return known; }
    const { data, error } = await service().from('tests').insert({ workspace_id: need().workspaceId, title: `${PREFIX} ${name}`, created_by: need().qaUserId }).select('id').single();
    if (error) { throw error; }
    testsByName.set(name, data.id as string);
    need().testRowIds.push(data.id as string);
    return data.id as string;
  }

  let pairCounter = 0;
  async function seedRun(spec: RunSpec): Promise<string> {
    const f = need();
    const db = service();
    const foreign = spec.workspace === 'foreign';
    const status = spec.status ?? 'passed';
    const { data: run, error } = await db.from('runs').insert({
      workspace_id: foreign ? f.foreignWorkspaceId : f.workspaceId,
      project_id: foreign ? f.foreignProjectId : f.projectId,
      test_id: foreign ? f.foreignTestId : await testFor(spec.test),
      environment_id: foreign ? f.foreignEnvId : f.envIds[spec.env ?? 'staging'],
      status,
      executor_mode: 'human',
      abort_reason: status === 'aborted' ? (spec.abort ?? 'seeded abort') : null,
      start_token: `${PREFIX}-${seededRunIds.length}`,
      test_title: `${PREFIX} title`,
      started_at: spec.start,
      finished_at: spec.finish === undefined ? (status === 'running' ? null : spec.start) : spec.finish,
    }).select('id').single();
    if (error) { throw error; }
    const runId = run.id as string;
    seededRunIds.push(runId);

    for (const [index, atc] of spec.atcs.entries()) {
      // atc_id stays null (it is an FK to a real ATC); the occurrence key is set
      // explicitly. A null `key` leaves BOTH null, which is the "unreliable" fixture.
      const { data: ra, error: raError } = await db.from('run_atcs').insert({
        run_id: runId,
        atc_id: null,
        source_atc_id: atc.key,
        position: index + 1,
        atc_title: atc.title,
      }).select('id').single();
      if (raError) { throw raError; }
      const { error: stepsError } = await db.from('run_steps').insert(atc.steps.map((s, i) => ({
        run_atc_id: ra.id,
        position: i,
        content: s.content,
        input_data: s.input ?? null,
        expected: s.expected ?? null,
        status: s.status,
      })));
      if (stepsError) { throw stepsError; }
    }
    return runId;
  }

  async function compare(runId: string): Promise<Comparison> {
    const { data, error } = await qa.rpc(RPC, { p_run_id: runId });
    if (error) { throw error; }
    return data as unknown as Comparison;
  }

  // Two consecutive Runs of a brand-new Test, both in Staging: the Previous run and
  // the viewed Run.
  type PairSide = Omit<RunSpec, 'test' | 'start'> & Partial<RunSpec>;
  async function pair(prev: PairSide, cur: PairSide) {
    const test = `pair${++pairCounter}`;
    const a = await seedRun({ test, start: '2026-03-01T09:00:00.000Z', finish: '2026-03-01T09:20:00.000Z', ...prev });
    const b = await seedRun({ test, start: '2026-03-02T09:00:00.000Z', finish: '2026-03-02T09:25:00.000Z', ...cur });
    return { previousId: a, currentId: b, result: await compare(b) };
  }

  const rowsOf = (c: Comparison) => (c.rows ?? []).map(r => `${r.group}:${r.content}:${r.previous_status ?? '-'}>${r.status ?? '-'}`);
  const steps = (...pairs: Array<[string, StepStatus]>): StepSpec[] => pairs.map(([content, status]) => ({ content, status }));

  // ----------------------------------------------------------------- the rulebook
  it('worked example: five outcomes, counts add up, fixed group order', async () => {
    need();
    const { previousId, result } = await pair(
      { atcs: [{ key: keyA, title: 'Add item', steps: steps(['A1', 'passed'], ['A2', 'passed'], ['A3', 'failed']) }, { key: keyB, title: 'Pay', steps: steps(['B1', 'passed'], ['B2', 'failed'], ['B3', 'blocked'], ['B4', 'skipped']) }] },
      { status: 'failed', atcs: [{ key: keyA, title: 'Add item', steps: steps(['A1', 'passed'], ['A2', 'failed'], ['A3', 'failed']) }, { key: keyB, title: 'Pay', steps: steps(['B1', 'passed'], ['B2', 'passed'], ['B3', 'passed'], ['B4', 'passed']) }] },
    );
    expect(result.state).toBe('compared');
    expect(result.previous?.id).toBe(previousId);
    expect(result.counts).toEqual({ new_failure: 1, still_failing: 1, newly_fixed: 1, unchanged_pass: 2, not_comparable: 2, shared: 7, added: 0, removed: 0 });
    const c = result.counts!;
    expect(c.new_failure + c.still_failing + c.newly_fixed + c.unchanged_pass + c.not_comparable).toBe(c.shared);
    expect(rowsOf(result)).toEqual([
      'new_failure:A2:passed>failed',
      'still_failing:A3:failed>failed',
      'newly_fixed:B2:failed>passed',
      'not_comparable:B3:blocked>passed',
      'not_comparable:B4:skipped>passed',
      'unchanged_pass:A1:passed>passed',
      'unchanged_pass:B1:passed>passed',
    ]);
    expect([result.nothing_changed, result.no_common_steps]).toEqual([false, false]);
    expect(result.run.environment_name).toBe('Staging');
  });

  it('classifies all 16 status pairs: 4 comparable, 12 not comparable', async () => {
    need();
    const all: StepStatus[] = ['passed', 'failed', 'blocked', 'skipped'];
    const grid = all.flatMap(p => all.map(t => ({ p, t })));
    const { result } = await pair(
      { atcs: [{ key: keyA, title: 'grid', steps: grid.map(g => ({ content: `${g.p}-${g.t}`, status: g.p })) }] },
      { atcs: [{ key: keyA, title: 'grid', steps: grid.map(g => ({ content: `${g.p}-${g.t}`, status: g.t })) }] },
    );
    const expected: Record<string, string> = { 'passed>failed': 'new_failure', 'failed>failed': 'still_failing', 'failed>passed': 'newly_fixed', 'passed>passed': 'unchanged_pass' };
    expect(result.rows).toHaveLength(16);
    for (const r of result.rows!) {
      expect(r.group).toBe(expected[`${r.previous_status}>${r.status}`] ?? 'not_comparable');
    }
    expect(result.counts!.not_comparable).toBe(12);
  });

  it('says nothing changed only when every shared step is an unchanged pass or still failing', async () => {
    need();
    const same = [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'failed']) }];
    const { result } = await pair({ atcs: same }, { atcs: same });
    expect([result.nothing_changed, result.counts!.still_failing]).toEqual([true, 1]);

    const withNotComparable = await pair({ atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'blocked']) }] }, { atcs: same });
    expect(withNotComparable.result.nothing_changed).toBe(false);

    // Equal shared outcomes plus ONE Added step: the sentence must be absent, the structural change shown.
    const withAdded = await pair({ atcs: same }, { atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'failed'], ['extra', 'passed']) }] });
    expect([withAdded.result.counts!.added, withAdded.result.counts!.shared, withAdded.result.counts!.unchanged_pass, withAdded.result.counts!.still_failing]).toEqual([1, 2, 1, 1]);
    expect(withAdded.result.nothing_changed).toBe(false);

    // Equal shared outcomes plus ONE Removed step: same.
    const withRemoved = await pair({ atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'failed'], ['gone', 'passed']) }] }, { atcs: same });
    expect([withRemoved.result.counts!.removed, withRemoved.result.counts!.shared]).toEqual([1, 2]);
    expect(withRemoved.result.nothing_changed).toBe(false);
  });

  it('reports a fully reworded Run as no common step, never as nothing changed', async () => {
    need();
    const { result } = await pair(
      { atcs: [{ key: keyA, title: 'x', steps: steps(['old1', 'passed'], ['old2', 'failed']) }] },
      { atcs: [{ key: keyA, title: 'x', steps: steps(['new1', 'passed'], ['new2', 'failed']) }] },
    );
    expect([result.no_common_steps, result.nothing_changed, result.counts!.shared, result.counts!.added, result.counts!.removed]).toEqual([true, false, 0, 2, 2]);
    // Failed rows come first inside Added; Removed follows the Previous run's order.
    expect(rowsOf(result)).toEqual(['added:new2:->failed', 'added:new1:->passed', 'removed:old1:passed>-', 'removed:old2:failed>-']);
  });

  it('pairs through re-save, move and reorder; only an inserted or deleted step is Added or Removed', async () => {
    need();
    const { result } = await pair(
      { atcs: [{ key: keyA, title: 'x', steps: steps(['a', 'passed'], ['b', 'passed'], ['c', 'passed']) }, { key: keyB, title: 'y', steps: steps(['d', 'passed']) }] },
      { atcs: [{ key: keyB, title: 'y renamed', steps: steps(['d', 'passed']) }, { key: keyA, title: 'x', steps: steps(['c', 'passed'], ['NEW', 'failed'], ['a', 'passed']) }] },
    );
    expect([result.counts!.added, result.counts!.removed, result.counts!.unchanged_pass, result.counts!.shared]).toEqual([1, 1, 3, 3]);
    // One step is shared AND one is Added/Removed: never "nothing changed".
    expect([result.nothing_changed, result.no_common_steps]).toEqual([false, false]);
    expect(rowsOf(result).filter(r => r.startsWith('added') || r.startsWith('removed'))).toEqual(['added:NEW:->failed', 'removed:b:passed>-']);
  });

  it('treats null and empty input/expected as equal and any other change as Removed plus Added', async () => {
    need();
    const { result } = await pair(
      { atcs: [{ key: keyA, title: 'x', steps: [{ content: 's', status: 'passed', input: null, expected: '' }, { content: 't', status: 'passed', input: 'in', expected: 'ex1' }] }] },
      { atcs: [{ key: keyA, title: 'x', steps: [{ content: 's', status: 'passed', input: '', expected: null }, { content: 't', status: 'passed', input: 'in', expected: 'ex2' }] }] },
    );
    expect([result.counts!.unchanged_pass, result.counts!.added, result.counts!.removed]).toEqual([1, 1, 1]);
  });

  it('pairs a repeated ATC 1st-1st and 2nd-2nd and reports an occurrence added at the end as Added (database level)', async () => {
    need();
    const two = (a: StepStatus, b: StepStatus): AtcSpec[] => [{ key: keyA, title: 'x', steps: steps(['s', a]) }, { key: keyA, title: 'x', steps: steps(['s', b]) }];
    const first = await pair({ atcs: two('passed', 'failed') }, { atcs: two('failed', 'failed') });
    expect([first.result.counts!.new_failure, first.result.counts!.still_failing, first.result.counts!.added, first.result.counts!.removed]).toEqual([1, 1, 0, 0]);
    const added = await pair({ atcs: two('failed', 'failed') }, { atcs: [...two('failed', 'failed'), { key: keyA, title: 'x', steps: steps(['s', 'passed']) }] });
    expect([added.result.counts!.still_failing, added.result.counts!.added]).toEqual([2, 1]);
  });

  it('pairs repeated wording only when both Runs hold the same number of copies', async () => {
    need();
    const equal = await pair(
      { atcs: [{ key: keyA, title: 'x', steps: steps(['same', 'passed'], ['same', 'failed'], ['other', 'passed']) }] },
      { atcs: [{ key: keyA, title: 'x', steps: steps(['same', 'failed'], ['same', 'passed'], ['other', 'passed']) }] },
    );
    expect([equal.result.counts!.new_failure, equal.result.counts!.newly_fixed, equal.result.counts!.unchanged_pass, equal.result.counts!.added]).toEqual([1, 1, 1, 0]);
    const unequal = await pair(
      { atcs: [{ key: keyA, title: 'x', steps: steps(['same', 'passed'], ['same', 'failed']) }] },
      { atcs: [{ key: keyA, title: 'x', steps: steps(['same', 'passed']) }] },
    );
    expect([unequal.result.counts!.shared, unequal.result.counts!.added, unequal.result.counts!.removed]).toEqual([0, 1, 2]);
  });

  // ----------------------------------------------------------------- baseline and states
  it('picks the latest earlier Run of the same Test AND Environment, any executor', async () => {
    need();
    const atcs = [{ key: keyA, title: 'x', steps: steps(['s', 'passed']) }];
    const r1 = await seedRun({ test: 'case9', start: '2026-04-01T09:00:00.000Z', finish: '2026-04-01T09:10:00.000Z', atcs });
    await seedRun({ test: 'case9', env: 'production', start: '2026-04-02T09:00:00.000Z', atcs });
    const r3 = await seedRun({ test: 'case9', start: '2026-04-03T09:00:00.000Z', atcs });
    expect((await compare(r3)).previous?.id).toBe(r1);
  });

  it('skips a Run that was still open when the viewed Run started, even if it closed later', async () => {
    need();
    const atcs = [{ key: keyA, title: 'x', steps: steps(['s', 'passed']) }];
    const r1 = await seedRun({ test: 'case10', start: '2026-05-01T08:00:00.000Z', finish: '2026-05-01T08:30:00.000Z', atcs });
    await seedRun({ test: 'case10', start: '2026-05-01T09:00:00.000Z', finish: '2026-05-01T09:40:00.000Z', atcs });
    const r2 = await seedRun({ test: 'case10', start: '2026-05-01T09:30:00.000Z', finish: '2026-05-01T09:50:00.000Z', atcs });
    expect((await compare(r2)).previous?.id).toBe(r1);
  });

  it('never uses an in-progress Run as either side', async () => {
    need();
    const atcs = [{ key: keyA, title: 'x', steps: steps(['s', 'passed']) }];
    const r1 = await seedRun({ test: 'case11', start: '2026-06-01T08:00:00.000Z', finish: '2026-06-01T08:10:00.000Z', atcs });
    const running = await seedRun({ test: 'case11', status: 'running', start: '2026-06-01T09:00:00.000Z', atcs: [{ key: keyA, title: 'x', steps: steps(['s', 'pending']) }] });
    const r3 = await seedRun({ test: 'case11', start: '2026-06-01T10:00:00.000Z', finish: '2026-06-01T10:10:00.000Z', atcs });
    expect((await compare(r3)).previous?.id).toBe(r1);
    const inProgress = await compare(running);
    expect([inProgress.state, inProgress.previous, inProgress.rows, inProgress.counts]).toEqual(['in_progress', null, undefined, undefined]);
  });

  it('answers no_previous for the only Run, the oldest Run and a Run whose earlier Runs are elsewhere', async () => {
    need();
    const atcs = [{ key: keyA, title: 'x', steps: steps(['s', 'passed']) }];
    const only = await seedRun({ test: 'case12', env: 'production', start: '2026-07-01T09:00:00.000Z', finish: '2026-07-01T09:10:00.000Z', atcs });
    const first = await compare(only);
    expect([first.state, first.previous, first.rows, first.counts]).toEqual(['no_previous', null, undefined, undefined]);
    expect(first.run.environment_name).toBe('Production');
    const staging = await seedRun({ test: 'case12', env: 'staging', start: '2026-07-02T09:00:00.000Z', finish: '2026-07-02T09:10:00.000Z', atcs });
    expect((await compare(staging)).state).toBe('no_previous');
  });

  it('treats strict "<" on finished versus started, a null finished_at, and equal started_at ties', async () => {
    need();
    const atcs = [{ key: keyA, title: 'x', steps: steps(['s', 'passed']) }];
    // finished exactly when the viewed Run started: not earlier, so not a Previous run.
    await seedRun({ test: 'case13', env: 'production', start: '2026-08-01T08:00:00.000Z', finish: '2026-08-02T08:00:00.000Z', atcs });
    // a terminal Run with no finished_at is not eligible either.
    await seedRun({ test: 'case13', env: 'production', start: '2026-08-01T07:00:00.000Z', finish: null, atcs });
    const viewed = await seedRun({ test: 'case13', env: 'production', start: '2026-08-02T08:00:00.000Z', finish: '2026-08-02T08:10:00.000Z', atcs });
    expect((await compare(viewed)).state).toBe('no_previous');
    // identical started_at: the greater Run id wins.
    const t1 = await seedRun({ test: 'case13', env: 'production', start: '2026-09-01T08:00:00.000Z', finish: '2026-09-01T08:10:00.000Z', atcs });
    const t2 = await seedRun({ test: 'case13', env: 'production', start: '2026-09-01T08:00:00.000Z', finish: '2026-09-01T08:10:00.000Z', atcs });
    const tv = await seedRun({ test: 'case13', env: 'production', start: '2026-09-02T08:00:00.000Z', finish: '2026-09-02T08:10:00.000Z', atcs });
    expect((await compare(tv)).previous?.id).toBe([t1, t2].sort().at(-1));
  });

  it('carries the abort reason and the skipped count, and never calls an unreached step newly fixed', async () => {
    need();
    const { previousId, result } = await pair(
      { status: 'aborted', abort: 'environment down', atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'failed'], ['s2', 'skipped'], ['s3', 'skipped']) }] },
      { atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'passed'], ['s3', 'passed']) }] },
    );
    expect(result.previous).toMatchObject({ id: previousId, status: 'aborted', abort_reason: 'environment down', skipped_steps: 2, total_steps: 3 });
    expect([result.counts!.newly_fixed, result.counts!.not_comparable]).toEqual([1, 2]);
    // a swept Run with every step marked has nothing skipped: no unreached claim.
    const swept = await pair(
      { status: 'aborted', abort: 'inactivity', atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'failed']) }] },
      { atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'failed']) }] },
    );
    expect(swept.result.previous?.skipped_steps).toBe(0);
  });

  it('answers unreliable, with no counts, when an ATC occurrence key is missing (database level)', async () => {
    need();
    const { result } = await pair(
      { atcs: [{ key: null, title: 'x', steps: steps(['s', 'passed']) }] },
      { atcs: [{ key: keyA, title: 'x', steps: steps(['s', 'passed']) }] },
    );
    expect([result.state, result.counts, result.rows]).toEqual(['unreliable', undefined, undefined]);
    expect(result.previous).not.toBeNull();
  });

  it('keeps every shared step not comparable when a Run finished with nothing executed', async () => {
    need();
    const { result } = await pair(
      { atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'passed']) }] },
      { atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'skipped'], ['s2', 'skipped']) }] },
    );
    expect([result.counts!.not_comparable, result.counts!.shared, result.nothing_changed]).toEqual([2, 2, false]);
  });

  // ----------------------------------------------------------------- the trigger
  it('fills the occurrence key from atc_id on insert and keeps an explicit key', async () => {
    const f = need();
    const db = service();
    const runId = await seedRun({ test: 'trigger', start: '2026-10-01T00:00:00.000Z', atcs: [] });
    const explicit = crypto.randomUUID();
    const kept = must(await db.from('run_atcs')
      .insert({ run_id: runId, atc_id: null, source_atc_id: explicit, position: 1, atc_title: 'explicit' })
      .select('source_atc_id')
      .single(), 'explicit key row');
    expect(kept.source_atc_id).toBe(explicit);
    const bare = must(await db.from('run_atcs')
      .insert({ run_id: runId, atc_id: null, position: 2, atc_title: 'null stays null' })
      .select('source_atc_id')
      .single(), 'bare row');
    expect(bare.source_atc_id).toBeNull();
    // A REAL ATC (seeded by this suite): the key is filled from atc_id.
    const filled = must(await db.from('run_atcs')
      .insert({ run_id: runId, atc_id: f.atcId, position: 3, atc_title: 'filled' })
      .select('atc_id, source_atc_id')
      .single(), 'filled row');
    expect(filled.source_atc_id).toBe(f.atcId);
  });

  it('snapshots the key when a Run is started through bunkai_create_run, and no existing row was left without one', async () => {
    const f = need();
    const db = service();
    const started = await db.rpc('bunkai_create_run', {
      p_actor_user_id: f.qaUserId,
      p_test_id: f.chainTestId,
      p_environment_id: f.envIds.staging,
      p_executor_mode: 'human',
      p_start_token: `${PREFIX}-created`,
    });
    if (started.error) { throw new Error(`bunkai_create_run failed: ${started.error.message}`); }
    const runId = (started.data as { id: string }).id;
    seededRunIds.push(runId);
    const rows = must(await db.from('run_atcs').select('atc_id, source_atc_id').eq('run_id', runId), 'run_atcs of the started Run');
    expect(rows).toHaveLength(1);
    expect(rows[0].atc_id).toBe(f.atcId);
    expect(rows[0].source_atc_id).toBe(f.atcId);

    // Post-apply backfill check over the WHOLE table: no row may have a non-null
    // atc_id and no key. A null key with a null atc_id is the legitimate
    // "unreliable" case and is not counted here.
    const missing = await db.from('run_atcs').select('id', { count: 'exact', head: true }).is('source_atc_id', null).not('atc_id', 'is', null);
    if (missing.error) { throw new Error(`backfill check failed: ${missing.error.message}`); }
    expect(missing.count).toBe(0);
  });

  // ----------------------------------------------------------------- access and read-only
  it('gives a Run in a workspace the identity does not belong to the SAME P0002 as a missing Run', async () => {
    need();
    const foreign = await seedRun({ test: 'case18', workspace: 'foreign', start: '2026-03-01T09:00:00.000Z', atcs: [{ key: keyA, title: 'x', steps: steps(['s', 'passed']) }] });
    const [foreignResult, missingResult] = await Promise.all([qa.rpc(RPC, { p_run_id: foreign }), qa.rpc(RPC, { p_run_id: ZERO_UUID })]);
    expect(foreignResult.error?.code).toBe('P0002');
    expect(foreignResult.data).toBeNull();
    expect(missingResult.error?.code).toBe('P0002');
    expect(missingResult.data).toBeNull();
    expect(foreignResult.error?.message).toBe(missingResult.error?.message);
    // the service role CAN see that Run, so the refusal above came from the caller's
    // identity and not from the data being absent.
    const { data: visible } = await service().from('runs').select('id').eq('id', foreign).maybeSingle();
    expect(visible?.id).toBe(foreign);
  });

  it('fails closed for a caller with no session: service role bypasses RLS but gets no data, anon cannot execute', async () => {
    need();
    const atcs = [{ key: keyA, title: 'x', steps: steps(['s', 'passed']) }];
    const own = await seedRun({ test: 'case19', start: '2026-03-10T09:00:00.000Z', atcs });
    const asService = await service().rpc(RPC, { p_run_id: own });
    expect(asService.error?.code).toBe('P0002');
    expect(asService.data).toBeNull();

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const asAnon = await anon.rpc(RPC, { p_run_id: own });
    expect(asAnon.data).toBeNull();
    expect(asAnon.error).not.toBeNull();
    expect(['42501', 'PGRST202']).toContain(asAnon.error?.code ?? '');
  });

  it('writes nothing: Runs, run_atcs, run_steps and the activity log are identical after comparing', async () => {
    need();
    const db = service();
    const { currentId } = await pair(
      { atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'passed'], ['s2', 'failed']) }] },
      { atcs: [{ key: keyA, title: 'x', steps: steps(['s1', 'failed'], ['s2', 'passed']) }] },
    );
    const snapshot = async () => {
      const [runs, atcs, runSteps, activity] = await Promise.all([
        db.from('runs').select('*').eq('workspace_id', need().workspaceId).like('start_token', `${PREFIX}%`).order('id'),
        db.from('run_atcs').select('*').in('run_id', seededRunIds).order('id'),
        db.from('run_steps').select('*, run_atcs!inner(run_id)').in('run_atcs.run_id', seededRunIds).order('id'),
        db.from('activity_log').select('id', { count: 'exact', head: true }).eq('workspace_id', need().workspaceId),
      ]);
      return JSON.stringify([runs.data, atcs.data, runSteps.data, activity.count]);
    };
    const before = await snapshot();
    await compare(currentId);
    await compare(currentId);
    expect(await snapshot()).toBe(before);
  });

  // ----------------------------------------------------------------- budget
  it('compares two 500-step Runs within the 2 second budget', async () => {
    need();
    const keys = Array.from({ length: 10 }, () => crypto.randomUUID());
    const build = (flip: (atc: number, step: number) => StepStatus): AtcSpec[] => keys.map((key, a) => ({
      key,
      title: `big ${a}`,
      steps: Array.from({ length: 50 }, (_, s) => ({ content: `step ${a}-${s}`, status: flip(a, s) })),
    }));
    const { currentId } = await pair(
      { atcs: build((a, s) => ((a + s) % 7 === 0 ? 'failed' : 'passed')) },
      { atcs: build((a, s) => ((a + s) % 5 === 0 ? 'failed' : 'passed')) },
    );
    const started = performance.now();
    const result = await compare(currentId);
    const elapsed = performance.now() - started;
    console.warn(`[compare-isolation] 500-step comparison: ${elapsed.toFixed(0)} ms round trip (budget ${BUDGET_MS} ms), ${result.rows?.length ?? 0} rows.`);
    expect(result.counts!.shared).toBe(500);
    expect(elapsed).toBeLessThanOrEqual(BUDGET_MS);
  });
});
