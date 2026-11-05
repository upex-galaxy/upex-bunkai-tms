import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
const { GET } = await import('./route');
const { GET: LIST_STORIES } = await import('../../../modules/[id]/user-stories/route');
const { GET: LIST_CRITERIA } = await import('../../../user-stories/[id]/acceptance-criteria/route');
const { DELETE } = await import('../../../modules/[id]/route');
const { mintPat } = await import('@lib/api/pat');

// BK-601: `?include_archived=true`, through the real handlers, a real PAT and real
// RLS. Off by default, marked when on, per request, and never wider than what the
// caller can already read. Fixtures sit in throwaway workspaces, deleted in afterAll.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const hasEnv = Boolean(url && serviceKey);
if (!hasEnv) {
  console.warn('[include_archived] SKIPPED ENTIRELY: no database environment.');
}
const describeOrSkip = hasEnv ? describe : describe.skip;
const PREFIX = `bk601l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

setDefaultTimeout(30_000);

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[include_archived] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Seed {
  workspaceIds: string[]
  userId: string
  email: string
  projectId: string
  viewerProjectId: string
  foreignProjectId: string
  liveId: string
  archivedId: string
  sweptStoryId: string
  sweptCriterionId: string
  ownStoryId: string
  writeToken: string
  viewerToken: string
  tokenIds: string[]
}

let seed: Seed | null = null;

function need(): Seed {
  if (!seed) { throw new Error('[include_archived] the fixture was not seeded; refusing to pass.'); }
  return seed;
}

function get(path: string, token: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/${path}`, { headers: { authorization: `Bearer ${token}` } });
}

interface Row { id: string, archived_at: string | null, archive: { archived_at: string, archived_by: { user_id: string, email: string | null } | null, archived_with: string | null } | null }
interface Listing { modules: Row[], user_stories: Row[], acceptance_criteria: Row[] }

async function listing(projectId: string, token: string, query = ''): Promise<Listing> {
  const response = await GET(get(`projects/${projectId}/modules${query}`, token));
  expect(response.status).toBe(200);
  return await response.json() as Listing;
}

describeOrSkip('BK-601: include_archived on the Module, User Story and Acceptance Criterion listings', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    const db = service();
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[include_archived] NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    const auth = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[include_archived] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
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
    const stamp = new Date().toISOString();
    must(await db.from('modules').insert({ project_id: viewerProject.id, path: 'va', name: 'Viewer archived', archived_at: stamp }).select('id'), 'viewer archived module');
    must(await db.from('modules').insert({ project_id: foreignProject.id, path: 'fa', name: 'Foreign archived', archived_at: stamp }).select('id'), 'foreign archived module');

    const live = must(await db.from('modules').insert({ project_id: project.id, path: 'live', name: 'Live' }).select('id').single(), 'live module');
    const archived = must(await db.from('modules').insert({ project_id: project.id, path: 'gone', name: 'Gone' }).select('id').single(), 'module to archive');
    const swept = must(await db.from('user_stories').insert({ module_id: archived.id, project_id: project.id, title: `${PREFIX} swept` }).select('id').single(), 'swept story');
    const criterion = must(await db.from('acceptance_criteria').insert({ user_story_id: swept.id, title: `${PREFIX} swept ac`, position: 1 }).select('id').single(), 'swept criterion');
    const own = must(await db.from('user_stories').insert({ module_id: live.id, project_id: project.id, title: `${PREFIX} own`, archived_at: stamp }).select('id').single(), 'own story');

    const write = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-write`, scopes: ['atc:read', 'atc:write'] });
    const viewer = await mintPat({ admin: db, userId, workspaceId: viewerWs.id as string, name: `${PREFIX}-viewer`, scopes: ['atc:read'] });

    const archiveResponse = await DELETE(new NextRequest(`https://app.test/api/v1/modules/${archived.id as string}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${write.token}` },
    }));
    if (archiveResponse.status !== 200) {
      throw new Error(`[include_archived] archive fixture failed: ${archiveResponse.status}`);
    }

    seed = {
      workspaceIds: [ws.id as string, viewerWs.id as string, foreignWs.id as string],
      userId,
      email: qaEmail,
      projectId: project.id as string,
      viewerProjectId: viewerProject.id as string,
      foreignProjectId: foreignProject.id as string,
      liveId: live.id as string,
      archivedId: archived.id as string,
      sweptStoryId: swept.id as string,
      sweptCriterionId: criterion.id as string,
      ownStoryId: own.id as string,
      writeToken: write.token,
      viewerToken: viewer.token,
      tokenIds: [write.id, viewer.id],
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
      throw new Error(`[include_archived] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  it('hides archived rows by default, and for any value other than true', async () => {
    const s = need();
    for (const query of ['', '?include_archived=false', '?include_archived=1']) {
      const body = await listing(s.projectId, s.writeToken, query);
      expect(body.modules.map(m => m.id)).toEqual([s.liveId]);
      expect(body.user_stories).toEqual([]);
      expect(body.acceptance_criteria).toEqual([]);
    }
  });

  it('shows them marked with the opt-in: who and when for the top, who and with what for the swept, the date alone for an own archive', async () => {
    const s = need();
    const body = await listing(s.projectId, s.writeToken, '?include_archived=true');
    const actor = { user_id: s.userId, email: s.email };

    const top = body.modules.find(m => m.id === s.archivedId)!;
    expect(top.archive).toEqual({ archived_at: top.archived_at!, archived_by: actor, archived_with: null });
    const live = body.modules.find(m => m.id === s.liveId)!;
    expect(live.archived_at).toBeNull();
    expect(live.archive).toBeNull();

    const swept = body.user_stories.find(r => r.id === s.sweptStoryId)!;
    expect(swept.archive).toEqual({ archived_at: swept.archived_at!, archived_by: actor, archived_with: 'Gone' });
    const criterion = body.acceptance_criteria.find(r => r.id === s.sweptCriterionId)!;
    expect(criterion.archive?.archived_with).toBe('Gone');

    const own = body.user_stories.find(r => r.id === s.ownStoryId)!;
    expect(own.archive).toEqual({ archived_at: own.archived_at!, archived_by: null, archived_with: null });
  });

  it('never exposes the batch id', async () => {
    const s = need();
    const response = await GET(get(`projects/${s.projectId}/modules?include_archived=true`, s.writeToken));
    expect(await response.text()).not.toContain('archive_batch_id');
  });

  it('lets a read-only member see the archive', async () => {
    const s = need();
    const body = await listing(s.viewerProjectId, s.viewerToken, '?include_archived=true');
    expect(body.modules).toHaveLength(1);
    expect(body.modules[0].archive?.archived_at).toBe(body.modules[0].archived_at!);
  });

  it('never widens what the caller can read: an outsider gets 404, opt-in or not', async () => {
    const s = need();
    for (const query of ['', '?include_archived=true']) {
      const response = await GET(get(`projects/${s.foreignProjectId}/modules${query}`, s.writeToken));
      expect(response.status).toBe(404);
    }
  });

  it('carries the flag on the User Story and Acceptance Criterion listings', async () => {
    const s = need();
    const storiesOf = async (query: string) => {
      const response = await LIST_STORIES(get(`modules/${s.archivedId}/user-stories${query}`, s.writeToken));
      return (await response.json() as { user_stories: Row[] }).user_stories.map(r => r.id);
    };
    expect(await storiesOf('')).toEqual([]);
    expect(await storiesOf('?include_archived=true')).toEqual([s.sweptStoryId]);

    const criteriaOf = async (query: string) => {
      const response = await LIST_CRITERIA(get(`user-stories/${s.sweptStoryId}/acceptance-criteria${query}`, s.writeToken));
      return (await response.json() as { acceptance_criteria: Row[] }).acceptance_criteria.map(r => r.id);
    };
    expect(await criteriaOf('')).toEqual([]);
    expect(await criteriaOf('?include_archived=true')).toEqual([s.sweptCriterionId]);
  });
});
