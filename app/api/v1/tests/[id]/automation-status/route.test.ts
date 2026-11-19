import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
setDefaultTimeout(30_000);
const routes = await import('./route');
const { GET, PUT } = routes;
const { mintPat } = await import('@lib/api/pat');

// BK-227: the HTTP contract of the automation status route, through the real
// handlers, a real Bearer PAT and the real RPCs. Function-level behaviour is
// proved by `lib/tests/automation-status-isolation.test.ts`; this covers what
// only the route owns: status codes, bodies, scopes and the missing edit/delete
// verbs. Skipped, loudly, only with no database environment or before 0135.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const TAG = '[automation status route]';
const ABSENT = '00000000-0000-4000-8000-000000000000';

const hasEnv = Boolean(url && serviceKey);
if (!hasEnv) {
  console.warn(`${TAG} SKIPPED ENTIRELY: no database environment.`);
}
let deployed = false;
if (hasEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc('bunkai_get_test_automation_status', { p_actor_user_id: ABSENT, p_test_id: ABSENT });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`${TAG} SKIPPED ENTIRELY: bunkai_get_test_automation_status is not deployed (${code}). Apply migration 0135_test_automation_status_history.sql.`);
  }
  else {
    throw new Error(`${TAG} unexpected answer from the deploy probe (${code}).`);
  }
}
const describeOrSkip = hasEnv && deployed ? describe : describe.skip;
const PREFIX = `bk227r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${TAG} fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Seed {
  userId: string
  workspaceId: string
  projectId: string
  atcId: string
  writeToken: string
  readToken: string
  tokenIds: string[]
}

let seed: Seed | null = null;
let counter = 0;

function need(): Seed {
  if (!seed) { throw new Error(`${TAG} the fixture was not seeded; refusing to pass.`); }
  return seed;
}

function call(method: string, testId: string, token: string, body?: unknown): NextRequest {
  return new NextRequest(`https://app.test/api/v1/tests/${testId}/automation-status`, {
    method,
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

async function newTest(): Promise<string> {
  counter += 1;
  const { data, error } = await service().rpc('bunkai_create_test', {
    p_actor_user_id: need().userId,
    p_workspace_id: need().workspaceId,
    p_title: `${PREFIX} test ${counter}`,
    p_atc_ids: [need().atcId],
  });
  if (error) { throw new Error(`${TAG} test seed failed: ${error.message}`); }
  return (data as { id: string }).id;
}

interface ErrorBody { error: { code: string, details?: { reason?: string } } }

describeOrSkip('BK-227: GET / PUT /api/v1/tests/{id}/automation-status', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    const db = service();
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error(`${TAG} NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.`);
    }
    const auth = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`${TAG} QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const userId = signIn.user.id;
    await auth.auth.signOut();
    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-w`, name: `${PREFIX} w`, owner_user_id: userId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} p` }).select('id').single(), 'project');
    const moduleRow = must(await db.from('modules').insert({ project_id: project.id, path: 'm', name: 'm' }).select('id').single(), 'module');
    const story = must(await db.from('user_stories').insert({ module_id: moduleRow.id, title: `${PREFIX} story` }).select('id').single(), 'story');
    const atc = must(await db.from('atcs').insert({
      project_id: project.id,
      module_id: moduleRow.id,
      user_story_id: story.id,
      slug: `${PREFIX}-a`,
      title: `${PREFIX} atc`,
      layer: 'UI',
    }).select('id').single(), 'atc');
    must(await db.from('atc_steps').insert({ atc_id: atc.id, position: 1, content: 'a step' }).select('id').single(), 'atc step');

    const write = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-write`, scopes: ['atc:read', 'atc:write'] });
    const read = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-read`, scopes: ['atc:read'] });
    seed = {
      userId,
      workspaceId: ws.id as string,
      projectId: project.id as string,
      atcId: atc.id as string,
      writeToken: write.token,
      readToken: read.token,
      tokenIds: [write.id, read.id],
    };
  });

  afterAll(async () => {
    const s = seed;
    if (!s) { return; }
    const db = service();
    for (const id of s.tokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
    await db.from('tests').delete().eq('workspace_id', s.workspaceId);
    await db.from('atcs').delete().eq('project_id', s.projectId);
    await db.from('projects').delete().eq('id', s.projectId);
    await db.from('activity_log').delete().eq('workspace_id', s.workspaceId);
    await db.from('workspace_members').delete().eq('workspace_id', s.workspaceId);
    await db.from('workspaces').delete().eq('id', s.workspaceId);
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`${TAG} ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  it('reads a new Test as manual-only with an empty history', async () => {
    const id = await newTest();
    const res = await GET(call('GET', id, need().readToken));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ test_id: id, automation_status: 'manual-only', history: [] });
  });

  it('sets the status, returns the entry, and a repeat is a no-op', async () => {
    const id = await newTest();
    const set = await PUT(call('PUT', id, need().writeToken, { status: 'candidate' }));
    expect(set.status).toBe(200);
    const body = await set.json() as { changed: boolean, automation_status: string, entry: { from_status: string, to_status: string } };
    expect(body.changed).toBe(true);
    expect(body.automation_status).toBe('candidate');
    expect(body.entry).toMatchObject({ from_status: 'manual-only', to_status: 'candidate' });

    const again = await PUT(call('PUT', id, need().writeToken, { status: 'candidate' }));
    expect(again.status).toBe(200);
    expect((await again.json() as { changed: boolean }).changed).toBe(false);

    const read = await GET(call('GET', id, need().readToken));
    expect((await read.json() as { history: unknown[] }).history).toHaveLength(1);
  });

  it('answers 422 to a status outside the three and changes nothing', async () => {
    const id = await newTest();
    for (const status of ['in-progress', 'Automated', null, 3]) {
      const res = await PUT(call('PUT', id, need().writeToken, { status }));
      expect(res.status).toBe(422);
      expect((await res.json() as ErrorBody).error.code).toBe('validation_failed');
    }
    const read = await GET(call('GET', id, need().readToken));
    expect(await read.json()).toMatchObject({ automation_status: 'manual-only', history: [] });
  });

  it('answers 403 to a token without atc:write, 400 to a bad id or body, 404 to a missing Test', async () => {
    const id = await newTest();
    expect((await PUT(call('PUT', id, need().readToken, { status: 'automated' }))).status).toBe(403);
    expect((await PUT(call('PUT', 'not-a-uuid', need().writeToken, { status: 'automated' }))).status).toBe(400);
    expect((await PUT(call('PUT', id, need().writeToken, '{nope'))).status).toBe(400);
    const missing = await GET(call('GET', ABSENT, need().readToken));
    expect(missing.status).toBe(404);
    expect((await missing.json() as ErrorBody).error.code).toBe('not_found');
  });

  it('answers 409 test_archived on an archived Test', async () => {
    const id = await newTest();
    expect((await service().rpc('bunkai_archive_test', { p_actor_user_id: need().userId, p_test_id: id })).error).toBeNull();
    const res = await PUT(call('PUT', id, need().writeToken, { status: 'automated' }));
    expect(res.status).toBe(409);
    expect((await res.json() as ErrorBody).error.details?.reason).toBe('test_archived');
  });

  it('exposes no verb that edits or deletes a history entry', () => {
    expect(Object.keys(routes).sort()).toEqual(['GET', 'PUT']);
  });
});
