import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

// Throwaway users, workspaces and tokens only: everything is deleted and recounted in afterAll.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasEnv = Boolean(url && anonKey && serviceKey && jwtSecret);
if (!hasEnv) {
  console.warn('[bug-token-workspace] SKIPPED ENTIRELY: needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_JWT_SECRET.');
}
const describeOrSkip = hasEnv ? describe : describe.skip;
setDefaultTimeout(60_000);

void mock.module('server-only', () => ({}));
const { POST: statusPost } = await import('./[id]/status/route');
const { POST: assignPost } = await import('./[id]/assign/route');
const { PATCH: correctionPatch } = await import('./[id]/route');
const { mintPat } = await import('@lib/api/pat');

const PREFIX = `bk2708-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Bk2708-${crypto.randomUUID()}`;
const MISSING = '00000000-0000-4000-8000-000000000000';
const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];
const seededBugIds: string[] = [];

interface Fixture {
  userId: string
  outsiderId: string
  homeWorkspaceId: string
  otherWorkspaceId: string
  otherProjectId: string
  otherModuleId: string
  homeToken: string
  otherToken: string
  unscopedToken: string
  outsiderToken: string
}
let fixture: Fixture | null = null;
let counter = 0;

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function need(): Fixture {
  if (!fixture) {
    throw new Error('[bug-token-workspace] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[bug-token-workspace] seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

async function newUser(label: string): Promise<string> {
  const email = `${PREFIX}-${label}@bunkai.test`;
  const { data, error } = await service().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) {
    throw error ?? new Error('Failed to create a BK-2708 test user.');
  }
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function newWorkspace(label: string, ownerId: string): Promise<{ workspaceId: string, projectId: string, moduleId: string }> {
  const db = service();
  const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-${label}`, name: `${PREFIX} ${label}`, owner_user_id: ownerId, plan: 'cloud' }).select('id').single(), `workspace ${label}`);
  createdWorkspaceIds.push(ws.id as string);
  must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: ownerId, role: 'owner', status: 'active' }).select('user_id'), `membership ${label}`);
  const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-${label}-p`, name: `${PREFIX} ${label} p` }).select('id').single(), `project ${label}`);
  const mod = must(await db.from('modules').insert({ project_id: project.id, path: `${PREFIX}-${label}-m`, name: `${PREFIX} ${label} m` }).select('id').single(), `module ${label}`);
  return { workspaceId: ws.id as string, projectId: project.id as string, moduleId: mod.id as string };
}

async function token(userId: string, workspaceId: string | null): Promise<string> {
  const minted = await mintPat({ admin: service() as never, userId, name: `${PREFIX}-pat`, scopes: ['atc:write'], workspaceId, expiresInDays: 1 });
  return minted.token;
}

async function seedBug(): Promise<string> {
  counter += 1;
  const row = must(await service().from('bugs').insert({
    workspace_id: need().otherWorkspaceId,
    project_id: need().otherProjectId,
    module_id: need().otherModuleId,
    title: `${PREFIX} bug ${counter}`,
    severity: 'P3',
    steps_to_reproduce: '1. open',
    evidence_urls: [],
    created_by: need().userId,
  }).select('id').single(), 'bug');
  seededBugIds.push(row.id as string);
  return row.id as string;
}

async function bugRow(bugId: string) {
  return must(await service().from('bugs').select('status, assignee_user_id, title, content_version').eq('id', bugId).single(), 'bug read');
}

async function activityCount(bugId: string): Promise<number> {
  const { count, error } = await service().from('activity_log').select('id', { count: 'exact', head: true }).eq('entity_type', 'bug').eq('entity_id', bugId);
  if (error) { throw error; }
  return count ?? 0;
}

type Route = 'status' | 'assign' | 'correction';

interface Outcome { status: number, body: { error?: { code?: string, message?: string, details?: unknown } } }

function visible(outcome: Outcome) {
  return { status: outcome.status, code: outcome.body.error?.code, message: outcome.body.error?.message, details: outcome.body.error?.details };
}

async function call(route: Route, bugId: string, bearer: string): Promise<Outcome> {
  const headers = { 'authorization': `Bearer ${bearer}`, 'content-type': 'application/json' };
  let response: Response;
  if (route === 'status') {
    response = await statusPost(new NextRequest(`http://localhost/api/v1/bugs/${bugId}/status`, { method: 'POST', headers, body: JSON.stringify({ status: 'in_progress' }) }));
  }
  else if (route === 'assign') {
    response = await assignPost(new NextRequest(`http://localhost/api/v1/bugs/${bugId}/assign`, { method: 'POST', headers, body: JSON.stringify({ assignee_user_id: need().userId }) }));
  }
  else {
    response = await correctionPatch(new NextRequest(`http://localhost/api/v1/bugs/${bugId}`, { method: 'PATCH', headers, body: JSON.stringify({ expected_version: 1, title: `${PREFIX} corrected` }) }));
  }
  return { status: response.status, body: await response.json() as Outcome['body'] };
}

async function snapshot(bugId: string) {
  return { row: await bugRow(bugId), events: await activityCount(bugId) };
}

describeOrSkip('BK-2708: single-Bug write routes bind a workspace-scoped token to the Bug workspace (database)', () => {
  beforeAll(async () => {
    const userId = await newUser('member');
    const outsiderId = await newUser('outsider');
    const home = await newWorkspace('home', userId);
    const other = await newWorkspace('other', userId);
    const outsiderHome = await newWorkspace('outsider', outsiderId);
    fixture = {
      userId,
      outsiderId,
      homeWorkspaceId: home.workspaceId,
      otherWorkspaceId: other.workspaceId,
      otherProjectId: other.projectId,
      otherModuleId: other.moduleId,
      homeToken: await token(userId, home.workspaceId),
      otherToken: await token(userId, other.workspaceId),
      unscopedToken: await token(userId, null),
      outsiderToken: await token(outsiderId, outsiderHome.workspaceId),
    };
  }, 120_000);

  afterAll(async () => {
    const db = service();
    const { data: tokens } = await db.from('access_tokens').select('id').in('user_id', createdUserIds);
    const tokenIds = (tokens ?? []).map(row => row.id as string);
    if (tokenIds.length > 0) {
      await db.from('access_token_secrets').delete().in('token_id', tokenIds);
      await db.from('access_tokens').delete().in('id', tokenIds);
    }
    for (const id of createdWorkspaceIds) {
      await db.from('workspaces').delete().eq('id', id);
    }
    const failedUsers: string[] = [];
    for (const id of createdUserIds) {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) { failedUsers.push(id); }
    }
    const { count: workspacesLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    const { count: bugsLeft } = await db.from('bugs').select('id', { count: 'exact', head: true }).like('title', `${PREFIX}%`);
    const { count: tokensLeft } = await db.from('access_tokens').select('id', { count: 'exact', head: true }).like('name', `${PREFIX}%`);
    const { count: eventsLeft } = seededBugIds.length === 0
      ? { count: 0 }
      : await db.from('activity_log').select('id', { count: 'exact', head: true }).eq('entity_type', 'bug').in('entity_id', seededBugIds);
    console.log(`[bug-token-workspace] cleanup: ${workspacesLeft} workspaces, ${bugsLeft} Bugs, ${tokensLeft} tokens, ${eventsLeft} events, ${failedUsers.length} users left`);
    if (workspacesLeft !== 0 || bugsLeft !== 0 || tokensLeft !== 0 || eventsLeft !== 0 || failedUsers.length > 0) {
      throw new Error(`[bug-token-workspace] cleanup left ${workspacesLeft} workspaces, ${bugsLeft} Bugs, ${tokensLeft} tokens, ${eventsLeft} events and ${failedUsers.length} users behind.`);
    }
  }, 120_000);

  for (const route of ['status', 'assign', 'correction'] as const) {
    it(`${route}: a token scoped to another workspace is 403 token_workspace_mismatch and nothing is written`, async () => {
      const bugId = await seedBug();
      const before = await snapshot(bugId);
      const result = await call(route, bugId, need().homeToken);
      expect([result.status, result.body.error?.code, result.body.error?.details]).toEqual([403, 'forbidden', { reason: 'token_workspace_mismatch' }]);
      expect(await snapshot(bugId)).toEqual(before);
    });

    it(`${route}: a token scoped to the Bug workspace is accepted`, async () => {
      const bugId = await seedBug();
      const result = await call(route, bugId, need().otherToken);
      expect(result.status).toBe(200);
      const row = await bugRow(bugId);
      const changed = { status: row.status, assignee: row.assignee_user_id, title: row.title };
      const expected = {
        status: { status: 'in_progress', assignee: null, title: `${PREFIX} bug ${counter}` },
        assign: { status: 'open', assignee: need().userId, title: `${PREFIX} bug ${counter}` },
        correction: { status: 'open', assignee: null, title: `${PREFIX} corrected` },
      }[route];
      expect(changed).toEqual(expected);
    });

    it(`${route}: a caller who cannot see the Bug keeps the same 404 as an unknown id`, async () => {
      const bugId = await seedBug();
      const before = await snapshot(bugId);
      const hidden = await call(route, bugId, need().outsiderToken);
      const unknown = await call(route, MISSING, need().homeToken);
      expect([hidden.status, hidden.body.error?.code, hidden.body.error?.details]).toEqual([404, 'not_found', { reason: 'not_found' }]);
      expect(visible(unknown)).toEqual(visible(hidden));
      expect(await snapshot(bugId)).toEqual(before);
    });
  }

  it('an unscoped token keeps acting on every workspace its user belongs to', async () => {
    const bugId = await seedBug();
    const result = await call('status', bugId, need().unscopedToken);
    expect(result.status).toBe(200);
    expect((await bugRow(bugId)).status).toBe('in_progress');
  });
});
