import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'bun:test';

// BK-1220 — DB-integration proof for migration 0108
// (0108_project_coverage_repeated_atc_tiebreak.sql): an ATC that sits at
// several positions of one Test chain gets the same coverage state for the
// same data, whatever random ids its run_atcs rows were given.
//
// Why the fixture pins run_atcs ids. The bug is not runtime randomness: under
// 0090 the ATC's row is picked by `ra.id desc` once the Run's started_at ties,
// so ONE seeded dataset answers the same thing on every call, buggy or not.
// A repeated-call assertion alone can never catch it. Instead each case is
// seeded TWICE with identical shape, once with the executed row holding the
// higher id and once with the not-executed row holding it (ids generated here
// and compared as lowercase hex, which is Postgres's uuid order). 0090 answers
// the two twins differently; 0108 must answer them identically.
//
//   sameRunPassedHigh / sameRunSkippedHigh  one Run, ATC at positions 1
//     (passed) and 2 (skipped): the Run stopped between them (the QA repro).
//   tiedRunsPassedHigh / tiedRunsSkippedHigh  two Runs sharing started_at, the
//     ATC passed in one and skipped in the other.
//   noneExecuted   both positions of the latest Run unexecuted (blocked,
//     skipped): still not run, the passed/failed allowlist is unchanged.
//   earlierPassThenSkipped   passed in an older Run, both positions skipped in
//     the latest Run: still not run (point-in-time, BK-46 decision A1).
//
// Service role is used ONLY to seed and tear down fixture rows and to call the
// RPC with an explicit actor id (the coverage-isolation.test.ts precedent). No
// session is obtained and no auth user is created or changed.
//
// FAIL-CLOSED GATE. This file is evidence only when it EXECUTES. It is
// registered as SKIPPED, with a loud warning at module load, in exactly two
// cases:
//   1. no database environment (NEXT_PUBLIC_SUPABASE_URL and
//      SUPABASE_SERVICE_ROLE_KEY absent: CI without DB credentials), or
//   2. the database still answers exactly as 0090 predicts for the twins
//      (migration 0108 not applied yet): reported as PENDING MIGRATION APPLY.
// Every other outcome FAILS: no active workspace member to anchor the fixture,
// a seed or cleanup error, or a report matching neither the old nor the new
// rule. Every test asserts at least once (`expect.hasAssertions()`). A run
// counts as evidence only if its output shows zero skipped tests.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDbEnv = Boolean(url && serviceKey);

const RPC = 'bunkai_report_project_coverage';
const PREFIX = `bk1220-repeated-atc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TAG = '[coverage-repeated-atc]';

type CaseKey =
  | 'sameRunPassedHigh'
  | 'sameRunSkippedHigh'
  | 'tiedRunsPassedHigh'
  | 'tiedRunsSkippedHigh'
  | 'noneExecuted'
  | 'earlierPassThenSkipped';

interface ModuleRow { module_id: string, ac_total: number, ac_uncovered: number, ac_not_run: number, ac_executed: number, status: string }
interface CoveragePayload { modules: ModuleRow[] }
interface Fixture { actorUserId: string, projectId: string, moduleIds: Record<CaseKey, string> }

const CASES: CaseKey[] = [
  'sameRunPassedHigh',
  'sameRunSkippedHigh',
  'tiedRunsPassedHigh',
  'tiedRunsSkippedHigh',
  'noneExecuted',
  'earlierPassThenSkipped',
];

// What each rule answers for the fixture. OLD is derived from 0090's
// `r.started_at desc, ra.id desc`: the higher id wins the tie.
const EXPECTED_0108: Record<CaseKey, string> = {
  sameRunPassedHigh: 'fully_covered',
  sameRunSkippedHigh: 'fully_covered',
  tiedRunsPassedHigh: 'fully_covered',
  tiedRunsSkippedHigh: 'fully_covered',
  noneExecuted: 'not_run',
  earlierPassThenSkipped: 'not_run',
};
const PREDICTED_0090: Record<CaseKey, string> = {
  ...EXPECTED_0108,
  sameRunSkippedHigh: 'not_run',
  tiedRunsSkippedHigh: 'not_run',
};

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// Two fresh uuids, returned as [higher, lower] in Postgres uuid order.
function idPair(): [string, string] {
  const a = randomUUID();
  const b = randomUUID();
  return a > b ? [a, b] : [b, a];
}

let createdProjectId: string | null = null;
let createdTestId: string | null = null;

async function cleanup(): Promise<void> {
  const db = service();
  // Deleting the Project cascades modules, stories, ACs, ATCs, links,
  // environments, Runs and run_atcs. The Test row is ON DELETE RESTRICT from
  // runs.test_id, so it goes after the Project (and its Runs) are gone.
  if (createdProjectId) {
    const { error } = await db.from('projects').delete().eq('id', createdProjectId);
    if (error) { throw new Error(`${TAG} cleanup failed deleting project ${createdProjectId}: ${error.message}`); }
    createdProjectId = null;
  }
  if (createdTestId) {
    const { error } = await db.from('tests').delete().eq('id', createdTestId);
    if (error) { throw new Error(`${TAG} cleanup failed deleting test ${createdTestId}: ${error.message}`); }
    createdTestId = null;
  }
}

async function seed(): Promise<Fixture> {
  const db = service();

  const { data: members, error: membersError } = await db
    .from('workspace_members')
    .select('user_id, workspace_id')
    .eq('status', 'active')
    .limit(1);
  if (membersError) { throw membersError; }
  const anchor = (members as Array<{ user_id: string, workspace_id: string }> | null)?.[0];
  if (!anchor) { throw new Error(`${TAG} need at least one active workspace member to anchor the fixture (seed state).`); }

  const { data: project, error: projectError } = await db
    .from('projects')
    .insert({ workspace_id: anchor.workspace_id, slug: `${PREFIX}-project`, name: `${PREFIX} project` })
    .select('id')
    .single();
  if (projectError) { throw projectError; }
  createdProjectId = project.id as string;
  const projectId = createdProjectId;

  const { data: modules, error: modulesError } = await db
    .from('modules')
    .insert(CASES.map(key => ({ project_id: projectId, path: key.toLowerCase(), name: `${PREFIX} ${key}` })))
    .select('id, path');
  if (modulesError) { throw modulesError; }
  const moduleIds = Object.fromEntries(
    CASES.map(key => [key, (modules ?? []).find(m => m.path === key.toLowerCase())!.id as string]),
  ) as Record<CaseKey, string>;

  const { data: stories, error: storiesError } = await db
    .from('user_stories')
    .insert(CASES.map(key => ({ module_id: moduleIds[key], title: `${PREFIX} story ${key}` })))
    .select('id, title');
  if (storiesError) { throw storiesError; }
  const storyId = (key: CaseKey) => (stories ?? []).find(s => s.title === `${PREFIX} story ${key}`)!.id as string;

  const { data: acs, error: acsError } = await db
    .from('acceptance_criteria')
    .insert(CASES.map(key => ({ user_story_id: storyId(key), title: `${PREFIX} ac ${key}`, position: 0 })))
    .select('id, title');
  if (acsError) { throw acsError; }
  const acId = (key: CaseKey) => (acs ?? []).find(a => a.title === `${PREFIX} ac ${key}`)!.id as string;

  const { data: atcs, error: atcsError } = await db
    .from('atcs')
    .insert(CASES.map(key => ({
      project_id: projectId,
      module_id: moduleIds[key],
      user_story_id: storyId(key),
      slug: `${PREFIX}-atc-${key.toLowerCase()}`,
      title: `${PREFIX} atc ${key}`,
      layer: 'UI',
      status: 'unrun',
    })))
    .select('id, slug');
  if (atcsError) { throw atcsError; }
  const atcId = (key: CaseKey) => (atcs ?? []).find(a => a.slug === `${PREFIX}-atc-${key.toLowerCase()}`)!.id as string;

  const { error: linkError } = await db
    .from('atc_acceptance_criteria')
    .insert(CASES.map(key => ({ atc_id: atcId(key), acceptance_criterion_id: acId(key) })));
  if (linkError) { throw linkError; }

  const { data: environment, error: environmentError } = await db
    .from('project_environments')
    .insert({ project_id: projectId, name: 'Staging' })
    .select('id')
    .single();
  if (environmentError) { throw environmentError; }

  const { data: test, error: testError } = await db
    .from('tests')
    .insert({ workspace_id: anchor.workspace_id, title: `${PREFIX} test`, created_by: anchor.user_id })
    .select('id')
    .single();
  if (testError) { throw testError; }
  createdTestId = test.id as string;

  const now = Date.now();
  const tiedStartedAt = new Date(now - 30 * 60 * 1000).toISOString();
  const runSpecs = [
    // The Run that stopped between the repeated positions (the QA repro).
    { key: 'main', status: 'aborted', abort_reason: `${PREFIX} stopped between repeated positions`, started_at: new Date(now).toISOString() },
    // Two Runs sharing started_at to the microsecond.
    { key: 'tiedA', status: 'passed', abort_reason: null, started_at: tiedStartedAt },
    { key: 'tiedB', status: 'aborted', abort_reason: `${PREFIX} tied run`, started_at: tiedStartedAt },
    // An older Run whose 'passed' must not rescue a later Run that ran nothing.
    { key: 'earlier', status: 'passed', abort_reason: null, started_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
  ] as const;
  const { data: runs, error: runsError } = await db
    .from('runs')
    .insert(runSpecs.map(r => ({
      workspace_id: anchor.workspace_id,
      project_id: projectId,
      test_id: createdTestId,
      environment_id: environment.id as string,
      test_title: `${PREFIX} test`,
      status: r.status,
      abort_reason: r.abort_reason,
      executor_mode: 'human',
      start_token: `${PREFIX}-run-${r.key}`,
      started_at: r.started_at,
    })))
    .select('id, start_token');
  if (runsError) { throw runsError; }
  const runId = (key: string) => (runs ?? []).find(r => r.start_token === `${PREFIX}-run-${key}`)!.id as string;

  const [samePassHigh, sameSkipLow] = idPair();
  const [sameSkipHigh, samePassLow] = idPair();
  const [tiedPassHigh, tiedSkipLow] = idPair();
  const [tiedSkipHigh, tiedPassLow] = idPair();

  // Every row carries an explicit id: a bulk insert sends the union of the
  // rows' keys, so a row without `id` would insert NULL instead of the default.
  const rows: Array<{ id: string, run: string, atc: CaseKey, position: number, status: string }> = [
    // main Run: each ATC at two consecutive chain positions.
    { id: samePassHigh, run: 'main', atc: 'sameRunPassedHigh', position: 1, status: 'passed' },
    { id: sameSkipLow, run: 'main', atc: 'sameRunPassedHigh', position: 2, status: 'skipped' },
    { id: samePassLow, run: 'main', atc: 'sameRunSkippedHigh', position: 3, status: 'passed' },
    { id: sameSkipHigh, run: 'main', atc: 'sameRunSkippedHigh', position: 4, status: 'skipped' },
    { id: randomUUID(), run: 'main', atc: 'noneExecuted', position: 5, status: 'blocked' },
    { id: randomUUID(), run: 'main', atc: 'noneExecuted', position: 6, status: 'skipped' },
    { id: randomUUID(), run: 'main', atc: 'earlierPassThenSkipped', position: 7, status: 'skipped' },
    { id: randomUUID(), run: 'main', atc: 'earlierPassThenSkipped', position: 8, status: 'skipped' },
    // tied Runs: the executed row in tiedA, the skipped row in tiedB.
    { id: tiedPassHigh, run: 'tiedA', atc: 'tiedRunsPassedHigh', position: 1, status: 'passed' },
    { id: tiedPassLow, run: 'tiedA', atc: 'tiedRunsSkippedHigh', position: 2, status: 'passed' },
    { id: tiedSkipLow, run: 'tiedB', atc: 'tiedRunsPassedHigh', position: 1, status: 'skipped' },
    { id: tiedSkipHigh, run: 'tiedB', atc: 'tiedRunsSkippedHigh', position: 2, status: 'skipped' },
    // earlier Run.
    { id: randomUUID(), run: 'earlier', atc: 'earlierPassThenSkipped', position: 1, status: 'passed' },
  ];
  const { error: runAtcsError } = await db
    .from('run_atcs')
    .insert(rows.map(r => ({
      id: r.id,
      run_id: runId(r.run),
      atc_id: atcId(r.atc),
      position: r.position,
      atc_title: `${PREFIX} atc ${r.atc}`,
      status: r.status,
    })));
  if (runAtcsError) { throw runAtcsError; }

  return { actorUserId: anchor.user_id, projectId, moduleIds };
}

async function reportCoverage(fx: Fixture): Promise<CoveragePayload> {
  const { data, error } = await service().rpc(RPC, { p_actor_user_id: fx.actorUserId, p_project_id: fx.projectId });
  if (error) { throw error; }
  return data as unknown as CoveragePayload;
}

function findModule(page: CoveragePayload, moduleId: string): ModuleRow {
  const mod = page.modules.find(m => m.module_id === moduleId);
  if (!mod) { throw new Error(`${TAG} module ${moduleId} not found in coverage report`); }
  return mod;
}

function statesOf(page: CoveragePayload, fx: Fixture): Record<CaseKey, string> {
  return Object.fromEntries(CASES.map(key => [key, findModule(page, fx.moduleIds[key]).status])) as Record<CaseKey, string>;
}

function sameStates(a: Record<CaseKey, string>, b: Record<CaseKey, string>): boolean {
  return CASES.every(key => a[key] === b[key]);
}

// Seed and classify the database at module load, so the suite can register as
// skipped (pending apply) or run (0108 live) before any test is collected.
let fixture: Fixture | null = null;
if (!hasDbEnv) {
  console.warn(`${TAG} SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran, so nothing here is evidence about migration 0108.`);
}
else {
  let seeded: Fixture;
  let states: Record<CaseKey, string>;
  try {
    seeded = await seed();
    states = statesOf(await reportCoverage(seeded), seeded);
  }
  catch (error) {
    await cleanup();
    throw error;
  }
  if (sameStates(states, EXPECTED_0108)) {
    fixture = seeded;
  }
  else if (sameStates(states, PREDICTED_0090)) {
    await cleanup();
    console.warn(`${TAG} SKIPPED ENTIRELY: PENDING MIGRATION APPLY. The database still answers exactly as 0090 predicts (the higher run_atcs.id wins the tie). Apply supabase/migrations/0108_project_coverage_repeated_atc_tiebreak.sql, then re-run. No assertion in this file ran, so nothing here is evidence about migration 0108.`);
  }
  else {
    await cleanup();
    throw new Error(`${TAG} coverage states match neither 0108 nor the 0090 prediction: ${JSON.stringify(states)}`);
  }
}

const describeOrSkip = fixture ? describe : describe.skip;

describeOrSkip('BK-1220 — an ATC repeated in one Test chain gets a deterministic coverage state (0108)', () => {
  afterAll(async () => {
    await cleanup();
  });

  it('a Run stopped between the repeated positions reads the same for both id orders: executed, fully covered', async () => {
    expect.hasAssertions();
    const page = await reportCoverage(fixture!);
    for (const key of ['sameRunPassedHigh', 'sameRunSkippedHigh'] as const) {
      const mod = findModule(page, fixture!.moduleIds[key]);
      expect(mod.status).toBe('fully_covered');
      expect(mod.ac_executed).toBe(1);
      expect(mod.ac_not_run).toBe(0);
    }
  });

  it('two Runs tied on started_at read the same for both id orders: executed, fully covered', async () => {
    expect.hasAssertions();
    const page = await reportCoverage(fixture!);
    for (const key of ['tiedRunsPassedHigh', 'tiedRunsSkippedHigh'] as const) {
      const mod = findModule(page, fixture!.moduleIds[key]);
      expect(mod.status).toBe('fully_covered');
      expect(mod.ac_executed).toBe(1);
    }
  });

  it('a latest Run where no occurrence was executed (blocked, skipped) still reads not_run', async () => {
    expect.hasAssertions();
    const mod = findModule(await reportCoverage(fixture!), fixture!.moduleIds.noneExecuted);
    expect(mod.status).toBe('not_run');
    expect(mod.ac_not_run).toBe(1);
    expect(mod.ac_executed).toBe(0);
  });

  it('an older passed Run does not rescue a latest Run that skipped every occurrence (point-in-time kept)', async () => {
    expect.hasAssertions();
    const mod = findModule(await reportCoverage(fixture!), fixture!.moduleIds.earlierPassThenSkipped);
    expect(mod.status).toBe('not_run');
    expect(mod.ac_not_run).toBe(1);
    expect(mod.ac_executed).toBe(0);
  });

  it('repeated calls return the same coverage state for every case', async () => {
    expect.hasAssertions();
    const runs = await Promise.all([reportCoverage(fixture!), reportCoverage(fixture!), reportCoverage(fixture!)]);
    for (const page of runs) {
      expect(statesOf(page, fixture!)).toEqual(EXPECTED_0108);
    }
  });
});
