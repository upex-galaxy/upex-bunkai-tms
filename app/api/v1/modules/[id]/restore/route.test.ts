import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
const { POST } = await import('./route');
const { DELETE } = await import('../route');
const { mintPat } = await import('@lib/api/pat');

// BK-601: the HTTP contract of the Module restore, end to end through the real
// handlers, a real Bearer PAT and the real RPC. Function-level behaviour is proved
// by `lib/modules/restore-isolation.test.ts`; this covers what only the route owns:
// status codes, bodies, scopes and how a refusal reads. Fixtures sit in throwaway
// workspaces and are deleted in afterAll.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const hasEnv = Boolean(url && serviceKey);
if (!hasEnv) {
  console.warn('[module restore route] SKIPPED ENTIRELY: no database environment.');
}
const describeOrSkip = hasEnv ? describe : describe.skip;
const PREFIX = `bk601r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';

setDefaultTimeout(30_000);

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[module restore route] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Seed {
  workspaceIds: string[]
  projectId: string
  moduleId: string
  childId: string
  viewerModuleId: string
  foreignModuleId: string
  writeToken: string
  readToken: string
  viewerToken: string
  tokenIds: string[]
}

let seed: Seed | null = null;

function need(): Seed {
  if (!seed) { throw new Error('[module restore route] the fixture was not seeded; refusing to pass.'); }
  return seed;
}

function call(method: string, path: string, token: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/modules/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
  });
}

describeOrSkip('BK-601: POST /api/v1/modules/{id}/restore', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    const db = service();
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[module restore route] NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    const auth = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[module restore route] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const userId = signIn.user.id;
    await auth.auth.signOut();

    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-w`, name: `${PREFIX} w`, owner_user_id: userId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    const viewerWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-v`, name: `${PREFIX} v`, owner_user_id: userId }).select('id').single(), 'viewer workspace');
    must(await db.from('workspace_members').insert({ workspace_id: viewerWs.id, user_id: userId, role: 'viewer', status: 'active' }).select('user_id').single(), 'viewer membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-f`, name: `${PREFIX} f`, owner_user_id: userId }).select('id').single(), 'foreign workspace');

    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} p` }).select('id').single(), 'project');
    const viewerProject = must(await db.from('projects').insert({ workspace_id: viewerWs.id, slug: `${PREFIX}-vp`, name: `${PREFIX} vp` }).select('id').single(), 'viewer project');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWs.id, slug: `${PREFIX}-fp`, name: `${PREFIX} fp` }).select('id').single(), 'foreign project');

    const moduleRow = must(await db.from('modules').insert({ project_id: project.id, path: 'm', name: 'Parent' }).select('id').single(), 'module');
    const child = must(await db.from('modules').insert({ project_id: project.id, parent_module_id: moduleRow.id, path: 'm/c', name: 'Child' }).select('id').single(), 'child');
    const stamp = new Date().toISOString();
    const viewerModule = must(await db.from('modules').insert({ project_id: viewerProject.id, path: 'v', name: 'v', archived_at: stamp }).select('id').single(), 'viewer module');
    const foreignModule = must(await db.from('modules').insert({ project_id: foreignProject.id, path: 'f', name: 'f', archived_at: stamp }).select('id').single(), 'foreign module');

    const write = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-write`, scopes: ['atc:read', 'atc:write'] });
    const read = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-read`, scopes: ['atc:read'] });
    const viewer = await mintPat({ admin: db, userId, workspaceId: viewerWs.id as string, name: `${PREFIX}-viewer`, scopes: ['atc:read', 'atc:write'] });

    seed = {
      workspaceIds: [ws.id as string, viewerWs.id as string, foreignWs.id as string],
      projectId: project.id as string,
      moduleId: moduleRow.id as string,
      childId: child.id as string,
      viewerModuleId: viewerModule.id as string,
      foreignModuleId: foreignModule.id as string,
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
    for (const id of s.tokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
    await db.from('projects').delete().in('workspace_id', s.workspaceIds);
    await db.from('workspace_members').delete().in('workspace_id', s.workspaceIds);
    await db.from('workspaces').delete().in('id', s.workspaceIds);
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`[module restore route] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  it('archives, refuses the child by naming its parent, restores, and repeats harmlessly', async () => {
    const s = need();

    const archived = await DELETE(call('DELETE', s.moduleId, s.writeToken));
    expect(archived.status).toBe(200);

    const refused = await POST(call('POST', `${s.childId}/restore`, s.writeToken));
    expect(refused.status).toBe(409);
    const refusal = await refused.json() as { error: { code: string, details: Record<string, unknown> } };
    expect(refusal.error.code).toBe('conflict');
    expect(refusal.error.details).toEqual({ reason: 'ancestor_archived', ancestor_id: s.moduleId, ancestor_name: 'Parent' });

    const restored = await POST(call('POST', `${s.moduleId}/restore`, s.writeToken));
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({
      restored: { id: s.moduleId, name: 'Parent', changed: true, modules: 2, user_stories: 0, acceptance_criteria: 0, atcs: 0 },
    });

    const repeat = await POST(call('POST', `${s.moduleId}/restore`, s.writeToken));
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toEqual({
      restored: { id: s.moduleId, name: 'Parent', changed: false, modules: 0, user_stories: 0, acceptance_criteria: 0, atcs: 0 },
    });
  });

  it('answers 403 to a token without atc:write', async () => {
    const s = need();
    const response = await POST(call('POST', `${s.moduleId}/restore`, s.readToken));
    expect(response.status).toBe(403);
    const body = await response.json() as { error: { details: { reason: string } } };
    expect(body.error.details.reason).toBe('missing_capability');
  });

  it('answers 403 to a read-only member, and leaves the Module archived', async () => {
    const s = need();
    const response = await POST(call('POST', `${s.viewerModuleId}/restore`, s.viewerToken));
    expect(response.status).toBe(403);
    const body = await response.json() as { error: { details: { reason: string } } };
    expect(body.error.details.reason).toBe('not_a_member');
    const row = must(await service().from('modules').select('archived_at').eq('id', s.viewerModuleId).single(), 'viewer module read');
    expect(row.archived_at).not.toBeNull();
  });

  it('answers 404 to a stranger and to an unknown id, 400 to a malformed one', async () => {
    const s = need();
    expect((await POST(call('POST', `${s.foreignModuleId}/restore`, s.writeToken))).status).toBe(404);
    expect((await POST(call('POST', `${ABSENT_UUID}/restore`, s.writeToken))).status).toBe(404);
    expect((await POST(call('POST', 'not-a-uuid/restore', s.writeToken))).status).toBe(400);
  });
});
