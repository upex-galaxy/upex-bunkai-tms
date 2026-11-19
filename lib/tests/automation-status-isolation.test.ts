import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, setDefaultTimeout } from 'bun:test';

// BK-227: the automation status writer, reader and append-only history, against
// the real database (migration 0135). A mocked rpc proves nothing about a
// DEFINER function (ADR-0012). Skipped, with a loud warning, only when there is
// no database environment or bunkai_set_test_automation_status is not deployed;
// every other problem fails the suite.

setDefaultTimeout(30_000);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const TAG = '[automation-status-isolation]';
const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn(`${TAG} SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran.`);
}

let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc('bunkai_set_test_automation_status', { p_actor_user_id: ABSENT_UUID, p_test_id: ABSENT_UUID, p_status: 'automated' });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`${TAG} SKIPPED ENTIRELY: bunkai_set_test_automation_status is not deployed (${code}). Apply migration 0135_test_automation_status_history.sql. No assertion in this file ran.`);
  }
  else {
    throw new Error(`${TAG} unexpected answer from the deploy probe (${code}: ${probe.error?.message ?? 'no message'}).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;
const PREFIX = `bk227-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type Status = 'manual-only' | 'candidate' | 'automated';

interface Entry {
  id: string
  from_status: Status
  to_status: Status
  actor_user_id: string | null
  actor_name: string
  changed_at: string
}

interface SetResult { test_id: string, automation_status: Status, changed: boolean, entry: Entry | null }
interface ReadResult { test_id: string, automation_status: Status, history: Entry[] }

interface Fixture {
  workspaceId: string
  roleWorkspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  roleProjectId: string
  foreignProjectId: string
  environmentId: string
}

let fixture: Fixture | null = null;
let qa: SupabaseClient;
let counter = 0;

function service(): SupabaseClient {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${TAG} fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

function need(): Fixture {
  if (!fixture) {
    throw new Error(`${TAG} the fixture was not seeded (see the beforeAll failure above); refusing to pass.`);
  }
  return fixture;
}

async function seedAtc(projectId: string): Promise<string> {
  counter += 1;
  const db = service();
  const mod = must(await db.from('modules').insert({ project_id: projectId, path: `m${counter}`, name: `m${counter}` }).select('id').single(), 'module');
  const story = must(await db.from('user_stories').insert({ module_id: mod.id, title: `${PREFIX} s${counter}` }).select('id').single(), 'story');
  const atc = must(await db.from('atcs').insert({
    project_id: projectId,
    module_id: mod.id,
    user_story_id: story.id,
    slug: `${PREFIX}-a${counter}`,
    title: `${PREFIX} a${counter}`,
    layer: 'UI',
  }).select('id').single(), 'atc');
  must(await db.from('atc_steps').insert({ atc_id: atc.id, position: 1, content: 'step', expected: 'it works' }).select('id').single(), 'atc step');
  return atc.id as string;
}

async function newTest(opts: { workspaceId?: string, projectId?: string, tags?: string[] } = {}): Promise<string> {
  counter += 1;
  const f = need();
  const workspaceId = opts.workspaceId ?? f.workspaceId;
  const atcId = await seedAtc(opts.projectId ?? f.projectId);
  const db = service();
  const t = must(await db.from('tests').insert({ workspace_id: workspaceId, title: `${PREFIX} t${counter}`, created_by: f.qaUserId, tags: opts.tags ?? [] }).select('id').single(), 'test');
  must(await db.from('test_steps').insert({ test_id: t.id, atc_id: atcId, position: 1 }).select('id').single(), 'test step');
  return t.id as string;
}

const setStatus = async (testId: string, status: string, actor?: string) =>
  service().rpc('bunkai_set_test_automation_status', { p_actor_user_id: actor ?? need().qaUserId, p_test_id: testId, p_status: status });

const readStatus = async (testId: string, client?: SupabaseClient, actor?: string) =>
  (client ?? service()).rpc('bunkai_get_test_automation_status', { p_actor_user_id: actor ?? need().qaUserId, p_test_id: testId });

async function current(testId: string): Promise<ReadResult> {
  const { data, error } = await readStatus(testId);
  if (error) { throw new Error(`${TAG} read failed: ${error.message}`); }
  return data as ReadResult;
}

async function setRole(role: 'viewer' | 'member' | 'admin' | 'owner') {
  const f = need();
  const { error } = await service().from('workspace_members').update({ role }).eq('workspace_id', f.roleWorkspaceId).eq('user_id', f.qaUserId);
  if (error) { throw new Error(`${TAG} role change failed: ${error.message}`); }
}

describeOrSkip('BK-227: automation status of a Test', () => {
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
    const roleWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-role`, name: `${PREFIX} role`, owner_user_id: qaUserId }).select('id').single(), 'role workspace');
    must(await db.from('workspace_members').insert({ workspace_id: roleWs.id, user_id: qaUserId, role: 'member', status: 'active' }).select('user_id').single(), 'role membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId }).select('id').single(), 'foreign workspace');

    const project = must(await db.from('projects').insert({ workspace_id: ws.id, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const roleProject = must(await db.from('projects').insert({ workspace_id: roleWs.id, slug: `${PREFIX}-r`, name: `${PREFIX} role project` }).select('id').single(), 'role project');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWs.id, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');
    const environment = must(await db.from('project_environments').insert({ project_id: project.id, name: 'staging' }).select('id').single(), 'environment');

    fixture = {
      workspaceId: ws.id as string,
      roleWorkspaceId: roleWs.id as string,
      foreignWorkspaceId: foreignWs.id as string,
      qaUserId,
      projectId: project.id as string,
      roleProjectId: roleProject.id as string,
      foreignProjectId: foreignProject.id as string,
      environmentId: environment.id as string,
    };
  });

  afterAll(async () => {
    const f = fixture;
    const db = service();
    if (f) {
      const workspaceIds = [f.workspaceId, f.roleWorkspaceId, f.foreignWorkspaceId];
      const projectIds = [f.projectId, f.roleProjectId, f.foreignProjectId];
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
    if (f) {
      const { count: left } = await db.from('test_automation_status_history').select('id', { count: 'exact', head: true }).in('workspace_id', [f.workspaceId, f.roleWorkspaceId, f.foreignWorkspaceId]);
      if (left !== 0) {
        throw new Error(`${TAG} ${left} history row(s) survived the teardown.`);
      }
    }
  });

  describe('default and transitions', () => {
    it('starts every Test as Manual-only with an empty history', async () => {
      const id = await newTest();
      const read = await current(id);
      expect(read.automation_status).toBe('manual-only');
      expect(read.history).toEqual([]);
    });

    it('accepts all six directed transitions, one entry each with the right from and to', async () => {
      const id = await newTest();
      const path: Status[] = ['candidate', 'automated', 'manual-only', 'automated', 'candidate', 'manual-only'];
      let from: Status = 'manual-only';
      for (const to of path) {
        const { data, error } = await setStatus(id, to);
        expect(error).toBeNull();
        const result = data as SetResult;
        expect(result.changed).toBe(true);
        expect(result.automation_status).toBe(to);
        expect(result.entry).toMatchObject({ from_status: from, to_status: to, actor_user_id: need().qaUserId });
        from = to;
      }
      const read = await current(id);
      expect(read.automation_status).toBe('manual-only');
      expect(read.history).toHaveLength(6);
      const pairs = read.history.map(h => `${h.from_status}>${h.to_status}`);
      expect(pairs).toEqual([
        'candidate>manual-only',
        'automated>candidate',
        'manual-only>automated',
        'automated>manual-only',
        'candidate>automated',
        'manual-only>candidate',
      ]);
      expect(new Set(pairs).size).toBe(6);
    });

    it('records the author name and keeps earlier entries unchanged after a further change', async () => {
      const id = await newTest();
      expect((await setStatus(id, 'candidate')).error).toBeNull();
      const first = (await current(id)).history;
      expect(first[0].actor_name.length).toBeGreaterThan(0);
      expect((await setStatus(id, 'automated')).error).toBeNull();
      const second = (await current(id)).history;
      expect(second).toHaveLength(2);
      expect(second[1]).toEqual(first[0]);
    });

    it('writes nothing when the current status is selected again', async () => {
      const id = await newTest();
      expect((await setStatus(id, 'automated')).error).toBeNull();
      const before = must(await service().from('tests').select('version, updated_at').eq('id', id).single(), 'test row');
      const { data, error } = await setStatus(id, 'automated');
      expect(error).toBeNull();
      expect((data as SetResult).changed).toBe(false);
      expect((data as SetResult).entry).toBeNull();
      expect((await current(id)).history).toHaveLength(1);
      const after = must(await service().from('tests').select('version, updated_at').eq('id', id).single(), 'test row');
      expect(after).toEqual(before);
    });

    it('rejects a value outside the three with 45128 and changes nothing', async () => {
      const id = await newTest();
      for (const bad of ['in-progress', 'Automated', 'manual_only', '']) {
        expect((await setStatus(id, bad)).error?.code).toBe('45128');
      }
      const read = await current(id);
      expect(read.automation_status).toBe('manual-only');
      expect(read.history).toEqual([]);
    });

    it('does not bump the Test version, so the tag and chain locks never conflict on a status change', async () => {
      const id = await newTest({ tags: ['regression'] });
      const before = must(await service().from('tests').select('version, tags').eq('id', id).single(), 'test row');
      expect((await setStatus(id, 'candidate')).error).toBeNull();
      const after = must(await service().from('tests').select('version, tags').eq('id', id).single(), 'test row');
      expect(after.version).toBe(before.version);
      expect(after.tags).toEqual(['regression']);
    });
  });

  describe('concurrency and order', () => {
    it('serializes two simultaneous changes: two entries, the second from equals the first to', async () => {
      const id = await newTest();
      const results = await Promise.all([setStatus(id, 'candidate'), setStatus(id, 'automated')]);
      for (const r of results) {
        expect(r.error).toBeNull();
      }
      const read = await current(id);
      expect(read.history).toHaveLength(2);
      const [newest, oldest] = read.history;
      expect(oldest.from_status).toBe('manual-only');
      expect(newest.from_status).toBe(oldest.to_status);
      expect(read.automation_status).toBe(newest.to_status);
    });

    it('orders entries newest first, ties broken by write order', async () => {
      const id = await newTest();
      for (const s of ['candidate', 'automated', 'candidate'] as Status[]) {
        expect((await setStatus(id, s)).error).toBeNull();
      }
      const history = (await current(id)).history;
      const times = history.map(h => Date.parse(h.changed_at));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(history.map(h => h.to_status)).toEqual(['candidate', 'automated', 'candidate']);
    });
  });

  describe('roles', () => {
    it('lets member, admin and owner change the status, and refuses a viewer with 42501', async () => {
      const f = need();
      const id = await newTest({ workspaceId: f.roleWorkspaceId, projectId: f.roleProjectId });
      try {
        await setRole('member');
        expect((await setStatus(id, 'candidate')).error).toBeNull();
        await setRole('admin');
        expect((await setStatus(id, 'automated')).error).toBeNull();
        await setRole('owner');
        expect((await setStatus(id, 'manual-only')).error).toBeNull();
        await setRole('viewer');
        expect((await setStatus(id, 'automated')).error?.code).toBe('42501');
        const read = await current(id);
        expect(read.automation_status).toBe('manual-only');
        expect(read.history).toHaveLength(3);
      }
      finally {
        await setRole('member');
      }
    });

    it('refuses a change once the member was downgraded to viewer mid-session', async () => {
      const f = need();
      const id = await newTest({ workspaceId: f.roleWorkspaceId, projectId: f.roleProjectId });
      try {
        await setRole('member');
        expect((await readStatus(id, qa)).error).toBeNull();
        await setRole('viewer');
        expect((await setStatus(id, 'automated')).error?.code).toBe('42501');
        expect((await readStatus(id, qa)).error).toBeNull();
        expect((await current(id)).history).toEqual([]);
      }
      finally {
        await setRole('member');
      }
    });

    it('lets a viewer read the status and history', async () => {
      const f = need();
      const id = await newTest({ workspaceId: f.roleWorkspaceId, projectId: f.roleProjectId });
      try {
        await setRole('member');
        expect((await setStatus(id, 'candidate')).error).toBeNull();
        await setRole('viewer');
        const { data, error } = await readStatus(id, qa);
        expect(error).toBeNull();
        expect((data as ReadResult).history).toHaveLength(1);
      }
      finally {
        await setRole('member');
      }
    });

    it('refuses a stranger (writer 42501 like its sibling writers, reader P0002), a missing Test and a spoofed actor', async () => {
      const f = need();
      const foreign = await newTest({ workspaceId: f.foreignWorkspaceId, projectId: f.foreignProjectId });
      expect((await setStatus(foreign, 'automated')).error?.code).toBe('42501');
      expect((await readStatus(foreign)).error?.code).toBe('P0002');
      expect((await setStatus(ABSENT_UUID, 'automated')).error?.code).toBe('P0002');
      expect((await readStatus(ABSENT_UUID)).error?.code).toBe('P0002');

      const own = await newTest();
      expect((await readStatus(own, qa, ABSENT_UUID)).error?.code).toBe('P0002');
      const row = must(await service().from('tests').select('automation_status').eq('id', foreign).single(), 'foreign row');
      expect(row.automation_status).toBe('manual-only');
    });
  });

  describe('the writer is the only path', () => {
    it('refuses a session calling the writer directly', async () => {
      const id = await newTest();
      const { error } = await qa.rpc('bunkai_set_test_automation_status', { p_actor_user_id: need().qaUserId, p_test_id: id, p_status: 'automated' });
      expect(error).not.toBeNull();
      expect((await current(id)).automation_status).toBe('manual-only');
    });

    it('refuses a direct update of automation_status from a session and from the service role', async () => {
      const id = await newTest();
      const bySession = await qa.from('tests').update({ automation_status: 'automated' }).eq('id', id).select('id');
      expect(bySession.error?.code).toBe('42501');
      const byService = await service().from('tests').update({ automation_status: 'automated' }).eq('id', id).select('id');
      expect(byService.error?.code).toBe('42501');
      const read = await current(id);
      expect(read.automation_status).toBe('manual-only');
      expect(read.history).toEqual([]);
    });

    it('still lets other columns of a Test be updated directly', async () => {
      const id = await newTest();
      const { error } = await service().from('tests').update({ title: `${PREFIX} renamed ${id}` }).eq('id', id);
      expect(error).toBeNull();
    });

    it('refuses a Test created with a non-default status', async () => {
      const f = need();
      const { error } = await service().from('tests').insert({ workspace_id: f.workspaceId, title: `${PREFIX} preset`, created_by: f.qaUserId, automation_status: 'automated' });
      expect(error?.code).toBe('42501');
    });
  });

  describe('history is append-only', () => {
    it('refuses insert, update and delete of history rows from a session and from the service role', async () => {
      const f = need();
      const id = await newTest();
      expect((await setStatus(id, 'candidate')).error).toBeNull();
      const entry = (await current(id)).history[0];

      for (const client of [qa, service()]) {
        const ins = await client.from('test_automation_status_history').insert({
          workspace_id: f.workspaceId,
          test_id: id,
          from_status: 'candidate',
          to_status: 'automated',
          actor_user_id: f.qaUserId,
          actor_name: 'forged',
        });
        expect(ins.error?.code).toBe('42501');
        const upd = await client.from('test_automation_status_history').update({ actor_name: 'edited' }).eq('id', entry.id);
        expect(upd.error?.code).toBe('42501');
        const del = await client.from('test_automation_status_history').delete().eq('id', entry.id);
        expect(del.error?.code).toBe('42501');
      }

      const after = (await current(id)).history;
      expect(after).toHaveLength(1);
      expect(after[0]).toEqual(entry);
    });

    it('lets a member read their workspace history rows directly, and nothing from a foreign workspace', async () => {
      const f = need();
      const own = await newTest();
      expect((await setStatus(own, 'candidate')).error).toBeNull();
      const { data, error } = await qa.from('test_automation_status_history').select('id, test_id, workspace_id').in('workspace_id', [f.workspaceId, f.foreignWorkspaceId]);
      expect(error).toBeNull();
      expect((data ?? []).every(r => r.workspace_id === f.workspaceId)).toBe(true);
      expect((data ?? []).some(r => r.test_id === own)).toBe(true);
    });

    it('keeps the author name on the entry when the author leaves the workspace', async () => {
      const f = need();
      const id = await newTest({ workspaceId: f.roleWorkspaceId, projectId: f.roleProjectId });
      try {
        await setRole('member');
        expect((await setStatus(id, 'candidate')).error).toBeNull();
        const before = must(await service().from('test_automation_status_history').select('id, actor_name').eq('test_id', id).single(), 'entry');
        const { error } = await service().from('workspace_members').update({ status: 'suspended' }).eq('workspace_id', f.roleWorkspaceId).eq('user_id', f.qaUserId);
        expect(error).toBeNull();
        const after = must(await service().from('test_automation_status_history').select('id, actor_name').eq('test_id', id).single(), 'entry');
        expect(after).toEqual(before);
      }
      finally {
        await service().from('workspace_members').update({ status: 'active', role: 'member' }).eq('workspace_id', f.roleWorkspaceId).eq('user_id', f.qaUserId);
      }
    });
  });

  describe('independence and the archive', () => {
    it('refuses a change on an archived Test with 45127 and keeps its history readable', async () => {
      const id = await newTest();
      expect((await setStatus(id, 'candidate')).error).toBeNull();
      expect((await service().rpc('bunkai_archive_test', { p_actor_user_id: need().qaUserId, p_test_id: id })).error).toBeNull();
      expect((await setStatus(id, 'automated')).error?.code).toBe('45127');
      const read = await current(id);
      expect(read.automation_status).toBe('candidate');
      expect(read.history).toHaveLength(1);
    });

    it('leaves the status untouched when tags change or a Run finishes', async () => {
      const f = need();
      const id = await newTest();
      const tagged = await service().rpc('bunkai_set_test_tags', { p_actor_user_id: f.qaUserId, p_test_id: id, p_if_match: null, p_tags: ['regression', 'smoke'] });
      expect(tagged.error).toBeNull();
      const run = await service().rpc('bunkai_create_run', {
        p_actor_user_id: f.qaUserId,
        p_test_id: id,
        p_environment_id: f.environmentId,
        p_executor_mode: 'human',
        p_start_token: `${PREFIX}-run-${id}`,
      });
      expect(run.error).toBeNull();
      const finished = await service().rpc('bunkai_finish_run', { p_actor_user_id: f.qaUserId, p_run_id: (run.data as { id: string }).id, p_verdict: 'passed', p_via: 'cookie' });
      expect(finished.error).toBeNull();
      const read = await current(id);
      expect(read.automation_status).toBe('manual-only');
      expect(read.history).toEqual([]);

      expect((await setStatus(id, 'automated')).error).toBeNull();
      const row = must(await service().from('tests').select('tags').eq('id', id).single(), 'test row');
      expect(row.tags).toEqual(['regression', 'smoke']);
    });
  });
});
