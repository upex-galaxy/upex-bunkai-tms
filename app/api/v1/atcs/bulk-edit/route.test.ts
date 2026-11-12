import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
const { POST } = await import('./route');
const { mintPat } = await import('@lib/api/pat');

// BK-507: the HTTP contract of the bulk edit, end to end through the real
// handler, a real Bearer PAT and the real RPC. Function-level behaviour is proved
// by `lib/atcs/bulk-edit-isolation.test.ts`; this covers what only the route
// owns: status codes, the report body, scopes and the 422 on a bad request.
// Fixtures sit in a throwaway workspace and are deleted in afterAll. Env-gated
// like its siblings: skipped, loudly, without a database environment.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const hasEnv = Boolean(url && serviceKey);
if (!hasEnv) {
  console.warn('[atc bulk-edit route] SKIPPED ENTIRELY: no database environment.');
}
const describeOrSkip = hasEnv ? describe : describe.skip;
const PREFIX = `bk507r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[atc bulk-edit route] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Seed {
  workspaceId: string
  projectId: string
  atcIds: string[]
  writeToken: string
  readToken: string
  tokenIds: string[]
}

let seed: Seed | null = null;

function need(): Seed {
  if (!seed) { throw new Error('[atc bulk-edit route] the fixture was not seeded; refusing to pass.'); }
  return seed;
}

function call(token: string | null, body: unknown): NextRequest {
  return new NextRequest('https://app.test/api/v1/atcs/bulk-edit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function layerOf(atcId: string): Promise<string> {
  return must(await service().from('atcs').select('layer').eq('id', atcId).single(), 'atc read').layer as string;
}

describeOrSkip('BK-507: POST /api/v1/atcs/bulk-edit', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    const db = service();
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[atc bulk-edit route] NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    const auth = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[atc bulk-edit route] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const userId = signIn.user.id;
    await auth.auth.signOut();
    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-w`, name: `${PREFIX} w`, owner_user_id: userId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} p` }).select('id').single(), 'project');
    const moduleRow = must(await db.from('modules').insert({ project_id: project.id, path: 'm', name: 'm' }).select('id').single(), 'module');
    const story = must(await db.from('user_stories').insert({ module_id: moduleRow.id, title: `${PREFIX} story` }).select('id').single(), 'story');
    const atcIds: string[] = [];
    for (const [i, archived] of [[1, false], [2, false], [3, true]] as const) {
      const atc = must(await db.from('atcs').insert({
        project_id: project.id,
        module_id: moduleRow.id,
        user_story_id: story.id,
        slug: `${PREFIX}-m/atc-0000000${i}`,
        title: `${PREFIX} atc ${i}`,
        layer: 'UI',
        archived_at: archived ? new Date().toISOString() : null,
      }).select('id').single(), `atc ${i}`);
      atcIds.push(atc.id as string);
    }

    const write = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-write`, scopes: ['atc:read', 'atc:write'] });
    const read = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-read`, scopes: ['atc:read'] });
    seed = {
      workspaceId: ws.id as string,
      projectId: project.id as string,
      atcIds,
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
    await db.from('atcs').delete().eq('project_id', s.projectId);
    await db.from('projects').delete().eq('id', s.projectId);
    await db.from('workspace_members').delete().eq('workspace_id', s.workspaceId);
    await db.from('workspaces').delete().eq('id', s.workspaceId);
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`[atc bulk-edit route] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  it('answers 200 with a per-ATC report: partial success keeps what changed', async () => {
    const s = need();
    const [a, b, archived] = s.atcIds;
    const response = await POST(call(s.writeToken, {
      project_id: s.projectId,
      field: 'layer',
      change: { layer: 'API' },
      items: [{ id: a, version: 1 }, { id: b, version: 1 }, { id: archived, version: 1 }],
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { requested: number, changed: number, refused: number, outcomes: Array<{ atc_id: string, outcome: string, reason: string | null }> };
    expect(body.requested).toBe(3);
    expect(body.changed).toBe(2);
    expect(body.refused).toBe(1);
    expect(body.outcomes.find(o => o.atc_id === archived)).toMatchObject({ outcome: 'refused', reason: 'archived' });
    expect(await layerOf(a)).toBe('API');
    expect(await layerOf(archived)).toBe('UI');
  });

  it('repeating the same request is a success that changes nothing', async () => {
    const s = need();
    const response = await POST(call(s.writeToken, {
      project_id: s.projectId,
      field: 'layer',
      change: { layer: 'API' },
      items: [{ id: s.atcIds[0], version: 1 }],
    }));
    expect(response.status).toBe(200);
    expect((await response.json() as { unchanged: number }).unchanged).toBe(1);
  });

  it('a dry run reports and writes nothing', async () => {
    const s = need();
    const response = await POST(call(s.writeToken, {
      project_id: s.projectId,
      field: 'layer',
      change: { layer: 'Unit' },
      items: [{ id: s.atcIds[1] }],
      dry_run: true,
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { dry_run: boolean, changed: number };
    expect(body.dry_run).toBe(true);
    expect(body.changed).toBe(1);
    expect(await layerOf(s.atcIds[1])).toBe('API');
  });

  it('refuses a token without atc:write (403) and an unknown token (401)', async () => {
    const s = need();
    const body = { project_id: s.projectId, field: 'layer', change: { layer: 'UI' }, items: [{ id: s.atcIds[0] }] };
    expect((await POST(call(s.readToken, body))).status).toBe(403);
    // A header-less call would fall back to the cookie session, and `cookies()` only exists
    // inside a real Next request, so the 401 is asserted with a token that matches no PAT.
    expect((await POST(call('bk-unknown-token', body))).status).toBe(401);
  });

  it('answers 422 for an unknown field and for an empty selection, with nothing written', async () => {
    const s = need();
    const status = await POST(call(s.writeToken, { project_id: s.projectId, field: 'status', change: { status: 'passed' }, items: [{ id: s.atcIds[0] }] }));
    expect(status.status).toBe(422);
    const empty = await POST(call(s.writeToken, { project_id: s.projectId, field: 'layer', change: { layer: 'UI' }, items: [] }));
    expect(empty.status).toBe(422);
    expect(await layerOf(s.atcIds[0])).toBe('API');
  });
});
