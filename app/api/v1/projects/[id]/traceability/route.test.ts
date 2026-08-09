import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { NextRequest } from 'next/server';

// The route imports `@lib/supabase/admin` (server-only) and `lib/api/pat`
// pulls in the same sentinel transitively; shim it so the module graph loads
// under Bun, then import the REAL exported `GET` handler. Same convention as
// `app/api/v1/atcs/[id]/duplicate/route.test.ts` (BK-184).
void mock.module('server-only', () => ({}));
const { GET } = await import('./route');
const { POST: createUserStory } = await import('@app/api/v1/modules/[id]/user-stories/route');
const { mintPat } = await import('@lib/api/pat');

// BK-329 — "Coverage & Traceability API: traceability route ignores the
// {projectId} path segment — any well-formed UUID returns the story chain".
//
// `GET /api/v1/projects/{id}/traceability?story=<id>` validated `{id}` for
// UUID SHAPE only and never checked it against the story's real project, so
// a URL asserting "project A" returned a story that actually belongs to
// project B (or to no project at all). Ruled by the AI Product Owner (Jira
// comment 12257) and the AI Tech Lead (Jira comment 12258): the route now
// resolves the story's real project via `module_id -> modules.project_id`
// under the caller's OWN RLS-scoped client (never the nullable
// `user_stories.project_id` — a known silent tenancy hole, BK-45 fact 1)
// and rejects a mismatch with the existing uniform `404 not_found` / "User
// story not found." — the SAME envelope the RPC's own P0002 mapping already
// throws (`lib/traceability/errors.ts`'s `throwStoryNotFound`). Never a 403
// — see BK-200 (`0063_environment_cross_workspace_404.sql`).
//
// The RPC itself (`bunkai_report_story_traceability`) is UNTOUCHED — it
// keeps its BK-45-ratified `p_user_story_id` grain, and `{id}` is still
// never forwarded to it. This is a route-level consistency check only.
//
// Real production write path (mandatory, not a fixture shortcut): the User
// Story is created by invoking the REAL exported POST handler of
// `app/api/v1/modules/[id]/user-stories/route.ts`, not a service-role
// INSERT — a fixture that seeds `user_stories.project_id` directly (the
// nullable backfill column the fix deliberately does NOT read) would prove
// nothing about the code path production actually writes through. Service
// role is confined to Project/Module scaffolding and teardown, the same
// sanctioned use as `lib/traceability/story-traceability-isolation.test.ts`.
//
// DB-dependent + env-gated: skips entirely when the Supabase env is absent
// (CI without DB creds); when the env IS present but no writable seed
// member exists, fails loudly rather than passing silently.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[traceability route] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

type Db = ReturnType<typeof service>;

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }

// A writable (role >= member, active) workspace member — user_stories'
// insert RLS policy (`user_stories_insert_workspace_role_member_plus`,
// 0005_rls_helpers.sql) requires more than viewer.
async function findWritableMember(db: Db): Promise<MemberRow | null> {
  const { data: members } = await db
    .from('workspace_members')
    .select('user_id, workspace_id, role, status');
  return (members as MemberRow[] | null)?.find(
    m => m.status === 'active' && ['member', 'admin', 'owner'].includes(m.role),
  ) ?? null;
}

function traceabilityRequest(projectId: string, storyId: string, token: string): NextRequest {
  return new NextRequest(`https://app.test/api/v1/projects/${projectId}/traceability?story=${storyId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

interface ChainSuccessBody { story?: { id?: string }, criteria?: unknown[] }
interface ErrorBody { error?: { code?: string, message?: string, details?: { reason?: string } } }

const NONEXISTENT_PROJECT_ID = '11111111-2222-4333-8444-555555555555';

describeOrSkip('BK-329 — GET /api/v1/projects/{id}/traceability rejects a project/story mismatch', () => {
  const createdProjectIds: string[] = [];
  const createdTokenIds: string[] = [];
  let fixture: { projectAId: string, projectBId: string, storyId: string, token: string } | null = null;
  let skipReason: string | null = null;

  beforeAll(async () => {
    const db = service();
    const writer = await findWritableMember(db);
    if (!writer) {
      skipReason = 'need an active workspace member with role >= member (seed state).';
      return;
    }

    const prefix = `bk329-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Two real Projects in the SAME workspace: A hosts the Story under
    // test, B exists purely to be a REAL-but-wrong `{id}` in the repro.
    const { data: projects, error: projectsError } = await db
      .from('projects')
      .insert([
        { workspace_id: writer.workspace_id, slug: `${prefix}-a`, name: `${prefix} project A` },
        { workspace_id: writer.workspace_id, slug: `${prefix}-b`, name: `${prefix} project B` },
      ])
      .select('id, slug');
    if (projectsError) { throw projectsError; }
    const projectAId = (projects ?? []).find(p => (p.slug as string).endsWith('-a'))!.id as string;
    const projectBId = (projects ?? []).find(p => (p.slug as string).endsWith('-b'))!.id as string;
    createdProjectIds.push(projectAId, projectBId);

    const { data: moduleA, error: moduleError } = await db
      .from('modules')
      .insert({ project_id: projectAId, path: 'live', name: 'Live' })
      .select('id')
      .single();
    if (moduleError) { throw moduleError; }

    const pat = await mintPat({
      admin: db,
      userId: writer.user_id,
      name: 'bk329-traceability-regression',
      scopes: ['atc:write'],
      expiresInDays: null,
    });
    createdTokenIds.push(pat.id);

    // REAL write path — the exact handler production traffic goes through.
    const createRequest = new NextRequest(`https://app.test/api/v1/modules/${moduleA.id}/user-stories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${pat.token}` },
      body: JSON.stringify({ title: `${prefix} story` }),
    });
    const createResponse = await createUserStory(createRequest);
    if (createResponse.status !== 201) {
      throw new Error(`[traceability route] fixture setup failed creating the User Story — POST /user-stories returned ${createResponse.status}.`);
    }
    const created = await createResponse.json() as { user_story?: { id?: string } };
    const storyId = requirePrecondition(created.user_story?.id, 'POST /user-stories did not return an id');

    fixture = { projectAId, projectBId, storyId, token: pat.token };
  });

  afterAll(async () => {
    if (createdProjectIds.length === 0) { return; }
    const db = service();
    // Projects cascade to modules/user_stories (0002/0003), same FK posture
    // as story-traceability-isolation.test.ts's teardown.
    const { error: deleteProjectsError } = await db.from('projects').delete().in('id', createdProjectIds);
    if (deleteProjectsError) { throw deleteProjectsError; }
    for (const id of createdTokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
  });

  it('THE REPRODUCTION — a real project id that is not the story\'s own returns 404 not_found (must have failed with 200 before the fix)', async () => {
    if (!fixture) { return warn(); }
    const response = await GET(traceabilityRequest(fixture.projectBId, fixture.storyId, fixture.token));
    const body = await response.json() as ErrorBody;

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe('not_found');
    expect(body.error?.message).toBe('User story not found.');
    expect(body.error?.details?.reason).toBe('not_found');
  });

  it('the ticket\'s literal repro shape — a project id that exists nowhere in the database returns the same 404', async () => {
    if (!fixture) { return warn(); }
    const response = await GET(traceabilityRequest(NONEXISTENT_PROJECT_ID, fixture.storyId, fixture.token));
    const body = await response.json() as ErrorBody;

    expect(response.status).toBe(404);
    expect(body.error?.code).toBe('not_found');
  });

  it('happy path unchanged — the story\'s REAL project id still returns 200 with the chain intact', async () => {
    if (!fixture) { return warn(); }
    const response = await GET(traceabilityRequest(fixture.projectAId, fixture.storyId, fixture.token));
    const body = await response.json() as ChainSuccessBody & ErrorBody;

    expect(response.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(body.story?.id).toBe(fixture.storyId);
    expect(Array.isArray(body.criteria)).toBe(true);
  });

  it('malformed {id} still 400s, unaffected by the new pre-check (contrast case from the ticket)', async () => {
    if (!fixture) { return warn(); }
    const response = await GET(new NextRequest(
      `https://app.test/api/v1/projects/not-a-uuid/traceability?story=${fixture.storyId}`,
      { headers: { authorization: `Bearer ${fixture.token}` } },
    ));
    const body = await response.json() as ErrorBody;

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe('bad_request');
  });

  function warn() {
    console.warn(`[traceability route] skipped: ${skipReason ?? 'fixture unavailable.'}`);
  }
});
