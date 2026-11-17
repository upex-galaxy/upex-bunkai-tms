import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

// BK-596: rename, archive and restore one Test, against the real database
// (migration 0134). A mocked rpc proves nothing about a DEFINER function
// (ADR-0012).
//
// What it proves:
//   * the writers: state, idempotency under concurrency, one event per real
//     change, nothing cascaded (chain, Runs and plan memberships untouched);
//   * rename: the create rules, the no-op, a case-only change, a stale version;
//   * authorization: session direct call, session table writes, stranger, viewer;
//   * the frozen state: reorder, tags, plan add, both Run writers, session chain
//     writes answer 45127 test_archived, and work again after restore;
//   * the split read paths: offer reads hide the Test, report reads keep it;
//   * atomicity: a failure before the event leaves nothing behind (AC-11).
//
// Fixtures live in throwaway workspaces named with PREFIX and are deleted in
// afterAll, which fails the suite if any remains. The file is SKIPPED, with a
// loud warning, only when there is no database environment or the database
// answers that bunkai_archive_test does not exist (0134 not applied). Every
// other problem FAILS the suite.

setDefaultTimeout(30_000);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const TAG = '[test-archive-isolation]';
const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn(`${TAG} SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran.`);
}

let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc('bunkai_archive_test', { p_actor_user_id: ABSENT_UUID, p_test_id: ABSENT_UUID });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`${TAG} SKIPPED ENTIRELY: bunkai_archive_test is not deployed (${code}). Apply migration 0134_test_archive_restore.sql. No assertion in this file ran.`);
  }
  else {
    throw new Error(`${TAG} unexpected answer from the deploy probe (${code}: ${probe.error?.message ?? 'no message'}).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;
const PREFIX = `bk596-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const { mintPat } = await import('@lib/api/pat');

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${TAG} fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
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
  environmentId: string
  environmentName: string
  tokenId: string
}

interface TestJson {
  id: string
  title: string
  version: number
  tags: string[]
  archived_at: string | null
  archived_by: string | null
  run_count: number
  plans: { id: string, name: string }[]
  atcs: { step_id: string, id: string }[]
  changed?: boolean
}

interface ArchiveResult { id: string, title: string, archived_at: string | null, archived_by: string | null, changed: boolean }

let fixture: Fixture | null = null;
let qa: SupabaseClient;
let counter = 0;
const tokenIds: string[] = [];

function need(): Fixture {
  if (!fixture) {
    throw new Error(`${TAG} the fixture was not seeded (see the beforeAll failure above); refusing to pass.`);
  }
  return fixture;
}

async function seedAtc(projectId: string): Promise<string> {
  counter += 1;
  const db = service();
  const label = `n${counter}`;
  const mod = must(await db.from('modules').insert({ project_id: projectId, path: `m${counter}`, name: `m${counter}` }).select('id').single(), 'module');
  const story = must(await db.from('user_stories').insert({ module_id: mod.id, title: `${PREFIX} ${label}` }).select('id').single(), 'story');
  const ac = must(await db.from('acceptance_criteria').insert({ user_story_id: story.id, title: `${PREFIX} ${label} ac`, position: 1 }).select('id').single(), 'criterion');
  const atc = must(await db.from('atcs').insert({
    project_id: projectId,
    module_id: mod.id,
    user_story_id: story.id,
    slug: `${PREFIX}-${label}`,
    title: `${PREFIX} ${label} atc`,
    layer: 'UI',
  }).select('id').single(), 'atc');
  must(await db.from('atc_steps').insert({ atc_id: atc.id, position: 1, content: `step of ${label}`, expected: 'it works' }).select('id').single(), 'atc step');
  must(await db.from('atc_acceptance_criteria').insert({ atc_id: atc.id, acceptance_criterion_id: ac.id }).select('atc_id').single(), 'binding');
  return atc.id as string;
}

async function seedTest(atcIds: string[], opts: { workspaceId?: string, title?: string, tags?: string[] } = {}): Promise<{ id: string, title: string }> {
  counter += 1;
  const title = opts.title ?? `${PREFIX} quokka${counter} test`;
  const db = service();
  const workspaceId = opts.workspaceId ?? need().workspaceId;
  // A stranger / viewer fixture cannot go through the writer, so seed directly.
  if (workspaceId !== need().workspaceId) {
    const t = must(await db.from('tests').insert({ workspace_id: workspaceId, title, created_by: need().qaUserId, tags: opts.tags ?? [] }).select('id').single(), 'test');
    for (const [i, atcId] of atcIds.entries()) {
      must(await db.from('test_steps').insert({ test_id: t.id, atc_id: atcId, position: i + 1 }).select('id').single(), 'test step');
    }
    return { id: t.id as string, title };
  }
  const { data, error } = await db.rpc('bunkai_create_test', {
    p_actor_user_id: need().qaUserId,
    p_workspace_id: workspaceId,
    p_title: title,
    p_atc_ids: atcIds,
  });
  if (error) { throw new Error(`${TAG} test seed failed: ${error.message}`); }
  const id = (data as { id: string }).id;
  if (opts.tags) {
    const tagged = await db.rpc('bunkai_set_test_tags', { p_actor_user_id: need().qaUserId, p_test_id: id, p_if_match: null, p_tags: opts.tags });
    if (tagged.error) { throw new Error(`${TAG} tag seed failed: ${tagged.error.message}`); }
  }
  return { id, title };
}

async function newTest(opts: { tags?: string[], title?: string } = {}) {
  return seedTest([await seedAtc(need().projectId)], opts);
}

const archive = async (testId: string, actor?: string) =>
  service().rpc('bunkai_archive_test', { p_actor_user_id: actor ?? need().qaUserId, p_test_id: testId });
const restore = async (testId: string, actor?: string) =>
  service().rpc('bunkai_restore_test', { p_actor_user_id: actor ?? need().qaUserId, p_test_id: testId });
const rename = async (testId: string, title: string, ifMatch: number | null = null, actor?: string) =>
  service().rpc('bunkai_rename_test', { p_actor_user_id: actor ?? need().qaUserId, p_test_id: testId, p_title: title, p_if_match: ifMatch });

async function testRow(testId: string) {
  return must(await service().from('tests').select('title, version, tags, archived_at, archived_by').eq('id', testId).single(), 'test read');
}

async function eventCount(testId: string, action: string): Promise<number> {
  const { count, error } = await service()
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', testId)
    .eq('action', action);
  if (error) { throw new Error(error.message); }
  return count ?? 0;
}

async function startRun(testId: string, token?: string) {
  counter += 1;
  return service().rpc('bunkai_create_run', {
    p_actor_user_id: need().qaUserId,
    p_test_id: testId,
    p_environment_id: need().environmentId,
    p_executor_mode: 'human',
    p_start_token: token ?? `${PREFIX}-run-${counter}`,
  });
}

async function runCount(testId: string): Promise<number> {
  const { count, error } = await service().from('runs').select('id', { count: 'exact', head: true }).eq('test_id', testId);
  if (error) { throw new Error(error.message); }
  return count ?? 0;
}

async function newPlan(): Promise<string> {
  const f = need();
  counter += 1;
  return must(await service().from('test_plans').insert({
    workspace_id: f.workspaceId,
    project_id: f.projectId,
    name: `${PREFIX} plan ${counter}`,
    status: 'open',
    created_by: f.qaUserId,
  }).select('id').single(), 'plan').id as string;
}

describeOrSkip('BK-596: rename, archive and restore a Test', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error(`${TAG} QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present.`);
    }
    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.user) {
      throw new Error(`${TAG} QA_E2E login failed (${signInError?.message ?? 'no user returned'}).`);
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
    const environmentName = 'staging';
    const environment = must(await db.from('project_environments').insert({ project_id: project.id, name: environmentName }).select('id').single(), 'environment');

    const pat = await mintPat({ admin: db as never, userId: qaUserId, name: `${PREFIX} ci`, workspaceId: ws.id as string, scopes: ['run:execute'], expiresInDays: null });
    tokenIds.push(pat.id);

    fixture = {
      workspaceId: ws.id as string,
      viewerWorkspaceId: viewerWs.id as string,
      foreignWorkspaceId: foreignWs.id as string,
      qaUserId,
      projectId: project.id as string,
      viewerProjectId: viewerProject.id as string,
      foreignProjectId: foreignProject.id as string,
      environmentId: environment.id as string,
      environmentName,
      tokenId: pat.id,
    };
  });

  afterAll(async () => {
    const f = fixture;
    const db = service();
    for (const id of tokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
    if (f) {
      const workspaceIds = [f.workspaceId, f.viewerWorkspaceId, f.foreignWorkspaceId];
      const projectIds = [f.projectId, f.viewerProjectId, f.foreignProjectId];
      await db.from('bunkai_test_failpoints').delete().in('workspace_id', workspaceIds);
      await db.from('test_plans').delete().in('workspace_id', workspaceIds);
      await db.from('runs').delete().in('project_id', projectIds);
      await db.from('tests').delete().in('workspace_id', workspaceIds);
      await db.from('atcs').delete().in('project_id', projectIds);
      await db.from('projects').delete().in('id', projectIds);
      await db.from('activity_log').delete().in('workspace_id', workspaceIds);
      await db.from('workspace_members').delete().in('workspace_id', workspaceIds);
      await db.from('workspaces').delete().in('id', workspaceIds);
    }
    await qa?.auth.signOut();
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    if (count !== 0) {
      throw new Error(`${TAG} ${count} fixture workspace(s) survived the teardown.`);
    }
  });

  describe('rename', () => {
    it('renames, bumps the version, keeps chain and tags, and writes one event with both names', async () => {
      const t = await newTest({ tags: ['smoke'] });
      const before = await testRow(t.id);
      const { data, error } = await rename(t.id, `${t.title}, card payment`, before.version as number);
      expect(error).toBeNull();
      const json = data as TestJson;
      expect(json.changed).toBe(true);
      expect(json.title).toBe(`${t.title}, card payment`);
      expect(json.version).toBe((before.version as number) + 1);
      expect(json.tags).toEqual(['smoke']);
      expect(json.atcs).toHaveLength(1);

      const events = must(await service().from('activity_log').select('payload').eq('entity_id', t.id).eq('action', 'test.renamed'), 'events');
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({ old_title: t.title, new_title: `${t.title}, card payment` });
    });

    it('refuses a blank or over-long title with 45121 and changes nothing', async () => {
      const t = await newTest();
      for (const bad of ['', '   ', 'x'.repeat(201)]) {
        expect((await rename(t.id, bad)).error?.code).toBe('45121');
      }
      const row = await testRow(t.id);
      expect(row.title).toBe(t.title);
      expect(await eventCount(t.id, 'test.renamed')).toBe(0);
    });

    it('accepts 200 multi-byte characters (length counts characters, not bytes)', async () => {
      const t = await newTest();
      const { error } = await rename(t.id, 'é'.repeat(200));
      expect(error).toBeNull();
      expect((await testRow(t.id)).title).toBe('é'.repeat(200));
    });

    it('treats the same name after trimming as a no-op, and a case-only change as a rename', async () => {
      const t = await newTest();
      const v = (await testRow(t.id)).version as number;
      const same = await rename(t.id, `  ${t.title}  `);
      expect(same.error).toBeNull();
      expect((same.data as TestJson).changed).toBe(false);
      expect((await testRow(t.id)).version).toBe(v);
      expect(await eventCount(t.id, 'test.renamed')).toBe(0);

      const upper = await rename(t.id, t.title.toUpperCase());
      expect((upper.data as TestJson).changed).toBe(true);
      expect(await eventCount(t.id, 'test.renamed')).toBe(1);
    });

    it('refuses a stale version with 45125 naming the current one', async () => {
      const t = await newTest();
      const v = (await testRow(t.id)).version as number;
      const { error } = await rename(t.id, 'other name', v - 1);
      expect(error?.code).toBe('45125');
      expect(error?.message).toContain(`version_conflict:${v}`);
      expect((await testRow(t.id)).title).toBe(t.title);
    });

    it('a past Run keeps the name it started under', async () => {
      const t = await newTest();
      const run = await startRun(t.id);
      expect(run.error).toBeNull();
      expect((await rename(t.id, 'renamed later')).error).toBeNull();
      const row = must(await service().from('runs').select('test_title').eq('id', (run.data as { id: string }).id).single(), 'run read');
      expect(row.test_title).toBe(t.title);
    });
  });

  describe('archive and restore', () => {
    it('archives, records who and when, writes one event, and edits nothing else', async () => {
      const t = await newTest({ tags: ['checkout'] });
      expect((await startRun(t.id)).error).toBeNull();
      // The plan writer is session-bound (auth.uid()); seed the membership directly.
      const plan = await newPlan();
      must(await service().from('test_plan_tests').insert({ test_plan_id: plan, test_id: t.id, added_by: need().qaUserId }).select('id').single(), 'member');
      const stepsBefore = must(await service().from('test_steps').select('id, position').eq('test_id', t.id).order('position'), 'steps');

      const { data, error } = await archive(t.id);
      expect(error).toBeNull();
      const result = data as ArchiveResult;
      expect(result.changed).toBe(true);
      expect(result.title).toBe(t.title);
      const row = await testRow(t.id);
      expect(row.archived_at).not.toBeNull();
      expect(row.archived_by).toBe(need().qaUserId);
      expect(row.tags).toEqual(['checkout']);
      expect(await eventCount(t.id, 'test.archived')).toBe(1);

      expect(must(await service().from('test_steps').select('id, position').eq('test_id', t.id).order('position'), 'steps')).toEqual(stepsBefore);
      expect(await runCount(t.id)).toBe(1);
      expect(must(await service().from('test_plan_tests').select('id').eq('test_id', t.id), 'members')).toHaveLength(1);
    });

    it('the expanded read keeps resolving it, with the Run count and the holding plans', async () => {
      const t = await newTest();
      expect((await startRun(t.id)).error).toBeNull();
      const plan = await newPlan();
      must(await service().from('test_plan_tests').insert({ test_plan_id: plan, test_id: t.id, added_by: need().qaUserId }).select('id').single(), 'member');
      expect((await archive(t.id)).error).toBeNull();

      const { data, error } = await service().rpc('bunkai_get_test_expanded', { p_actor_user_id: need().qaUserId, p_test_id: t.id });
      expect(error).toBeNull();
      const json = data as TestJson;
      expect(json.archived_at).not.toBeNull();
      expect(json.archived_by).toBe(need().qaUserId);
      expect(json.run_count).toBe(1);
      expect(json.plans.map(p => p.id)).toEqual([plan]);
      expect(json.atcs).toHaveLength(1);
    });

    it('a repeated archive reports success and keeps the first actor and timestamp', async () => {
      const t = await newTest();
      expect((await archive(t.id)).error).toBeNull();
      const first = await testRow(t.id);
      const again = await archive(t.id);
      expect(again.error).toBeNull();
      expect((again.data as ArchiveResult).changed).toBe(false);
      expect(await testRow(t.id)).toEqual(first);
      expect(await eventCount(t.id, 'test.archived')).toBe(1);
    });

    it('restoring a live Test reports success, changes nothing and writes no event', async () => {
      const t = await newTest();
      const { data, error } = await restore(t.id);
      expect(error).toBeNull();
      expect((data as ArchiveResult).changed).toBe(false);
      expect(await eventCount(t.id, 'test.restored')).toBe(0);
    });

    it('two simultaneous archives both succeed and write exactly one event', async () => {
      const t = await newTest();
      const [a, b] = await Promise.all([archive(t.id), archive(t.id)]);
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect([(a.data as ArchiveResult).changed, (b.data as ArchiveResult).changed].sort()).toEqual([false, true]);
      expect(await eventCount(t.id, 'test.archived')).toBe(1);
    });

    it('restores to full use: same chain, same tags, same Runs, its own event', async () => {
      const t = await newTest({ tags: ['smoke'] });
      expect((await startRun(t.id)).error).toBeNull();
      expect((await archive(t.id)).error).toBeNull();
      const { data, error } = await restore(t.id);
      expect(error).toBeNull();
      expect((data as ArchiveResult).changed).toBe(true);
      const row = await testRow(t.id);
      expect(row.archived_at).toBeNull();
      expect(row.archived_by).toBeNull();
      expect(row.tags).toEqual(['smoke']);
      expect(await runCount(t.id)).toBe(1);
      expect(await eventCount(t.id, 'test.restored')).toBe(1);
      expect((await startRun(t.id)).error).toBeNull();
      expect((await rename(t.id, 'back in use')).error).toBeNull();
    });

    it('restores a Test whose chained ATC was archived meanwhile', async () => {
      const atcId = await seedAtc(need().projectId);
      const t = await seedTest([atcId]);
      expect((await archive(t.id)).error).toBeNull();
      expect((await service().rpc('bunkai_archive_atc', { p_actor_user_id: need().qaUserId, p_atc_id: atcId })).error).toBeNull();
      expect((await restore(t.id)).error).toBeNull();
      expect((await testRow(t.id)).archived_at).toBeNull();
      const atc = must(await service().from('atcs').select('archived_at').eq('id', atcId).single(), 'atc');
      expect(atc.archived_at).not.toBeNull();
    });

    it('rolls the archive back when a step before the event fails, and a retry works', async () => {
      const f = need();
      const db = service();
      const t = await newTest();
      must(await db.from('bunkai_test_failpoints').insert({ name: 'test_archive.before_event', workspace_id: f.workspaceId }).select('name'), 'arm failpoint');
      try {
        const { error } = await archive(t.id);
        expect(error?.code).toBe('P0001');
        expect((await testRow(t.id)).archived_at).toBeNull();
        expect(await eventCount(t.id, 'test.archived')).toBe(0);
      }
      finally {
        await db.from('bunkai_test_failpoints').delete().eq('name', 'test_archive.before_event').eq('workspace_id', f.workspaceId);
      }
      expect((await archive(t.id)).error).toBeNull();
      expect((await testRow(t.id)).archived_at).not.toBeNull();
    });

    it('rolls the restore back when a step before the event fails', async () => {
      const f = need();
      const db = service();
      const t = await newTest();
      expect((await archive(t.id)).error).toBeNull();
      must(await db.from('bunkai_test_failpoints').insert({ name: 'test_restore.before_event', workspace_id: f.workspaceId }).select('name'), 'arm failpoint');
      try {
        expect((await restore(t.id)).error?.code).toBe('P0001');
        expect((await testRow(t.id)).archived_at).not.toBeNull();
        expect(await eventCount(t.id, 'test.restored')).toBe(0);
      }
      finally {
        await db.from('bunkai_test_failpoints').delete().eq('name', 'test_restore.before_event').eq('workspace_id', f.workspaceId);
      }
    });

    it('shows rename, archive and restore in the Activity Stream, in order, naming the Test and actor', async () => {
      const f = need();
      const t = await newTest();
      expect((await rename(t.id, `${t.title} v2`)).error).toBeNull();
      expect((await archive(t.id)).error).toBeNull();
      expect((await restore(t.id)).error).toBeNull();
      const { data, error } = await qa.rpc('bunkai_list_activity', { p_workspace_id: f.workspaceId, p_limit: 50 });
      expect(error).toBeNull();
      const items = (data as { items: { action: string, entity_id: string, actor_user_id: string, payload: Record<string, unknown> }[] }).items.filter(i => i.entity_id === t.id && i.action !== 'test.created');
      expect(items.map(i => i.action)).toEqual(['test.restored', 'test.archived', 'test.renamed']);
      expect(items[2].payload).toEqual({ old_title: t.title, new_title: `${t.title} v2` });
      expect(items[1].payload).toEqual({ title: `${t.title} v2` });
      for (const item of items) {
        expect(item.actor_user_id).toBe(f.qaUserId);
      }
    });
  });

  describe('authorization', () => {
    it('a signed-in session cannot reach the writers directly', async () => {
      const t = await newTest();
      for (const [fn, args] of [
        ['bunkai_archive_test', { p_actor_user_id: need().qaUserId, p_test_id: t.id }],
        ['bunkai_restore_test', { p_actor_user_id: need().qaUserId, p_test_id: t.id }],
        ['bunkai_rename_test', { p_actor_user_id: need().qaUserId, p_test_id: t.id, p_title: 'x', p_if_match: null }],
      ] as const) {
        const { error } = await qa.rpc(fn, args);
        expect(error?.code).toBe('42501');
      }
      expect(await testRow(t.id)).toMatchObject({ title: t.title, archived_at: null });
    });

    it('a signed-in writer cannot set the archive columns through the table grant', async () => {
      const t = await newTest();
      const set = await qa.from('tests').update({ archived_at: new Date().toISOString() }).eq('id', t.id);
      expect(set.error?.code).toBe('42501');
      const forged = await qa.from('tests').update({ archived_by: need().qaUserId }).eq('id', t.id);
      expect(forged.error?.code).toBe('42501');
      expect((await testRow(t.id)).archived_at).toBeNull();
      // A live Test keeps its existing grant.
      expect((await qa.from('tests').update({ tags: ['still-writable'] }).eq('id', t.id)).error).toBeNull();
    });

    it('a signed-in writer cannot change an archived Test or its chain through the table grants', async () => {
      const t = await newTest();
      expect((await archive(t.id)).error).toBeNull();
      expect((await qa.from('tests').update({ title: 'sneaky' }).eq('id', t.id)).error?.code).toBe('45127');
      const step = must(await service().from('test_steps').select('id').eq('test_id', t.id).single(), 'step');
      expect((await qa.from('test_steps').update({ position: 9 }).eq('id', step.id)).error?.code).toBe('45127');
      expect((await qa.from('test_steps').insert({ test_id: t.id, atc_id: await seedAtc(need().projectId), position: 2 })).error?.code).toBe('45127');
      expect((await testRow(t.id)).title).toBe(t.title);
    });

    it('refuses a stranger with 42501 and changes nothing', async () => {
      const f = need();
      const t = await seedTest([await seedAtc(f.foreignProjectId)], { workspaceId: f.foreignWorkspaceId });
      expect((await archive(t.id)).error?.code).toBe('42501');
      expect((await rename(t.id, 'x')).error?.code).toBe('42501');
      expect(await testRow(t.id)).toMatchObject({ title: t.title, archived_at: null });
    });

    it('refuses a viewer: rename, archive and restore', async () => {
      const f = need();
      const t = await seedTest([await seedAtc(f.viewerProjectId)], { workspaceId: f.viewerWorkspaceId });
      expect((await archive(t.id)).error?.code).toBe('42501');
      expect((await rename(t.id, 'x')).error?.code).toBe('42501');
      await service().from('tests').update({ archived_at: new Date().toISOString() }).eq('id', t.id);
      expect((await restore(t.id)).error?.code).toBe('42501');
      expect((await testRow(t.id)).archived_at).not.toBeNull();
    });

    it('a stranger cannot read an archived Test, and the answer matches a missing one', async () => {
      const f = need();
      const t = await seedTest([await seedAtc(f.foreignProjectId)], { workspaceId: f.foreignWorkspaceId });
      const live = await service().rpc('bunkai_get_test_expanded', { p_actor_user_id: f.qaUserId, p_test_id: t.id });
      await service().from('tests').update({ archived_at: new Date().toISOString() }).eq('id', t.id);
      const archived = await service().rpc('bunkai_get_test_expanded', { p_actor_user_id: f.qaUserId, p_test_id: t.id });
      expect(live.error?.code).toBeDefined();
      expect(archived.error?.code).toBe(live.error!.code);
      expect(archived.data).toBeNull();
    });

    it('answers P0002 for an id that does not exist', async () => {
      expect((await archive(ABSENT_UUID)).error?.code).toBe('P0002');
      expect((await restore(ABSENT_UUID)).error?.code).toBe('P0002');
      expect((await rename(ABSENT_UUID, 'x')).error?.code).toBe('P0002');
    });
  });

  describe('the frozen state', () => {
    it('rename, reorder and tags answer 45127 test_archived, and work again after restore', async () => {
      const t = await seedTest([await seedAtc(need().projectId), await seedAtc(need().projectId)]);
      const steps = must(await service().from('test_steps').select('id').eq('test_id', t.id).order('position'), 'steps').map(s => s.id as string);
      expect((await archive(t.id)).error).toBeNull();
      const v = (await testRow(t.id)).version;

      expect((await rename(t.id, 'frozen')).error?.code).toBe('45127');
      const reorder = await service().rpc('bunkai_reorder_test_steps', { p_actor_user_id: need().qaUserId, p_test_id: t.id, p_if_match: null, p_step_ids: [...steps].reverse() });
      expect(reorder.error?.code).toBe('45127');
      const tags = await service().rpc('bunkai_set_test_tags', { p_actor_user_id: need().qaUserId, p_test_id: t.id, p_if_match: null, p_tags: ['smoke'] });
      expect(tags.error?.code).toBe('45127');
      expect((await testRow(t.id)).version).toBe(v);
      expect(await eventCount(t.id, 'test.reordered')).toBe(0);

      expect((await restore(t.id)).error).toBeNull();
      expect((await service().rpc('bunkai_reorder_test_steps', { p_actor_user_id: need().qaUserId, p_test_id: t.id, p_if_match: null, p_step_ids: [...steps].reverse() })).error).toBeNull();
    });

    it('a stranger gets 42501, not the archived state, from the frozen writers', async () => {
      const f = need();
      const t = await seedTest([await seedAtc(f.foreignProjectId)], { workspaceId: f.foreignWorkspaceId });
      await service().from('tests').update({ archived_at: new Date().toISOString() }).eq('id', t.id);
      expect((await rename(t.id, 'x')).error?.code).toBe('42501');
      const tags = await service().rpc('bunkai_set_test_tags', { p_actor_user_id: f.qaUserId, p_test_id: t.id, p_if_match: null, p_tags: [] });
      expect(tags.error?.code).toBe('42501');
    });

    it('both Run writers refuse an archived Test and create no Run', async () => {
      const f = need();
      const t = await newTest();
      expect((await archive(t.id)).error).toBeNull();
      expect((await startRun(t.id)).error?.code).toBe('45127');
      const submitted = await service().rpc('bunkai_submit_automated_run', {
        p_actor_user_id: f.qaUserId,
        p_token_id: f.tokenId,
        p_test_id: t.id,
        p_environment_name: f.environmentName,
        p_verdict: 'passed',
        p_duration_seconds: 12,
        p_steps: [{ position: 1, result: 'pass' }],
        p_evidence_urls: [],
        p_idempotency_key: null,
      });
      expect(submitted.error?.code).toBe('45127');
      expect(await runCount(t.id)).toBe(0);
    });

    it('a replayed start token returns the Run it created before the archive', async () => {
      const t = await newTest();
      const token = `${PREFIX}-replay`;
      const first = await startRun(t.id, token);
      expect(first.error).toBeNull();
      expect((await archive(t.id)).error).toBeNull();
      const replay = await startRun(t.id, token);
      expect(replay.error).toBeNull();
      expect((replay.data as { id: string, replayed: boolean }).id).toBe((first.data as { id: string }).id);
      expect((replay.data as { replayed: boolean }).replayed).toBe(true);
      expect(await runCount(t.id)).toBe(1);
    });

    it('a Run in progress at archive time can still finish', async () => {
      const t = await newTest();
      const run = await startRun(t.id);
      expect(run.error).toBeNull();
      expect((await archive(t.id)).error).toBeNull();
      const finished = await service().rpc('bunkai_finish_run', { p_actor_user_id: need().qaUserId, p_run_id: (run.data as { id: string }).id, p_verdict: 'passed', p_via: 'cookie' });
      expect(finished.error).toBeNull();
    });
  });

  describe('offer reads hide an archived Test', () => {
    it('tag filter, ATC usage, plan picker and workspace search drop it, and take it back on restore', async () => {
      const f = need();
      const tag = `zz${Date.now().toString(36)}`;
      const atcId = await seedAtc(f.projectId);
      const siblings = [];
      for (let i = 0; i < 3; i += 1) {
        siblings.push(await seedTest([atcId], { tags: [tag], title: `${PREFIX} wombat sibling ${i}` }));
      }
      const target = await seedTest([atcId], { tags: [tag], title: `${PREFIX} wombat target` });

      const filter = async () => ((await service().rpc('bunkai_filter_tests_by_tag', { p_actor_user_id: f.qaUserId, p_tag: tag, p_limit: 50 })).data as { items: { id: string }[] }).items.map(i => i.id);
      const usage = async () => (await service().rpc('bunkai_atc_usage', { p_actor_user_id: f.qaUserId, p_atc_id: atcId })).data as { count: number, archived_count: number, used_in: { test_id: string }[] };
      const picker = async () => ((await service().rpc('bunkai_search_tests', { p_actor_user_id: f.qaUserId, p_query: 'wombat', p_project_id: f.projectId, p_limit: 50 })).data as { id: string }[]).map(r => r.id);
      const search = async () => ((await qa.rpc('bunkai_search_workspace', { p_query: 'wombat', p_workspace_id: f.workspaceId, p_limit: 50 })).data as { results?: { entity_type: string, id: string }[] } | { entity_type: string, id: string }[]);
      const searchIds = async () => {
        const raw = await search();
        const rows = Array.isArray(raw) ? raw : (raw.results ?? []);
        return rows.filter(r => r.entity_type === 'test').map(r => r.id);
      };

      const filteredBefore = await filter();
      expect(filteredBefore).toContain(target.id);
      expect((await usage()).count).toBe(4);
      expect(await picker()).toContain(target.id);
      expect(await searchIds()).toContain(target.id);

      expect((await archive(target.id)).error).toBeNull();
      expect(await filter()).toEqual(filteredBefore.filter(id => id !== target.id));
      const u = await usage();
      expect(u.count).toBe(3);
      expect(u.archived_count).toBe(1);
      expect(u.used_in.map(r => r.test_id)).not.toContain(target.id);
      expect(await picker()).not.toContain(target.id);
      expect(await searchIds()).not.toContain(target.id);
      for (const s of siblings) {
        expect(await filter()).toContain(s.id);
      }

      expect((await restore(target.id)).error).toBeNull();
      expect(await filter()).toEqual(filteredBefore);
      expect((await usage()).count).toBe(4);
      expect(await searchIds()).toContain(target.id);
    });
  });

  describe('report reads keep an archived Test', () => {
    it('traceability keeps the Test and its latest Run as evidence, marked archived', async () => {
      const f = need();
      const atcId = await seedAtc(f.projectId);
      const t = await seedTest([atcId]);
      expect((await startRun(t.id)).error).toBeNull();
      expect((await archive(t.id)).error).toBeNull();
      const story = must(await service().from('atcs').select('user_story_id').eq('id', atcId).single(), 'story');
      const { data, error } = await service().rpc('bunkai_report_story_traceability', { p_actor_user_id: f.qaUserId, p_user_story_id: story.user_story_id });
      expect(error).toBeNull();
      const atc = (data as { criteria: { atcs: { id: string, test: { id: string, archived_at: string | null } | null, latest_run: unknown }[] }[] })
        .criteria
        .flatMap(c => c.atcs)
        .find(a => a.id === atcId)!;
      expect(atc.test?.id).toBe(t.id);
      expect(atc.test?.archived_at).not.toBeNull();
      expect(atc.latest_run).not.toBeNull();
    });

    it('an archived Test that never ran still covers its ATC, marked archived', async () => {
      const f = need();
      const atcId = await seedAtc(f.projectId);
      const t = await seedTest([atcId]);
      expect((await archive(t.id)).error).toBeNull();
      const story = must(await service().from('atcs').select('user_story_id').eq('id', atcId).single(), 'story');
      const { data } = await service().rpc('bunkai_report_story_traceability', { p_actor_user_id: f.qaUserId, p_user_story_id: story.user_story_id });
      const atc = (data as { criteria: { atcs: { id: string, test: { id: string, archived_at: string | null } | null, latest_run: unknown }[] }[] })
        .criteria
        .flatMap(c => c.atcs)
        .find(a => a.id === atcId)!;
      expect(atc.test?.id).toBe(t.id);
      expect(atc.test?.archived_at).not.toBeNull();
      expect(atc.latest_run).toBeNull();
    });

    it('run history keeps every Run of an archived Test', async () => {
      const f = need();
      const t = await newTest();
      expect((await startRun(t.id)).error).toBeNull();
      expect((await startRun(t.id)).error).toBeNull();
      expect((await archive(t.id)).error).toBeNull();
      const { data, error } = await service().rpc('bunkai_list_test_runs', { p_actor_user_id: f.qaUserId, p_test_id: t.id });
      expect(error).toBeNull();
      expect((data as { items: unknown[] }).items).toHaveLength(2);
    });
  });
});
