import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
const { POST } = await import('./route');
const { DELETE, GET, PATCH } = await import('../route');
const { PUT: TAGS } = await import('../tags/route');
const { POST: START_RUN } = await import('../../../runs/route');
const { mintPat } = await import('@lib/api/pat');

// BK-596: the HTTP contract of rename, archive and restore, end to end through
// the real handlers, a real Bearer PAT and the real RPCs (BK-571's vocabulary).
// Function-level behaviour is proved by `lib/tests/test-archive-isolation.test.ts`;
// this covers what only the routes own: status codes, bodies, scopes, the split
// title faults and the named refusals on an archived Test. Fixtures sit in a
// throwaway workspace and are deleted in afterAll. Skipped, loudly, only with no
// database environment or before migration 0134 is applied.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const TAG = '[test archive routes]';
const ABSENT = '00000000-0000-4000-8000-000000000000';

const hasEnv = Boolean(url && serviceKey);
if (!hasEnv) {
  console.warn(`${TAG} SKIPPED ENTIRELY: no database environment.`);
}
let deployed = false;
if (hasEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc('bunkai_archive_test', { p_actor_user_id: ABSENT, p_test_id: ABSENT });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`${TAG} SKIPPED ENTIRELY: bunkai_archive_test is not deployed (${code}). Apply migration 0134_test_archive_restore.sql.`);
  }
  else {
    throw new Error(`${TAG} unexpected answer from the deploy probe (${code}).`);
  }
}
const describeOrSkip = hasEnv && deployed ? describe : describe.skip;
const PREFIX = `bk596r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  environmentId: string
  atcId: string
  writeToken: string
  readToken: string
  runToken: string
  tokenIds: string[]
}

let seed: Seed | null = null;
let counter = 0;

function need(): Seed {
  if (!seed) { throw new Error(`${TAG} the fixture was not seeded; refusing to pass.`); }
  return seed;
}

function call(method: string, path: string, token: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://app.test/api/v1/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function newTest(): Promise<{ id: string, title: string }> {
  counter += 1;
  const title = `${PREFIX} test ${counter}`;
  const { data, error } = await service().rpc('bunkai_create_test', {
    p_actor_user_id: need().userId,
    p_workspace_id: need().workspaceId,
    p_title: title,
    p_atc_ids: [need().atcId],
  });
  if (error) { throw new Error(`${TAG} test seed failed: ${error.message}`); }
  return { id: (data as { id: string }).id, title };
}

async function row(testId: string) {
  return must(await service().from('tests').select('title, version, archived_at').eq('id', testId).single(), 'test read');
}

interface ErrorBody { error: { code: string, details?: { reason?: string, current_version?: number } } }

describeOrSkip('BK-596: PATCH / DELETE /api/v1/tests/{id} and POST /api/v1/tests/{id}/restore', () => {
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
    const env = must(await db.from('project_environments').insert({ project_id: project.id, name: 'staging' }).select('id').single(), 'environment');
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
    const run = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-run`, scopes: ['atc:read', 'run:execute'] });
    seed = {
      userId,
      workspaceId: ws.id as string,
      projectId: project.id as string,
      environmentId: env.id as string,
      atcId: atc.id as string,
      writeToken: write.token,
      readToken: read.token,
      runToken: run.token,
      tokenIds: [write.id, read.id, run.id],
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
    await db.from('runs').delete().eq('project_id', s.projectId);
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

  it('renames with the version guard, and answers a no-op as changed: false', async () => {
    const s = need();
    const t = await newTest();
    const v = (await row(t.id)).version as number;

    const renamed = await PATCH(call('PATCH', `tests/${t.id}`, s.writeToken, { title: '  Checkout - guest, card  ' }, { 'x-if-match': String(v) }));
    expect(renamed.status).toBe(200);
    const body = await renamed.json() as { test: { title: string, version: number }, changed: boolean };
    expect(body.changed).toBe(true);
    expect(body.test.title).toBe('Checkout - guest, card');
    expect(body.test.version).toBe(v + 1);

    const same = await PATCH(call('PATCH', `tests/${t.id}`, s.writeToken, { title: 'Checkout - guest, card' }));
    expect((await same.json() as { changed: boolean }).changed).toBe(false);

    const stale = await PATCH(call('PATCH', `tests/${t.id}`, s.writeToken, { title: 'Other' }, { 'x-if-match': String(v) }));
    expect(stale.status).toBe(409);
    const staleBody = await stale.json() as ErrorBody;
    expect(staleBody.error.details?.reason).toBe('version_conflict');
    expect(staleBody.error.details?.current_version).toBe(v + 1);
  });

  it('names the actual title fault: required vs too long', async () => {
    const s = need();
    const t = await newTest();
    for (const [title, reason] of [['', 'title_required'], ['\t  ', 'title_required'], ['x'.repeat(201), 'title_too_long']] as const) {
      const response = await PATCH(call('PATCH', `tests/${t.id}`, s.writeToken, { title }));
      expect(response.status).toBe(422);
      expect((await response.json() as ErrorBody).error.details?.reason).toBe(reason);
    }
    const emoji = await PATCH(call('PATCH', `tests/${t.id}`, s.writeToken, { title: '🧪'.repeat(200) }));
    expect(emoji.status).toBe(200);
    expect((await row(t.id)).title).toBe('🧪'.repeat(200));
  });

  it('runs the archive contract: 204, repeat, frozen writes, no Run, still readable, restore, repeat', async () => {
    const s = need();
    const t = await newTest();

    const archived = await DELETE(call('DELETE', `tests/${t.id}`, s.writeToken));
    expect(archived.status).toBe(204);
    expect(await archived.text()).toBe('');
    const firstAt = (await row(t.id)).archived_at;
    expect(firstAt).not.toBeNull();
    expect((await DELETE(call('DELETE', `tests/${t.id}`, s.writeToken))).status).toBe(204);
    expect((await row(t.id)).archived_at).toBe(firstAt);

    const rename = await PATCH(call('PATCH', `tests/${t.id}`, s.writeToken, { title: 'Frozen' }));
    expect(rename.status).toBe(409);
    expect((await rename.json() as ErrorBody).error.details?.reason).toBe('test_archived');
    const tags = await TAGS(call('PUT', `tests/${t.id}/tags`, s.writeToken, { tags: ['smoke'] }));
    expect(tags.status).toBe(409);
    expect((await tags.json() as ErrorBody).error.details?.reason).toBe('test_archived');

    const run = await START_RUN(call('POST', 'runs', s.runToken, {
      test_id: t.id,
      environment_id: s.environmentId,
      executor_mode: 'agent',
      start_token: `${PREFIX}-start-1`,
    }, { 'idempotency-key': `${PREFIX}-idem-1` }));
    expect(run.status).toBe(409);
    expect((await run.json() as ErrorBody).error.details?.reason).toBe('test_archived');

    const read = await GET(call('GET', `tests/${t.id}`, s.readToken));
    expect(read.status).toBe(200);
    expect((await read.json() as { test: { archived_at: string | null } }).test.archived_at).not.toBeNull();

    const restored = await POST(call('POST', `tests/${t.id}/restore`, s.writeToken));
    expect(restored.status).toBe(200);
    const restoredBody = await restored.json() as { test: { id: string, changed: boolean, archived_at: string | null } };
    expect(restoredBody.test).toMatchObject({ id: t.id, changed: true, archived_at: null });
    const again = await POST(call('POST', `tests/${t.id}/restore`, s.writeToken));
    expect((await again.json() as { test: { changed: boolean } }).test.changed).toBe(false);
  });

  it('a token without atc:write can do none of the three', async () => {
    const s = need();
    const t = await newTest();
    expect((await PATCH(call('PATCH', `tests/${t.id}`, s.readToken, { title: 'x' }))).status).toBe(403);
    expect((await DELETE(call('DELETE', `tests/${t.id}`, s.readToken))).status).toBe(403);
    expect((await POST(call('POST', `tests/${t.id}/restore`, s.readToken))).status).toBe(403);
    expect(await row(t.id)).toMatchObject({ title: t.title, archived_at: null });
  });

  it('answers 400 for a malformed id and 404 for an unknown one', async () => {
    const s = need();
    expect((await DELETE(call('DELETE', 'tests/not-a-uuid', s.writeToken))).status).toBe(400);
    expect((await POST(call('POST', 'tests/not-a-uuid/restore', s.writeToken))).status).toBe(400);
    expect((await PATCH(call('PATCH', 'tests/not-a-uuid', s.writeToken, { title: 'x' }))).status).toBe(400);
    expect((await DELETE(call('DELETE', `tests/${ABSENT}`, s.writeToken))).status).toBe(404);
    expect((await POST(call('POST', `tests/${ABSENT}/restore`, s.writeToken))).status).toBe(404);
    expect((await PATCH(call('PATCH', `tests/${ABSENT}`, s.writeToken, { title: 'x' }))).status).toBe(404);
  });
});
