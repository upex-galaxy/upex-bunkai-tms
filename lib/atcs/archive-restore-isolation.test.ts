import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-571: archive and restore one ATC, against the real database (migration
// 0116). A mocked rpc proves nothing about a DEFINER function (ADR-0012).
//
// What it proves:
//   * the writers: state, idempotency under concurrency, one event per real
//     change, chains untouched, no Test edited;
//   * authorization: actor spoof, direct call from a session, stranger, viewer;
//   * the split read paths: reuse reads hide the ATC, evidence reads keep it;
//   * the frozen state: edit and duplicate answer the named atc_archived;
//   * restore under an archived parent hands the ATC to the parent's cascade;
//   * atomicity: a failure before the event leaves nothing behind (AC-12).
//
// Fixtures live in throwaway workspaces named with PREFIX and are deleted in
// afterAll, which fails the suite if any remains. With no database environment
// the suite is skipped with a loud warning; in every other case it FAILS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[archive-restore-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY).');
}
const describeOrSkip = hasDbEnv ? describe : describe.skip;
const PREFIX = `bk571-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[archive-restore-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

interface Fixture {
  workspaceId: string
  viewerWorkspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  viewerProjectId: string
  foreignProjectId: string
  viewerModuleId: string
  foreignModuleId: string
  environmentId: string
}

interface Branch { moduleId: string, storyId: string, acId: string, atcId: string, title: string }

interface ArchiveResult {
  id: string
  title: string
  archived_at: string | null
  archived_by: string | null
  held_by_parent?: string | null
  changed: boolean
}

let fixture: Fixture | null = null;
let qa: SupabaseClient;
let counter = 0;

function need(): Fixture {
  if (!fixture) {
    throw new Error('[archive-restore-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

async function seedModule(projectId: string): Promise<string> {
  counter += 1;
  const path = `m${counter}`;
  const row = must(await service().from('modules').insert({ project_id: projectId, path, name: path }).select('id').single(), 'module');
  return row.id as string;
}

async function seedBranch(projectId: string, moduleId?: string): Promise<Branch> {
  counter += 1;
  const db = service();
  const label = `n${counter}`;
  const mod = moduleId ?? await seedModule(projectId);
  const story = must(await db.from('user_stories').insert({ module_id: mod, title: `${PREFIX} ${label}` }).select('id').single(), 'story');
  const ac = must(await db.from('acceptance_criteria').insert({ user_story_id: story.id, title: `${PREFIX} ${label} ac`, position: 1 }).select('id').single(), 'criterion');
  const title = `${PREFIX} zebra${label} atc`;
  const atc = must(await db.from('atcs').insert({
    project_id: projectId,
    module_id: mod,
    user_story_id: story.id,
    slug: `${PREFIX}-${label}`,
    title,
    layer: 'UI',
  }).select('id').single(), 'atc');
  must(await db.from('atc_steps').insert({ atc_id: atc.id, position: 1, content: `step of ${label}`, expected: 'it works' }).select('id').single(), 'atc step');
  must(await db.from('atc_acceptance_criteria').insert({ atc_id: atc.id, acceptance_criterion_id: ac.id }).select('atc_id').single(), 'binding');
  return { moduleId: mod, storyId: story.id as string, acId: ac.id as string, atcId: atc.id as string, title };
}

async function archive(atcId: string, actor?: string) {
  return service().rpc('bunkai_archive_atc', { p_actor_user_id: actor ?? need().qaUserId, p_atc_id: atcId });
}

async function restore(atcId: string, actor?: string) {
  return service().rpc('bunkai_restore_atc', { p_actor_user_id: actor ?? need().qaUserId, p_atc_id: atcId });
}

async function atcRow(atcId: string) {
  return must(await service().from('atcs').select('archived_at, archived_by, version').eq('id', atcId).single(), 'atc read');
}

async function eventCount(atcId: string, action: string): Promise<number> {
  const { count, error } = await service()
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', atcId)
    .eq('action', action);
  if (error) { throw new Error(error.message); }
  return count ?? 0;
}

async function chainOf(atcId: string) {
  const rows = must(await service().from('test_steps').select('id, test_id, position').eq('atc_id', atcId).order('id'), 'chain read');
  return rows;
}

async function seedTest(atcIds: string[]): Promise<string> {
  counter += 1;
  const { data, error } = await service().rpc('bunkai_create_test', {
    p_actor_user_id: need().qaUserId,
    p_workspace_id: need().workspaceId,
    p_title: `${PREFIX} test ${counter}`,
    p_atc_ids: atcIds,
  });
  if (error) { throw new Error(`[archive-restore-isolation] test seed failed: ${error.message}`); }
  return (data as { id: string }).id;
}

function updateArgs(atcId: string, acId: string, title: string) {
  return {
    p_actor_user_id: need().qaUserId,
    p_atc_id: atcId,
    p_if_match: null,
    p_title: title,
    p_layer: 'UI',
    p_tags: [],
    p_steps: [{ position: 1, content: 'edited step' }],
    p_assertions: [],
    p_ac_ids: [acId],
  };
}

// A finished Run that failed on the ATC's step, through the real run RPC so the
// snapshot is the one production writes.
async function seedFinishedFailedRun(testId: string): Promise<string> {
  const db = service();
  counter += 1;
  const { data, error } = await db.rpc('bunkai_create_run', {
    p_actor_user_id: need().qaUserId,
    p_test_id: testId,
    p_environment_id: need().environmentId,
    p_executor_mode: 'human',
    p_start_token: `${PREFIX}-${counter}`,
  });
  if (error) { throw new Error(`[archive-restore-isolation] run seed failed: ${error.message}`); }
  const runId = (data as { id: string }).id;
  const runAtcs = must(await db.from('run_atcs').update({ status: 'failed' }).eq('run_id', runId).select('id'), 'run_atcs finish');
  must(await db.from('run_steps').update({ status: 'failed' }).in('run_atc_id', runAtcs.map(r => r.id as string)).select('id'), 'run_steps finish');
  must(await db.from('runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId).select('id'), 'run finish');
  return runId;
}

describeOrSkip('BK-571: archive and restore an ATC', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[archive-restore-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.');
    }
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`[archive-restore-isolation] QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
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
    const environment = must(await db.from('project_environments').insert({ project_id: project.id, name: 'staging' }).select('id').single(), 'environment');

    fixture = {
      workspaceId: ws.id as string,
      viewerWorkspaceId: viewerWs.id as string,
      foreignWorkspaceId: foreignWs.id as string,
      qaUserId,
      projectId: project.id as string,
      viewerProjectId: viewerProject.id as string,
      foreignProjectId: foreignProject.id as string,
      viewerModuleId: await seedModule(viewerProject.id as string),
      foreignModuleId: await seedModule(foreignProject.id as string),
      environmentId: environment.id as string,
    };
  });

  afterAll(async () => {
    const f = fixture;
    if (!f) { return; }
    const db = service();
    const workspaceIds = [f.workspaceId, f.viewerWorkspaceId, f.foreignWorkspaceId];
    const projectIds = [f.projectId, f.viewerProjectId, f.foreignProjectId];
    await db.from('bugs').delete().in('project_id', projectIds);
    await db.from('runs').delete().in('project_id', projectIds);
    await db.from('tests').delete().in('workspace_id', workspaceIds);
    await db.from('atcs').delete().in('project_id', projectIds);
    await db.from('projects').delete().in('id', projectIds);
    await db.from('workspace_members').delete().in('workspace_id', workspaceIds);
    await db.from('workspaces').delete().in('id', workspaceIds);
    await qa?.auth.signOut();
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`[archive-restore-isolation] ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  describe('the writers', () => {
    it('archives, records who and when, and writes one event', async () => {
      const b = await seedBranch(need().projectId);
      const { data, error } = await archive(b.atcId);
      expect(error).toBeNull();
      const result = data as ArchiveResult;
      expect(result.changed).toBe(true);
      expect(result.title).toBe(b.title);

      const row = await atcRow(b.atcId);
      expect(row.archived_at).not.toBeNull();
      expect(row.archived_by).toBe(need().qaUserId);
      expect(await eventCount(b.atcId, 'atc.archived')).toBe(1);
    });

    it('never edits a Test: 4 chain positions across 3 Tests survive, in order', async () => {
      const b = await seedBranch(need().projectId);
      const other = await seedBranch(need().projectId, b.moduleId);
      await seedTest([b.atcId, other.atcId, b.atcId]);
      await seedTest([b.atcId]);
      await seedTest([other.atcId, b.atcId]);
      const before = await chainOf(b.atcId);
      expect(before).toHaveLength(4);

      expect((await archive(b.atcId)).error).toBeNull();
      expect(await chainOf(b.atcId)).toEqual(before);
    });

    it('restores to full circulation: same ids, same chain, same version, its own event', async () => {
      const b = await seedBranch(need().projectId);
      await seedTest([b.atcId]);
      const before = await chainOf(b.atcId);
      const versionBefore = (await atcRow(b.atcId)).version;
      expect((await archive(b.atcId)).error).toBeNull();

      const { data, error } = await restore(b.atcId);
      expect(error).toBeNull();
      const result = data as ArchiveResult;
      expect(result.changed).toBe(true);
      expect(result.archived_at).toBeNull();
      expect(result.held_by_parent).toBeNull();

      const row = await atcRow(b.atcId);
      expect(row.archived_at).toBeNull();
      expect(row.archived_by).toBeNull();
      expect(row.version).toBe(versionBefore);
      expect(await chainOf(b.atcId)).toEqual(before);
      expect(await eventCount(b.atcId, 'atc.restored')).toBe(1);
    });

    it('a repeated archive reports success and keeps the first actor and timestamp', async () => {
      const b = await seedBranch(need().projectId);
      expect((await archive(b.atcId)).error).toBeNull();
      const first = await atcRow(b.atcId);

      const { data, error } = await archive(b.atcId);
      expect(error).toBeNull();
      expect((data as ArchiveResult).changed).toBe(false);
      const second = await atcRow(b.atcId);
      expect(second.archived_at).toBe(first.archived_at);
      expect(second.archived_by).toBe(first.archived_by);
      expect(await eventCount(b.atcId, 'atc.archived')).toBe(1);
    });

    it('restoring a live ATC reports success, changes nothing and writes no event', async () => {
      const b = await seedBranch(need().projectId);
      const { data, error } = await restore(b.atcId);
      expect(error).toBeNull();
      expect((data as ArchiveResult).changed).toBe(false);
      expect(await eventCount(b.atcId, 'atc.restored')).toBe(0);
    });

    it('two simultaneous archives both succeed and write exactly one event', async () => {
      const b = await seedBranch(need().projectId);
      const [one, two] = await Promise.all([archive(b.atcId), archive(b.atcId)]);
      expect(one.error).toBeNull();
      expect(two.error).toBeNull();
      const changed = [one.data as ArchiveResult, two.data as ArchiveResult].filter(r => r.changed);
      expect(changed).toHaveLength(1);
      expect(await eventCount(b.atcId, 'atc.archived')).toBe(1);
    });

    it('two simultaneous restores both succeed and write exactly one event', async () => {
      const b = await seedBranch(need().projectId);
      expect((await archive(b.atcId)).error).toBeNull();
      const [one, two] = await Promise.all([restore(b.atcId), restore(b.atcId)]);
      expect(one.error).toBeNull();
      expect(two.error).toBeNull();
      const changed = [one.data as ArchiveResult, two.data as ArchiveResult].filter(r => r.changed);
      expect(changed).toHaveLength(1);
      expect(await eventCount(b.atcId, 'atc.restored')).toBe(1);
    });

    it('rolls the archive back when a step before the event fails, and a retry works', async () => {
      const f = need();
      const db = service();
      const b = await seedBranch(f.projectId);
      must(await db.from('bunkai_test_failpoints').insert({ name: 'atc_archive.before_event', workspace_id: f.workspaceId }).select('name'), 'arm failpoint');
      try {
        const { error } = await archive(b.atcId);
        expect(error?.code).toBe('P0001');
        expect((await atcRow(b.atcId)).archived_at).toBeNull();
        expect(await eventCount(b.atcId, 'atc.archived')).toBe(0);
      }
      finally {
        await db.from('bunkai_test_failpoints').delete().eq('name', 'atc_archive.before_event').eq('workspace_id', f.workspaceId);
      }
      expect((await archive(b.atcId)).error).toBeNull();
      expect((await atcRow(b.atcId)).archived_at).not.toBeNull();
    });

    it('rolls the restore back when a step before the event fails', async () => {
      const f = need();
      const db = service();
      const b = await seedBranch(f.projectId);
      expect((await archive(b.atcId)).error).toBeNull();
      must(await db.from('bunkai_test_failpoints').insert({ name: 'atc_restore.before_event', workspace_id: f.workspaceId }).select('name'), 'arm failpoint');
      try {
        const { error } = await restore(b.atcId);
        expect(error?.code).toBe('P0001');
        expect((await atcRow(b.atcId)).archived_at).not.toBeNull();
        expect(await eventCount(b.atcId, 'atc.restored')).toBe(0);
      }
      finally {
        await db.from('bunkai_test_failpoints').delete().eq('name', 'atc_restore.before_event').eq('workspace_id', f.workspaceId);
      }
    });

    it('shows both events in the workspace Activity Stream, naming the ATC', async () => {
      const f = need();
      const b = await seedBranch(f.projectId);
      expect((await archive(b.atcId)).error).toBeNull();
      expect((await restore(b.atcId)).error).toBeNull();

      const { data, error } = await qa.rpc('bunkai_list_activity', { p_workspace_id: f.workspaceId, p_limit: 50 });
      expect(error).toBeNull();
      const items = (data as { items: { action: string, entity_id: string, actor_user_id: string, payload: { title?: string } }[] }).items.filter(i => i.entity_id === b.atcId);
      expect(items.map(i => i.action)).toEqual(['atc.restored', 'atc.archived']);
      for (const item of items) {
        expect(item.payload.title).toBe(b.title);
        expect(item.actor_user_id).toBe(f.qaUserId);
      }
    });
  });

  describe('authorization', () => {
    it('a signed-in session cannot reach the writers directly', async () => {
      const b = await seedBranch(need().projectId);
      for (const fn of ['bunkai_archive_atc', 'bunkai_restore_atc']) {
        const { error } = await qa.rpc(fn, { p_actor_user_id: need().qaUserId, p_atc_id: b.atcId });
        expect(error?.code).toBe('42501');
      }
      expect((await atcRow(b.atcId)).archived_at).toBeNull();
    });

    it('a signed-in writer cannot PATCH the archive columns through the table grant', async () => {
      const b = await seedBranch(need().projectId);
      const set = await qa.from('atcs').update({ archived_at: new Date().toISOString() }).eq('id', b.atcId);
      expect(set.error?.code).toBe('42501');
      const forged = await qa.from('atcs').update({ archived_by: need().qaUserId }).eq('id', b.atcId);
      expect(forged.error?.code).toBe('42501');
      expect((await atcRow(b.atcId)).archived_at).toBeNull();

      // The guard covers only these columns: the existing grant keeps working.
      const edit = await qa.from('atcs').update({ tags: ['still-writable'] }).eq('id', b.atcId);
      expect(edit.error).toBeNull();
    });

    it('refuses a stranger with 42501 and changes nothing', async () => {
      const f = need();
      const foreign = await seedBranch(f.foreignProjectId, f.foreignModuleId);
      expect((await archive(foreign.atcId)).error?.code).toBe('42501');
      expect((await atcRow(foreign.atcId)).archived_at).toBeNull();
    });

    it('refuses a read-only member: archive and restore both', async () => {
      const f = need();
      const b = await seedBranch(f.viewerProjectId, f.viewerModuleId);
      expect((await archive(b.atcId)).error?.code).toBe('42501');
      expect((await atcRow(b.atcId)).archived_at).toBeNull();

      await service().from('atcs').update({ archived_at: new Date().toISOString() }).eq('id', b.atcId);
      expect((await restore(b.atcId)).error?.code).toBe('42501');
      expect((await atcRow(b.atcId)).archived_at).not.toBeNull();
    });

    it('answers P0002 for an id that does not exist', async () => {
      expect((await archive(ABSENT_UUID)).error?.code).toBe('P0002');
      expect((await restore(ABSENT_UUID)).error?.code).toBe('P0002');
    });

    it('a stranger cannot learn that an ATC is archived from the edit path', async () => {
      const f = need();
      const foreign = await seedBranch(f.foreignProjectId, f.foreignModuleId);
      await service().from('atcs').update({ archived_at: new Date().toISOString() }).eq('id', foreign.atcId);
      const { error } = await service().rpc('bunkai_update_atc', updateArgs(foreign.atcId, foreign.acId, 'A title'));
      expect(error?.code).toBe('42501');
    });
  });

  describe('the frozen state', () => {
    it('edit and duplicate answer the named atc_archived, and work again after restore', async () => {
      const b = await seedBranch(need().projectId);
      expect((await archive(b.atcId)).error).toBeNull();

      const edit = await service().rpc('bunkai_update_atc', updateArgs(b.atcId, b.acId, 'A new title'));
      expect(edit.error?.code).toBe('45025');
      const copy = await service().rpc('bunkai_duplicate_atc', { p_actor_user_id: need().qaUserId, p_source_atc_id: b.atcId });
      expect(copy.error?.code).toBe('45025');

      expect((await restore(b.atcId)).error).toBeNull();
      expect((await service().rpc('bunkai_update_atc', updateArgs(b.atcId, b.acId, 'A new title'))).error).toBeNull();
      const copied = await service().rpc('bunkai_duplicate_atc', { p_actor_user_id: need().qaUserId, p_source_atc_id: b.atcId });
      expect(copied.error).toBeNull();
    });

    it('cannot be added to a new Test chain until it is restored', async () => {
      const f = need();
      const b = await seedBranch(f.projectId);
      expect((await archive(b.atcId)).error).toBeNull();
      const refused = await service().rpc('bunkai_create_test', {
        p_actor_user_id: f.qaUserId,
        p_workspace_id: f.workspaceId,
        p_title: `${PREFIX} refused`,
        p_atc_ids: [b.atcId],
      });
      expect(refused.error?.code).toBe('45122');

      expect((await restore(b.atcId)).error).toBeNull();
      expect(await seedTest([b.atcId])).toBeTruthy();
    });
  });

  describe('reuse reads hide an archived ATC', () => {
    it('leaves ATC search, the workspace search and the by-id read, and returns on restore', async () => {
      const f = need();
      const b = await seedBranch(f.projectId);
      const term = b.title.split(' ')[1];
      const searchArgs = { p_actor_user_id: f.qaUserId, p_query: term, p_project_id: f.projectId };

      const hits = async () => {
        const { data, error } = await service().rpc('bunkai_search_atcs', searchArgs);
        if (error) { throw new Error(error.message); }
        return JSON.stringify(data).includes(b.atcId);
      };
      const paletteHits = async () => {
        const { data, error } = await qa.rpc('bunkai_search_workspace', { p_query: term, p_workspace_id: f.workspaceId });
        if (error) { throw new Error(error.message); }
        return JSON.stringify(data).includes(b.atcId);
      };

      expect(await hits()).toBe(true);
      expect(await paletteHits()).toBe(true);

      expect((await archive(b.atcId)).error).toBeNull();
      expect(await hits()).toBe(false);
      expect(await paletteHits()).toBe(false);
      expect((await service().rpc('bunkai_get_atc', { p_actor_user_id: f.qaUserId, p_atc_id: b.atcId })).error?.code).toBe('P0002');
      expect((await service().rpc('bunkai_atc_usage', { p_actor_user_id: f.qaUserId, p_atc_id: b.atcId })).error?.code).toBe('P0002');

      expect((await restore(b.atcId)).error).toBeNull();
      expect(await hits()).toBe(true);
      expect(await paletteHits()).toBe(true);
    });

    it('archiving one ATC leaves its siblings alone', async () => {
      const b = await seedBranch(need().projectId);
      const sibling = await seedBranch(need().projectId, b.moduleId);
      expect((await archive(b.atcId)).error).toBeNull();
      expect((await atcRow(sibling.atcId)).archived_at).toBeNull();
    });
  });

  describe('evidence reads keep an archived ATC', () => {
    it('a Test keeps the step, step count and order, and marks it as archived', async () => {
      const b = await seedBranch(need().projectId);
      const other = await seedBranch(need().projectId, b.moduleId);
      const testId = await seedTest([other.atcId, b.atcId]);
      expect((await archive(b.atcId)).error).toBeNull();

      const { data, error } = await service().rpc('bunkai_get_test_expanded', { p_actor_user_id: need().qaUserId, p_test_id: testId });
      expect(error).toBeNull();
      const test = data as { atc_count: number, atcs: { id: string, position: number, archived_at: string | null, steps: unknown[] }[] };
      expect(test.atc_count).toBe(2);
      expect(test.atcs.map(a => a.id)).toEqual([other.atcId, b.atcId]);
      expect(test.atcs[0].archived_at).toBeNull();
      expect(test.atcs[1].archived_at).not.toBeNull();
      expect(test.atcs[1].steps).toHaveLength(1);
    });

    it('a Test that chains an archived ATC can still start a Run', async () => {
      const b = await seedBranch(need().projectId);
      const testId = await seedTest([b.atcId]);
      expect((await archive(b.atcId)).error).toBeNull();
      expect(await seedFinishedFailedRun(testId)).toBeTruthy();
    });

    it('a past Run renders every step and keeps its failing outcome', async () => {
      const b = await seedBranch(need().projectId);
      const testId = await seedTest([b.atcId]);
      const runId = await seedFinishedFailedRun(testId);
      const read = async () => {
        const { data, error } = await service().rpc('bunkai_run_json', { p_run_id: runId });
        if (error) { throw new Error(error.message); }
        return data as { status: string, atcs: { atc_id: string, atc_title: string, status: string, steps: { content: string, status: string }[] }[] };
      };
      const before = await read();

      expect((await archive(b.atcId)).error).toBeNull();
      const after = await read();
      expect(after).toEqual(before);
      expect(after.status).toBe('failed');
      expect(after.atcs[0].atc_title).toBe(b.title);
      expect(after.atcs[0].status).toBe('failed');
      expect(after.atcs[0].steps[0].content).toContain('step of');
      expect(after.atcs[0].steps[0].status).toBe('failed');
    });

    it('a Defect keeps resolving the ATC and Run it was anchored to', async () => {
      const f = need();
      const b = await seedBranch(f.projectId);
      const testId = await seedTest([b.atcId]);
      const runId = await seedFinishedFailedRun(testId);
      const bug = must(await service().from('bugs').insert({
        workspace_id: f.workspaceId,
        project_id: f.projectId,
        module_id: b.moduleId,
        title: `${PREFIX} defect`,
        severity: 'P2',
        run_id: runId,
        atc_id: b.atcId,
        created_by: f.qaUserId,
      }).select('id').single(), 'bug');
      expect((await archive(b.atcId)).error).toBeNull();

      const { data, error } = await service().rpc('bunkai_bug_json', { p_bug_id: bug.id });
      expect(error).toBeNull();
      const origin = (data as { origin: { run_id: string, atc_id: string, atc_title: string } }).origin;
      expect(origin.run_id).toBe(runId);
      expect(origin.atc_id).toBe(b.atcId);
      expect(origin.atc_title).toBe(b.title);
    });

    it('traceability keeps the ATC, Test and Run as evidence and marks it archived', async () => {
      const b = await seedBranch(need().projectId);
      const testId = await seedTest([b.atcId]);
      await seedFinishedFailedRun(testId);
      expect((await archive(b.atcId)).error).toBeNull();

      const { data, error } = await service().rpc('bunkai_report_story_traceability', {
        p_actor_user_id: need().qaUserId,
        p_user_story_id: b.storyId,
      });
      expect(error).toBeNull();
      const criterion = (data as { criteria: { id: string, atcs: { id: string, archived_at: string | null, test: { id: string } | null, latest_run: { run_id: string } | null }[] }[] }).criteria[0];
      expect(criterion.id).toBe(b.acId);
      expect(criterion.atcs).toHaveLength(1);
      expect(criterion.atcs[0].id).toBe(b.atcId);
      expect(criterion.atcs[0].archived_at).not.toBeNull();
      expect(criterion.atcs[0].test?.id).toBe(testId);
      expect(criterion.atcs[0].latest_run).not.toBeNull();
    });

    it('project and workspace coverage do not report the criterion as uncovered', async () => {
      const f = need();
      const b = await seedBranch(f.projectId);

      const noCoverage = async () => {
        const { data, error } = await service().rpc('bunkai_report_project_coverage', { p_actor_user_id: f.qaUserId, p_project_id: f.projectId });
        if (error) { throw new Error(error.message); }
        return (data as { no_coverage: { ac_id: string }[] }).no_coverage.map(r => r.ac_id);
      };
      const workspaceBound = async () => {
        const { data, error } = await service().rpc('bunkai_report_workspace_coverage', { p_actor_user_id: f.qaUserId, p_workspace_id: f.workspaceId });
        if (error) { throw new Error(error.message); }
        return (data as { kpis: { ac_bound: number } }).kpis.ac_bound;
      };

      const boundBefore = await workspaceBound();
      expect((await archive(b.atcId)).error).toBeNull();
      expect(await noCoverage()).not.toContain(b.acId);
      expect(await workspaceBound()).toBe(boundBefore);
    });

    it('an archived ATC that never ran does not hold the criterion at not_run', async () => {
      const f = need();
      const db = service();
      const passed = await seedBranch(f.projectId);
      const unrun = must(await db.from('atcs').insert({
        project_id: f.projectId,
        module_id: passed.moduleId,
        user_story_id: passed.storyId,
        slug: `${PREFIX}-unrun-${++counter}`,
        title: `${PREFIX} unrun atc`,
        layer: 'UI',
      }).select('id').single(), 'atc');
      must(await db.from('atc_acceptance_criteria').insert({ atc_id: unrun.id, acceptance_criterion_id: passed.acId }).select('atc_id').single(), 'binding');
      const testId = await seedTest([passed.atcId]);
      const runId = await seedFinishedFailedRun(testId);
      must(await db.from('run_atcs').update({ status: 'passed' }).eq('run_id', runId).select('id'), 'run_atcs passed');

      const moduleState = async () => {
        const { data, error } = await db.rpc('bunkai_report_project_coverage', { p_actor_user_id: f.qaUserId, p_project_id: f.projectId });
        if (error) { throw new Error(error.message); }
        return (data as { modules: { module_id: string, status: string }[] }).modules.find(m => m.module_id === passed.moduleId)?.status;
      };

      expect(await moduleState()).toBe('not_run');
      expect((await archive(unrun.id as string)).error).toBeNull();
      expect(await moduleState()).toBe('fully_covered');
    });

    it('a criterion whose only ATC is archived and never ran reads not_run, not uncovered', async () => {
      const f = need();
      const b = await seedBranch(f.projectId);
      expect((await archive(b.atcId)).error).toBeNull();
      const { data, error } = await service().rpc('bunkai_report_project_coverage', { p_actor_user_id: f.qaUserId, p_project_id: f.projectId });
      expect(error).toBeNull();
      const report = data as { modules: { module_id: string, status: string }[], no_coverage: { ac_id: string }[] };
      expect(report.modules.find(m => m.module_id === b.moduleId)?.status).toBe('not_run');
      expect(report.no_coverage.map(r => r.ac_id)).not.toContain(b.acId);
    });

    it('an ATC archived with a descendant Module does not count as coverage', async () => {
      const f = need();
      const db = service();
      const parentPath = `p${++counter}`;
      const parent = must(await db.from('modules').insert({ project_id: f.projectId, path: parentPath, name: parentPath }).select('id').single(), 'parent module');
      const child = must(await db.from('modules').insert({ project_id: f.projectId, path: `${parentPath}/c`, name: 'c', parent_module_id: parent.id }).select('id').single(), 'child module');
      const story = must(await db.from('user_stories').insert({ module_id: parent.id, title: `${PREFIX} parent story` }).select('id').single(), 'story');
      const ac = must(await db.from('acceptance_criteria').insert({ user_story_id: story.id, title: `${PREFIX} parent ac`, position: 1 }).select('id').single(), 'criterion');
      const atc = must(await db.from('atcs').insert({
        project_id: f.projectId,
        module_id: child.id,
        user_story_id: story.id,
        slug: `${PREFIX}-child-${counter}`,
        title: `${PREFIX} child atc`,
        layer: 'UI',
      }).select('id').single(), 'atc');
      must(await db.from('atc_acceptance_criteria').insert({ atc_id: atc.id, acceptance_criterion_id: ac.id }).select('atc_id').single(), 'binding');

      const { error: archiveError } = await qa.rpc('bunkai_archive_module_subtree', { p_module_id: child.id });
      expect(archiveError).toBeNull();

      const { data, error } = await db.rpc('bunkai_report_project_coverage', { p_actor_user_id: f.qaUserId, p_project_id: f.projectId });
      expect(error).toBeNull();
      expect((data as { no_coverage: { ac_id: string }[] }).no_coverage.map(r => r.ac_id)).toContain(ac.id as string);
    });
  });

  describe('restore under an archived parent', () => {
    it('own archive, then Module archived: restore hands the ATC to the Module and it stays hidden', async () => {
      const f = need();
      const b = await seedBranch(f.projectId);
      expect((await archive(b.atcId)).error).toBeNull();
      const ownAt = (await atcRow(b.atcId)).archived_at;

      const { error: moduleError } = await qa.rpc('bunkai_archive_module_subtree', { p_module_id: b.moduleId });
      expect(moduleError).toBeNull();
      const moduleRow = must(await service().from('modules').select('archived_at').eq('id', b.moduleId).single(), 'module read');
      // The cascade only touches live rows: the own archive keeps its stamp.
      expect((await atcRow(b.atcId)).archived_at).toBe(ownAt);

      const { data, error } = await restore(b.atcId);
      expect(error).toBeNull();
      const result = data as ArchiveResult;
      expect(result.changed).toBe(true);
      expect(result.held_by_parent).toBe('module');

      const row = await atcRow(b.atcId);
      expect(row.archived_at).toBe(moduleRow.archived_at as string);
      expect(row.archived_by).toBeNull();
      expect(await eventCount(b.atcId, 'atc.restored')).toBe(1);
      expect((await service().rpc('bunkai_get_atc', { p_actor_user_id: f.qaUserId, p_atc_id: b.atcId })).error?.code).toBe('P0002');

      const again = await restore(b.atcId);
      expect(again.error).toBeNull();
      expect((again.data as ArchiveResult).changed).toBe(false);
      expect(await eventCount(b.atcId, 'atc.restored')).toBe(1);
    });

    it('own archive, then User Story archived: the nearest parent holds it', async () => {
      const b = await seedBranch(need().projectId);
      expect((await archive(b.atcId)).error).toBeNull();
      const { error: storyError } = await qa.rpc('bunkai_archive_user_story', { p_story_id: b.storyId });
      expect(storyError).toBeNull();
      const storyRow = must(await service().from('user_stories').select('archived_at').eq('id', b.storyId).single(), 'story read');

      const { data, error } = await restore(b.atcId);
      expect(error).toBeNull();
      const result = data as ArchiveResult;
      expect(result.changed).toBe(true);
      expect(result.held_by_parent).toBe('user_story');
      expect((await atcRow(b.atcId)).archived_at).toBe(storyRow.archived_at as string);
    });

    it('archived only by the cascade: restore has nothing to undo', async () => {
      const b = await seedBranch(need().projectId);
      const { error: moduleError } = await qa.rpc('bunkai_archive_module_subtree', { p_module_id: b.moduleId });
      expect(moduleError).toBeNull();
      const before = await atcRow(b.atcId);
      expect(before.archived_at).not.toBeNull();
      expect(before.archived_by).toBeNull();

      const { data, error } = await restore(b.atcId);
      expect(error).toBeNull();
      expect((data as ArchiveResult).changed).toBe(false);
      expect((data as ArchiveResult).held_by_parent).toBe('module');
      expect((await atcRow(b.atcId)).archived_at).toBe(before.archived_at);
      expect(await eventCount(b.atcId, 'atc.restored')).toBe(0);
    });
  });
});
