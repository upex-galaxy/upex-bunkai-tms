import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-269 — DB-integration test for `bunkai_sweep_abandoned_runs`
// (migration 0075_run_inactivity_sweep.sql), the SECURITY DEFINER function
// pg_cron invokes every 15 minutes to close Runs nobody is executing any
// more. Mandatory per ADR-0012 requirement (6): "the DB-integration test
// ships in the same slice as the migration, not a later one" — a sweep that
// no test can invoke against the real database would ship on the strength of
// a mock, which proves nothing about a SECURITY DEFINER function. The
// migration's §3 grants `execute` to `service_role` for exactly this suite.
//
// Structure mirrors `lib/notifications/run-event-trigger-isolation.test.ts`
// (BK-211): inline service-role client, `describeOrSkip` env gate, a
// `PREFIX`-namespaced throwaway workspace seeded in `beforeAll` and torn down
// in `afterAll`, a deployment probe that SKIPS LOUDLY (never fails the build)
// when the migration is not applied, and direct `runs` inserts rather than
// `bunkai_create_run` — the create RPC is separately covered and is not the
// function under test here.
//
// THE FUNCTION IS GLOBAL, AND THAT SHAPES EVERY ASSERTION BELOW. The sweep
// takes no workspace parameter: one call closes every idle Run in every
// tenant on the instance. So this suite never asserts on the aggregate
// counters as though the fixture were the only input — `swept` is checked as
// `>= 1`, never `=== 1`, and every state assertion is keyed on a run id this
// suite itself seeded. AC7.1's workspace-scoping claim is therefore proven
// the only way it honestly can be: per-row, on the `activity_log`
// `workspace_id` the sweep wrote for OUR Run.
//
// TIME IS SEEDED, NEVER WAITED FOR. `runs.started_at` and
// `run_steps.executed_at` are ordinary writable columns, so idleness is
// expressed by inserting timestamps in the past (10h ago against the 4h
// default threshold). Nothing here sleeps.
//
// THE SWEEP RUNS ONCE, IN `beforeAll`. Every fixture Run is seeded before
// that single pass, so the scenarios read one consistent post-sweep state
// instead of racing each other; the AC5 idempotence case is the one test
// that deliberately invokes a SECOND pass, and AC8.1 invokes a third with an
// invalid threshold.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const RPC = 'bunkai_sweep_abandoned_runs';
const PREFIX = `bk269-sweep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// The migration's default, and the value the cron entry passes.
const THRESHOLD_HOURS = 4;
// AC6.1 — the literal, ASCII-only prefix that makes a swept Run's reason
// distinguishable from a person-typed one at a glance. Byte-for-byte from
// 0075 §2b; the trailing space before the timestamp is part of it.
const REASON_PREFIX = `Auto-closed by inactivity sweep: no step activity for ${THRESHOLD_HOURS}h (closed `;
// `to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI')` + ' UTC)'.
const REASON_TAIL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\)$/;
// A person-typed reason, seeded on an already-aborted Run (AC3.1).
const MANUAL_REASON = 'Aborted by hand: wrong build deployed to Staging';

// The fixture is ~30 sequential PostgREST round trips against a shared
// remote instance, and a sweep pass is unbounded work by construction (it is
// global). Bun's 5s default is not a meaningful budget for either.
const HOOK_TIMEOUT_MS = 180_000;
const SWEEP_TIMEOUT_MS = 120_000;

const TERMINAL_STATES = ['passed', 'failed', 'aborted'] as const;
type TerminalState = (typeof TERMINAL_STATES)[number];

interface RunRow {
  id: string
  workspace_id: string
  status: string
  abort_reason: string | null
  finished_at: string | null
  version: number
}

interface ActivityRow {
  id: string
  workspace_id: string | null
  actor_user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  payload: { via?: string, reason?: string, skipped_steps?: number }
}

interface StatusRow { id: string, status: string }

interface SweepResult {
  examined: number
  swept: number
  failed: number
  threshold_hours: number
}

interface Fixture {
  workspaceAId: string
  workspaceBId: string
  actorUserId: string
  testAId: string
  testBId: string
  // AC1.1 / AC6.1 / AC6.2 / AC7.1 / cascade — idle, mixed step verdicts.
  idleRunId: string
  idleAtcRecordedId: string
  idleAtcPendingId: string
  idleStepPassedId: string
  idleStepFailedId: string
  idleStepBlockedId: string
  idleStepPendingIds: string[]
  // AC1.2 — old `started_at`, but a step marked seconds ago.
  freshRunId: string
  // AC2.1 / AC2.2 — terminal, idle, must never be touched.
  passedRunId: string
  failedRunId: string
  // AC3.1 — aborted by a person, idle, reason must survive.
  manualAbortRunId: string
  // AC-E2 — steps exist but none ever marked (`coalesce(..., started_at)`).
  noMarksRunId: string
  // AC-E1.2 — swept, then a mark is attempted on it.
  markClosedRunId: string
  markClosedStepId: string
  // AC-E3 — scenario outline over every terminal status.
  e3RunIds: Record<TerminalState, string>
  // AC7.1 — workspace B's Run is fresh and must stay running.
  freshBRunId: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

interface SeedRunOptions {
  key: string
  workspaceId: string
  projectId: string
  testId: string
  environmentId: string
  executorUserId: string | null
  status: 'running' | TerminalState
  startedAt: string
  finishedAt?: string | null
  abortReason?: string | null
}

async function seedRun(db: ReturnType<typeof service>, opts: SeedRunOptions): Promise<string> {
  const { data, error } = await db
    .from('runs')
    .insert({
      workspace_id: opts.workspaceId,
      project_id: opts.projectId,
      test_id: opts.testId,
      environment_id: opts.environmentId,
      status: opts.status,
      executor_mode: 'human',
      executor_user_id: opts.executorUserId,
      start_token: `${PREFIX}-${opts.key}`,
      test_title: `${PREFIX} test`,
      started_at: opts.startedAt,
      finished_at: opts.finishedAt ?? null,
      abort_reason: opts.abortReason ?? null,
    })
    .select('id')
    .single();
  if (error) { throw error; }
  return data.id as string;
}

async function seedRunAtc(
  db: ReturnType<typeof service>,
  runId: string,
  position: number,
  status: string,
): Promise<string> {
  const { data, error } = await db
    .from('run_atcs')
    .insert({ run_id: runId, position, atc_title: `${PREFIX} atc ${position}`, status })
    .select('id')
    .single();
  if (error) { throw error; }
  return data.id as string;
}

async function seedRunStep(
  db: ReturnType<typeof service>,
  runAtcId: string,
  position: number,
  status: string,
  executedAt: string | null,
): Promise<string> {
  const { data, error } = await db
    .from('run_steps')
    .insert({
      run_atc_id: runAtcId,
      position,
      content: `${PREFIX} step ${position}`,
      status,
      executed_at: executedAt,
    })
    .select('id')
    .single();
  if (error) { throw error; }
  return data.id as string;
}

async function fetchRun(db: ReturnType<typeof service>, runId: string): Promise<RunRow> {
  const { data, error } = await db
    .from('runs')
    .select('id, workspace_id, status, abort_reason, finished_at, version')
    .eq('id', runId)
    .single();
  if (error) { throw error; }
  return data as unknown as RunRow;
}

async function fetchStep(db: ReturnType<typeof service>, stepId: string): Promise<StatusRow> {
  const { data, error } = await db
    .from('run_steps')
    .select('id, status')
    .eq('id', stepId)
    .single();
  if (error) { throw error; }
  return data as unknown as StatusRow;
}

async function fetchRunAtc(db: ReturnType<typeof service>, runAtcId: string): Promise<StatusRow> {
  const { data, error } = await db
    .from('run_atcs')
    .select('id, status')
    .eq('id', runAtcId)
    .single();
  if (error) { throw error; }
  return data as unknown as StatusRow;
}

// Every `run.aborted` audit row this suite's own Run produced. Read by id,
// never by "the most recent row on the instance" — the sweep is global.
async function sweepEventsFor(db: ReturnType<typeof service>, runId: string): Promise<ActivityRow[]> {
  const { data, error } = await db
    .from('activity_log')
    .select('id, workspace_id, actor_user_id, action, entity_type, entity_id, payload')
    .eq('entity_type', 'run')
    .eq('entity_id', runId)
    .eq('action', 'run.aborted')
    .order('created_at', { ascending: false });
  if (error) { throw error; }
  return (data ?? []) as unknown as ActivityRow[];
}

async function runSweep(db: ReturnType<typeof service>, thresholdHours: number): Promise<SweepResult> {
  const { data, error } = await db.rpc(RPC, { p_threshold_hours: thresholdHours });
  if (error) { throw error; }
  return data as unknown as SweepResult;
}

let fixture: Fixture | null = null;
let firstPass: SweepResult | null = null;
let skipReason: string | null = null;
// Teardown is gated on these, NOT on `fixture` — the fixture is only assigned
// on the LAST line of `beforeAll`, so a throw (or a hook timeout) anywhere in
// the ~30 seeding round trips would otherwise strand every row already
// inserted on a shared live instance. Mirrors `lib/bugs/detail-isolation.
// test.ts`'s `createdWorkspaceId` gate.
const createdWorkspaceIds: string[] = [];
const createdTestIds: string[] = [];

describeOrSkip('BK-269 — bunkai_sweep_abandoned_runs (idle close, terminal immunity, cascade, idempotence)', () => {
  beforeAll(async () => {
    const db = service();

    // 0. Is the migration applied? Probe with a threshold so large the cutoff
    //    predates the instance itself — a deployed function returns a
    //    zero-swept summary and writes nothing; an undeployed one answers
    //    PGRST202 ("Could not find the function ..."). Probing with 0 would
    //    be the more direct signal (AC8.1's 45215) but would close every
    //    running Run on the instance if the floor check were ever dropped, so
    //    that assertion lives in its own test, after the fixture exists to
    //    catch it.
    const probe = await db.rpc(RPC, { p_threshold_hours: 87_600 });
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}: ${probe.error.message ?? ''}). Apply migration 0075_run_inactivity_sweep.sql.`;
      return;
    }
    if ((probe.data as SweepResult | null)?.swept !== 0) {
      skipReason = `${RPC} swept rows at a 10-year threshold — refusing to seed against it.`;
      return;
    }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(20);
    if (membersError) { throw membersError; }
    const distinctIds = [...new Set((members ?? []).map(m => m.user_id as string))];
    const actorUserId = distinctIds[0];
    if (!actorUserId) {
      skipReason = 'need at least 1 real user id among active workspace members (seed state).';
      return;
    }

    // Two throwaway workspaces: AC7.1 needs the sweep's per-row workspace
    // attribution to be checkable, and a shared live instance is the only
    // place this function ever runs.
    const { data: workspaces, error: workspacesError } = await db
      .from('workspaces')
      .insert([
        { slug: `${PREFIX}-ws-a`, name: `${PREFIX} A`, owner_user_id: actorUserId },
        { slug: `${PREFIX}-ws-b`, name: `${PREFIX} B`, owner_user_id: actorUserId },
      ])
      .select('id, slug');
    if (workspacesError) { throw workspacesError; }
    const workspaceAId = (workspaces ?? []).find(w => (w.slug as string).endsWith('-ws-a'))!.id as string;
    const workspaceBId = (workspaces ?? []).find(w => (w.slug as string).endsWith('-ws-b'))!.id as string;
    createdWorkspaceIds.push(workspaceAId, workspaceBId);

    // AC-E1.2 calls the REAL `bunkai_mark_run_step`, whose step 2 is a
    // member+ write assert (0042:137) that precedes the closed-Run check —
    // so the actor genuinely needs a membership row here.
    const { error: seedMembersError } = await db
      .from('workspace_members')
      .insert([
        { workspace_id: workspaceAId, user_id: actorUserId, role: 'owner', status: 'active' },
        { workspace_id: workspaceBId, user_id: actorUserId, role: 'owner', status: 'active' },
      ]);
    if (seedMembersError) { throw seedMembersError; }

    const { data: projects, error: projectsError } = await db
      .from('projects')
      .insert([
        { workspace_id: workspaceAId, slug: `${PREFIX}-project-a`, name: `${PREFIX} project A` },
        { workspace_id: workspaceBId, slug: `${PREFIX}-project-b`, name: `${PREFIX} project B` },
      ])
      .select('id, slug, workspace_id');
    if (projectsError) { throw projectsError; }
    const projectAId = (projects ?? []).find(p => p.workspace_id === workspaceAId)!.id as string;
    const projectBId = (projects ?? []).find(p => p.workspace_id === workspaceBId)!.id as string;

    const { data: environments, error: environmentsError } = await db
      .from('project_environments')
      .insert([
        { project_id: projectAId, name: 'Staging' },
        { project_id: projectBId, name: 'Staging' },
      ])
      .select('id, project_id');
    if (environmentsError) { throw environmentsError; }
    const environmentAId = (environments ?? []).find(e => e.project_id === projectAId)!.id as string;
    const environmentBId = (environments ?? []).find(e => e.project_id === projectBId)!.id as string;

    const { data: tests, error: testsError } = await db
      .from('tests')
      .insert([
        { workspace_id: workspaceAId, title: `${PREFIX} test A`, created_by: actorUserId },
        { workspace_id: workspaceBId, title: `${PREFIX} test B`, created_by: actorUserId },
      ])
      .select('id, workspace_id');
    if (testsError) { throw testsError; }
    const testAId = (tests ?? []).find(t => t.workspace_id === workspaceAId)!.id as string;
    const testBId = (tests ?? []).find(t => t.workspace_id === workspaceBId)!.id as string;
    createdTestIds.push(testAId, testBId);

    const inA = {
      workspaceId: workspaceAId,
      projectId: projectAId,
      testId: testAId,
      environmentId: environmentAId,
      executorUserId: actorUserId,
    };

    // --- AC1.1 / AC6 / cascade: idle, with one chain position already
    //     decided (recorded verdicts must survive) and one still pending.
    const idleRunId = await seedRun(db, { ...inA, key: 'idle', status: 'running', startedAt: hoursAgo(12) });
    const idleAtcRecordedId = await seedRunAtc(db, idleRunId, 1, 'failed');
    const idleAtcPendingId = await seedRunAtc(db, idleRunId, 2, 'pending');
    const idleStepPassedId = await seedRunStep(db, idleAtcRecordedId, 0, 'passed', hoursAgo(10));
    const idleStepFailedId = await seedRunStep(db, idleAtcRecordedId, 1, 'failed', hoursAgo(10));
    const idleStepBlockedId = await seedRunStep(db, idleAtcRecordedId, 2, 'blocked', hoursAgo(10));
    const idleStepPendingIds = [
      await seedRunStep(db, idleAtcPendingId, 0, 'pending', null),
      await seedRunStep(db, idleAtcPendingId, 1, 'pending', null),
    ];

    // --- AC1.2: started long ago, but marked seconds ago. `max(executed_at)`
    //     must beat `started_at` in the coalesce.
    const freshRunId = await seedRun(db, { ...inA, key: 'fresh', status: 'running', startedAt: hoursAgo(12) });
    const freshAtcId = await seedRunAtc(db, freshRunId, 1, 'pending');
    await seedRunStep(db, freshAtcId, 0, 'passed', new Date().toISOString());
    await seedRunStep(db, freshAtcId, 1, 'pending', null);

    // --- AC2.1 / AC2.2: terminal and idle. Only the status predicate keeps
    //     these out of the candidate set.
    const passedRunId = await seedRun(db, { ...inA, key: 'passed', status: 'passed', startedAt: hoursAgo(20), finishedAt: hoursAgo(19) });
    const failedRunId = await seedRun(db, { ...inA, key: 'failed', status: 'failed', startedAt: hoursAgo(20), finishedAt: hoursAgo(19) });

    // --- AC3.1: a person's reason, on an idle aborted Run.
    const manualAbortRunId = await seedRun(db, {
      ...inA,
      key: 'manual-abort',
      status: 'aborted',
      startedAt: hoursAgo(20),
      finishedAt: hoursAgo(19),
      abortReason: MANUAL_REASON,
    });

    // --- AC-E2: steps exist, none ever marked. Only the `started_at`
    //     fallback can close this one.
    const noMarksRunId = await seedRun(db, { ...inA, key: 'no-marks', status: 'running', startedAt: hoursAgo(9) });
    const noMarksAtcId = await seedRunAtc(db, noMarksRunId, 1, 'pending');
    await seedRunStep(db, noMarksAtcId, 0, 'pending', null);
    await seedRunStep(db, noMarksAtcId, 1, 'pending', null);

    // --- AC-E1.2: its own Run, so the mark attempt cannot disturb the
    //     cascade assertions on `idleRunId`.
    const markClosedRunId = await seedRun(db, { ...inA, key: 'mark-closed', status: 'running', startedAt: hoursAgo(11) });
    const markClosedAtcId = await seedRunAtc(db, markClosedRunId, 1, 'pending');
    const markClosedStepId = await seedRunStep(db, markClosedAtcId, 0, 'pending', null);

    // --- AC-E3: one idle Run per terminal status.
    const e3RunIds = {} as Record<TerminalState, string>;
    for (const state of TERMINAL_STATES) {
      e3RunIds[state] = await seedRun(db, {
        ...inA,
        key: `e3-${state}`,
        status: state,
        startedAt: hoursAgo(30),
        finishedAt: hoursAgo(29),
        abortReason: state === 'aborted' ? MANUAL_REASON : null,
      });
    }

    // --- AC7.1: workspace B, fresh.
    const freshBRunId = await seedRun(db, {
      key: 'fresh-b',
      workspaceId: workspaceBId,
      projectId: projectBId,
      testId: testBId,
      environmentId: environmentBId,
      executorUserId: actorUserId,
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    fixture = {
      workspaceAId,
      workspaceBId,
      actorUserId,
      testAId,
      testBId,
      idleRunId,
      idleAtcRecordedId,
      idleAtcPendingId,
      idleStepPassedId,
      idleStepFailedId,
      idleStepBlockedId,
      idleStepPendingIds,
      freshRunId,
      passedRunId,
      failedRunId,
      manualAbortRunId,
      noMarksRunId,
      markClosedRunId,
      markClosedStepId,
      e3RunIds,
      freshBRunId,
    };

    // THE pass every scenario below reads.
    firstPass = await runSweep(db, THRESHOLD_HOURS);
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    if (createdWorkspaceIds.length === 0) { return; }
    const db = service();
    // `runs.test_id` is ON DELETE RESTRICT (0031), so the Runs go first;
    // everything else — run_atcs, run_steps, activity_log (0009:81) and the
    // notifications the 0066 trigger produced for these Runs (0053:65) —
    // cascades off the workspaces.
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    await db.from('workspaces').delete().in('id', createdWorkspaceIds);
    if (createdTestIds.length > 0) {
      await db.from('tests').delete().in('id', createdTestIds);
    }
  }, HOOK_TIMEOUT_MS);

  it('AC1.1 — a running Run whose last step activity predates the threshold is closed as aborted, with finished_at and a system reason', async () => {
    if (!fixture || !firstPass) { return warn(); }
    const db = service();

    // The sweep is global: our Run is one of an unknown number closed by this
    // pass, so `>= 1` is the only honest aggregate claim. `failed` is
    // DELIBERATELY not asserted to be 0 — a foreign tenant's Run tripping the
    // per-Run exception block would flip that counter and fail this suite for
    // something it does not own. The authority that OUR close succeeded is
    // the row state below, not a counter.
    expect(firstPass.swept).toBeGreaterThanOrEqual(1);
    expect(firstPass.examined).toBeGreaterThanOrEqual(firstPass.swept);
    expect(firstPass.threshold_hours).toBe(THRESHOLD_HOURS);

    const run = await fetchRun(db, fixture.idleRunId);
    expect(run.status).toBe('aborted');
    expect(run.finished_at).not.toBeNull();
    expect(run.abort_reason).not.toBeNull();
    expect(run.abort_reason!.startsWith(REASON_PREFIX)).toBe(true);
  });

  it('AC1.2 — a running Run with a step marked inside the threshold is left untouched', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const run = await fetchRun(db, fixture.freshRunId);
    expect(run.status).toBe('running');
    expect(run.abort_reason).toBeNull();
    expect(run.finished_at).toBeNull();
  });

  it('AC2.1 — a passed Run is never swept, however idle', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const run = await fetchRun(db, fixture.passedRunId);
    expect(run.status).toBe('passed');
    expect(run.abort_reason).toBeNull();
    expect(run.finished_at).not.toBeNull();
    expect(await sweepEventsFor(db, fixture.passedRunId)).toHaveLength(0);
  });

  it('AC2.2 — a failed Run is never swept, however idle', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const run = await fetchRun(db, fixture.failedRunId);
    expect(run.status).toBe('failed');
    expect(run.abort_reason).toBeNull();
    expect(run.finished_at).not.toBeNull();
    expect(await sweepEventsFor(db, fixture.failedRunId)).toHaveLength(0);
  });

  it('AC3.1 — a manually aborted Run keeps the reason a person typed; the sweep never overwrites it', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const run = await fetchRun(db, fixture.manualAbortRunId);
    expect(run.status).toBe('aborted');
    expect(run.abort_reason).toBe(MANUAL_REASON);
    expect(run.abort_reason!.startsWith(REASON_PREFIX)).toBe(false);
    expect(await sweepEventsFor(db, fixture.manualAbortRunId)).toHaveLength(0);
  });

  it('AC5.1 — idempotence: a second pass finds the already-closed Run outside its candidate set and changes nothing', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const before = await fetchRun(db, fixture.idleRunId);
    const eventsBefore = await sweepEventsFor(db, fixture.idleRunId);

    // Same reasoning as AC1.1: the counters describe the whole instance, so
    // only the shape of the call is asserted here; byte-identity of OUR Run
    // is what proves idempotence.
    const secondPass = await runSweep(db, THRESHOLD_HOURS);
    expect(secondPass.threshold_hours).toBe(THRESHOLD_HOURS);

    const after = await fetchRun(db, fixture.idleRunId);
    expect(after.status).toBe(before.status);
    expect(after.finished_at).toBe(before.finished_at);
    expect(after.abort_reason).toBe(before.abort_reason);
    expect(after.version).toBe(before.version);

    // No second audit row either — a duplicated `run.aborted` would fan out a
    // duplicate notification through the 0066 trigger.
    const eventsAfter = await sweepEventsFor(db, fixture.idleRunId);
    expect(eventsAfter).toHaveLength(eventsBefore.length);
    expect(eventsAfter).toHaveLength(1);
  }, SWEEP_TIMEOUT_MS);

  it('AC6.1 — the reason carries the exact system prefix, a UTC closure timestamp, and fits runs_abort_reason_chk', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const run = await fetchRun(db, fixture.idleRunId);
    const reason = run.abort_reason!;

    // Prefix by equality on the slice — not a loose `contains`.
    expect(reason.slice(0, REASON_PREFIX.length)).toBe(REASON_PREFIX);
    // The tail is deliberately non-deterministic (it is `now()`), so it is
    // asserted by shape.
    expect(reason.slice(REASON_PREFIX.length)).toMatch(REASON_TAIL);
    // 0036's runs_abort_reason_chk: btrim length between 3 and 500.
    expect(reason.trim().length).toBeGreaterThanOrEqual(3);
    expect(reason.trim().length).toBeLessThanOrEqual(500);
  });

  it('AC6.2 — the audit row is attributed to no person and is machine-taggable as a sweep', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const events = await sweepEventsFor(db, fixture.idleRunId);
    expect(events).toHaveLength(1);
    const event = events[0];

    expect(event.action).toBe('run.aborted');
    expect(event.entity_type).toBe('run');
    expect(event.entity_id).toBe(fixture.idleRunId);
    expect(event.actor_user_id).toBeNull();
    expect(event.payload.via).toBe('sweep');
    // The two chain-position-2 steps were the only pending ones at sweep time.
    expect(String(event.payload.skipped_steps)).toBe(String(fixture.idleStepPendingIds.length));
    expect(event.payload.reason).toBe((await fetchRun(db, fixture.idleRunId)).abort_reason!);
  });

  it('AC7.1 — workspace scoping: only the idle Run in workspace A is closed, and its audit row carries workspace A', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const runA = await fetchRun(db, fixture.idleRunId);
    const runB = await fetchRun(db, fixture.freshBRunId);

    expect(runA.workspace_id).toBe(fixture.workspaceAId);
    expect(runA.status).toBe('aborted');

    expect(runB.workspace_id).toBe(fixture.workspaceBId);
    expect(runB.status).toBe('running');
    expect(runB.abort_reason).toBeNull();
    expect(runB.finished_at).toBeNull();
    expect(await sweepEventsFor(db, fixture.freshBRunId)).toHaveLength(0);

    const events = await sweepEventsFor(db, fixture.idleRunId);
    expect(events).toHaveLength(1);
    expect(events[0].workspace_id).toBe(fixture.workspaceAId);
  });

  it('AC-E1.2 — marking a step on a swept Run is refused with 45212, and no run_steps row moves', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const swept = await fetchRun(db, fixture.markClosedRunId);
    expect(swept.status).toBe('aborted');

    const before = await fetchStep(db, fixture.markClosedStepId);

    const { error } = await db.rpc('bunkai_mark_run_step', {
      p_actor_user_id: fixture.actorUserId,
      p_run_id: fixture.markClosedRunId,
      p_run_step_id: fixture.markClosedStepId,
      p_status: 'passed',
      p_note: null,
      p_evidence_url: null,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45212');

    const after = await fetchStep(db, fixture.markClosedStepId);
    expect(after.status).toBe(before.status);
  });

  it('AC-E2 — a Run whose steps were never marked at all is closed off started_at (the coalesce fallback)', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const run = await fetchRun(db, fixture.noMarksRunId);
    expect(run.status).toBe('aborted');
    expect(run.finished_at).not.toBeNull();
    expect(run.abort_reason!.startsWith(REASON_PREFIX)).toBe(true);

    const events = await sweepEventsFor(db, fixture.noMarksRunId);
    expect(events).toHaveLength(1);
    // Both seeded steps were pending, so both were skipped.
    expect(String(events[0].payload.skipped_steps)).toBe('2');
  });

  // Scenario outline over the whole terminal vocabulary (0031:79-80 minus
  // 'running'): none of these is ever a sweep candidate.
  for (const state of TERMINAL_STATES) {
    it(`AC-E3 — a '${state}' Run older than the threshold is never swept (scenario outline)`, async () => {
      if (!fixture) { return warn(); }
      const db = service();

      const runId = fixture.e3RunIds[state];
      const run = await fetchRun(db, runId);
      expect(run.status).toBe(state);
      expect(run.abort_reason).toBe(state === 'aborted' ? MANUAL_REASON : null);
      expect(await sweepEventsFor(db, runId)).toHaveLength(0);
    });
  }

  it('AC8.1 — a zero threshold is refused with 45215 and closes nothing', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const { error } = await db.rpc(RPC, { p_threshold_hours: 0 });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45215');

    // The still-running fixture Runs are the proof that the raise happened
    // before any candidate was taken — a 0 threshold would otherwise put
    // every running Run on the instance in the candidate set.
    const fresh = await fetchRun(db, fixture.freshRunId);
    expect(fresh.status).toBe('running');
    const freshB = await fetchRun(db, fixture.freshBRunId);
    expect(freshB.status).toBe('running');
  }, SWEEP_TIMEOUT_MS);

  it('cascade — every pending step and pending chain position is skipped, while recorded verdicts are left exactly as they were', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    for (const stepId of fixture.idleStepPendingIds) {
      expect((await fetchStep(db, stepId)).status).toBe('skipped');
    }
    expect((await fetchRunAtc(db, fixture.idleAtcPendingId)).status).toBe('skipped');

    // Recorded verdicts survive: the sweep's steps 2d/2e both filter on
    // `status = 'pending'`.
    expect((await fetchStep(db, fixture.idleStepPassedId)).status).toBe('passed');
    expect((await fetchStep(db, fixture.idleStepFailedId)).status).toBe('failed');
    expect((await fetchStep(db, fixture.idleStepBlockedId)).status).toBe('blocked');
    expect((await fetchRunAtc(db, fixture.idleAtcRecordedId)).status).toBe('failed');
  });

  it('sanity — the sweep never invents work: an unknown Run id has no audit trail', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    expect(await sweepEventsFor(db, ZERO_UUID)).toHaveLength(0);
  });
});

// The suite never fails on missing migration, missing env, or seed state —
// it says why and passes.
function warn() {
  console.warn(`[inactivity-sweep-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
