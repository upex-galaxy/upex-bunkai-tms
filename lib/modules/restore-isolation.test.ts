import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

// BK-601: restore an archived Module, against the real database (migration 0117).
// A mocked rpc proves nothing about a DEFINER function (ADR-0012).
//
// What it proves:
//   * a restore is the exact inverse of ONE archive, for the batch-stamped path and
//     for rows archived before 0117;
//   * own archives stay archived, the BK-571 "held by parent" ATC comes back, and an
//     ATC never returns under a parent that is still archived;
//   * every refusal is named, carries its details through PostgREST and writes nothing;
//   * atomicity, authorization, the activity entry and idempotency;
//   * the archive itself is unchanged apart from the stamp (AC-10).
//
// The depth and name-collision refusals cannot be reached through the product
// (AI Product Owner ruling of 2026-11-05, gap 3): the fixtures build those states
// directly with the service role.
//
// Fixtures live in throwaway workspaces named with PREFIX and are deleted in
// afterAll, which fails the suite if any remains. With no database environment the
// suite is skipped with a loud warning; in every other case it FAILS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[restore-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY).');
}
const describeOrSkip = hasDbEnv ? describe : describe.skip;
const PREFIX = `bk601-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';
const FAILPOINT = 'module_restore.before_event';

setDefaultTimeout(30_000);

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[restore-isolation] fixture step failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Fixture {
  workspaceId: string
  qaUserId: string
  projectId: string
  viewerModuleId: string
  foreignModuleId: string
  workspaceIds: string[]
  projectIds: string[]
}

interface Branch { moduleId: string, storyId: string, acId: string, atcId: string }

interface Restored {
  id: string
  name: string
  changed: boolean
  modules: number
  user_stories: number
  acceptance_criteria: number
  atcs: number
}

let fixture: Fixture | null = null;
let qa: SupabaseClient;
let counter = 0;

function need(): Fixture {
  if (!fixture) {
    throw new Error('[restore-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

function nextLabel(): string {
  counter += 1;
  return `n${counter}`;
}

interface SeedModuleOptions { parentId?: string, name?: string, path?: string, projectId?: string }

async function seedModule(options: SeedModuleOptions = {}): Promise<string> {
  const label = nextLabel();
  const row = must(await service().from('modules').insert({
    project_id: options.projectId ?? need().projectId,
    parent_module_id: options.parentId ?? null,
    path: options.path ?? label,
    name: options.name ?? label,
  }).select('id').single(), 'module');
  return row.id as string;
}

async function seedStory(moduleId: string, externalId?: string): Promise<string> {
  const row = must(await service().from('user_stories').insert({
    module_id: moduleId,
    project_id: need().projectId,
    title: `${PREFIX} ${nextLabel()}`,
    external_id: externalId ?? null,
  }).select('id').single(), 'story');
  return row.id as string;
}

async function seedAtc(moduleId: string, storyId: string): Promise<string> {
  const label = nextLabel();
  const row = must(await service().from('atcs').insert({
    project_id: need().projectId,
    module_id: moduleId,
    user_story_id: storyId,
    slug: `${PREFIX}-${label}`,
    title: `${PREFIX} ${label} atc`,
    layer: 'UI',
  }).select('id').single(), 'atc');
  return row.id as string;
}

async function seedBranch(moduleId?: string, parentId?: string): Promise<Branch> {
  const mod = moduleId ?? await seedModule({ parentId });
  const storyId = await seedStory(mod);
  const ac = must(await service().from('acceptance_criteria').insert({
    user_story_id: storyId,
    title: `${PREFIX} ${nextLabel()} ac`,
    position: 1,
  }).select('id').single(), 'criterion');
  const atcId = await seedAtc(mod, storyId);
  return { moduleId: mod, storyId, acId: ac.id as string, atcId };
}

async function archiveModule(moduleId: string) {
  const result = await qa.rpc('bunkai_archive_module_subtree', { p_module_id: moduleId });
  return must(result, 'archive module') as { modules: number, user_stories: number, acceptance_criteria: number, atcs: number };
}

async function restoreModule(moduleId: string, client: SupabaseClient = qa) {
  return client.rpc('bunkai_restore_module_subtree', { p_module_id: moduleId });
}

async function restored(moduleId: string): Promise<Restored> {
  const { data, error } = await restoreModule(moduleId);
  expect(error).toBeNull();
  return data as Restored;
}

async function archiveStoryOnItsOwn(storyId: string) {
  must(await qa.rpc('bunkai_archive_user_story', { p_story_id: storyId }), 'archive story');
}

async function archiveAtcOnItsOwn(atcId: string) {
  must(await service().rpc('bunkai_archive_atc', { p_actor_user_id: need().qaUserId, p_atc_id: atcId }), 'archive atc');
}

async function rowOf(table: 'modules' | 'user_stories' | 'acceptance_criteria', id: string) {
  return must(await service().from(table).select('archived_at, archive_batch_id').eq('id', id).single(), `${table} read`);
}

async function atcOf(id: string) {
  return must(await service().from('atcs').select('archived_at, archived_by, archive_batch_id').eq('id', id).single(), 'atc read');
}

async function isLive(table: 'modules' | 'user_stories' | 'acceptance_criteria', id: string): Promise<boolean> {
  return (await rowOf(table, id)).archived_at === null;
}

async function branchState(branch: Branch) {
  return {
    module: await isLive('modules', branch.moduleId),
    story: await isLive('user_stories', branch.storyId),
    criterion: await isLive('acceptance_criteria', branch.acId),
    atc: (await atcOf(branch.atcId)).archived_at === null,
  };
}

const ALL_LIVE = { module: true, story: true, criterion: true, atc: true };
const ALL_ARCHIVED = { module: false, story: false, criterion: false, atc: false };

async function restoreEventCount(moduleId: string): Promise<number> {
  const { count, error } = await service()
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', moduleId)
    .eq('action', 'module.restored');
  if (error) { throw new Error(error.message); }
  return count ?? 0;
}

describeOrSkip('BK-601: restore an archived Module', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[restore-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[restore-isolation] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
    }
    const qaUserId = signIn.user.id;
    const db = service();

    const ws = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId }).select('id').single(), 'workspace');
    must(await db.from('workspace_members').insert({ workspace_id: ws.id, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id').single(), 'membership');
    const viewerWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-viewer`, name: `${PREFIX} viewer`, owner_user_id: qaUserId }).select('id').single(), 'viewer workspace');
    must(await db.from('workspace_members').insert({ workspace_id: viewerWs.id, user_id: qaUserId, role: 'viewer', status: 'active' }).select('user_id').single(), 'viewer membership');
    // No membership row: the QA identity is a stranger here.
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId }).select('id').single(), 'foreign workspace');

    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const viewerProject = must(await db.from('projects').insert({ workspace_id: viewerWs.id, slug: `${PREFIX}-v`, name: `${PREFIX} viewer project` }).select('id').single(), 'viewer project');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWs.id, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');

    const archivedAt = new Date().toISOString();
    const viewerModule = must(await db.from('modules').insert({ project_id: viewerProject.id, path: 'viewer', name: 'viewer', archived_at: archivedAt }).select('id').single(), 'viewer module');
    const foreignModule = must(await db.from('modules').insert({ project_id: foreignProject.id, path: 'foreign', name: 'foreign', archived_at: archivedAt }).select('id').single(), 'foreign module');

    fixture = {
      workspaceId: ws.id as string,
      qaUserId,
      projectId: project.id as string,
      viewerModuleId: viewerModule.id as string,
      foreignModuleId: foreignModule.id as string,
      workspaceIds: [ws.id as string, viewerWs.id as string, foreignWs.id as string],
      projectIds: [project.id as string, viewerProject.id as string, foreignProject.id as string],
    };
  });

  afterAll(async () => {
    const f = fixture;
    if (!f) { return; }
    const db = service();
    await db.from('bunkai_test_failpoints').delete().eq('name', FAILPOINT).eq('workspace_id', f.workspaceId);
    await db.from('atcs').delete().in('project_id', f.projectIds);
    await db.from('projects').delete().in('id', f.projectIds);
    await db.from('workspace_members').delete().in('workspace_id', f.workspaceIds);
    await db.from('workspaces').delete().in('id', f.workspaceIds);
    await qa?.auth.signOut();
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`[restore-isolation] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  describe('the archive stays what it was (AC-10)', () => {
    it('reports the same counts in the same shape and stamps one batch on all four tables', async () => {
      const top = await seedBranch();
      const sub = await seedBranch(undefined, top.moduleId);

      const report = await archiveModule(top.moduleId);
      expect(report).toEqual({ modules: 2, user_stories: 2, acceptance_criteria: 2, atcs: 2 });

      const batch = (await rowOf('modules', top.moduleId)).archive_batch_id;
      expect(batch).not.toBeNull();
      for (const branch of [top, sub]) {
        expect((await rowOf('modules', branch.moduleId)).archive_batch_id).toBe(batch);
        expect((await rowOf('user_stories', branch.storyId)).archive_batch_id).toBe(batch);
        expect((await rowOf('acceptance_criteria', branch.acId)).archive_batch_id).toBe(batch);
        const atc = await atcOf(branch.atcId);
        expect(atc.archive_batch_id).toBe(batch);
        expect(atc.archived_by).toBeNull();
      }
    });

    it('a User Story archived on its own takes no batch id', async () => {
      const branch = await seedBranch();
      await archiveStoryOnItsOwn(branch.storyId);
      expect((await rowOf('user_stories', branch.storyId)).archive_batch_id).toBeNull();
      expect((await atcOf(branch.atcId)).archive_batch_id).toBeNull();
    });
  });

  describe('the inverse of one archive', () => {
    it('brings back the whole set, with the Module first in the counts, in place and in order', async () => {
      const top = await seedBranch();
      const sub = await seedBranch(undefined, top.moduleId);
      const db = service();
      must(await db.from('modules').update({ position: 7 }).eq('id', sub.moduleId).select('id'), 'set position');
      const secondAc = must(await db.from('acceptance_criteria').insert({ user_story_id: top.storyId, title: `${PREFIX} second`, position: 2 }).select('id').single(), 'second criterion');
      const before = must(await db.from('modules').select('path, parent_module_id, position').eq('id', sub.moduleId).single(), 'module before');

      await archiveModule(top.moduleId);
      const result = await restored(top.moduleId);

      expect(result).toEqual({
        id: top.moduleId,
        name: result.name,
        changed: true,
        modules: 2,
        user_stories: 2,
        acceptance_criteria: 3,
        atcs: 2,
      });
      expect(await branchState(top)).toEqual(ALL_LIVE);
      expect(await branchState(sub)).toEqual(ALL_LIVE);
      const after: unknown = must(await db.from('modules').select('path, parent_module_id, position').eq('id', sub.moduleId).single(), 'module after');
      expect(after).toEqual(before);
      expect(must(await db.from('acceptance_criteria').select('position').eq('id', secondAc.id).single(), 'criterion after').position).toBe(2);
      expect((await rowOf('modules', top.moduleId)).archive_batch_id).toBeNull();
      expect((await atcOf(top.atcId)).archive_batch_id).toBeNull();
    });

    it('leaves every other archived Module alone', async () => {
      const one = await seedBranch();
      const two = await seedBranch();
      const three = await seedBranch();
      await archiveModule(one.moduleId);
      await archiveModule(two.moduleId);
      await archiveModule(three.moduleId);
      const twoBefore = await rowOf('modules', two.moduleId);

      await restored(one.moduleId);

      expect(await branchState(one)).toEqual(ALL_LIVE);
      expect(await branchState(two)).toEqual(ALL_ARCHIVED);
      expect(await branchState(three)).toEqual(ALL_ARCHIVED);
      expect(await rowOf('modules', two.moduleId)).toEqual(twoBefore);
    });

    it('holds when two subtrees share one archived_at, the reason the batch id exists', async () => {
      const left = await seedBranch();
      const right = await seedBranch();
      const db = service();
      const stamp = new Date().toISOString();
      for (const [branch, batch] of [[left, crypto.randomUUID()], [right, crypto.randomUUID()]] as const) {
        const set = { archived_at: stamp, archive_batch_id: batch };
        must(await db.from('modules').update(set).eq('id', branch.moduleId).select('id'), 'stamp module');
        must(await db.from('user_stories').update(set).eq('id', branch.storyId).select('id'), 'stamp story');
        must(await db.from('acceptance_criteria').update(set).eq('id', branch.acId).select('id'), 'stamp criterion');
        must(await db.from('atcs').update(set).eq('id', branch.atcId).select('id'), 'stamp atc');
      }

      await restored(left.moduleId);

      expect(await branchState(left)).toEqual(ALL_LIVE);
      expect(await branchState(right)).toEqual(ALL_ARCHIVED);
    });

    it('restores only the second archive after archive, restore, archive', async () => {
      const branch = await seedBranch();
      const other = await seedStory(branch.moduleId);
      await archiveModule(branch.moduleId);
      await restored(branch.moduleId);

      await archiveStoryOnItsOwn(other);
      await archiveModule(branch.moduleId);
      await restored(branch.moduleId);

      expect(await branchState(branch)).toEqual(ALL_LIVE);
      expect(await isLive('user_stories', other)).toBe(false);
    });

    it('falls back to the timestamp for rows archived before 0117, and stops at a different stamp', async () => {
      const top = await seedBranch();
      const swept = await seedBranch(undefined, top.moduleId);
      const earlier = await seedBranch(undefined, top.moduleId);
      const beneathEarlier = await seedBranch(undefined, earlier.moduleId);
      const db = service();
      const stamp = '2026-01-02T03:04:05.000Z';
      const older = '2026-01-01T00:00:00.000Z';
      const stampBranch = async (branch: Branch, at: string) => {
        must(await db.from('modules').update({ archived_at: at }).eq('id', branch.moduleId).select('id'), 'legacy module');
        must(await db.from('user_stories').update({ archived_at: at }).eq('id', branch.storyId).select('id'), 'legacy story');
        must(await db.from('acceptance_criteria').update({ archived_at: at }).eq('id', branch.acId).select('id'), 'legacy criterion');
        must(await db.from('atcs').update({ archived_at: at }).eq('id', branch.atcId).select('id'), 'legacy atc');
      };
      await stampBranch(top, stamp);
      await stampBranch(swept, stamp);
      await stampBranch(earlier, older);
      await stampBranch(beneathEarlier, older);

      const result = await restored(top.moduleId);

      expect(result.modules).toBe(2);
      expect(await branchState(top)).toEqual(ALL_LIVE);
      expect(await branchState(swept)).toEqual(ALL_LIVE);
      expect(await branchState(earlier)).toEqual(ALL_ARCHIVED);
      expect(await branchState(beneathEarlier)).toEqual(ALL_ARCHIVED);
    });
  });

  describe('own archives (AC-03)', () => {
    it('keeps a User Story archived on its own, with its criteria and ATCs', async () => {
      const branch = await seedBranch();
      const own = await seedBranch(branch.moduleId);
      await archiveStoryOnItsOwn(own.storyId);
      await archiveModule(branch.moduleId);

      await restored(branch.moduleId);

      expect(await branchState(branch)).toEqual(ALL_LIVE);
      expect(await isLive('user_stories', own.storyId)).toBe(false);
      expect(await isLive('acceptance_criteria', own.acId)).toBe(false);
      expect((await atcOf(own.atcId)).archived_at).not.toBeNull();
    });

    it('keeps a sub-Module archived on its own, and nothing beneath it is active', async () => {
      const parent = await seedBranch();
      const own = await seedBranch(undefined, parent.moduleId);
      const beneath = await seedBranch(undefined, own.moduleId);
      await archiveModule(own.moduleId);
      await archiveModule(parent.moduleId);

      const result = await restored(parent.moduleId);

      expect(result.modules).toBe(1);
      expect(await branchState(parent)).toEqual(ALL_LIVE);
      expect(await branchState(own)).toEqual(ALL_ARCHIVED);
      expect(await branchState(beneath)).toEqual(ALL_ARCHIVED);

      await restored(own.moduleId);
      expect(await branchState(own)).toEqual(ALL_LIVE);
      expect(await branchState(beneath)).toEqual(ALL_LIVE);
    });

    it('keeps an ATC archived on its own, with its actor and timestamp', async () => {
      const branch = await seedBranch();
      const ownAtc = await seedAtc(branch.moduleId, branch.storyId);
      await archiveAtcOnItsOwn(ownAtc);
      const before = await atcOf(ownAtc);
      await archiveModule(branch.moduleId);

      await restored(branch.moduleId);

      expect((await atcOf(branch.atcId)).archived_at).toBeNull();
      expect(await atcOf(ownAtc)).toEqual(before);
    });

    it('brings back an ATC restored while its parent was archived', async () => {
      const branch = await seedBranch();
      const heldAtc = await seedAtc(branch.moduleId, branch.storyId);
      await archiveAtcOnItsOwn(heldAtc);
      await archiveModule(branch.moduleId);
      must(await service().rpc('bunkai_restore_atc', { p_actor_user_id: need().qaUserId, p_atc_id: heldAtc }), 'restore atc under archived parent');
      const held = await atcOf(heldAtc);
      expect(held.archived_by).toBeNull();
      expect(held.archive_batch_id).toBeNull();

      const result = await restored(branch.moduleId);

      expect(result.atcs).toBe(2);
      expect(await atcOf(heldAtc)).toEqual({ archived_at: null, archived_by: null, archive_batch_id: null });
    });

    it('never returns an ATC under a parent still archived: it passes to that parent', async () => {
      const storyHome = await seedBranch();
      const atcHome = await seedModule();
      const crossAtc = await seedAtc(atcHome, storyHome.storyId);
      await archiveModule(storyHome.moduleId);
      await archiveModule(atcHome);
      const atcHomeStamp = (await rowOf('modules', atcHome)).archived_at;

      const result = await restored(storyHome.moduleId);

      expect(result.atcs).toBe(1);
      const passed = await atcOf(crossAtc);
      expect(Date.parse(passed.archived_at)).toBe(Date.parse(atcHomeStamp));
      expect(passed.archived_by).toBeNull();
      expect(passed.archive_batch_id).toBeNull();

      await restored(atcHome);
      expect((await atcOf(crossAtc)).archived_at).toBeNull();
    });
  });

  describe('refusals write nothing', () => {
    it('names the nearest archived ancestor, then lets the child back once it is restored (AC-04)', async () => {
      const grand = await seedBranch();
      const parent = await seedBranch(undefined, grand.moduleId);
      const child = await seedBranch(undefined, parent.moduleId);
      await archiveModule(child.moduleId);
      await archiveModule(parent.moduleId);
      await archiveModule(grand.moduleId);
      const before = await rowOf('modules', child.moduleId);
      const parentRow = must(await service().from('modules').select('name').eq('id', parent.moduleId).single(), 'parent name');

      const { data, error } = await restoreModule(child.moduleId);

      expect(data).toBeNull();
      expect(error?.code).toBe('45004');
      expect(error?.message).toBe('ancestor_archived');
      expect(JSON.parse(error?.details ?? '{}')).toEqual({ ancestor_id: parent.moduleId, ancestor_name: parentRow.name });
      expect(await rowOf('modules', child.moduleId)).toEqual(before);
      expect(await restoreEventCount(child.moduleId)).toBe(0);

      await restored(grand.moduleId);
      await restored(parent.moduleId);
      const result = await restored(child.moduleId);
      expect(result.changed).toBe(true);
      const after = must(await service().from('modules').select('parent_module_id').eq('id', child.moduleId).single(), 'child parent');
      expect(after.parent_module_id).toBe(parent.moduleId);
    });

    it('checks no ancestor for a Module at the Project root, and allows a parent back while a child stays archived', async () => {
      const root = await seedBranch();
      const child = await seedBranch(undefined, root.moduleId);
      await archiveModule(child.moduleId);
      await archiveModule(root.moduleId);

      const result = await restored(root.moduleId);

      expect(result.changed).toBe(true);
      expect(await branchState(child)).toEqual(ALL_ARCHIVED);
    });

    it('refuses past the nesting limit, and allows exactly the limit (AC-09)', async () => {
      // The depth CHECK binds `path`, so the over-deep state is built on the parent
      // chain with short paths: the same state a future path bug would leave behind.
      const chain: string[] = [];
      for (let level = 0; level < 5; level += 1) {
        chain.push(await seedModule({ parentId: chain.at(-1) }));
      }
      const atLimit = await seedModule({ parentId: chain.at(-1) });
      const overLimit = await seedModule({ parentId: atLimit });
      const db = service();
      const stamp = new Date().toISOString();
      must(await db.from('modules').update({ archived_at: stamp }).eq('id', overLimit).select('id'), 'archive over limit');
      must(await db.from('modules').update({ archived_at: '2026-01-01T00:00:00.000Z' }).eq('id', atLimit).select('id'), 'archive at limit');

      expect((await restored(atLimit)).changed).toBe(true);

      const { error } = await restoreModule(overLimit);
      expect(error?.code).toBe('45002');
      expect(error?.message).toBe('depth_exceeded');
      expect(await isLive('modules', overLimit)).toBe(false);
      expect(await restoreEventCount(overLimit)).toBe(0);
    });

    it('refuses a same-named active sibling, and retries after a rename (AC-09)', async () => {
      const label = nextLabel();
      const archived = await seedBranch(await seedModule({ name: `Checkout ${label}`, path: `checkout-${label}` }));
      await archiveModule(archived.moduleId);
      // A different path, because unique(project_id, path) binds archived rows too.
      const twin = await seedModule({ name: ` checkout ${label.toUpperCase()} `, path: `checkout-${label}-twin` });

      const { error } = await restoreModule(archived.moduleId);

      expect(error?.code).toBe('45005');
      expect(error?.message).toBe('name_collision');
      expect(JSON.parse(error?.details ?? '{}')).toEqual({ module_name: `Checkout ${label}` });
      expect(await branchState(archived)).toEqual(ALL_ARCHIVED);
      expect(await restoreEventCount(archived.moduleId)).toBe(0);

      must(await service().from('modules').update({ name: `Renamed ${label}` }).eq('id', twin).select('id'), 'rename twin');
      expect((await restored(archived.moduleId)).changed).toBe(true);
    });

    it('refuses when an active Story took a restored Story\'s key while it was archived', async () => {
      const key = `BK${Date.now() % 100000}${counter}-1`;
      const home = await seedModule();
      const storyId = await seedStory(home, key);
      await archiveModule(home);
      // The partial unique index ignores archived rows, so this insert is legal.
      const elsewhere = await seedModule();
      const taker = await seedStory(elsewhere, key.toLowerCase());

      const { error } = await restoreModule(home);

      expect(error?.code).toBe('45006');
      expect(error?.message).toBe('story_key_collision');
      expect(JSON.parse(error?.details ?? '{}')).toEqual({ external_id: key.toUpperCase() });
      expect(await isLive('modules', home)).toBe(false);
      expect(await isLive('user_stories', storyId)).toBe(false);

      must(await archiveStoryOnItsOwn(taker).then(() => ({ data: true, error: null })), 'free the key');
      expect((await restored(home)).user_stories).toBe(1);
    });
  });

  describe('atomicity (AC-05)', () => {
    it('leaves everything archived when the restore fails before its event, and a retry works', async () => {
      const f = need();
      const db = service();
      const top = await seedBranch();
      const sub = await seedBranch(undefined, top.moduleId);
      await archiveModule(top.moduleId);
      const batch = (await rowOf('modules', top.moduleId)).archive_batch_id;

      must(await db.from('bunkai_test_failpoints').insert({ name: FAILPOINT, workspace_id: f.workspaceId }).select('name'), 'arm failpoint');
      try {
        const { error } = await restoreModule(top.moduleId);
        expect(error?.code).toBe('P0001');
        expect(error?.message).toBe('test_failpoint');
      }
      finally {
        await db.from('bunkai_test_failpoints').delete().eq('name', FAILPOINT).eq('workspace_id', f.workspaceId);
      }

      expect(await branchState(top)).toEqual(ALL_ARCHIVED);
      expect(await branchState(sub)).toEqual(ALL_ARCHIVED);
      expect((await rowOf('modules', sub.moduleId)).archive_batch_id).toBe(batch);
      expect(await restoreEventCount(top.moduleId)).toBe(0);

      expect((await restored(top.moduleId)).changed).toBe(true);
      expect(await branchState(sub)).toEqual(ALL_LIVE);
    });
  });

  describe('authorization (AC-06)', () => {
    it('refuses a viewer with 42501 and changes nothing', async () => {
      const f = need();
      const { error } = await restoreModule(f.viewerModuleId);
      expect(error?.code).toBe('42501');
      expect(await isLive('modules', f.viewerModuleId)).toBe(false);
    });

    it('refuses a stranger and changes nothing', async () => {
      const f = need();
      const { error } = await restoreModule(f.foreignModuleId);
      expect(error?.code).toBe('42501');
      expect(await isLive('modules', f.foreignModuleId)).toBe(false);
    });

    it('answers P0002 for an unknown id', async () => {
      const { error } = await restoreModule(ABSENT_UUID);
      expect(error?.code).toBe('P0002');
    });

    it('gives anon no execute, and the service role no actor to write as', async () => {
      const f = need();
      const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
      const anonResult = await restoreModule(f.viewerModuleId, anon);
      expect(anonResult.error?.code).toBe('42501');
      const serviceResult = await restoreModule(f.viewerModuleId, service());
      expect(serviceResult.error?.code).toBe('42501');
      expect(await isLive('modules', f.viewerModuleId)).toBe(false);
    });

    it('a session cannot write the batch id of an ATC through PostgREST', async () => {
      const branch = await seedBranch();
      const { error } = await qa.from('atcs').update({ archive_batch_id: crypto.randomUUID() }).eq('id', branch.atcId);
      expect(error?.code).toBe('42501');
      expect((await atcOf(branch.atcId)).archive_batch_id).toBeNull();
    });
  });

  describe('activity and idempotency (AC-07, AC-08)', () => {
    it('writes one module.restored with the actor and the four counts, separate from the archive', async () => {
      const f = need();
      const branch = await seedBranch();
      await archiveModule(branch.moduleId);
      await restored(branch.moduleId);

      const rows = must(await service().from('activity_log').select('action, actor_user_id, payload').eq('entity_id', branch.moduleId).order('created_at'), 'activity read');
      expect(rows.map(r => r.action)).toEqual(['module.archived', 'module.restored']);
      expect(rows[1].actor_user_id).toBe(f.qaUserId);
      expect(rows[1].payload).toEqual({ modules: 1, user_stories: 1, acceptance_criteria: 1, atcs: 1 });

      const name = must(await service().from('modules').select('name').eq('id', branch.moduleId).single(), 'module name').name;
      const feed = must(await qa.rpc('bunkai_list_activity', { p_workspace_id: f.workspaceId, p_limit: 50 }), 'activity feed') as {
        items: { entity_id: string, action: string, payload: Record<string, unknown> }[]
      };
      const entries = feed.items.filter(i => i.entity_id === branch.moduleId);
      expect(entries.map(i => i.action)).toEqual(['module.restored', 'module.archived']);
      for (const entry of entries) {
        expect(entry.payload).toEqual({ name, modules: 1, user_stories: 1, acceptance_criteria: 1, atcs: 1 });
      }
    });

    it('reports success with zero counts for an active Module, with no write and no event', async () => {
      const branch = await seedBranch();
      const name = must(await service().from('modules').select('name').eq('id', branch.moduleId).single(), 'module name').name;

      expect(await restored(branch.moduleId)).toEqual({
        id: branch.moduleId,
        name,
        changed: false,
        modules: 0,
        user_stories: 0,
        acceptance_criteria: 0,
        atcs: 0,
      });
      expect(await restoreEventCount(branch.moduleId)).toBe(0);
    });

    it('serializes two simultaneous restores: one wins, the other changes nothing', async () => {
      const branch = await seedBranch();
      await archiveModule(branch.moduleId);

      const results = await Promise.all([restored(branch.moduleId), restored(branch.moduleId)]);

      expect(results.map(r => r.changed).sort()).toEqual([false, true]);
      expect(await restoreEventCount(branch.moduleId)).toBe(1);
      expect(await branchState(branch)).toEqual(ALL_LIVE);
    });

    it('a second restore changes nothing further', async () => {
      const branch = await seedBranch();
      await archiveModule(branch.moduleId);
      await restored(branch.moduleId);

      expect((await restored(branch.moduleId)).changed).toBe(false);
      expect(await restoreEventCount(branch.moduleId)).toBe(1);
    });
  });
});
