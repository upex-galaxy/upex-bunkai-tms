import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

void mock.module('server-only', () => ({}));
const { POST } = await import('./route');
const { DELETE, PATCH } = await import('../route');
const { POST: DUPLICATE } = await import('../duplicate/route');
const { mintPat } = await import('@lib/api/pat');

// BK-571: the HTTP contract of archive and restore, end to end through the real
// handlers, a real Bearer PAT and the real RPCs. BK-601 and BK-596 reuse this
// vocabulary. Function-level behaviour is proved by
// `lib/atcs/archive-restore-isolation.test.ts`; this covers what only the routes
// own: status codes, bodies, scopes and the named refusal on an archived ATC.
// Fixtures sit in a throwaway workspace and are deleted in afterAll.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;
const hasEnv = Boolean(url && serviceKey);
if (!hasEnv) {
  console.warn('[atc archive routes] SKIPPED ENTIRELY: no database environment.');
}
const describeOrSkip = hasEnv ? describe : describe.skip;
const PREFIX = `bk571r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[atc archive routes] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Seed {
  workspaceId: string
  projectId: string
  atcId: string
  acId: string
  writeToken: string
  readToken: string
  tokenIds: string[]
}

let seed: Seed | null = null;

function need(): Seed {
  if (!seed) { throw new Error('[atc archive routes] the fixture was not seeded; refusing to pass.'); }
  return seed;
}

function call(method: string, path: string, token: string, body?: unknown): NextRequest {
  return new NextRequest(`https://app.test/api/v1/atcs/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function archivedAt(atcId: string): Promise<string | null> {
  const row = must(await service().from('atcs').select('archived_at').eq('id', atcId).single(), 'atc read');
  return row.archived_at as string | null;
}

describeOrSkip('BK-571: DELETE /api/v1/atcs/{id} and POST /api/v1/atcs/{id}/restore', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    const db = service();
    if (!anonKey || !qaEmail || !qaPassword) {
      throw new Error('[atc archive routes] NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    const auth = createClient(url!, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await auth.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[atc archive routes] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const userId = signIn.user.id;
    await auth.auth.signOut();
    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-w`, name: `${PREFIX} w`, owner_user_id: userId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} p` }).select('id').single(), 'project');
    const moduleRow = must(await db.from('modules').insert({ project_id: project.id, path: 'm', name: 'm' }).select('id').single(), 'module');
    const story = must(await db.from('user_stories').insert({ module_id: moduleRow.id, title: `${PREFIX} story` }).select('id').single(), 'story');
    const ac = must(await db.from('acceptance_criteria').insert({ user_story_id: story.id, title: `${PREFIX} ac`, position: 1 }).select('id').single(), 'criterion');
    const atc = must(await db.from('atcs').insert({
      project_id: project.id,
      module_id: moduleRow.id,
      user_story_id: story.id,
      slug: `${PREFIX}-a`,
      title: `${PREFIX} atc`,
      layer: 'UI',
    }).select('id').single(), 'atc');
    must(await db.from('atc_acceptance_criteria').insert({ atc_id: atc.id, acceptance_criterion_id: ac.id }).select('atc_id').single(), 'binding');

    const write = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-write`, scopes: ['atc:read', 'atc:write'] });
    const read = await mintPat({ admin: db, userId, workspaceId: ws.id as string, name: `${PREFIX}-read`, scopes: ['atc:read'] });
    seed = {
      workspaceId: ws.id as string,
      projectId: project.id as string,
      atcId: atc.id as string,
      acId: ac.id as string,
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
      throw new Error(`[atc archive routes] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  it('runs the whole contract: archive, repeat, refused edit, restore, repeat', async () => {
    const s = need();

    const archived = await DELETE(call('DELETE', s.atcId, s.writeToken));
    expect(archived.status).toBe(204);
    expect(await archived.text()).toBe('');
    const firstAt = await archivedAt(s.atcId);
    expect(firstAt).not.toBeNull();

    const repeated = await DELETE(call('DELETE', s.atcId, s.writeToken));
    expect(repeated.status).toBe(204);
    expect(await archivedAt(s.atcId)).toBe(firstAt);

    const edit = await PATCH(call('PATCH', s.atcId, s.writeToken, {
      title: 'An edited title',
      layer: 'UI',
      steps: [{ position: 1, content: 'edited' }],
      assertions: [],
      tags: [],
      acceptance_criterion_ids: [s.acId],
    }));
    expect(edit.status).toBe(409);
    const editBody = await edit.json() as { error: { code: string, message: string, details: { reason: string } } };
    expect(editBody.error.details.reason).toBe('atc_archived');
    expect(editBody.error.message).toContain('Restore it');

    const copy = await DUPLICATE(call('POST', `${s.atcId}/duplicate`, s.writeToken));
    expect(copy.status).toBe(409);

    const restored = await POST(call('POST', `${s.atcId}/restore`, s.writeToken));
    expect(restored.status).toBe(200);
    const restoredBody = await restored.json() as { atc: { id: string, changed: boolean, archived_at: string | null, held_by_parent: string | null } };
    expect(restoredBody.atc.id).toBe(s.atcId);
    expect(restoredBody.atc.changed).toBe(true);
    expect(restoredBody.atc.archived_at).toBeNull();
    expect(restoredBody.atc.held_by_parent).toBeNull();

    const again = await POST(call('POST', `${s.atcId}/restore`, s.writeToken));
    expect(again.status).toBe(200);
    expect((await again.json() as { atc: { changed: boolean } }).atc.changed).toBe(false);
  });

  it('a token without atc:write can do neither', async () => {
    const s = need();
    expect((await DELETE(call('DELETE', s.atcId, s.readToken))).status).toBe(403);
    expect((await POST(call('POST', `${s.atcId}/restore`, s.readToken))).status).toBe(403);
    expect(await archivedAt(s.atcId)).toBeNull();
  });

  it('answers 400 for a malformed id and 404 for an unknown one', async () => {
    const s = need();
    expect((await DELETE(call('DELETE', 'not-a-uuid', s.writeToken))).status).toBe(400);
    expect((await POST(call('POST', 'not-a-uuid/restore', s.writeToken))).status).toBe(400);
    const absent = '00000000-0000-4000-8000-000000000000';
    expect((await DELETE(call('DELETE', absent, s.writeToken))).status).toBe(404);
    expect((await POST(call('POST', `${absent}/restore`, s.writeToken))).status).toBe(404);
  });
});
