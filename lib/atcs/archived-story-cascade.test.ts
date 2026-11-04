import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-1555 — archiving a User Story archives its acceptance criteria and ATCs.
//
// `DELETE /api/v1/user-stories/{id}` used to set only `user_stories.archived_at`,
// so the story's ATCs stayed live and `GET /api/v1/atcs/{id}` (bunkai_get_atc)
// kept serving them with 200, against the BK-595 decision ("archived, including
// via an archived parent: 404"). Every ATC reader (by id, usage, search,
// library, workbench, export) filters only `atcs.archived_at`, the
// invariant module archiving already keeps. The route now archives through
// `bunkai_archive_user_story` (migration 0111), which cascades like
// `bunkai_archive_module_subtree`.
//
// What it proves against the real database:
//   * the cascade: story, its acceptance criteria and its ATCs share one
//     archived_at, and bunkai_get_atc then answers P0002 (the route's uniform 404);
//   * a sibling story's ATC and criterion are untouched;
//   * already archived answers 55000 and changes nothing;
//   * a non-member gets 42501 and nothing is archived.
//
// The function reads auth.uid(), so it is called with the declared automation
// identity's real session (`QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD`).
// Service role only seeds and tears down its own throwaway workspace. With no
// database environment the suite is skipped with a loud warning; in every other
// case (missing identity, failed login, missing function) it FAILS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[archived-story-cascade] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY).');
}
const describeOrSkip = hasDbEnv ? describe : describe.skip;
const PREFIX = `bk1555-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[archived-story-cascade] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Branch { storyId: string, acId: string, atcId: string }
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectIds: string[]
  moduleId: string
  foreignModuleId: string
}

let fixture: Fixture | null = null;
let qa: ReturnType<typeof service>;

function need(): Fixture {
  if (!fixture) {
    throw new Error('[archived-story-cascade] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

async function seedBranch(moduleId: string, projectId: string, label: string): Promise<Branch> {
  const db = service();
  const story = must(await db.from('user_stories').insert({ module_id: moduleId, title: `${PREFIX} ${label}` }).select('id').single(), `${label} story`);
  const ac = must(await db.from('acceptance_criteria').insert({ user_story_id: story.id, title: `${PREFIX} ${label} ac`, position: 1 }).select('id').single(), `${label} criterion`);
  const atc = must(await db.from('atcs').insert({
    project_id: projectId,
    module_id: moduleId,
    user_story_id: story.id,
    slug: `${PREFIX}-${label}`,
    title: `${PREFIX} ${label} atc`,
    layer: 'UI',
  }).select('id').single(), `${label} atc`);
  return { storyId: story.id as string, acId: ac.id as string, atcId: atc.id as string };
}

async function archivedAt(table: 'user_stories' | 'acceptance_criteria' | 'atcs', id: string): Promise<string | null> {
  const row = must(await service().from(table).select('archived_at').eq('id', id).single(), `${table} read`);
  return row.archived_at as string | null;
}

describeOrSkip('BK-1555 — archiving a User Story cascades to its criteria and ATCs', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[archived-story-cascade] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[archived-story-cascade] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const qaUserId = signIn.user.id;
    const db = service();

    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    // No membership row: the QA identity is a stranger here.
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId }).select('id').single(), 'foreign workspace');

    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWs.id, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');
    const moduleRow = must(await db.from('modules').insert({ project_id: project.id, path: 'bk1555', name: 'bk1555' }).select('id').single(), 'module');
    const foreignModule = must(await db.from('modules').insert({ project_id: foreignProject.id, path: 'bk1555', name: 'bk1555' }).select('id').single(), 'foreign module');

    fixture = {
      workspaceId: ws.id as string,
      foreignWorkspaceId: foreignWs.id as string,
      qaUserId,
      projectIds: [project.id as string, foreignProject.id as string],
      moduleId: moduleRow.id as string,
      foreignModuleId: foreignModule.id as string,
    };
  });

  afterAll(async () => {
    const f = fixture;
    if (!f) { return; }
    const db = service();
    await db.from('atcs').delete().in('project_id', f.projectIds);
    await db.from('projects').delete().in('id', f.projectIds);
    await db.from('workspace_members').delete().eq('workspace_id', f.workspaceId);
    await db.from('workspaces').delete().in('id', [f.workspaceId, f.foreignWorkspaceId]);
    await qa?.auth.signOut();
  });

  it('archives the story, its criteria and its ATCs together, and the ATC then reads as not found', async () => {
    const f = need();
    const target = await seedBranch(f.moduleId, f.projectIds[0], 'target');
    const sibling = await seedBranch(f.moduleId, f.projectIds[0], 'sibling');

    const before = await service().rpc('bunkai_get_atc', { p_actor_user_id: f.qaUserId, p_atc_id: target.atcId });
    expect(before.error).toBeNull();

    const { data, error } = await qa.rpc('bunkai_archive_user_story', { p_story_id: target.storyId });
    expect(error).toBeNull();
    const story = data as unknown as { id: string, archived_at: string | null };
    expect(story.id).toBe(target.storyId);
    expect(story.archived_at).not.toBeNull();

    const storyAt = await archivedAt('user_stories', target.storyId);
    expect(storyAt).not.toBeNull();
    expect(await archivedAt('acceptance_criteria', target.acId)).toBe(storyAt);
    expect(await archivedAt('atcs', target.atcId)).toBe(storyAt);

    const after = await service().rpc('bunkai_get_atc', { p_actor_user_id: f.qaUserId, p_atc_id: target.atcId });
    expect(after.error?.code).toBe('P0002');

    expect(await archivedAt('user_stories', sibling.storyId)).toBeNull();
    expect(await archivedAt('acceptance_criteria', sibling.acId)).toBeNull();
    expect(await archivedAt('atcs', sibling.atcId)).toBeNull();
  });

  it('answers 55000 for a story that is already archived and changes nothing', async () => {
    const f = need();
    const branch = await seedBranch(f.moduleId, f.projectIds[0], 'twice');
    const first = await qa.rpc('bunkai_archive_user_story', { p_story_id: branch.storyId });
    expect(first.error).toBeNull();
    const at = await archivedAt('atcs', branch.atcId);

    const second = await qa.rpc('bunkai_archive_user_story', { p_story_id: branch.storyId });
    expect(second.error?.code).toBe('55000');
    expect(await archivedAt('atcs', branch.atcId)).toBe(at);
  });

  it('refuses a non-member with 42501 and archives nothing', async () => {
    const f = need();
    const foreign = await seedBranch(f.foreignModuleId, f.projectIds[1], 'foreign');

    const { error } = await qa.rpc('bunkai_archive_user_story', { p_story_id: foreign.storyId });
    expect(error?.code).toBe('42501');
    expect(await archivedAt('user_stories', foreign.storyId)).toBeNull();
    expect(await archivedAt('acceptance_criteria', foreign.acId)).toBeNull();
    expect(await archivedAt('atcs', foreign.atcId)).toBeNull();
  });
});
