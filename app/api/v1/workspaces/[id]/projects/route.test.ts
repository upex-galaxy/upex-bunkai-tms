import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// BK-1900 — GET /api/v1/workspaces/{id}/projects, live-DB route contract. The
// pure filter and error mapping live in `response.test.ts`; this file covers
// what a fake `db` cannot: the auth posture, and that RLS (not the handler) is
// what keeps a foreign workspace's projects out — a member's Bearer PAT lists
// its own workspace's projects and gets the empty list for every other one.
//
// Same shim + import convention as `projects/[id]/atcs/export/route.test.ts`.
void mock.module('server-only', () => ({}));
void mock.module('@lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));
const { GET } = await import('./route');
const { mintPat } = await import('@lib/api/pat');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

const NONEXISTENT_WS = '11111111-2222-4333-8444-555555555555';

function listRequest(workspaceId: string, opts: { token?: string, slug?: string } = {}): NextRequest {
  const query = opts.slug === undefined ? '' : `?slug=${encodeURIComponent(opts.slug)}`;
  return new NextRequest(`https://app.test/api/v1/workspaces/${workspaceId}/projects${query}`, {
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  });
}

interface ListBody { projects?: Array<{ id: string, slug: string, name: string, created_at: string }>, error?: { code?: string } }

function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[workspaces/projects GET] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

describe('BK-1900 — GET /api/v1/workspaces/{id}/projects — gates (no DB needed)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const response = await GET(listRequest(NONEXISTENT_WS));
    expect(response.status).toBe(401);
  });
});

describeOrSkip('BK-1900 — GET /api/v1/workspaces/{id}/projects — live DB', () => {
  interface Fixture {
    workspaceId: string
    project: { id: string, slug: string }
    foreignWorkspaceId: string
    readToken: string
    runOnlyToken: string
  }
  let fixture: Fixture | null = null;
  const mintedTokenIds: string[] = [];

  beforeAll(async () => {
    const db = service();
    const { data: projects } = await db.from('projects').select('id, slug, workspace_id').limit(200);
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, status');
    const { data: workspaces } = await db.from('workspaces').select('id, deleted_at');
    const live = new Set((workspaces ?? []).filter(w => w.deleted_at === null).map(w => w.id as string));
    const active = (members ?? []).filter(m => m.status === 'active' && live.has(m.workspace_id as string));

    for (const project of projects ?? []) {
      const member = active.find(m => m.workspace_id === project.workspace_id);
      if (!member) { continue; }
      const memberOf = new Set(active.filter(m => m.user_id === member.user_id).map(m => m.workspace_id as string));
      const foreign = [...live].find(id => !memberOf.has(id));
      if (!foreign) { continue; }

      const read = await mintPat({ admin: db, userId: member.user_id as string, name: 'bk1900-projects-read', scopes: ['atc:read'], expiresInDays: 1 });
      mintedTokenIds.push(read.id);
      const runOnly = await mintPat({ admin: db, userId: member.user_id as string, name: 'bk1900-projects-run', scopes: ['run:execute'], expiresInDays: 1 });
      mintedTokenIds.push(runOnly.id);
      fixture = {
        workspaceId: project.workspace_id as string,
        project: { id: project.id as string, slug: project.slug as string },
        foreignWorkspaceId: foreign,
        readToken: read.token,
        runOnlyToken: runOnly.token,
      };
      return;
    }
  });

  afterAll(async () => {
    const db = service();
    for (const id of mintedTokenIds) {
      await db.from('access_tokens').delete().eq('id', id);
    }
  });

  it('lists the member\'s own workspace projects, including the seeded one', async () => {
    const f = requirePrecondition(fixture, 'no project whose member also has a foreign live workspace');
    const response = await GET(listRequest(f.workspaceId, { token: f.readToken }));
    const body = await response.json() as ListBody;
    expect(response.status).toBe(200);
    expect(body.projects?.map(p => p.id)).toContain(f.project.id);
  });

  it('narrows to exactly one project by slug', async () => {
    const f = requirePrecondition(fixture, 'fixture setup failed');
    const response = await GET(listRequest(f.workspaceId, { token: f.readToken, slug: f.project.slug }));
    const body = await response.json() as ListBody;
    expect(response.status).toBe(200);
    expect(body.projects?.map(p => p.id)).toEqual([f.project.id]);
  });

  it('answers a foreign workspace and a nonexistent one with the identical empty list', async () => {
    const f = requirePrecondition(fixture, 'fixture setup failed');
    const foreign = await GET(listRequest(f.foreignWorkspaceId, { token: f.readToken }));
    const missing = await GET(listRequest(NONEXISTENT_WS, { token: f.readToken }));
    expect(foreign.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(await foreign.json()).toEqual({ projects: [] });
    expect(await missing.json()).toEqual({ projects: [] });
  });

  it('refuses a PAT without atc:read with 403', async () => {
    const f = requirePrecondition(fixture, 'fixture setup failed');
    const response = await GET(listRequest(f.workspaceId, { token: f.runOnlyToken }));
    expect(response.status).toBe(403);
  });

  it('refuses a malformed workspace id with 400 for an authenticated caller', async () => {
    const f = requirePrecondition(fixture, 'fixture setup failed');
    const response = await GET(listRequest('not-a-uuid', { token: f.readToken }));
    expect(response.status).toBe(400);
  });
});
