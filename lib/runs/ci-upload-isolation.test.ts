import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from '@lib/utils/select-all';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasEnv = Boolean(url && serviceKey && anonKey && jwtSecret);
const describeOrSkip = hasEnv ? describe : describe.skip;

void mock.module('server-only', () => ({}));
const { POST: uploadRoute } = await import('@app/api/v1/runs/uploads/route');
const { executeUpload, parseUploadQuery } = await import('@lib/runs/ci-upload-service');
const { mintPat } = await import('@lib/api/pat');
const { mintUserJwt } = await import('@lib/api/user-jwt');

const RPC = 'bunkai_submit_automated_run';
const PREFIX = `bk226-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
const createdUserIds: string[] = [];
const createdTokenIds: string[] = [];
const createdMemberships: { user_id: string, workspace_id: string }[] = [];
let ownerToken = '';
let ownerTokenName = '';
let foreignScopedToken = '';
let viewerId = '';
let outsiderId = '';

async function createUser(db: Db, label: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: `${PREFIX}-${label}@bunkai.test`,
    password: `Bk226-${label}-Test!${Date.now()}`,
    email_confirm: true,
  });
  if (error || !data.user) { throw error ?? new Error('createUser failed'); }
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function mint(db: Db, userId: string, name: string, workspaceId: string | null) {
  const pat = await mintPat({ admin: db as never, userId, name, workspaceId, scopes: ['atc:read', 'run:execute'], expiresInDays: null });
  createdTokenIds.push(pat.id);
  return pat;
}

async function impersonate(userId: string): Promise<SupabaseClient> {
  const token = await mintUserJwt(userId, jwtSecret!);
  return createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function reportText(cases: string): string {
  return `<?xml version="1.0"?><testsuites><testsuite name="ci">${cases}</testsuite></testsuites>`;
}

function report(cases: string): Uint8Array {
  return new TextEncoder().encode(reportText(cases));
}

function cases(n: number, failAt: number | null = null): string {
  return Array.from({ length: n }, (_, i) => (i + 1 === failAt
    ? `<testcase name="case ${i + 1}" classname="bk226"><failure message="expected 200">trace</failure></testcase>`
    : `<testcase name="case ${i + 1}" classname="bk226" time="2"/>`)).join('');
}

function query(extra = '') {
  return parseUploadQuery(new URLSearchParams(`test_id=${testId}&environment=${encodeURIComponent(anchor.environmentName)}&file_name=junit.xml${extra}`));
}

async function asSession(userId: string, extra: string, body: Uint8Array) {
  const db = await impersonate(userId);
  return executeUpload({ userId, workspaceId: null, via: 'cookie', tokenId: null, db: db as never }, query(extra), body);
}

async function status(run: () => Promise<unknown>): Promise<number> {
  try {
    await run();
    return 200;
  }
  catch (error) {
    return (error as { status?: number }).status ?? 500;
  }
}

async function runCount(db: Db): Promise<number> {
  const { count, error } = await db.from('runs').select('id', { count: 'exact', head: true }).eq('test_id', testId);
  if (error) { throw error; }
  return count ?? 0;
}

interface RunJson {
  id: string
  status: string
  executor_mode: string
  executor_name: string | null
  replayed: boolean
  report: { file_name: string, entry_count: number, unmapped_count: number, unmapped: { index: number, name: string }[] } | null
  atcs: { position: number, status: string, steps: { status: string, note: string | null }[] }[]
}

describeOrSkip('BK-226 — CI results upload through bunkai_submit_automated_run', () => {
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
      p_source: 'upload',
    } as never);
    if (probe.error && probe.error.code !== '45237') {
      skipReason = `the upload source is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0141_run_ci_results_upload.sql.`;
      console.warn(`[ci-upload-isolation] skipped: ${skipReason}`);
      return;
    }
    const found = await findAnchor(db);
    if (!found) {
      skipReason = 'need a live workspace with a writer, a project with an environment and 2+ ATCs that have steps.';
      console.warn(`[ci-upload-isolation] skipped: ${skipReason}`);
      return;
    }
    anchor = found;
    const { data: other } = await db.from('workspaces').select('id').neq('id', anchor.workspaceId).is('deleted_at', null).limit(1).maybeSingle();
    otherWorkspaceId = (other as { id: string } | null)?.id ?? null;

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspaceId, title: `${PREFIX} upload`, created_by: anchor.writerUserId })
      .select('id')
      .single();
    if (testError || !test) { throw testError ?? new Error('test seed failed'); }
    testId = test.id;
    const { error: chainError } = await db
      .from('test_steps')
      .insert(anchor.atcIds.slice(0, 2).map((atc_id, i) => ({ test_id: testId, atc_id, position: i + 1 })));
    if (chainError) { throw chainError; }

    viewerId = await createUser(db, 'viewer');
    const { error: viewerError } = await db
      .from('workspace_members')
      .insert({ workspace_id: anchor.workspaceId, user_id: viewerId, role: 'viewer', status: 'active' });
    if (viewerError) { throw viewerError; }
    createdMemberships.push({ user_id: viewerId, workspace_id: anchor.workspaceId });
    outsiderId = await createUser(db, 'outsider');

    ownerTokenName = `${PREFIX}-pipeline`;
    ownerToken = (await mint(db, anchor.writerUserId, ownerTokenName, anchor.workspaceId)).token;
    if (otherWorkspaceId) {
      foreignScopedToken = (await mint(db, anchor.writerUserId, `${PREFIX}-foreign`, otherWorkspaceId)).token;
    }
  });

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    if (testId) {
      const { data: runs } = await db.from('runs').select('id').eq('test_id', testId);
      const ids = ((runs ?? []) as { id: string }[]).map(r => r.id);
      if (ids.length > 0) {
        await db.from('run_submission_keys').delete().in('run_id', ids);
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

  const ready = () => skipReason === null;

  it('a session upload records a finished ci run with notes, gaps blocked and no token name', async () => {
    if (!ready()) { return; }
    const result = await asSession(anchor.writerUserId, '', report(cases(1, 1)));
    expect(result.status).toBe(201);
    const run = result.body.run as RunJson;
    expect(run.executor_mode).toBe('ci');
    expect(run.executor_name).toBeNull();
    expect(run.status).toBe('failed');
    expect(run.atcs.map(a => a.status)).toEqual(['failed', 'blocked']);
    expect(run.atcs[0].steps[0].note).toBe('Failure: expected 200\ntrace');
    expect(run.atcs[0].steps.slice(1).every(s => s.note === null)).toBe(true);
    expect(run.report).toEqual({ file_name: 'junit.xml', entry_count: 1, unmapped_count: 0, unmapped: [] });
  });

  it('the pipeline token path creates the same kind of run and keeps acknowledged unmapped entries', async () => {
    if (!ready()) { return; }
    const response = await uploadRoute(new NextRequest(`http://localhost/api/v1/runs/uploads?test_id=${testId}&environment=${encodeURIComponent(anchor.environmentName)}&acknowledge_unmapped=true&file_name=nightly.xml`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${ownerToken}`, 'content-type': 'application/xml' },
      body: reportText(cases(4)),
    }));
    expect(response.status).toBe(201);
    const { run } = await response.json() as { run: RunJson };
    expect(run.executor_mode).toBe('ci');
    expect(run.executor_name).toBe(ownerTokenName);
    expect(run.status).toBe('passed');
    expect(run.report!.unmapped_count).toBe(2);
    expect(run.report!.unmapped.map(u => [u.index, u.name])).toEqual([[3, 'case 3'], [4, 'case 4']]);
  });

  it('a viewer is refused and nothing is recorded', async () => {
    if (!ready()) { return; }
    const db = service();
    const before = await runCount(db);
    expect(await status(async () => asSession(viewerId, '', report(cases(2))))).toBe(403);
    expect(await runCount(db)).toBe(before);
  });

  it('a non-member and a token of another workspace both get 404', async () => {
    if (!ready()) { return; }
    expect(await status(async () => asSession(outsiderId, '', report(cases(2))))).toBe(404);
    if (foreignScopedToken) {
      const response = await uploadRoute(new NextRequest(`http://localhost/api/v1/runs/uploads?test_id=${testId}&environment=${encodeURIComponent(anchor.environmentName)}`, {
        method: 'POST',
        headers: { 'authorization': `Bearer ${foreignScopedToken}`, 'content-type': 'application/xml' },
        body: reportText(cases(2)),
      }));
      expect(response.status).toBe(404);
    }
  });

  it('a session cannot pass another user as the actor, and the api source still needs a token', async () => {
    if (!ready()) { return; }
    const outsider = await impersonate(outsiderId);
    const args = {
      p_actor_user_id: anchor.writerUserId,
      p_token_id: null,
      p_test_id: testId,
      p_environment_name: anchor.environmentName,
      p_verdict: 'passed',
      p_duration_seconds: 1,
      p_steps: [{ position: 1, result: 'pass' }, { position: 2, result: 'pass' }],
      p_source: 'upload',
      p_report: { file_name: 'x.xml', entry_count: 2, unmapped: [] },
    };
    const spoof = await outsider.rpc(RPC, args as never);
    expect(spoof.error?.code).toBe('P0002');
    const writer = await impersonate(anchor.writerUserId);
    const noToken = await writer.rpc(RPC, { ...args, p_source: 'api', p_report: undefined } as never);
    expect(noToken.error?.code).toBe('45237');
  });

  it('the same idempotency key replays the first run; another report under it is a conflict', async () => {
    if (!ready()) { return; }
    const db = service();
    const key = `&idempotency_key=${PREFIX}-k1`;
    const first = await asSession(anchor.writerUserId, key, report(cases(2)));
    expect(first.status).toBe(201);
    const count = await runCount(db);
    const again = await asSession(anchor.writerUserId, key, report(cases(2)));
    expect(again.status).toBe(200);
    expect((again.body.run as RunJson).id).toBe((first.body.run as RunJson).id);
    expect(await status(async () => asSession(anchor.writerUserId, key, report(cases(2, 2))))).toBe(409);
    expect(await runCount(db)).toBe(count);
  });
});
