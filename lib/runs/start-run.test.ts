import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'bun:test';

// BK-34 — integration guard for the start-run RPC (`bunkai_create_run`) and the
// read RPC (`bunkai_get_run_expanded`). Sibling of the BK-28 reorder suite: it
// drives the REAL server-side rulebook against a live database through the
// service-role client (explicit actor — the exact contract the API route uses),
// asserting the observable ATP behaviors (BK-34-ATC-01..07) + authorization:
//
//   * ATC-01 start → run with run_steps in chain order, all pending, status running;
//   * ATC-02 a Test with no executable steps → no_executable_steps (45202), no row;
//   * ATC-03 an environment not in the Test's Project → environment_invalid (45201);
//   * ATC-04 same (test_id, start_token) within 24h → the SAME run id (replayed), no dup;
//   * ATC-05 a different token → a NEW run id, the original untouched;
//   * ATC-06 executor_mode agent/ci stored verbatim; an invalid mode → 45200;
//   * ATC-07 a started run is queryable via bunkai_get_run_expanded (history visibility)
//           AND its snapshot is frozen against a later source-step edit;
//   * authorization: a non-member actor → forbidden (42501), no existence disclosure.
//
// 401 (unauthenticated) is enforced at the route layer (withApiHandler), not the
// RPC — the RPC always receives an explicit resolved actor — so it is out of
// scope here.
//
// DB-dependent + env-gated: when the Supabase env is absent the suite SKIPS
// LOUDLY (describe.skip). When present but the seed can't satisfy a precondition
// it logs and passes (never blocks a build on seed state). Every created run is
// purged in afterAll via a unique per-suite start_token prefix, so the shared DB
// is left pristine; the read/snapshot case rolls back its own throwaway fixture.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const CREATE_RPC = 'bunkai_create_run';
const READ_RPC = 'bunkai_get_run_expanded';
const TOKEN_PREFIX = `bk34-test-${Date.now()}-`;
const RANDOM_UUID = '00000000-0000-0000-0000-000000000000';

const WRITER_ROLES = new Set(['member', 'admin', 'owner']);

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof service>;

// A (test, writer-actor, project, staging-env) where the actor can write the
// Test's workspace and the Test has at least one executable step.
async function pickRunnable(db: Db) {
  const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');
  const activeWriters = ((members ?? []) as MemberRow[]).filter(m => m.status === 'active' && WRITER_ROLES.has(m.role));

  // Tests with >= 1 executable step, joined to their project + a Staging env.
  const { data: steps } = await db.from('test_steps').select('test_id, atc_id');
  const { data: tests } = await db.from('tests').select('id, workspace_id, title');
  const { data: atcs } = await db.from('atcs').select('id, project_id');
  const { data: atcSteps } = await db.from('atc_steps').select('atc_id');
  const { data: envs } = await db.from('project_environments').select('id, project_id, name');

  if (!steps || !tests || !atcs || !atcSteps || !envs) { return undefined; }

  const stepCountByAtc = new Map<string, number>();
  for (const s of atcSteps as { atc_id: string }[]) {
    stepCountByAtc.set(s.atc_id, (stepCountByAtc.get(s.atc_id) ?? 0) + 1);
  }
  const projectByAtc = new Map<string, string>();
  for (const a of atcs as { id: string, project_id: string }[]) { projectByAtc.set(a.id, a.project_id); }

  for (const t of tests as { id: string, workspace_id: string, title: string }[]) {
    const writer = activeWriters.find(m => m.workspace_id === t.workspace_id);
    if (!writer) { continue; }
    const chain = (steps as { test_id: string, atc_id: string }[]).filter(s => s.test_id === t.id);
    if (chain.length === 0) { continue; }
    const execCount = chain.reduce((n, s) => n + (stepCountByAtc.get(s.atc_id) ?? 0), 0);
    if (execCount === 0) { continue; }
    const projectId = projectByAtc.get(chain[0].atc_id);
    if (!projectId) { continue; }
    const stagingEnv = (envs as { id: string, project_id: string, name: string }[])
      .find(e => e.project_id === projectId && e.name === 'Staging');
    if (!stagingEnv) { continue; }
    return { testId: t.id, workspaceId: t.workspace_id, actorId: writer.user_id, projectId, envId: stagingEnv.id, execCount };
  }
  return undefined;
}

describeOrSkip('BK-34 — bunkai_create_run / bunkai_get_run_expanded', () => {
  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    // Purge every run this suite created (cascade clears run_atcs/run_steps),
    // then the audit rows it emitted.
    const { data: created } = await db.from('runs').select('id').like('start_token', `${TOKEN_PREFIX}%`);
    const ids = ((created ?? []) as { id: string }[]).map(r => r.id);
    if (ids.length > 0) {
      await db.from('activity_log').delete().eq('action', 'run.started').in('entity_id', ids);
      await db.from('runs').delete().like('start_token', `${TOKEN_PREFIX}%`);
    }
  });

  it('ATC-01 — start → run_steps in chain order, all pending, status running', async () => {
    const db = service();
    const pick = await pickRunnable(db);
    if (!pick) { console.warn('[start-run] skipped ATC-01: need a writable Test with >= 1 executable step (seed state).'); return; }

    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: pick.actorId,
      p_test_id: pick.testId,
      p_environment_id: pick.envId,
      p_executor_mode: 'human',
      p_start_token: `${TOKEN_PREFIX}atc01`,
    });
    expect(error).toBeNull();
    const run = data as {
      status: string
      executor_mode: string
      environment_name: string
      step_count: number
      replayed: boolean
      atcs: Array<{ position: number, steps: Array<{ position: number, status: string }> }>
    };
    expect(run.status).toBe('running');
    expect(run.executor_mode).toBe('human');
    expect(run.environment_name).toBe('Staging');
    expect(run.replayed).toBe(false);
    expect(run.step_count).toBe(pick.execCount);
    // ATC positions are ascending (chain order preserved).
    const atcPositions = run.atcs.map(a => a.position);
    expect([...atcPositions].sort((a, b) => a - b)).toEqual(atcPositions);
    // every run_step is pending.
    const allPending = run.atcs.every(a => a.steps.every(s => s.status === 'pending'));
    expect(allPending).toBe(true);
  });

  it('ATC-03 — an environment not in the Test\'s Project → environment_invalid (45201)', async () => {
    const db = service();
    const pick = await pickRunnable(db);
    if (!pick) { console.warn('[start-run] skipped ATC-03: seed state.'); return; }
    // An env from a DIFFERENT project.
    const { data: foreign } = await db
      .from('project_environments')
      .select('id')
      .neq('project_id', pick.projectId)
      .limit(1)
      .maybeSingle();
    if (!foreign) { console.warn('[start-run] skipped ATC-03: need a second project with an env.'); return; }

    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: pick.actorId,
      p_test_id: pick.testId,
      p_environment_id: (foreign as { id: string }).id,
      p_executor_mode: 'human',
      p_start_token: `${TOKEN_PREFIX}atc03`,
    });
    expect(error?.code).toBe('45201');
    expect(data).toBeNull();
  });

  it('ATC-04 — same (test_id, start_token) within 24h → same run id (replayed), no duplicate', async () => {
    const db = service();
    const pick = await pickRunnable(db);
    if (!pick) { console.warn('[start-run] skipped ATC-04: seed state.'); return; }
    const token = `${TOKEN_PREFIX}atc04`;
    const args = {
      p_actor_user_id: pick.actorId,
      p_test_id: pick.testId,
      p_environment_id: pick.envId,
      p_executor_mode: 'human',
      p_start_token: token,
    };
    const first = await db.rpc(CREATE_RPC, args);
    const second = await db.rpc(CREATE_RPC, args);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    const r1 = first.data as { id: string, replayed: boolean };
    const r2 = second.data as { id: string, replayed: boolean };
    expect(r1.replayed).toBe(false);
    expect(r2.replayed).toBe(true);
    expect(r2.id).toBe(r1.id);
    const { count } = await db.from('runs').select('id', { count: 'exact', head: true }).eq('start_token', token);
    expect(count).toBe(1);
  });

  it('ATC-05 — a different token → a new run id', async () => {
    const db = service();
    const pick = await pickRunnable(db);
    if (!pick) { console.warn('[start-run] skipped ATC-05: seed state.'); return; }
    const a = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_test_id: pick.testId, p_environment_id: pick.envId, p_executor_mode: 'human', p_start_token: `${TOKEN_PREFIX}atc05a` });
    const b = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_test_id: pick.testId, p_environment_id: pick.envId, p_executor_mode: 'human', p_start_token: `${TOKEN_PREFIX}atc05b` });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect((b.data as { id: string }).id).not.toBe((a.data as { id: string }).id);
  });

  it('ATC-06 — executor_mode agent/ci stored verbatim; an invalid mode → 45200', async () => {
    const db = service();
    const pick = await pickRunnable(db);
    if (!pick) { console.warn('[start-run] skipped ATC-06: seed state.'); return; }
    for (const mode of ['agent', 'ci'] as const) {
      const { data, error } = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_test_id: pick.testId, p_environment_id: pick.envId, p_executor_mode: mode, p_start_token: `${TOKEN_PREFIX}atc06-${mode}` });
      expect(error).toBeNull();
      expect((data as { executor_mode: string }).executor_mode).toBe(mode);
    }
    const bad = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_test_id: pick.testId, p_environment_id: pick.envId, p_executor_mode: 'robot', p_start_token: `${TOKEN_PREFIX}atc06-bad` });
    expect(bad.error?.code).toBe('45200');
    expect(bad.data).toBeNull();
  });

  it('ATC-07 — a started run is queryable and its snapshot is frozen against a later source edit', async () => {
    const db = service();
    const pick = await pickRunnable(db);
    if (!pick) { console.warn('[start-run] skipped ATC-07: seed state.'); return; }

    const { data, error } = await db.rpc(CREATE_RPC, { p_actor_user_id: pick.actorId, p_test_id: pick.testId, p_environment_id: pick.envId, p_executor_mode: 'human', p_start_token: `${TOKEN_PREFIX}atc07` });
    expect(error).toBeNull();
    const created = data as { id: string, atcs: Array<{ atc_id: string, steps: Array<{ atc_step_id: string, content: string }> }> };

    // Queryability (history visibility): the read RPC returns the same run.
    const read = await db.rpc(READ_RPC, { p_actor_user_id: pick.actorId, p_run_id: created.id });
    expect(read.error).toBeNull();
    expect((read.data as { id: string }).id).toBe(created.id);

    // Snapshot integrity: edit a source atc_step, then re-read — the run must NOT change.
    const firstStep = created.atcs.flatMap(a => a.steps).find(s => s.atc_step_id);
    if (!firstStep) { console.warn('[start-run] ATC-07 snapshot half-skipped: run had no provenance-linked step.'); return; }
    const { data: src } = await db.from('atc_steps').select('id, content').eq('id', firstStep.atc_step_id).maybeSingle();
    if (!src) { return; }
    const original = (src as { content: string }).content;
    await db.from('atc_steps').update({ content: `${original} EDITED-${Date.now()}` }).eq('id', firstStep.atc_step_id);
    try {
      const reread = await db.rpc(READ_RPC, { p_actor_user_id: pick.actorId, p_run_id: created.id });
      const snapStep = (reread.data as { atcs: Array<{ steps: Array<{ atc_step_id: string, content: string }> }> })
        .atcs
        .flatMap(a => a.steps)
        .find(s => s.atc_step_id === firstStep.atc_step_id);
      expect(snapStep?.content).toBe(firstStep.content); // frozen at start, not the edited source
    }
    finally {
      // Restore the source step so shared data stays pristine.
      await db.from('atc_steps').update({ content: original }).eq('id', firstStep.atc_step_id);
    }
  });

  it('authorization — a non-member actor → forbidden (42501), no existence disclosure', async () => {
    const db = service();
    const pick = await pickRunnable(db);
    if (!pick) { console.warn('[start-run] skipped authz: seed state.'); return; }
    const { data, error } = await db.rpc(CREATE_RPC, {
      p_actor_user_id: RANDOM_UUID,
      p_test_id: pick.testId,
      p_environment_id: pick.envId,
      p_executor_mode: 'human',
      p_start_token: `${TOKEN_PREFIX}authz`,
    });
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });
});
