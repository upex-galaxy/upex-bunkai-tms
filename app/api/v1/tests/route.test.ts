import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
setDefaultTimeout(30_000);
const { POST } = await import('./route');
const { mintPat } = await import('@lib/api/pat');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const TAG = '[test create route]';

const hasEnv = Boolean(url && serviceKey);
if (!hasEnv) {
  console.warn(`${TAG} SKIPPED ENTIRELY: no database environment.`);
}
const describeOrSkip = hasEnv ? describe : describe.skip;
const PREFIX = `bk2243-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  workspaceId: string
  projectId: string
  atcId: string
  token: string
  tokenId: string
}

let seed: Seed | null = null;

function need(): Seed {
  if (!seed) { throw new Error(`${TAG} the fixture was not seeded; refusing to pass.`); }
  return seed;
}

function create(title: string): NextRequest {
  const s = need();
  return new NextRequest('https://app.test/api/v1/tests', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${s.token}`, 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ title, atc_ids: [s.atcId], workspace_id: s.workspaceId }),
  });
}

interface ErrorBody { error: { code: string, details?: { reason?: string } } }

describeOrSkip('BK-2243: POST /api/v1/tests title rule matches rename', () => {
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
    const pat = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-write`, scopes: ['atc:read', 'atc:write'] });
    seed = {
      workspaceId: ws.id as string,
      projectId: project.id as string,
      atcId: atc.id as string,
      token: pat.token,
      tokenId: pat.id,
    };
  });

  afterAll(async () => {
    const s = seed;
    if (!s) { return; }
    const db = service();
    await db.from('access_token_secrets').delete().eq('token_id', s.tokenId);
    await db.from('access_tokens').delete().eq('id', s.tokenId);
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

  it('names title_required for an empty, space, tab or NBSP-only title', async () => {
    for (const title of ['', '   ', '\t', ' ']) {
      const response = await POST(create(title));
      expect(response.status).toBe(422);
      const body = await response.json() as ErrorBody;
      expect(body.error.code).toBe('validation_failed');
      expect(body.error.details?.reason).toBe('title_required');
    }
  });

  it('counts code points: 200 emoji are created, 201 answer title_too_long', async () => {
    const ok = await POST(create('🧪'.repeat(200)));
    expect(ok.status).toBe(201);
    const created = await ok.json() as { test: { id: string } };
    const stored = must(await service().from('tests').select('title').eq('id', created.test.id).single(), 'test read');
    expect(stored.title).toBe('🧪'.repeat(200));

    const over = await POST(create('🧪'.repeat(201)));
    expect(over.status).toBe(422);
    expect((await over.json() as ErrorBody).error.details?.reason).toBe('title_too_long');
  });

  it('trims the title before storing it', async () => {
    const response = await POST(create('  Checkout - guest  '));
    expect(response.status).toBe(201);
    const body = await response.json() as { test: { title: string } };
    expect(body.test.title).toBe('Checkout - guest');
  });
});
