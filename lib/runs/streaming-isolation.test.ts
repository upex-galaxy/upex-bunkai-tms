import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@lib/utils/select-all';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-223 — DB-integration test for the streaming contract (migration
// 0122_streamed_run_step_results.sql), driven through the REAL route handlers
// with real Personal Access Tokens, the way an agent or a CI job calls them:
//
//   * start with executor_mode "agent" snapshots the token name (executor_name);
//   * a bearer re-report of a reported step is idempotent when identical (200,
//     executed_at untouched) and a 409 conflict when it differs;
//   * the optional Idempotency-Key header replays the byte-identical response;
//   * a finish with unreported steps records them as skipped and derives the
//     duration from the timestamps;
//   * the 60 minute sweep closes idle agent / ci runs (reason "Inactivity
//     timeout", reported steps preserved) and never touches a human run or a
//     run that is only 30 minutes idle; a swept run is immutable and a restart
//     needs a new start_token;
//   * a viewer's token, or a token without run:execute, cannot stream.
//
// TIME IS SEEDED, NEVER WAITED FOR: idleness is expressed by moving
// runs.started_at / run_steps.executed_at into the past. The sweep is GLOBAL
// (one call closes every idle agent / ci run on the instance, exactly what the
// cron job does every 5 minutes), so assertions are keyed on run ids this suite
// created, never on the aggregate counters. Skips loudly when env or the
// migration is missing, same as submission-isolation.test.ts.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

void mock.module('server-only', () => ({}));
const { POST: startRoute } = await import('@app/api/v1/runs/route');
const { POST: markRoute } = await import('@app/api/v1/runs/[id]/steps/[stepId]/mark/route');
const { POST: finishRoute } = await import('@app/api/v1/runs/[id]/finish/route');
const { mintPat } = await import('@lib/api/pat');

const PREFIX = `bk223-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const WRITER_ROLES = new Set(['member', 'admin', 'owner']);

setDefaultTimeout(90_000);

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
type Db = ReturnType<typeof service>;

interface Anchor {
  workspaceId: string
  writerUserId: string
  environmentId: string
  atcIds: string[]
}

async function findAnchor(db: Db): Promise<Anchor | null> {
  const members = await selectAll<{ user_id: string, workspace_id: string, role: string, status: string }>(
    ({ from, to }) => db.from('workspace_members').select('user_id, workspace_id, role, status').order('user_id').range(from, to),
  );
  const live = new Set((await selectAll<{ id: string }>(
    ({ from, to }) => db.from('workspaces').select('id').is('deleted_at', null).order('id').range(from, to),
  )).map(w => w.id));
  const projects = await selectAll<{ id: string, workspace_id: string }>(
    ({ from, to }) => db.from('projects').select('id, workspace_id').order('id').range(from, to),
  );
  const envs = await selectAll<{ id: string, project_id: string }>(
    ({ from, to }) => db.from('project_environments').select('id, project_id').order('id').range(from, to),
  );
  const atcs = await selectAll<{ id: string, project_id: string }>(
    ({ from, to }) => db.from('atcs').select('id, project_id').order('id').range(from, to),
  );
  const steps = await selectAll<{ atc_id: string }>(
    ({ from, to }) => db.from('atc_steps').select('atc_id').order('id').range(from, to),
  );
  const withSteps = new Set(steps.map(s => s.atc_id));

  for (const p of projects) {
    if (!live.has(p.workspace_id)) { continue; }
    const writer = members.find(m => m.workspace_id === p.workspace_id && m.status === 'active' && WRITER_ROLES.has(m.role));
    const env = envs.find(e => e.project_id === p.id);
    const projectAtcs = atcs.filter(a => a.project_id === p.id && withSteps.has(a.id)).slice(0, 2);
    if (writer && env && projectAtcs.length >= 1) {
      return { workspaceId: p.workspace_id, writerUserId: writer.user_id, environmentId: env.id, atcIds: projectAtcs.map(a => a.id) };
    }
  }
  return null;
}

interface RunStepJson { id: string, status: string, note: string | null, executed_at: string | null }
interface RunJson {
  id: string
  status: string
  executor_mode: string
  executor_name: string | null
  abort_reason: string | null
  started_at: string
  finished_at: string | null
  replayed?: boolean
  atcs: { steps: RunStepJson[] }[]
}
interface Envelope { run?: RunJson, error?: { code: string, message: string, details?: { reason?: string } } }

let skipReason: string | null = null;
let anchor!: Anchor;
let testId = '';
let agentToken = '';
let agentTokenName = '';
let viewerToken = '';
let unscopedToken = '';
const createdTokenIds: string[] = [];
const createdUserIds: string[] = [];
const createdMemberships: { user_id: string, workspace_id: string }[] = [];

async function mint(db: Db, userId: string, name: string, scopes: ('atc:read' | 'run:execute')[]) {
  const pat = await mintPat({ admin: db as never, userId, name, workspaceId: anchor.workspaceId, scopes, expiresInDays: null });
  createdTokenIds.push(pat.id);
  return pat;
}

async function call(
  handler: (req: NextRequest, ctx: never) => Promise<Response>,
  path: string,
  token: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const response = await handler(new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({}) } as never);
  const text = await response.text();
  return { status: response.status, text, json: JSON.parse(text) as Envelope };
}

async function start(token: string, mode: 'agent' | 'ci' | 'human' | undefined, startToken: string, attempt = 1) {
  return call(startRoute as never, '/api/v1/runs', token, {
    test_id: testId,
    environment_id: anchor.environmentId,
    ...(mode ? { executor_mode: mode } : {}),
    start_token: startToken,
  }, { 'idempotency-key': `${PREFIX}-start-${startToken}-${attempt}`.slice(0, 120) });
}

async function mark(token: string, runId: string, stepId: string, body: unknown, headers: Record<string, string> = {}) {
  return call(markRoute as never, `/api/v1/runs/${runId}/steps/${stepId}/mark`, token, body, headers);
}

async function finish(token: string, runId: string, body: unknown) {
  return call(finishRoute as never, `/api/v1/runs/${runId}/finish`, token, body);
}

function stepsOf(run: RunJson): RunStepJson[] {
  return run.atcs.flatMap(a => a.steps);
}

async function fetchRun(db: Db, runId: string) {
  const { data, error } = await db.from('runs').select('id, status, abort_reason, started_at, finished_at, executor_name, executor_mode').eq('id', runId).single();
  if (error) { throw error; }
  return data as { id: string, status: string, abort_reason: string | null, started_at: string, finished_at: string | null, executor_name: string | null, executor_mode: string };
}

async function minutesAgo(db: Db, runId: string, minutes: number, stepIds: string[] = []) {
  const at = new Date(Date.now() - minutes * 60_000).toISOString();
  const { error } = await db.from('runs').update({ started_at: at }).eq('id', runId);
  if (error) { throw error; }
  for (const id of stepIds) {
    const { error: stepError } = await db.from('run_steps').update({ executed_at: at }).eq('id', id);
    if (stepError) { throw stepError; }
  }
}

describeOrSkip('BK-223 — streaming step results (mark conflict rule, executor_name, 60 minute sweep)', () => {
  beforeAll(async () => {
    const db = service();

    const probe = await db.rpc('bunkai_sweep_inactive_agent_runs', { p_threshold_minutes: 5_000_000 });
    if (probe.error) {
      skipReason = `bunkai_sweep_inactive_agent_runs is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0122_streamed_run_step_results.sql.`;
      console.warn(`[streaming-isolation] skipped: ${skipReason}`);
      return;
    }
    const found = await findAnchor(db);
    if (!found) {
      skipReason = 'need a live workspace with a writer, a project with an environment and an ATC that has steps (seed state).';
      console.warn(`[streaming-isolation] skipped: ${skipReason}`);
      return;
    }
    anchor = found;

    // A throwaway Test chained over existing ATCs (never edits an existing Test).
    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspaceId, title: `${PREFIX} streaming`, created_by: anchor.writerUserId })
      .select('id')
      .single();
    if (testError || !test) { throw testError ?? new Error('test seed failed'); }
    testId = test.id;
    const { error: chainError } = await db
      .from('test_steps')
      .insert(anchor.atcIds.map((atc_id, i) => ({ test_id: testId, atc_id, position: i + 1 })));
    if (chainError) { throw chainError; }

    const { data: viewer, error: viewerError } = await db.auth.admin.createUser({
      email: `${PREFIX}-viewer@bunkai.test`,
      password: `Bk223-viewer-Test!${Date.now()}`,
      email_confirm: true,
    });
    if (viewerError || !viewer.user) { throw viewerError ?? new Error('createUser failed'); }
    createdUserIds.push(viewer.user.id);
    const { error: memberError } = await db
      .from('workspace_members')
      .insert({ workspace_id: anchor.workspaceId, user_id: viewer.user.id, role: 'viewer', status: 'active' });
    if (memberError) { throw memberError; }
    createdMemberships.push({ user_id: viewer.user.id, workspace_id: anchor.workspaceId });

    agentTokenName = `${PREFIX}-agent-karim`;
    agentToken = (await mint(db, anchor.writerUserId, agentTokenName, ['atc:read', 'run:execute'])).token;
    viewerToken = (await mint(db, viewer.user.id, `${PREFIX}-viewer`, ['atc:read', 'run:execute'])).token;
    unscopedToken = (await mint(db, anchor.writerUserId, `${PREFIX}-readonly`, ['atc:read'])).token;
  });

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    if (testId) {
      const { data: runs } = await db.from('runs').select('id').eq('test_id', testId);
      const ids = ((runs ?? []) as { id: string }[]).map(r => r.id);
      if (ids.length > 0) {
        await db.from('notifications').delete().in('entity_id', ids);
        await db.from('activity_log').delete().in('entity_id', ids);
        await db.from('runs').delete().in('id', ids);
      }
      await db.from('test_steps').delete().eq('test_id', testId);
      await db.from('tests').delete().eq('id', testId);
    }
    for (const id of createdTokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
    for (const m of createdMemberships) {
      await db.from('workspace_members').delete().eq('user_id', m.user_id).eq('workspace_id', m.workspace_id);
    }
    for (const id of createdUserIds) {
      await db.auth.admin.deleteUser(id);
    }
  });

  it('start with executor_mode agent snapshots the token name, mark reports stream in, the run stays running', async () => {
    if (skipReason) { return; }
    const started = await start(agentToken, 'agent', `${PREFIX}-flow`);
    expect(started.status).toBe(201);
    const run = started.json.run!;
    expect(run.executor_mode).toBe('agent');
    expect(run.executor_name).toBe(agentTokenName);
    expect(run.status).toBe('running');
    expect(stepsOf(run).every(s => s.status === 'pending')).toBe(true);

    const first = stepsOf(run)[0];
    const marked = await mark(agentToken, run.id, first.id, { status: 'passed', note: 'ok' });
    expect(marked.status).toBe(200);
    expect(stepsOf(marked.json.run!)[0].status).toBe('passed');
    expect(marked.json.run!.status).toBe('running');
  });

  it('a start without executor_mode stays human (BK-34 behaviour)', async () => {
    if (skipReason) { return; }
    const started = await start(agentToken, undefined, `${PREFIX}-human-default`);
    expect(started.status).toBe(201);
    expect(started.json.run!.executor_mode).toBe('human');
  });

  it('identical re-report is 200 and does not move executed_at; a different status is a 409 and changes nothing', async () => {
    if (skipReason) { return; }
    const db = service();
    const run = (await start(agentToken, 'agent', `${PREFIX}-conflict`)).json.run!;
    const step = stepsOf(run)[0];

    const original = await mark(agentToken, run.id, step.id, { status: 'failed', note: 'timeout on payment' });
    expect(original.status).toBe(200);
    const { data: before } = await db.from('run_steps').select('executed_at').eq('id', step.id).single();

    const retry = await mark(agentToken, run.id, step.id, { status: 'failed', note: 'timeout on payment' });
    expect(retry.status).toBe(200);
    expect(stepsOf(retry.json.run!)[0].status).toBe('failed');
    const { data: after } = await db.from('run_steps').select('executed_at').eq('id', step.id).single();
    expect(after!.executed_at).toBe(before!.executed_at);

    const conflict = await mark(agentToken, run.id, step.id, { status: 'passed' });
    expect(conflict.status).toBe(409);
    expect(conflict.json.error!.details?.reason).toBe('run_step_conflict');
    const { data: stored } = await db.from('run_steps').select('status, note').eq('id', step.id).single();
    expect(stored).toEqual({ status: 'failed', note: 'timeout on payment' });

    const differentNote = await mark(agentToken, run.id, step.id, { status: 'failed', note: 'another note' });
    expect(differentNote.status).toBe(409);
  });

  it('the RPC without p_via (a cookie session) keeps last-write-wins', async () => {
    if (skipReason) { return; }
    const db = service();
    const run = (await start(agentToken, 'agent', `${PREFIX}-lww`)).json.run!;
    const step = stepsOf(run)[0];
    await mark(agentToken, run.id, step.id, { status: 'failed' });
    const { error } = await db.rpc('bunkai_mark_run_step', {
      p_actor_user_id: anchor.writerUserId,
      p_run_id: run.id,
      p_run_step_id: step.id,
      p_status: 'passed',
      p_note: null as unknown as string,
      p_evidence_url: null as unknown as string,
    });
    expect(error).toBeNull();
    const { data } = await db.from('run_steps').select('status').eq('id', step.id).single();
    expect(data!.status).toBe('passed');
  });

  it('Idempotency-Key replays the byte-identical response; the same key with another payload is a 409', async () => {
    if (skipReason) { return; }
    const run = (await start(agentToken, 'agent', `${PREFIX}-idem`)).json.run!;
    const step = stepsOf(run)[0];
    const headers = { 'idempotency-key': `${PREFIX}-step3-attempt-1` };

    const original = await mark(agentToken, run.id, step.id, { status: 'failed', note: 'timeout on payment' }, headers);
    const replay = await mark(agentToken, run.id, step.id, { status: 'failed', note: 'timeout on payment' }, headers);
    expect(original.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.text).toBe(original.text);

    const reused = await mark(agentToken, run.id, step.id, { status: 'passed' }, headers);
    expect(reused.status).toBe(409);
  });

  it('invalid step status or verdict is rejected and the run is unchanged', async () => {
    if (skipReason) { return; }
    const run = (await start(agentToken, 'agent', `${PREFIX}-invalid`)).json.run!;
    const step = stepsOf(run)[0];
    for (const status of ['pending', 'success', '']) {
      const res = await mark(agentToken, run.id, step.id, { status });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    const badVerdict = await finish(agentToken, run.id, { verdict: 'success' });
    expect(badVerdict.status).toBeGreaterThanOrEqual(400);
    expect(badVerdict.status).toBeLessThan(500);
    const db = service();
    expect((await fetchRun(db, run.id)).status).toBe('running');
    const { data } = await db.from('run_steps').select('status').eq('id', step.id).single();
    expect(data!.status).toBe('pending');
  });

  it('finish with unreported steps skips them, derives the duration, and a later report is a 409', async () => {
    if (skipReason) { return; }
    const db = service();
    const run = (await start(agentToken, 'agent', `${PREFIX}-finish`)).json.run!;
    const all = stepsOf(run);
    await mark(agentToken, run.id, all[0].id, { status: 'passed' });

    const finished = await finish(agentToken, run.id, { verdict: 'failed', duration_seconds: 99999 });
    expect(finished.status).toBe(200);
    expect(finished.json.run!.status).toBe('failed');
    const row = await fetchRun(db, run.id);
    // The caller-supplied duration is ignored: the run lasted seconds, not 99999.
    const seconds = (Date.parse(row.finished_at!) - Date.parse(row.started_at)) / 1000;
    expect(seconds).toBeLessThan(600);
    const { data: steps } = await db.from('run_steps').select('id, status').in('id', all.map(s => s.id));
    const byId = new Map((steps ?? []).map(s => [s.id as string, s.status as string]));
    expect(byId.get(all[0].id)).toBe('passed');
    for (const s of all.slice(1)) { expect(byId.get(s.id)).toBe('skipped'); }

    const late = await mark(agentToken, run.id, all[0].id, { status: 'passed' });
    expect(late.status).toBe(409);
    const again = await finish(agentToken, run.id, { verdict: 'passed' });
    expect(again.status).toBe(409);
  });

  it('a viewer token and a token without run:execute cannot stream', async () => {
    if (skipReason) { return; }
    const viewerStart = await start(viewerToken, 'agent', `${PREFIX}-viewer`);
    expect(viewerStart.status).toBe(403);
    const noScope = await start(unscopedToken, 'agent', `${PREFIX}-noscope`);
    expect(noScope.status).toBe(403);

    const run = (await start(agentToken, 'agent', `${PREFIX}-viewer-mark`)).json.run!;
    const step = stepsOf(run)[0];
    const viewerMark = await mark(viewerToken, run.id, step.id, { status: 'passed' });
    expect(viewerMark.status).toBe(403);
    const noScopeMark = await mark(unscopedToken, run.id, step.id, { status: 'passed' });
    expect(noScopeMark.status).toBe(403);
    const { data } = await service().from('run_steps').select('status').eq('id', step.id).single();
    expect(data!.status).toBe('pending');
  });

  it('the 60 minute sweep closes idle agent / ci runs, spares human and recent ones, and a restart needs a new start_token', async () => {
    if (skipReason) { return; }
    const db = service();
    const idleAgent = (await start(agentToken, 'agent', `${PREFIX}-sweep-agent`)).json.run!;
    const idleCi = (await start(agentToken, 'ci', `${PREFIX}-sweep-ci`)).json.run!;
    const recentAgent = (await start(agentToken, 'agent', `${PREFIX}-sweep-recent`)).json.run!;
    const idleHuman = (await start(agentToken, 'human', `${PREFIX}-sweep-human`)).json.run!;

    // One reported step on the idle agent run, 61 minutes ago: must survive the close.
    const reported = stepsOf(idleAgent)[0];
    await mark(agentToken, idleAgent.id, reported.id, { status: 'passed' });
    await minutesAgo(db, idleAgent.id, 90, [reported.id]);
    await minutesAgo(db, idleCi.id, 61);
    await minutesAgo(db, recentAgent.id, 30);
    await minutesAgo(db, idleHuman.id, 90);

    const { data: pass, error } = await db.rpc('bunkai_sweep_inactive_agent_runs', { p_threshold_minutes: 60 });
    expect(error).toBeNull();
    expect((pass as { swept: number }).swept).toBeGreaterThanOrEqual(2);

    const agentRow = await fetchRun(db, idleAgent.id);
    expect(agentRow.status).toBe('aborted');
    expect(agentRow.abort_reason!.startsWith('Inactivity timeout')).toBe(true);
    const { data: keptStep } = await db.from('run_steps').select('status').eq('id', reported.id).single();
    expect(keptStep!.status).toBe('passed');
    expect((await fetchRun(db, idleCi.id)).status).toBe('aborted');
    expect((await fetchRun(db, recentAgent.id)).status).toBe('running');
    expect((await fetchRun(db, idleHuman.id)).status).toBe('running');

    const { data: audit } = await db.from('activity_log').select('payload, actor_user_id').eq('entity_id', idleAgent.id).eq('action', 'run.aborted');
    expect((audit ?? []).some(a => (a.payload as { via?: string }).via === 'sweep' && a.actor_user_id === null)).toBe(true);

    // Closed runs accept nothing.
    const lateMark = await mark(agentToken, idleAgent.id, stepsOf(idleAgent)[1]?.id ?? reported.id, { status: 'passed' });
    expect(lateMark.status).toBe(409);
    const lateFinish = await finish(agentToken, idleAgent.id, { verdict: 'passed' });
    expect(lateFinish.status).toBe(409);

    // The same start_token inside 24 h replays the aborted run; a new one starts fresh.
    // (a fresh Idempotency-Key: the HTTP guard would otherwise replay the stale 201 snapshot)
    const sameToken = await start(agentToken, 'agent', `${PREFIX}-sweep-agent`, 2);
    expect(sameToken.json.run!.id).toBe(idleAgent.id);
    expect(sameToken.json.run!.status).toBe('aborted');
    const restarted = await start(agentToken, 'agent', `${PREFIX}-sweep-agent-2`);
    expect(restarted.status).toBe(201);
    expect(restarted.json.run!.id).not.toBe(idleAgent.id);
    expect(restarted.json.run!.status).toBe('running');
  });

  it('the sweep refuses a threshold below one minute and is not reachable by signed-in users', async () => {
    if (skipReason) { return; }
    const db = service();
    const { error } = await db.rpc('bunkai_sweep_inactive_agent_runs', { p_threshold_minutes: 0 });
    expect(error?.code).toBe('45215');
    const anon = createClient(url!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } }) as SupabaseClient;
    const denied = await anon.rpc('bunkai_sweep_inactive_agent_runs', { p_threshold_minutes: 60 } as never);
    expect(denied.error).not.toBeNull();
  });
});
