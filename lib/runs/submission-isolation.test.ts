import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@lib/utils/select-all';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-222 — DB-integration guard for `bunkai_submit_automated_run` (0121) and the
// POST /api/v1/runs/submissions route. ADR-0012 question 6: it attempts the spoof
// against the REAL database (a mocked `db.rpc` proves nothing) and drives the REAL
// exported handler with a REAL minted PAT, so the bearer middleware, the
// impersonating client and the RPC are all exercised together.
//
//   * AC-1 a submission records a finished `agent` run attributed to the token name,
//     with the submitted statuses on run_atcs/run_steps and both audit rows;
//   * AC-2/AC-3 idempotency: replay -> 200 same run; different payload -> 409;
//     concurrent identical requests create exactly one run; a rejected submission
//     does not consume the key; after 24 hours the key is free;
//   * AC-4 incomplete coverage names the missing positions, nothing recorded;
//   * AC-5/AC-6 the RPC backstops (the HTTP layer rejects these earlier);
//   * AC-7 viewer and missing scope -> 403, nothing recorded;
//   * AC-8 an unknown environment is named and never created;
//   * AC-9 a missing Test, a Test of another workspace and a non-member answer an
//     identical 404;
//   * spoof: an impersonated user cannot pass another user's id as the actor, nor use
//     another user's token.
//
// DB-dependent + env-gated: SKIPS when the Supabase env is absent, and when the RPC is
// not deployed yet (migration 0121). It seeds a throwaway Test on top of an existing
// workspace/project/ATCs and throwaway users, and purges everything in afterAll.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasEnv = Boolean(url && serviceKey && anonKey && jwtSecret);
const describeOrSkip = hasEnv ? describe : describe.skip;

void mock.module('server-only', () => ({}));
const { POST: submitRoute } = await import('@app/api/v1/runs/submissions/route');
const { mintPat } = await import('@lib/api/pat');
const { mintUserJwt } = await import('@lib/api/user-jwt');

const RPC = 'bunkai_submit_automated_run';
const PREFIX = `bk222-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const WRITER_ROLES = new Set(['member', 'admin', 'owner']);

setDefaultTimeout(90_000);

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
type Db = ReturnType<typeof service>;

interface Anchor {
  workspaceId: string
  writerUserId: string
  projectId: string
  environmentName: string
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
  const envs = await selectAll<{ project_id: string, name: string }>(
    ({ from, to }) => db.from('project_environments').select('project_id, name').order('id').range(from, to),
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
    const projectAtcs = atcs.filter(a => a.project_id === p.id && withSteps.has(a.id)).slice(0, 3);
    if (writer && env && projectAtcs.length >= 2) {
      return {
        workspaceId: p.workspace_id,
        writerUserId: writer.user_id,
        projectId: p.id,
        environmentName: env.name,
        atcIds: projectAtcs.map(a => a.id),
      };
    }
  }
  return null;
}

let skipReason: string | null = null;
let anchor!: Anchor;
let otherWorkspaceId: string | null = null;
let testId = '';
let chainLength = 0;
const createdUserIds: string[] = [];
const createdTokenIds: string[] = [];
const createdMemberships: { user_id: string, workspace_id: string }[] = [];
let ownerToken = '';
let ownerTokenId = '';
let ownerTokenName = '';
let viewerToken = '';
let outsiderToken = '';
let outsiderUserId = '';
let outsiderTokenId = '';
let foreignScopedToken = '';
let readOnlyToken = '';

async function createUser(db: Db, label: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: `${PREFIX}-${label}@bunkai.test`,
    password: `Bk222-${label}-Test!${Date.now()}`,
    email_confirm: true,
  });
  if (error || !data.user) { throw error ?? new Error('createUser failed'); }
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function mint(db: Db, userId: string, name: string, workspaceId: string | null, scopes: ('atc:read' | 'run:execute')[]) {
  const pat = await mintPat({ admin: db as never, userId, name, workspaceId, scopes, expiresInDays: null });
  createdTokenIds.push(pat.id);
  return pat;
}

function passingSteps(n = chainLength) {
  return Array.from({ length: n }, (_, i) => ({ position: i + 1, result: 'pass' }));
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    test_id: testId,
    environment: anchor.environmentName.toUpperCase(),
    verdict: 'passed',
    duration_seconds: 92,
    steps: passingSteps(),
    evidence_urls: ['https://ci.example.com/run/1', 'https://ci.example.com/run/2'],
    ...overrides,
  };
}

interface RunStepJson { status: string, executed_at: string | null }
interface RunAtcJson { position: number, status: string, steps: RunStepJson[] }
interface RunJson {
  id: string
  status: string
  executor_mode: string
  executor_name: string | null
  executor_user_id: string
  replayed: boolean
  environment_name: string
  evidence_urls: string[]
  started_at: string
  finished_at: string
  atcs: RunAtcJson[]
}

async function submit(token: string, payload: unknown) {
  const response = await submitRoute(new NextRequest('http://localhost/api/v1/runs/submissions', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  const json = await response.json() as { run?: RunJson, error?: { code: string, message: string, details?: { missing_positions?: number[] }, request_id?: string } };
  return { status: response.status, json };
}

async function runCount(db: Db): Promise<number> {
  const { count, error } = await db.from('runs').select('id', { count: 'exact', head: true }).eq('test_id', testId);
  if (error) { throw error; }
  return count ?? 0;
}

async function impersonate(userId: string): Promise<SupabaseClient> {
  const token = await mintUserJwt(userId, jwtSecret!);
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describeOrSkip('BK-222 — bunkai_submit_automated_run + POST /api/v1/runs/submissions', () => {
  beforeAll(async () => {
    const db = service();

    const probe = await db.rpc(RPC, {
      p_actor_user_id: ZERO_UUID,
      p_token_id: ZERO_UUID,
      p_test_id: ZERO_UUID,
      p_environment_name: 'x',
      p_verdict: 'passed',
      p_duration_seconds: 0,
      p_steps: [],
    });
    if (probe.error && probe.error.code !== '45237') {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0121_automated_run_submission.sql.`;
      console.warn(`[submission-isolation] skipped: ${skipReason}`);
      return;
    }

    const found = await findAnchor(db);
    if (!found) {
      skipReason = 'need a live workspace with a writer, a project with an environment and 2+ ATCs that have steps (seed state).';
      console.warn(`[submission-isolation] skipped: ${skipReason}`);
      return;
    }
    anchor = found;

    const { data: other } = await db.from('workspaces').select('id').neq('id', anchor.workspaceId).is('deleted_at', null).limit(1).maybeSingle();
    otherWorkspaceId = (other as { id: string } | null)?.id ?? null;

    // A throwaway Test chained over existing ATCs (never edits an existing Test).
    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspaceId, title: `${PREFIX} submission`, created_by: anchor.writerUserId })
      .select('id')
      .single();
    if (testError || !test) { throw testError ?? new Error('test seed failed'); }
    testId = test.id;
    chainLength = anchor.atcIds.length;
    const { error: chainError } = await db
      .from('test_steps')
      .insert(anchor.atcIds.map((atc_id, i) => ({ test_id: testId, atc_id, position: i + 1 })));
    if (chainError) { throw chainError; }

    const viewerId = await createUser(db, 'viewer');
    const { error: viewerError } = await db
      .from('workspace_members')
      .insert({ workspace_id: anchor.workspaceId, user_id: viewerId, role: 'viewer', status: 'active' });
    if (viewerError) { throw viewerError; }
    createdMemberships.push({ user_id: viewerId, workspace_id: anchor.workspaceId });

    outsiderUserId = await createUser(db, 'outsider');

    ownerTokenName = `${PREFIX}-ci-bot`;
    const owner = await mint(db, anchor.writerUserId, ownerTokenName, anchor.workspaceId, ['atc:read', 'run:execute']);
    ownerToken = owner.token;
    ownerTokenId = owner.id;
    viewerToken = (await mint(db, viewerId, `${PREFIX}-viewer`, anchor.workspaceId, ['atc:read', 'run:execute'])).token;
    const outsider = await mint(db, outsiderUserId, `${PREFIX}-outsider`, anchor.workspaceId, ['atc:read', 'run:execute']);
    outsiderToken = outsider.token;
    outsiderTokenId = outsider.id;
    readOnlyToken = (await mint(db, anchor.writerUserId, `${PREFIX}-readonly`, anchor.workspaceId, ['atc:read'])).token;
    if (otherWorkspaceId) {
      foreignScopedToken = (await mint(db, anchor.writerUserId, `${PREFIX}-foreign`, otherWorkspaceId, ['atc:read', 'run:execute'])).token;
    }
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

  function ready(): boolean {
    if (skipReason) { return false; }
    return true;
  }

  it('AC-1 — records a finished agent run attributed to the token, with the submitted statuses and both audit rows', async () => {
    if (!ready()) { return; }
    const db = service();
    const res = await submit(ownerToken, body({ idempotency_key: `${PREFIX}-ac1` }));
    expect(res.status).toBe(201);
    const run = res.json.run!;
    expect(run.status).toBe('passed');
    expect(run.executor_mode).toBe('agent');
    expect(run.executor_name).toBe(ownerTokenName);
    expect(run.executor_user_id).toBe(anchor.writerUserId);
    expect(run.replayed).toBe(false);
    expect(run.environment_name).toBe(anchor.environmentName);
    expect(run.evidence_urls).toEqual(['https://ci.example.com/run/1', 'https://ci.example.com/run/2']);
    expect(run.atcs).toHaveLength(chainLength);
    expect(run.atcs.every(a => a.status === 'passed' && a.steps.every(s => s.status === 'passed' && s.executed_at))).toBe(true);
    const duration = Date.parse(run.finished_at) - Date.parse(run.started_at);
    expect(duration).toBe(92_000);

    const { data: stored } = await db.from('runs').select('executor_token_id, status').eq('id', run.id).single();
    expect(stored).toMatchObject({ executor_token_id: ownerTokenId, status: 'passed' });
    const { data: audit } = await db.from('activity_log').select('action, payload').eq('entity_id', run.id);
    const actions = ((audit ?? []) as { action: string }[]).map(a => a.action).sort();
    expect(actions).toEqual(['run.finished', 'run.started']);
  });

  it('a failed run stores fail and block per chain position', async () => {
    if (!ready()) { return; }
    const steps = passingSteps();
    steps[0] = { position: 1, result: 'fail' };
    steps[1] = { position: 2, result: 'block' };
    const res = await submit(ownerToken, body({ verdict: 'failed', steps }));
    expect(res.status).toBe(201);
    const atcs = res.json.run!.atcs;
    expect(atcs[0].status).toBe('failed');
    expect(atcs[0].steps.every(s => s.status === 'failed')).toBe(true);
    expect(atcs[1].status).toBe('blocked');
    expect(res.json.run!.status).toBe('failed');
  });

  it('AC-2 / AC-3 — replay returns the same run (200); a different payload with the same key is 409 and changes nothing', async () => {
    if (!ready()) { return; }
    const db = service();
    const key = `${PREFIX}-idem`;
    const first = await submit(ownerToken, body({ idempotency_key: key }));
    expect(first.status).toBe(201);
    const before = await runCount(db);

    const replay = await submit(ownerToken, body({ idempotency_key: key }));
    expect(replay.status).toBe(200);
    expect(replay.json.run!.id).toBe(first.json.run!.id);
    expect(replay.json.run!.replayed).toBe(true);
    expect(await runCount(db)).toBe(before);

    const conflict = await submit(ownerToken, body({ idempotency_key: key, duration_seconds: 93 }));
    expect(conflict.status).toBe(409);
    expect(conflict.json.error?.code).toBe('conflict');
    expect(await runCount(db)).toBe(before);
  });

  it('two concurrent identical requests create exactly one run', async () => {
    if (!ready()) { return; }
    const db = service();
    const key = `${PREFIX}-race`;
    const before = await runCount(db);
    const [a, b] = await Promise.all([
      submit(ownerToken, body({ idempotency_key: key })),
      submit(ownerToken, body({ idempotency_key: key })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.json.run!.id).toBe(b.json.run!.id);
    expect(await runCount(db)).toBe(before + 1);
  });

  it('a rejected submission does not consume the key; after 24 hours the key is free', async () => {
    if (!ready()) { return; }
    const db = service();
    const key = `${PREFIX}-reject`;
    const bad = await submit(ownerToken, body({ idempotency_key: key, steps: passingSteps().slice(1) }));
    expect(bad.status).toBe(422);
    const ok = await submit(ownerToken, body({ idempotency_key: key }));
    expect(ok.status).toBe(201);

    await db.from('run_submission_keys')
      .update({ created_at: new Date(Date.now() - 25 * 3600_000).toISOString() })
      .eq('workspace_id', anchor.workspaceId)
      .eq('idempotency_key', key);
    const reused = await submit(ownerToken, body({ idempotency_key: key, duration_seconds: 5 }));
    expect(reused.status).toBe(201);
    expect(reused.json.run!.id).not.toBe(ok.json.run!.id);
  });

  it('AC-4 — incomplete coverage names the missing positions and records nothing', async () => {
    if (!ready()) { return; }
    const db = service();
    const before = await runCount(db);
    const res = await submit(ownerToken, body({ steps: [{ position: 1, result: 'pass' }] }));
    expect(res.status).toBe(422);
    expect(res.json.error?.details?.missing_positions).toEqual(Array.from({ length: chainLength - 1 }, (_, i) => i + 2));
    expect(await runCount(db)).toBe(before);
  });

  it('AC-5 / AC-6 — the RPC backstops reject a bad vocabulary and an inconsistent verdict', async () => {
    if (!ready()) { return; }
    const db = service();
    const args = {
      p_actor_user_id: anchor.writerUserId,
      p_token_id: ownerTokenId,
      p_test_id: testId,
      p_environment_name: anchor.environmentName,
      p_duration_seconds: 10,
    };
    const vocab = await db.rpc(RPC, { ...args, p_verdict: 'success', p_steps: passingSteps() });
    expect(vocab.error?.code).toBe('45232');
    const stepVocab = await db.rpc(RPC, { ...args, p_verdict: 'passed', p_steps: passingSteps().map(s => ({ ...s, result: 'ok' })) });
    expect(stepVocab.error?.code).toBe('45232');
    const inconsistent = await db.rpc(RPC, { ...args, p_verdict: 'passed', p_steps: passingSteps().map((s, i) => (i === 0 ? { ...s, result: 'fail' } : s)) });
    expect(inconsistent.error?.code).toBe('45235');
    const failedNoFail = await db.rpc(RPC, { ...args, p_verdict: 'failed', p_steps: passingSteps() });
    expect(failedNoFail.error?.code).toBe('45235');
    const dup = await db.rpc(RPC, { ...args, p_verdict: 'passed', p_steps: [...passingSteps(), { position: 1, result: 'pass' }] });
    expect(dup.error?.code).toBe('45234');
  });

  it('AC-7 — a viewer and a token without run:execute are 403 and record nothing', async () => {
    if (!ready()) { return; }
    const db = service();
    const before = await runCount(db);
    const viewer = await submit(viewerToken, body());
    expect(viewer.status).toBe(403);
    const noScope = await submit(readOnlyToken, body());
    expect(noScope.status).toBe(403);
    expect(await runCount(db)).toBe(before);
  });

  it('AC-8 — an unknown environment is named and never created', async () => {
    if (!ready()) { return; }
    const db = service();
    const { count: envBefore } = await db.from('project_environments').select('id', { count: 'exact', head: true }).eq('project_id', anchor.projectId);
    const before = await runCount(db);
    const res = await submit(ownerToken, body({ environment: `${PREFIX}-nowhere` }));
    expect(res.status).toBe(422);
    expect(res.json.error?.code).toBe('environment_invalid');
    expect(res.json.error?.message).toContain(`${PREFIX}-nowhere`);
    const { count: envAfter } = await db.from('project_environments').select('id', { count: 'exact', head: true }).eq('project_id', anchor.projectId);
    expect(envAfter).toBe(envBefore);
    expect(await runCount(db)).toBe(before);
  });

  it('AC-9 — a missing Test, another workspace\'s token and a non-member answer an identical 404', async () => {
    if (!ready()) { return; }
    const missing = await submit(ownerToken, body({ test_id: '11111111-1111-4111-8111-111111111111' }));
    const nonMember = await submit(outsiderToken, body());
    expect(missing.status).toBe(404);
    expect(nonMember.status).toBe(404);
    expect(nonMember.json.error?.code).toBe(missing.json.error?.code);
    expect(nonMember.json.error?.message).toBe(missing.json.error?.message);
    if (foreignScopedToken) {
      const foreign = await submit(foreignScopedToken, body());
      expect(foreign.status).toBe(404);
      expect(foreign.json.error?.message).toBe(missing.json.error?.message);
    }
  });

  it('spoof — an impersonated user cannot pass another user\'s id as the actor', async () => {
    if (!ready()) { return; }
    const db = service();
    const before = await runCount(db);
    const asOutsider = await impersonate(outsiderUserId);
    const spoof = await asOutsider.rpc(RPC, {
      p_actor_user_id: anchor.writerUserId,
      p_token_id: ownerTokenId,
      p_test_id: testId,
      p_environment_name: anchor.environmentName,
      p_verdict: 'passed',
      p_duration_seconds: 10,
      p_steps: passingSteps(),
    });
    expect(spoof.error?.code).toBe('P0002');
    expect(spoof.data).toBeNull();
    expect(await runCount(db)).toBe(before);
  });

  it('another user\'s token is refused even for the right actor (45237)', async () => {
    if (!ready()) { return; }
    const asOutsider = await impersonate(outsiderUserId);
    const stolen = await asOutsider.rpc(RPC, {
      p_actor_user_id: outsiderUserId,
      p_token_id: ownerTokenId,
      p_test_id: testId,
      p_environment_name: anchor.environmentName,
      p_verdict: 'passed',
      p_duration_seconds: 10,
      p_steps: passingSteps(),
    });
    expect(stolen.error?.code).toBe('45237');
    expect(outsiderTokenId).not.toBe(ownerTokenId);
  });

  it('the idempotency key table and the RPC are closed to anon and to authenticated reads', async () => {
    if (!ready()) { return; }
    const asOwner = await impersonate(anchor.writerUserId);
    const read = await asOwner.from('run_submission_keys').select('idempotency_key').limit(1);
    expect(read.error).not.toBeNull();
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const anonCall = await anon.rpc(RPC, {
      p_actor_user_id: ZERO_UUID,
      p_token_id: ZERO_UUID,
      p_test_id: ZERO_UUID,
      p_environment_name: 'x',
      p_verdict: 'passed',
      p_duration_seconds: 0,
      p_steps: [],
    });
    expect(anonCall.error).not.toBeNull();
  });
});
