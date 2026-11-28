import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';

// Throwaway users and workspaces only: never the shared QA identity or its workspaces.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && anonKey && serviceKey);
const describeOrSkip = hasEnv ? describe : describe.skip;

type Jar = Map<string, string>;
type Db = SupabaseClient<Database>;
type Tables = Database['public']['Tables'];
let boundJar: Jar = new Map();
const deferred: Array<() => Promise<unknown>> = [];

function ssrClientFor(jar: Jar) {
  return createServerClient<Database>(url!, anonKey!, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value === '') { jar.delete(name); }
          else { jar.set(name, value); }
        }
      },
    },
  });
}

const nextServer = { ...(await import('next/server')) };
void mock.module('next/server', () => ({ ...nextServer, after: (task: () => Promise<unknown>) => { deferred.push(task); } }));
void mock.module('server-only', () => ({}));
void mock.module('@lib/supabase/server', () => ({
  createClient: async () => ssrClientFor(boundJar),
}));

const { NextRequest } = nextServer;
const { POST: requestExport } = await import('./workspaces/[id]/data-export/route');
const { GET: downloadExport } = await import('./workspaces/[id]/data-export/download/route');
const { PATCH: patchWorkspace } = await import('./workspaces/[id]/route');
const { markNotificationRead } = await import('./notifications/[id]/read/response');
const { markAllNotificationsRead } = await import('./workspaces/[id]/notifications/read-all/response');
const { beginIdempotentRequest, recordIdempotencyResult } = await import('@lib/api/idempotency');
const { EXPORT_STORAGE_BUCKET } = await import('@lib/workspace-export/constants');

const PREFIX = `bk2592-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = `Bk2592-${crypto.randomUUID()}`;
const userIds: string[] = [];
const workspaceIds: string[] = [];
const archivePaths: string[] = [];

interface Actor { id: string, jar: Jar, db: Db }

interface Fixture {
  workspaceId: string
  projectId: string
  moduleId: string
  atcId: string
  testId: string
  environmentId: string
  runId: string
  runAtcId: string
}

function service(): Db {
  return createClient<Database>(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function anon(): Db {
  return createClient<Database>(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function must<T>(result: { data: T, error: unknown }): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw result.error ?? new Error('Expected a row.');
  }
  return result.data;
}

async function newActor(label: string): Promise<Actor> {
  const email = `${PREFIX}-${label}@bunkai.test`;
  const { data, error } = await service().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) {
    throw error ?? new Error(`Failed to create the ${label} test user.`);
  }
  userIds.push(data.user.id);
  const jar: Jar = new Map();
  const signIn = await ssrClientFor(jar).auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error || !signIn.data.session) {
    throw signIn.error ?? new Error(`Failed to sign in the ${label} test user.`);
  }
  const db = createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signIn.data.session.access_token}` } },
  });
  return { id: data.user.id, jar, db };
}

async function newFixture(owner: Actor, member: Actor): Promise<Fixture> {
  const db = service();
  const workspace = must(await db.from('workspaces').insert({ slug: `${PREFIX}-ws`, name: `${PREFIX} ws`, owner_user_id: owner.id }).select('id').single());
  workspaceIds.push(workspace.id);
  must(await db.from('workspace_members').insert([
    { workspace_id: workspace.id, user_id: owner.id, role: 'owner', status: 'active' },
    { workspace_id: workspace.id, user_id: member.id, role: 'member', status: 'active' },
  ]).select('user_id'));
  const project = must(await db.from('projects').insert({ workspace_id: workspace.id, slug: 'guard', name: `${PREFIX} project` }).select('id').single());
  const mod = must(await db.from('modules').insert({ project_id: project.id, path: 'guard', name: 'Guard' }).select('id').single());
  const story = must(await db.from('user_stories').insert({ module_id: mod.id, project_id: project.id, title: `${PREFIX} story` }).select('id').single());
  const atc = must(await db.from('atcs').insert({ project_id: project.id, module_id: mod.id, user_story_id: story.id, slug: 'guard-atc', title: `${PREFIX} atc`, layer: 'UI' }).select('id').single());
  must(await db.from('atc_steps').insert({ atc_id: atc.id, position: 1, content: 'Open the page' }).select('id'));
  const test = must(await db.from('tests').insert({ workspace_id: workspace.id, title: `${PREFIX} test`, created_by: owner.id }).select('id').single());
  must(await db.from('test_steps').insert({ test_id: test.id, atc_id: atc.id, position: 1 }).select('id'));
  const environment = must(await db.from('project_environments').insert({ project_id: project.id, name: 'staging' }).select('id').single());
  const run = must(await db.from('runs').insert({
    workspace_id: workspace.id,
    project_id: project.id,
    test_id: test.id,
    environment_id: environment.id,
    status: 'running',
    executor_mode: 'human',
    executor_user_id: member.id,
    start_token: `${PREFIX}-seed`,
    test_title: `${PREFIX} test`,
  }).select('id').single());
  const runAtc = must(await db.from('run_atcs').insert({ run_id: run.id, atc_id: atc.id, position: 1, atc_title: `${PREFIX} atc` }).select('id').single());
  return {
    workspaceId: workspace.id,
    projectId: project.id,
    moduleId: mod.id,
    atcId: atc.id,
    testId: test.id,
    environmentId: environment.id,
    runId: run.id,
    runAtcId: runAtc.id,
  };
}

async function count(table: 'runs' | 'run_atcs' | 'run_steps' | 'bugs' | 'import_jobs' | 'workspace_exports' | 'notifications' | 'idempotency_keys', column: string, value: string): Promise<number> {
  const { count: n, error } = await service().from(table).select('id', { count: 'exact', head: true }).eq(column, value);
  if (error) {
    throw error;
  }
  return n ?? 0;
}

function routeRequest(path: string, method: string, body?: unknown): InstanceType<typeof NextRequest> {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function asActor(actor: Actor, request: InstanceType<typeof NextRequest>, handler: (request: InstanceType<typeof NextRequest>) => Promise<Response>): Promise<Response> {
  boundJar = actor.jar;
  return handler(request);
}

async function drainDeferred(): Promise<void> {
  while (deferred.length > 0) {
    await deferred.shift()!();
  }
}

describeOrSkip('BK-2592 client writes the data API refuses (database)', () => {
  let owner: Actor;
  let member: Actor;
  let fx: Fixture;

  beforeAll(async () => {
    owner = await newActor('owner');
    member = await newActor('member');
    fx = await newFixture(owner, member);
  }, 60_000);

  afterAll(async () => {
    if (!hasEnv) {
      return;
    }
    const db = service();
    const failures: string[] = [];
    if (archivePaths.length > 0) {
      const { error } = await db.storage.from(EXPORT_STORAGE_BUCKET).remove(archivePaths);
      if (error) {
        failures.push(`archives: ${error.message}`);
      }
    }
    const { data: extra } = await db.from('workspaces').select('id').like('slug', `${PREFIX}%`);
    const ids = [...new Set([...workspaceIds, ...(extra ?? []).map(w => w.id)])];
    if (ids.length > 0) {
      await db.from('runs').delete().in('workspace_id', ids);
      const { error } = await db.from('workspaces').delete().in('id', ids);
      if (error) {
        failures.push(`workspaces: ${error.message}`);
      }
    }
    for (const id of userIds) {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) {
        failures.push(`user ${id}: ${error.message}`);
      }
    }
    const { count: workspacesLeft } = await db.from('workspaces').select('id', { count: 'exact', head: true }).like('slug', `${PREFIX}%`);
    const { count: keysLeft } = await db.from('idempotency_keys').select('id', { count: 'exact', head: true }).in('user_id', userIds);
    let archivesLeft = 0;
    for (const path of archivePaths) {
      const [folder, name] = path.split('/');
      const { data } = await db.storage.from(EXPORT_STORAGE_BUCKET).list(folder, { search: name });
      archivesLeft += (data ?? []).filter(o => o.name === name).length;
    }
    let usersLeft = 0;
    for (const id of userIds) {
      const { data } = await db.auth.admin.getUserById(id);
      if (data?.user) {
        usersLeft += 1;
      }
    }
    console.log(`[bk2592] cleanup: ${userIds.length - usersLeft}/${userIds.length} users deleted, ${workspacesLeft ?? 'unknown'} workspaces, ${keysLeft ?? 'unknown'} idempotency keys and ${archivesLeft} archives left`);
    if (failures.length > 0 || usersLeft !== 0 || workspacesLeft !== 0 || keysLeft !== 0 || archivesLeft !== 0) {
      throw new Error(`BK-2592 cleanup left fixtures behind: ${failures.join('; ') || 'see the counts above'}`);
    }
  }, 90_000);

  describe('workspace_exports', () => {
    const serverColumns: Array<[string, () => Partial<Tables['workspace_exports']['Insert']>]> = [
      ['status', () => ({ status: 'completed' })],
      ['archive_path', () => ({ archive_path: `${fx.workspaceId}/${crypto.randomUUID()}.zip` })],
      ['archive_bytes', () => ({ archive_bytes: 1 })],
      ['expires_at', () => ({ expires_at: new Date(Date.now() + 86_400_000).toISOString() })],
      ['completed_at', () => ({ completed_at: new Date().toISOString() })],
      ['started_at', () => ({ started_at: new Date().toISOString() })],
      ['error_message', () => ({ error_message: 'set by the client' })],
      ['created_at', () => ({ created_at: new Date(Date.now() + 86_400_000).toISOString() })],
      ['id', () => ({ id: crypto.randomUUID() })],
    ];

    for (const [column, extra] of serverColumns) {
      it(`the owner cannot set ${column} when requesting an export`, async () => {
        const before = await count('workspace_exports', 'workspace_id', fx.workspaceId);
        const { error } = await owner.db.from('workspace_exports').insert({ workspace_id: fx.workspaceId, requested_by: owner.id, ...extra() }).select('id');
        expect(error?.code).toBe('42501');
        expect(await count('workspace_exports', 'workspace_id', fx.workspaceId)).toBe(before);
      }, 20_000);
    }

    it('a refused completed row never reaches the download', async () => {
      const { error } = await owner.db.from('workspace_exports').insert({
        workspace_id: fx.workspaceId,
        requested_by: owner.id,
        status: 'completed',
        archive_path: `${fx.workspaceId}/${crypto.randomUUID()}.zip`,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      }).select('id');
      expect(error?.code).toBe('42501');
      const resolved = await owner.db.rpc('bunkai_resolve_workspace_export_download', { p_workspace_id: fx.workspaceId });
      expect(resolved.error?.code).toBe('45801');
    }, 20_000);

    it('the owner cannot change or delete an export row', async () => {
      const row = must(await service().from('workspace_exports').insert({ workspace_id: fx.workspaceId, requested_by: owner.id, status: 'failed', error_message: 'seed' }).select('id, status').single());
      const updated = await owner.db.from('workspace_exports').update({ status: 'completed' }).eq('id', row.id).select('id');
      expect(updated.error?.code).toBe('42501');
      const deleted = await owner.db.from('workspace_exports').delete().eq('id', row.id).select('id');
      expect(deleted.error?.code).toBe('42501');
      expect(must(await service().from('workspace_exports').select('status').eq('id', row.id).single()).status).toBe('failed');
      must(await service().from('workspace_exports').delete().eq('id', row.id).select('id'));
    }, 20_000);

    it('the owner still requests, builds and downloads an export through the routes', async () => {
      const response = await asActor(owner, routeRequest(`/api/v1/workspaces/${fx.workspaceId}/data-export`, 'POST'), requestExport);
      expect(response.status).toBe(202);
      const { export_job_id: jobId, status } = await response.json() as { export_job_id: string, status: string };
      expect(status).toBe('queued');
      archivePaths.push(`${fx.workspaceId}/${jobId}.zip`);
      await drainDeferred();
      const stored = must(await service().from('workspace_exports').select('status, archive_path, expires_at').eq('id', jobId).single());
      expect(stored).toMatchObject({ status: 'completed', archive_path: `${fx.workspaceId}/${jobId}.zip` });
      const download = await asActor(owner, routeRequest(`/api/v1/workspaces/${fx.workspaceId}/data-export/download`, 'GET'), downloadExport);
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toBe('application/zip');
      expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }, 60_000);
  });

  describe('runs, run_atcs and run_steps', () => {
    it('a member cannot insert a run row directly', async () => {
      const before = await count('runs', 'workspace_id', fx.workspaceId);
      const { error } = await member.db.from('runs').insert({
        workspace_id: fx.workspaceId,
        project_id: fx.projectId,
        test_id: fx.testId,
        environment_id: fx.environmentId,
        status: 'passed',
        executor_mode: 'human',
        executor_user_id: owner.id,
        start_token: `${PREFIX}-direct`,
        test_title: 'direct',
        finished_at: new Date().toISOString(),
      }).select('id');
      expect(error?.code).toBe('42501');
      expect(await count('runs', 'workspace_id', fx.workspaceId)).toBe(before);
    }, 20_000);

    it('a member cannot insert a run ATC row directly', async () => {
      const before = await count('run_atcs', 'run_id', fx.runId);
      const { error } = await member.db.from('run_atcs').insert({ run_id: fx.runId, atc_id: fx.atcId, position: 2, atc_title: 'direct', status: 'passed' }).select('id');
      expect(error?.code).toBe('42501');
      expect(await count('run_atcs', 'run_id', fx.runId)).toBe(before);
    }, 20_000);

    it('a member cannot insert a run step row directly', async () => {
      const before = await count('run_steps', 'run_atc_id', fx.runAtcId);
      const { error } = await member.db.from('run_steps').insert({ run_atc_id: fx.runAtcId, position: 1, content: 'direct', status: 'passed', executed_at: new Date().toISOString() }).select('id');
      expect(error?.code).toBe('42501');
      expect(await count('run_steps', 'run_atc_id', fx.runAtcId)).toBe(before);
    }, 20_000);

    it('a member still starts, marks and finishes a run through the run functions', async () => {
      const started = await member.db.rpc('bunkai_create_run', {
        p_actor_user_id: member.id,
        p_test_id: fx.testId,
        p_environment_id: fx.environmentId,
        p_executor_mode: 'human',
        p_start_token: `${PREFIX}-flow`,
      });
      expect(started.error).toBeNull();
      const run = must(await service().from('runs').select('id').eq('test_id', fx.testId).eq('start_token', `${PREFIX}-flow`).single());
      const runAtc = must(await service().from('run_atcs').select('id').eq('run_id', run.id).single());
      const stepId = must(await service().from('run_steps').select('id').eq('run_atc_id', runAtc.id).single()).id;
      const marked = await member.db.rpc('bunkai_mark_run_step', {
        p_actor_user_id: member.id,
        p_run_id: run.id,
        p_run_step_id: stepId,
        p_status: 'passed',
        p_note: null as unknown as string,
        p_evidence_url: null as unknown as string,
      });
      expect(marked.error).toBeNull();
      const finished = await member.db.rpc('bunkai_finish_run', {
        p_actor_user_id: member.id,
        p_run_id: run.id,
        p_verdict: 'passed',
        p_via: 'cookie',
      });
      expect(finished.error).toBeNull();
      expect(must(await service().from('runs').select('status, executor_user_id').eq('id', run.id).single())).toMatchObject({ status: 'passed', executor_user_id: member.id });
      expect(must(await service().from('run_steps').select('status').eq('id', stepId).single()).status).toBe('passed');
    }, 30_000);
  });

  describe('bugs', () => {
    it('a member cannot insert a bug row directly', async () => {
      const before = await count('bugs', 'workspace_id', fx.workspaceId);
      const { error } = await member.db.from('bugs').insert({
        workspace_id: fx.workspaceId,
        project_id: fx.projectId,
        module_id: fx.moduleId,
        title: 'Direct insert',
        severity: 'P1',
        created_by: owner.id,
        sync_state: 'synced',
        external_issue_key: 'BK-1',
      }).select('id');
      expect(error?.code).toBe('42501');
      expect(await count('bugs', 'workspace_id', fx.workspaceId)).toBe(before);
    }, 20_000);

    it('a member still files a bug through the bug function', async () => {
      const created = await member.db.rpc('bunkai_create_bug', {
        p_actor_user_id: member.id,
        p_project_id: fx.projectId,
        p_module_id: fx.moduleId,
        p_title: `${PREFIX} filed bug`,
        p_severity: 'P3',
        p_description: null as unknown as string,
        p_steps_to_reproduce: '',
        p_evidence_urls: [],
        p_run_id: null as unknown as string,
        p_run_step_id: null as unknown as string,
        p_atc_id: null as unknown as string,
      });
      expect(created.error).toBeNull();
      const stored = must(await service().from('bugs').select('created_by, status').eq('workspace_id', fx.workspaceId).eq('title', `${PREFIX} filed bug`).single());
      expect(stored.created_by).toBe(member.id);
    }, 20_000);
  });

  describe('import_jobs', () => {
    const serverColumns: Array<[string, Partial<Tables['import_jobs']['Insert']>]> = [
      ['status', { status: 'completed' }],
      ['imported_count', { imported_count: 999 }],
      ['created_count', { created_count: 999 }],
      ['errors', { errors: [] }],
      ['completed_at', { completed_at: new Date().toISOString() }],
      ['next_page_token', { next_page_token: 'token' }],
    ];

    for (const [column, extra] of serverColumns) {
      it(`a member cannot set ${column} when enqueuing an import`, async () => {
        const before = await count('import_jobs', 'project_id', fx.projectId);
        const { error } = await member.db.from('import_jobs').insert({ workspace_id: fx.workspaceId, project_id: fx.projectId, jql: 'project = BK', ...extra }).select('id');
        expect(error?.code).toBe('42501');
        expect(await count('import_jobs', 'project_id', fx.projectId)).toBe(before);
      }, 20_000);
    }

    it('a member still enqueues an import with the columns the route sends, and the worker still updates it', async () => {
      const job = must(await member.db.from('import_jobs').insert({ workspace_id: fx.workspaceId, project_id: fx.projectId, jql: 'project = BK' }).select('id, status').single());
      expect(job.status).toBe('queued');
      must(await service().from('import_jobs').update({ status: 'completed', completed_at: new Date().toISOString(), imported_count: 0 }).eq('id', job.id).select('id'));
      expect(must(await service().from('import_jobs').select('status').eq('id', job.id).single()).status).toBe('completed');
    }, 20_000);
  });

  describe('notifications', () => {
    async function seedNotification(): Promise<string> {
      const row = must(await service().from('notifications').insert({
        workspace_id: fx.workspaceId,
        recipient_user_id: member.id,
        event_type: 'run_finished',
        entity_type: 'run',
        entity_id: fx.runId,
        payload: { title: 'seed' },
      }).select('id').single());
      return row.id;
    }

    async function readNotification(id: string) {
      return must(await service().from('notifications').select('workspace_id, recipient_user_id, event_type, entity_type, entity_id, payload, created_at, source_event_id, emailed_at, in_app_suppressed').eq('id', id).single());
    }

    const serverColumns: Array<[string, () => Tables['notifications']['Update']]> = [
      ['payload', () => ({ payload: { title: 'changed' } })],
      ['event_type', () => ({ event_type: 'bug_assigned' })],
      ['entity_id', () => ({ entity_id: crypto.randomUUID() })],
      ['emailed_at', () => ({ emailed_at: new Date().toISOString() })],
      ['source_event_id', () => ({ source_event_id: crypto.randomUUID() })],
      ['created_at', () => ({ created_at: new Date().toISOString() })],
      ['read_at together with payload', () => ({ read_at: new Date().toISOString(), payload: { title: 'changed' } })],
    ];

    for (const [column, change] of serverColumns) {
      it(`the recipient cannot change ${column} of their own notification`, async () => {
        const id = await seedNotification();
        const before = await readNotification(id);
        const { error } = await member.db.from('notifications').update(change()).eq('id', id).select('id');
        expect(error?.code).toBe('42501');
        expect(await readNotification(id)).toEqual(before);
      }, 20_000);
    }

    it('the recipient cannot insert or delete a notification', async () => {
      const id = await seedNotification();
      const inserted = await member.db.from('notifications').insert({ workspace_id: fx.workspaceId, recipient_user_id: member.id, event_type: 'run_finished', entity_type: 'run' }).select('id');
      expect(inserted.error?.code).toBe('42501');
      const deleted = await member.db.from('notifications').delete().eq('id', id).select('id');
      expect(deleted.error?.code).toBe('42501');
      expect(await count('notifications', 'id', id)).toBe(1);
    }, 20_000);

    it('the recipient still marks one notification and then all of them as read', async () => {
      const first = await seedNotification();
      const second = await seedNotification();
      const marked = await markNotificationRead(member.db, first);
      expect(marked.read_at).not.toBeNull();
      const all = await markAllNotificationsRead(member.db, { workspaceId: fx.workspaceId, recipientUserId: member.id });
      expect(all.updated_count).toBeGreaterThanOrEqual(1);
      const { data } = await service().from('notifications').select('id, read_at').in('id', [first, second]);
      expect((data ?? []).every(row => row.read_at !== null)).toBe(true);
    }, 20_000);
  });

  describe('idempotency_keys', () => {
    it('a user cannot insert an idempotency row for themselves', async () => {
      const { error } = await member.db.from('idempotency_keys').insert({
        user_id: member.id,
        endpoint: 'POST /api/v1/guard',
        key: `${PREFIX}-direct`,
        request_hash: 'hash',
        status: 'succeeded',
        response_snapshot: { forged: true },
        response_status: 200,
      }).select('id');
      expect(error?.code).toBe('42501');
      expect(await count('idempotency_keys', 'key', `${PREFIX}-direct`)).toBe(0);
    }, 20_000);

    it('a user cannot rewrite or delete their own stored response', async () => {
      const row = must(await service().from('idempotency_keys').insert({
        user_id: member.id,
        endpoint: 'POST /api/v1/guard',
        key: `${PREFIX}-stored`,
        request_hash: 'hash',
        status: 'succeeded',
        response_snapshot: { ok: true },
        response_status: 201,
      }).select('id').single());
      const updated = await member.db.from('idempotency_keys').update({ response_snapshot: { ok: false }, response_status: 200 }).eq('id', row.id).select('id');
      expect(updated.error?.code).toBe('42501');
      const deleted = await member.db.from('idempotency_keys').delete().eq('id', row.id).select('id');
      expect(deleted.error?.code).toBe('42501');
      const stored = must(await service().from('idempotency_keys').select('response_snapshot, response_status').eq('id', row.id).single());
      expect({ snapshot: stored.response_snapshot, status: stored.response_status }).toEqual({ snapshot: { ok: true }, status: 201 });
    }, 20_000);

    it('the idempotency middleware still stores and replays a response', async () => {
      const headers = new Headers({ 'idempotency-key': `${PREFIX}-replay` });
      const args = { headers, userId: member.id, endpoint: 'POST /api/v1/guard', workspaceId: fx.workspaceId, requestPayload: { a: 1 } };
      const first = await beginIdempotentRequest(args);
      expect(first.isReplay).toBe(false);
      await recordIdempotencyResult(first.token, { ok: true }, 201);
      const second = await beginIdempotentRequest(args);
      expect(second).toMatchObject({ isReplay: true, snapshot: { ok: true }, status: 201 });
    }, 20_000);
  });

  it('an anonymous caller cannot insert into any of these tables', async () => {
    const db = anon();
    const attempts = await Promise.all([
      db.from('workspace_exports').insert({ workspace_id: fx.workspaceId, requested_by: owner.id }).select('id'),
      db.from('runs').insert({ workspace_id: fx.workspaceId, project_id: fx.projectId, test_id: fx.testId, environment_id: fx.environmentId, executor_mode: 'human', start_token: `${PREFIX}-anon`, test_title: 'anon' }).select('id'),
      db.from('run_atcs').insert({ run_id: fx.runId, position: 3, atc_title: 'anon' }).select('id'),
      db.from('run_steps').insert({ run_atc_id: fx.runAtcId, position: 9, content: 'anon' }).select('id'),
      db.from('bugs').insert({ workspace_id: fx.workspaceId, project_id: fx.projectId, module_id: fx.moduleId, title: 'Anon bug', severity: 'P4' }).select('id'),
      db.from('import_jobs').insert({ workspace_id: fx.workspaceId, project_id: fx.projectId, jql: 'project = BK' }).select('id'),
      db.from('notifications').insert({ workspace_id: fx.workspaceId, recipient_user_id: member.id, event_type: 'run_finished', entity_type: 'run' }).select('id'),
      db.from('idempotency_keys').insert({ user_id: member.id, endpoint: 'POST /api/v1/guard', key: `${PREFIX}-anon`, request_hash: 'hash' }).select('id'),
    ]);
    expect(attempts.map(a => a.error?.code)).toEqual(Array.from({ length: 8 }, () => '42501'));
  }, 20_000);

  describe('workspaces.name', () => {
    async function readName(): Promise<string> {
      return must(await service().from('workspaces').select('name').eq('id', fx.workspaceId).single()).name;
    }

    for (const [label, name] of [['longer than 80 characters', 'x'.repeat(81)], ['blank', '   ']] as const) {
      it(`the owner cannot rename the workspace to a name that is ${label}`, async () => {
        const before = await readName();
        const { error } = await owner.db.from('workspaces').update({ name }).eq('id', fx.workspaceId).select('id');
        expect(error?.code).toBe('23514');
        expect(await readName()).toBe(before);
      }, 20_000);
    }

    it('the owner still renames the workspace to 80 characters through the route', async () => {
      const name = 'n'.repeat(80);
      const response = await asActor(owner, routeRequest(`/api/v1/workspaces/${fx.workspaceId}`, 'PATCH', { name }), patchWorkspace);
      expect(response.status).toBe(200);
      expect(await readName()).toBe(name);
    }, 20_000);
  });
});
