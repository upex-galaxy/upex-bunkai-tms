import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
const { POST } = await import('./route');
const { mintPat } = await import('@lib/api/pat');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const hasEnv = Boolean(url && serviceKey);
if (!hasEnv) {
  console.warn('[test bulk-edit route] SKIPPED ENTIRELY: no database environment.');
}
const describeOrSkip = hasEnv ? describe : describe.skip;
const PREFIX = `bk2099r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[test bulk-edit route] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Seed {
  userId: string
  workspaceId: string
  viewerWorkspaceId: string
  testIds: string[]
  viewerTestId: string
  writeToken: string
  readToken: string
  viewerToken: string
  tokenIds: string[]
}

let seed: Seed | null = null;

function need(): Seed {
  if (!seed) { throw new Error('[test bulk-edit route] the fixture was not seeded; refusing to pass.'); }
  return seed;
}

function call(token: string | null, body: unknown, raw = false): NextRequest {
  return new NextRequest('https://app.test/api/v1/tests/bulk-edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

async function freshTest(tags: string[] = []): Promise<string> {
  const s = need();
  return must(await service().from('tests').insert({ workspace_id: s.workspaceId, title: `${PREFIX} fresh ${crypto.randomUUID().slice(0, 8)}`, created_by: s.userId, tags }).select('id').single(), 'fresh test').id as string;
}

async function tagsOf(testId: string): Promise<string[]> {
  return must(await service().from('tests').select('tags').eq('id', testId).single(), 'test read').tags as string[];
}

async function errorOf(response: Response): Promise<{ code: string, message: string, details?: Record<string, unknown> }> {
  return (await response.json() as { error: { code: string, message: string, details?: Record<string, unknown> } }).error;
}

describeOrSkip('BK-2099: POST /api/v1/tests/bulk-edit', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    const db = service();
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[test bulk-edit route] NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    const auth = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[test bulk-edit route] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const userId = signIn.user.id;
    await auth.auth.signOut();
    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-w`, name: `${PREFIX} w`, owner_user_id: userId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    const viewerWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-v`, name: `${PREFIX} v`, owner_user_id: userId }).select('id').single(), 'viewer workspace');
    must(await db.from('workspace_members').insert({ workspace_id: viewerWs.id, user_id: userId, role: 'viewer', status: 'active' }).select('user_id').single(), 'viewer membership');

    const testIds: string[] = [];
    for (const [i, archived] of [[1, false], [2, false], [3, true]] as const) {
      const t = must(await db.from('tests').insert({
        workspace_id: ws.id,
        title: `${PREFIX} t${i}`,
        created_by: userId,
        tags: i === 2 ? ['smoke'] : [],
        archived_at: archived ? new Date().toISOString() : null,
      }).select('id').single(), `test ${i}`);
      testIds.push(t.id as string);
    }
    const viewerTest = must(await db.from('tests').insert({ workspace_id: viewerWs.id, title: `${PREFIX} vt`, created_by: userId }).select('id').single(), 'viewer test');

    const write = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-write`, scopes: ['atc:read', 'atc:write'] });
    const read = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-read`, scopes: ['atc:read'] });
    const viewer = await mintPat({ admin: db, userId, workspaceId: viewerWs.id as string, name: `${PREFIX}-viewer`, scopes: ['atc:read', 'atc:write'] });
    seed = {
      userId,
      workspaceId: ws.id as string,
      viewerWorkspaceId: viewerWs.id as string,
      testIds,
      viewerTestId: viewerTest.id as string,
      writeToken: write.token,
      readToken: read.token,
      viewerToken: viewer.token,
      tokenIds: [write.id, read.id, viewer.id],
    };
  });

  afterAll(async () => {
    const s = seed;
    if (!s) { return; }
    const db = service();
    const workspaceIds = [s.workspaceId, s.viewerWorkspaceId];
    for (const id of s.tokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
    await db.from('activity_log').delete().in('workspace_id', workspaceIds);
    await db.from('tests').delete().in('workspace_id', workspaceIds);
    await db.from('workspace_members').delete().in('workspace_id', workspaceIds);
    await db.from('workspaces').delete().in('id', workspaceIds);
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`[test bulk-edit route] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  it('a dry run answers the report and writes nothing', async () => {
    const s = need();
    const [, t2, archived] = s.testIds;
    const t1 = await freshTest();
    const response = await POST(call(s.writeToken, { test_ids: [t1, t2, archived], mode: 'add', tags: ['smoke'], dry_run: true }));
    expect(response.status).toBe(200);
    const body = await response.json() as { dry_run: boolean, changed: number, unchanged: number, refused: number };
    expect(body).toMatchObject({ dry_run: true, changed: 1, unchanged: 1, refused: 1 });
    expect(await tagsOf(t1)).toEqual([]);
  });

  it('answers 200 with one outcome per Test, using the token\'s own workspace', async () => {
    const s = need();
    const [, t2, archived] = s.testIds;
    const t1 = await freshTest();
    const response = await POST(call(s.writeToken, { test_ids: [t1, t2, archived, t1], mode: 'add', tags: ['SMOKE'] }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json() as { mode: string, requested: number, outcomes: Array<{ test_id: string, outcome: string, reason: string | null, tags: string[] | null }> };
    expect(body.mode).toBe('add');
    expect(body.requested).toBe(3);
    expect(body.outcomes.find(o => o.test_id === t1)).toMatchObject({ outcome: 'changed', tags: ['smoke'] });
    expect(body.outcomes.find(o => o.test_id === t2)).toMatchObject({ outcome: 'unchanged' });
    expect(body.outcomes.find(o => o.test_id === archived)).toMatchObject({ outcome: 'refused', reason: 'archived' });
    expect(await tagsOf(t1)).toEqual(['smoke']);
  });

  it('removes with mode remove', async () => {
    const s = need();
    const t1 = await freshTest(['smoke', 'api']);
    const response = await POST(call(s.writeToken, { test_ids: [t1], mode: 'remove', tags: ['smoke'], workspace_id: s.workspaceId }));
    expect(response.status).toBe(200);
    expect(await tagsOf(t1)).toEqual(['api']);
  });

  it('a viewer gets 403 insufficient_role and nothing is written', async () => {
    const s = need();
    const response = await POST(call(s.viewerToken, { test_ids: [s.viewerTestId], mode: 'add', tags: ['smoke'] }));
    expect(response.status).toBe(403);
    const error = await errorOf(response);
    expect(error.code).toBe('forbidden');
    expect(error.details).toEqual({ reason: 'insufficient_role' });
    expect(await tagsOf(s.viewerTestId)).toEqual([]);
  });

  it('a scoped token naming another workspace gets 403 token_workspace_mismatch', async () => {
    const s = need();
    const response = await POST(call(s.writeToken, { test_ids: [s.viewerTestId], mode: 'add', tags: ['smoke'], workspace_id: s.viewerWorkspaceId }));
    expect(response.status).toBe(403);
    expect((await errorOf(response)).details).toEqual({ reason: 'token_workspace_mismatch' });
  });

  it('refuses a token without atc:write (403) and an unknown token (401)', async () => {
    const s = need();
    const t1 = await freshTest();
    const body = { test_ids: [t1], mode: 'add', tags: ['smoke'] };
    const readOnly = await POST(call(s.readToken, body));
    expect(readOnly.status).toBe(403);
    expect((await errorOf(readOnly)).message).toBe('Missing required capability: atc:write');
    // A header-less call falls back to the cookie session, and `cookies()` only exists
    // inside a real Next request, so the 401 is asserted with a token that matches no PAT.
    expect((await POST(call('bk-unknown-token', body))).status).toBe(401);
    expect(await tagsOf(t1)).toEqual([]);
  });

  it('answers 400 for malformed JSON and for a non-UUID id', async () => {
    const s = need();
    expect((await POST(call(s.writeToken, '{"test_ids": [', true))).status).toBe(400);
    const t1 = await freshTest();
    const bad = await POST(call(s.writeToken, { test_ids: [t1, 'not-a-uuid'], mode: 'add', tags: ['smoke'] }));
    expect(bad.status).toBe(400);
    const badAndInvalid = await POST(call(s.writeToken, { test_ids: [t1, 'not-a-uuid'], mode: 'replace', tags: [] }));
    expect(badAndInvalid.status).toBe(400);
    expect(await tagsOf(t1)).toEqual([]);
  });

  it('answers 422 for replace, mixed sets, invalid tags, an empty selection and 201 distinct ids', async () => {
    const s = need();
    const id = await freshTest();
    const bodies: unknown[] = [
      { test_ids: [id], mode: 'replace', tags: ['smoke'] },
      { test_ids: [id], add: ['a'], remove: ['b'] },
      { test_ids: [id], mode: 'add', tags: ['a,b'] },
      { test_ids: [id], mode: 'add', tags: [] },
      { test_ids: [], mode: 'add', tags: ['smoke'] },
      { test_ids: [id, ...Array.from({ length: 200 }, () => crypto.randomUUID())], mode: 'add', tags: ['smoke'] },
    ];
    for (const body of bodies) {
      const response = await POST(call(s.writeToken, body));
      expect({ body, status: response.status }).toEqual({ body, status: 422 });
    }
    expect(await tagsOf(id)).toEqual([]);
  });

  it('accepts exactly 200 distinct ids', async () => {
    const s = need();
    const ids = [s.testIds[0], ...Array.from({ length: 199 }, () => crypto.randomUUID())];
    const response = await POST(call(s.writeToken, { test_ids: ids, mode: 'add', tags: ['ceiling'], dry_run: true }));
    expect(response.status).toBe(200);
    expect((await response.json() as { requested: number }).requested).toBe(200);
  });
});
