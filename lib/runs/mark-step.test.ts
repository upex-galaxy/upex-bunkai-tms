import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-35 — integration guard for the mark-step RPC (`bunkai_mark_run_step`,
// 0042_run_step_mark.sql). Sibling of `start-run.test.ts` / `history-isolation
// .test.ts`: it drives the REAL server-side rulebook against a live database
// through the service-role client (explicit actor — the exact contract the
// API route uses), asserting the observable behaviors this story's plan
// documents as the RPC's business logic (verdict derivation is SQL-owned,
// D9 — no shadow TS re-implementation, so this suite IS the correctness
// proof, not a mocked unit test):
//
//   * AC1   a pending step marks passed/failed/blocked, with or without a
//           note/evidence link; executed_at is stamped;
//   * Q8    empty-string / whitespace-only note or evidence_url normalize to
//           NULL rather than being rejected;
//   * AC2   all 8 two-step verdict combinations (fail overrides everything,
//           blocked-no-fail resolves to blocked, all-pass resolves to
//           passed);
//   * Q1    the parent ATC verdict stays 'pending' while ANY sibling step is
//           still pending — even a 3-step ATC where two of three are already
//           resolved;
//   * AC6   last-write-wins: re-marking a step overwrites the prior result
//           and immediately recalculates the ATC verdict;
//   * ATP   a re-mark-to-pending attempt (and any other out-of-enum status)
//           is rejected with 45213 — the step is left untouched;
//   * AC5   a step cannot be marked on a Run that is already closed
//           (aborted OR finished/passed) — 45212, step NOT recorded;
//   * Q4    authorization is member+ (the same tier BK-36/39 already use):
//           a non-member is rejected with 42501, and (when the shared seed DB
//           has an active viewer-role member to exercise it) so is a
//           viewer-tier member — non-disclosing, no mutation;
//   * not-found: a nonexistent step, or a real step that belongs to a
//     DIFFERENT run than the one passed in, both collapse to the SAME P0002
//     (no cross-run existence leakage);
//   * FOR UPDATE — a concurrent bunkai_finish_run and bunkai_mark_run_step on
//     the SAME run (the ATP's BK-39-race scenario) never leave the database
//     in an inconsistent state, whichever transaction's row lock wins.
//
// This suite seeds its OWN Run/run_atcs/run_steps fixtures directly (service
// role bypasses RLS) rather than reusing `bunkai_create_run`, so every
// verdict combination gets an exact, disposable 1-ATC/N-step shape — cloned
// from `history-isolation.test.ts`'s own seeding pattern. DB-dependent +
// env-gated: when the Supabase env is absent the suite SKIPS LOUDLY
// (describe.skip). When present but the seed can't satisfy a precondition it
// logs and passes (never blocks a build on seed state). Every created run is
// purged in afterAll via a unique per-suite id list (cascades run_atcs/
// run_steps); the audit rows this RPC writes are purged separately since
// `activity_log.entity_id` carries no FK.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const RPC = 'bunkai_mark_run_step';
const PREFIX = `bk35-mark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const WRITER_ROLES = new Set(['member', 'admin', 'owner']);

interface MemberRow { user_id: string, workspace_id: string, status: string, role: string }
interface Anchor { workspaceId: string, userId: string, projectId: string, environmentId: string }
interface RunStepJson {
  id: string
  position: number
  status: string
  note: string | null
  evidence_url: string | null
  executed_at: string | null
}
interface RunAtcJson { id: string, position: number, status: string, steps: RunStepJson[] }
interface RunJson { id: string, status: string, atcs: RunAtcJson[] }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof service>;

// AC2 — the acceptance-criteria table's 8 combinations for a 2-step ATC.
const AC2_COMBOS: Array<{ steps: [string, string], verdict: string }> = [
  { steps: ['passed', 'passed'], verdict: 'passed' },
  { steps: ['failed', 'failed'], verdict: 'failed' },
  { steps: ['blocked', 'blocked'], verdict: 'blocked' },
  { steps: ['failed', 'passed'], verdict: 'failed' },
  { steps: ['passed', 'failed'], verdict: 'failed' },
  { steps: ['blocked', 'passed'], verdict: 'blocked' },
  { steps: ['passed', 'blocked'], verdict: 'blocked' },
  { steps: ['failed', 'blocked'], verdict: 'failed' },
];

let anchor: Anchor | null = null;
let viewerActorUserId: string | null = null;
let testId: string | null = null;
let skipReason: string | null = null;
const runIds: string[] = [];
const stepIdsForCleanup: string[] = [];

// Pick the first (member+, project, environment) triple that shares a
// workspace — everything a seeded Run row needs to satisfy its NOT NULL FKs.
function findAnchor(
  writers: MemberRow[],
  projects: Array<{ id: string, workspace_id: string }>,
  environments: Array<{ id: string, project_id: string }>,
): Anchor | undefined {
  const envByProject = new Map<string, string>();
  for (const e of environments) {
    if (!envByProject.has(e.project_id)) { envByProject.set(e.project_id, e.id); }
  }
  for (const m of writers) {
    for (const p of projects) {
      const environmentId = envByProject.get(p.id);
      if (p.workspace_id === m.workspace_id && environmentId) {
        return { workspaceId: m.workspace_id, userId: m.user_id, projectId: p.id, environmentId };
      }
    }
  }
  return undefined;
}

// Seed one throwaway Run + one run_atcs (position 1) + N pending run_steps,
// bypassing bunkai_create_run entirely so each test gets an exact shape.
async function seedRun(db: Db, opts: { stepCount: number, status?: string, abortReason?: string }) {
  const runId = crypto.randomUUID();
  const status = opts.status ?? 'running';
  const { error: runErr } = await db.from('runs').insert({
    id: runId,
    workspace_id: anchor!.workspaceId,
    project_id: anchor!.projectId,
    test_id: testId!,
    environment_id: anchor!.environmentId,
    status,
    abort_reason: status === 'aborted'
      ? (opts.abortReason ?? 'Seeded by the BK-35 mark-step suite for a closed-run guard test.')
      : null,
    executor_mode: 'human',
    executor_user_id: anchor!.userId,
    start_token: `${PREFIX}-${runId}`,
    test_title: `${PREFIX} fixture`,
  });
  if (runErr) { throw runErr; }
  runIds.push(runId);

  const { data: atc, error: atcErr } = await db
    .from('run_atcs')
    .insert({ run_id: runId, atc_id: null, position: 1, atc_title: `${PREFIX} atc`, status: 'pending' })
    .select('id')
    .single();
  if (atcErr) { throw atcErr; }
  const runAtcId = (atc as { id: string }).id;

  const newStepIds: string[] = [];
  for (let i = 0; i < opts.stepCount; i++) {
    const { data: step, error: stepErr } = await db
      .from('run_steps')
      .insert({ run_atc_id: runAtcId, atc_step_id: null, position: i, content: `${PREFIX} step ${i}`, status: 'pending' })
      .select('id')
      .single();
    if (stepErr) { throw stepErr; }
    const id = (step as { id: string }).id;
    newStepIds.push(id);
    stepIdsForCleanup.push(id);
  }
  return { runId, runAtcId, stepIds: newStepIds };
}

async function mark(db: Db, args: {
  runId: string
  stepId: string
  status: string
  note?: string | null
  evidenceUrl?: string | null
  actorUserId?: string
}) {
  return db.rpc(RPC, {
    p_actor_user_id: args.actorUserId ?? anchor!.userId,
    p_run_id: args.runId,
    p_run_step_id: args.stepId,
    p_status: args.status,
    p_note: args.note ?? null,
    p_evidence_url: args.evidenceUrl ?? null,
  });
}

function findAtc(data: unknown, atcId: string) {
  return (data as RunJson).atcs.find(a => a.id === atcId);
}
function findStep(data: unknown, stepId: string) {
  return (data as RunJson).atcs.flatMap(a => a.steps).find(s => s.id === stepId);
}

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[mark-step] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}

describeOrSkip('BK-35 — bunkai_mark_run_step', () => {
  beforeAll(async () => {
    const db = service();

    // 0. Is the RPC deployed? Probe with all-zero ids: a deployed RPC answers
    //    P0002 (not_found); an undeployed one answers "function does not exist".
    //    `actorUserId` is passed explicitly so `mark()` never dereferences
    //    the not-yet-resolved `anchor` module variable.
    const probe = await mark(db, { runId: ZERO_UUID, stepId: ZERO_UUID, status: 'passed', actorUserId: ZERO_UUID });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `bunkai_mark_run_step is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0042_run_step_mark.sql.`;
      return;
    }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, status, role');
    if (membersError) { throw membersError; }
    const { data: projects, error: projectsError } = await db.from('projects').select('id, workspace_id');
    if (projectsError) { throw projectsError; }
    const { data: environments, error: environmentsError } = await db
      .from('project_environments')
      .select('id, project_id');
    if (environmentsError) { throw environmentsError; }

    const allMembers = (members ?? []) as MemberRow[];
    const activeWriters = allMembers.filter(m => m.status === 'active' && WRITER_ROLES.has(m.role));
    const found = findAnchor(
      activeWriters,
      (projects ?? []) as Array<{ id: string, workspace_id: string }>,
      (environments ?? []) as Array<{ id: string, project_id: string }>,
    );
    if (!found) {
      skipReason = 'need an active member+ whose workspace has a project with at least one environment (seed state).';
      return;
    }
    anchor = found;
    viewerActorUserId = allMembers
      .find(m => m.status === 'active' && m.role === 'viewer' && m.workspace_id === anchor!.workspaceId)
      ?.user_id ?? null;

    const { data: createdTest, error: testErr } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspaceId, title: `${PREFIX} fixture`, created_by: anchor.userId })
      .select('id')
      .single();
    if (testErr) { throw testErr; }
    testId = (createdTest as { id: string }).id;
  });

  afterAll(async () => {
    const db = service();
    if (stepIdsForCleanup.length > 0) {
      await db.from('activity_log').delete().eq('action', 'run_step.marked').in('entity_id', stepIdsForCleanup);
    }
    if (runIds.length > 0) {
      // Cascade-clears run_atcs/run_steps (0031_runs.sql FKs).
      await db.from('runs').delete().in('id', runIds);
    }
    if (testId) {
      await db.from('tests').delete().eq('id', testId);
    }
  });

  it('AC1.1 — marks a pending step passed with note + evidence link, stamps executed_at', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, stepIds: [stepId] } = await seedRun(db, { stepCount: 1 });

    const { data, error } = await mark(db, {
      runId,
      stepId,
      status: 'passed',
      note: 'Login redirects correctly',
      evidenceUrl: 'https://s3.example.com/evidence/screenshot-001.png',
    });
    expect(error).toBeNull();
    const step = findStep(data, stepId);
    expect(step?.status).toBe('passed');
    expect(step?.note).toBe('Login redirects correctly');
    expect(step?.evidence_url).toBe('https://s3.example.com/evidence/screenshot-001.png');
    expect(step?.executed_at).not.toBeNull();
  });

  it('AC1.2/Q8 — omitted, whitespace-only, and empty-string note/evidence all normalize to null (never rejected)', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, stepIds: [s1, s2] } = await seedRun(db, { stepCount: 2 });

    const r1 = await mark(db, { runId, stepId: s1, status: 'passed' });
    expect(r1.error).toBeNull();
    const step1 = findStep(r1.data, s1);
    expect(step1?.note).toBeNull();
    expect(step1?.evidence_url).toBeNull();

    const r2 = await mark(db, { runId, stepId: s2, status: 'passed', note: '   ', evidenceUrl: '' });
    expect(r2.error).toBeNull();
    const step2 = findStep(r2.data, s2);
    expect(step2?.note).toBeNull();
    expect(step2?.evidence_url).toBeNull();
  });

  // AC2 — all 8 two-step verdict combinations, plus Q1's pending-precedence
  // (the ATC must still read 'pending' after only the FIRST step resolves).
  for (const combo of AC2_COMBOS) {
    it(`AC2/Q1 — step1=${combo.steps[0]}, step2=${combo.steps[1]} -> ATC verdict ${combo.verdict} (stays pending until both resolve)`, async () => {
      if (!anchor) { return warn(); }
      const db = service();
      const { runId, runAtcId, stepIds: [s1, s2] } = await seedRun(db, { stepCount: 2 });

      const r1 = await mark(db, { runId, stepId: s1, status: combo.steps[0] });
      expect(r1.error).toBeNull();
      expect(findAtc(r1.data, runAtcId)?.status).toBe('pending');

      const r2 = await mark(db, { runId, stepId: s2, status: combo.steps[1] });
      expect(r2.error).toBeNull();
      expect(findAtc(r2.data, runAtcId)?.status).toBe(combo.verdict);
    });
  }

  it('Q1 — a 3-step ATC stays pending until the LAST pending step resolves', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, runAtcId, stepIds: [s1, s2, s3] } = await seedRun(db, { stepCount: 3 });

    const r1 = await mark(db, { runId, stepId: s1, status: 'passed' });
    expect(findAtc(r1.data, runAtcId)?.status).toBe('pending');
    const r2 = await mark(db, { runId, stepId: s2, status: 'passed' });
    expect(findAtc(r2.data, runAtcId)?.status).toBe('pending');
    const r3 = await mark(db, { runId, stepId: s3, status: 'passed' });
    expect(findAtc(r3.data, runAtcId)?.status).toBe('passed');
  });

  it('AC6 — last-write-wins: re-marking a step overwrites the result and immediately recalculates the ATC verdict', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, runAtcId, stepIds: [s1] } = await seedRun(db, { stepCount: 1 });

    const first = await mark(db, { runId, stepId: s1, status: 'passed' });
    expect(first.error).toBeNull();
    expect(findAtc(first.data, runAtcId)?.status).toBe('passed');

    const second = await mark(db, { runId, stepId: s1, status: 'failed', note: 're-marked after review' });
    expect(second.error).toBeNull();
    const step = findStep(second.data, s1);
    expect(step?.status).toBe('failed');
    expect(step?.note).toBe('re-marked after review');
    expect(findAtc(second.data, runAtcId)?.status).toBe('failed');
  });

  it('rejects a re-mark-to-pending attempt with 45213 — the step is left untouched', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, stepIds: [s1] } = await seedRun(db, { stepCount: 1 });
    await mark(db, { runId, stepId: s1, status: 'passed' }); // establish a non-pending baseline

    const { data, error } = await mark(db, { runId, stepId: s1, status: 'pending' });
    expect(error?.code).toBe('45213');
    expect(data).toBeNull();

    const check = await db.from('run_steps').select('status').eq('id', s1).single();
    expect((check.data as { status: string }).status).toBe('passed');
  });

  it('rejects any other out-of-enum status value with 45213 (e.g. "skipped" is a system-only status)', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, stepIds: [s1] } = await seedRun(db, { stepCount: 1 });
    const { data, error } = await mark(db, { runId, stepId: s1, status: 'skipped' });
    expect(error?.code).toBe('45213');
    expect(data).toBeNull();
  });

  it('AC5 — guard: a step cannot be marked on an ABORTED run (45212), step not recorded', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, stepIds: [s1] } = await seedRun(db, { stepCount: 1, status: 'aborted' });

    const { data, error } = await mark(db, { runId, stepId: s1, status: 'passed' });
    expect(error?.code).toBe('45212');
    expect(data).toBeNull();

    const check = await db.from('run_steps').select('status').eq('id', s1).single();
    expect((check.data as { status: string }).status).toBe('pending');
  });

  it('AC5 — guard: a step cannot be marked on a FINISHED (passed) run (45212), step not recorded', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, stepIds: [s1] } = await seedRun(db, { stepCount: 1, status: 'passed' });

    const { data, error } = await mark(db, { runId, stepId: s1, status: 'passed' });
    expect(error?.code).toBe('45212');
    expect(data).toBeNull();

    const check = await db.from('run_steps').select('status').eq('id', s1).single();
    expect((check.data as { status: string }).status).toBe('pending');
  });

  it('authorization — a non-member actor is rejected (42501), step not recorded, no existence disclosure', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, stepIds: [s1] } = await seedRun(db, { stepCount: 1 });

    const { data, error } = await mark(db, { runId, stepId: s1, status: 'passed', actorUserId: ZERO_UUID });
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();

    const check = await db.from('run_steps').select('status').eq('id', s1).single();
    expect((check.data as { status: string }).status).toBe('pending');
  });

  it('authorization — a viewer-tier member (Q4 member+ tier, not just non-members) is rejected (42501)', async () => {
    if (!anchor) { return warn(); }
    if (!viewerActorUserId) {
      console.warn('[mark-step] skipped authz(viewer): need an active viewer-role member in the anchor workspace (seed state).');
      return;
    }
    const db = service();
    const { runId, stepIds: [s1] } = await seedRun(db, { stepCount: 1 });

    const { data, error } = await mark(db, { runId, stepId: s1, status: 'passed', actorUserId: viewerActorUserId });
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('not-found — a nonexistent run_step_id raises P0002', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId } = await seedRun(db, { stepCount: 1 });

    const { data, error } = await mark(db, { runId, stepId: ZERO_UUID, status: 'passed' });
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  it('not-found — a real step belonging to a DIFFERENT run than p_run_id raises the SAME P0002 (no cross-run leakage)', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const a = await seedRun(db, { stepCount: 1 });
    const b = await seedRun(db, { stepCount: 1 });

    const { data, error } = await mark(db, { runId: a.runId, stepId: b.stepIds[0], status: 'passed' });
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  it('FOR UPDATE race — a concurrent finish and mark on the same run never leave inconsistent state (BK-39-race)', async () => {
    if (!anchor) { return warn(); }
    const db = service();
    const { runId, stepIds: [s1] } = await seedRun(db, { stepCount: 1 });

    // bunkai_finish_run only GATES on runs.status (never run_steps), so it
    // succeeds regardless of which transaction's row lock wins. The
    // interesting outcome is whether mark_run_step saw the run still
    // 'running' (and recorded the step) or already closed. If finish's lock
    // wins, finish's own step-sweep (0037_run_finish.sql §5b) flips every
    // still-pending run_steps row to 'skipped' as part of closing the run —
    // so a rejected mark never leaves the step 'pending', it leaves it
    // 'skipped' (finish's mutation, not mark's — mark's own guard fires
    // BEFORE it would touch the row).
    const [finishResult, markResult] = await Promise.all([
      db.rpc('bunkai_finish_run', { p_actor_user_id: anchor.userId, p_run_id: runId, p_verdict: 'passed' }),
      mark(db, { runId, stepId: s1, status: 'failed' }),
    ]);
    expect(finishResult.error).toBeNull();

    const { data: stepRow } = await db.from('run_steps').select('status').eq('id', s1).single();
    const finalStatus = (stepRow as { status: string }).status;

    if (markResult.error) {
      // finish's transaction won the row-lock race: mark saw a closed run
      // and was rejected before mutating anything; finish's own sweep is
      // what moved the step off 'pending'.
      expect(markResult.error.code).toBe('45212');
      expect(finalStatus).toBe('skipped');
    }
    else {
      // mark's transaction won the race: the step was recorded before
      // finish's sweep ran, so finish's "not-yet-executed" sweep excludes it
      // (its status was already 'failed', not 'pending') and it survives.
      expect(finalStatus).toBe('failed');
    }
  });
});
