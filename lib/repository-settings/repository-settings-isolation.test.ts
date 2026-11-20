import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectAll } from '@lib/utils/select-all';
import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it, mock, setDefaultTimeout } from 'bun:test';
import { NextRequest } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const pgUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
const hasEnv = Boolean(url && serviceKey && anonKey && jwtSecret);
const describeOrSkip = hasEnv ? describe : describe.skip;

void mock.module('server-only', () => ({}));
const settingsRoute = await import('@app/api/v1/projects/[id]/repository-settings/route');
const { GET: reportRoute } = await import('@app/api/v1/projects/[id]/runs/report/route');
const { mintPat } = await import('@lib/api/pat');
const { mintUserJwt } = await import('@lib/api/user-jwt');

const PREFIX = `bk228-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const MIGRATION = join(import.meta.dir, '../../supabase/migrations/0138_project_repository_url.sql');
const TOUCHED = ['bunkai_report_project_runs', 'bunkai_set_project_repository_url', 'bunkai_list_project_branches'];
const REPORT_SIGNATURE = 'public.bunkai_report_project_runs(uuid,uuid,date,date,uuid,text[],text[],int,timestamptz,uuid,text)';
const WRITER_SIGNATURE = 'public.bunkai_set_project_repository_url(uuid,uuid,text)';

setDefaultTimeout(120_000);

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
type Db = ReturnType<typeof service>;
type Handler = (req: NextRequest, ctx: never) => Promise<Response>;

interface Envelope {
  repository_settings?: { repository_url: string | null }
  items?: { id: string, branch: string | null }[]
  totals?: { passed: number, failed: number }
  error?: { code: string, message: string, details?: { reason?: string } }
}

function functionBody(sql: string, name: string): string {
  const start = sql.lastIndexOf(`create or replace function public.${name}(`);
  const open = sql.indexOf('$$', start) + 2;
  return sql.slice(open, sql.indexOf('$$', open));
}

async function call(handler: Handler, method: 'GET' | 'PUT', path: string, token: string, body?: unknown) {
  const response = await handler(new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({}) } as never);
  return { status: response.status, json: JSON.parse(await response.text()) as Envelope };
}

async function userClient(userId: string) {
  const jwt = await mintUserJwt(userId, jwtSecret!);
  return createClient(url!, anonKey!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

let skipReason: string | null = null;
let workspaceId = '';
let adminUserId = '';
let projectId = '';
let siblingProjectId = '';
let testId = '';
const environmentIds: Record<string, string> = {};
const tokens: Record<'admin' | 'member' | 'viewer', string> = { admin: '', member: '', viewer: '' };
const userIds: Record<'member' | 'viewer' | 'outsider', string> = { member: '', viewer: '', outsider: '' };
const createdTokenIds: string[] = [];
const createdUserIds: string[] = [];
const runIds: Record<string, string> = {};

async function createUser(db: Db, label: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email: `${PREFIX}-${label}@bunkai.test`,
    password: `Bk228-${label}-Test!${Date.now()}`,
    email_confirm: true,
  });
  if (error || !data.user) { throw error ?? new Error('createUser failed'); }
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function mint(db: Db, userId: string, label: string, scopes: string[]): Promise<string> {
  const pat = await mintPat({ admin: db as never, userId, name: `${PREFIX}-${label}`, workspaceId, scopes: scopes as never, expiresInDays: null });
  createdTokenIds.push(pat.id);
  return pat.token;
}

async function insertRun(db: Db, key: string, args: { project: string, branch: string | null, status: 'passed' | 'failed', minutesAgo: number }) {
  const started = new Date(Date.now() - args.minutesAgo * 60_000);
  const { data, error } = await db.from('runs').insert({
    workspace_id: workspaceId,
    project_id: args.project,
    test_id: testId,
    test_title: `${PREFIX} branch filter`,
    environment_id: environmentIds[args.project],
    executor_mode: args.branch === null ? 'human' : 'ci',
    start_token: `${PREFIX}-${key}`,
    status: args.status,
    started_at: started.toISOString(),
    finished_at: new Date(started.getTime() + 1000).toISOString(),
    ci_branch: args.branch,
  }).select('id').single();
  if (error || !data) { throw error ?? new Error(`run ${key} failed`); }
  runIds[key] = data.id;
}

describeOrSkip('BK-228 — repository URL and branch filter (real database, real handlers)', () => {
  beforeAll(async () => {
    const db = service();
    const probe = await db.from('project_repository_settings').select('project_id').limit(1);
    if (probe.error) {
      skipReason = `project_repository_settings is missing (${probe.error.code ?? 'unknown'}). Apply migration 0138_project_repository_url.sql.`;
      console.warn(`[repository-settings-isolation] skipped: ${skipReason}`);
      return;
    }
    const members = await selectAll<{ user_id: string, workspace_id: string, role: string, status: string }>(
      ({ from, to }) => db.from('workspace_members').select('user_id, workspace_id, role, status').order('user_id').range(from, to),
    );
    const live = new Set((await selectAll<{ id: string }>(
      ({ from, to }) => db.from('workspaces').select('id').is('deleted_at', null).order('id').range(from, to),
    )).map(w => w.id));
    const admin = members.find(m => live.has(m.workspace_id) && m.status === 'active' && ['owner', 'admin'].includes(m.role));
    if (!admin) {
      skipReason = 'need a live workspace with an active owner or admin (seed state).';
      console.warn(`[repository-settings-isolation] skipped: ${skipReason}`);
      return;
    }
    workspaceId = admin.workspace_id;
    adminUserId = admin.user_id;

    for (const label of ['main', 'sibling'] as const) {
      const { data: project, error } = await db.from('projects')
        .insert({ workspace_id: workspaceId, name: `${PREFIX} ${label}`, slug: `${PREFIX}-${label}` })
        .select('id')
        .single();
      if (error || !project) { throw error ?? new Error('project seed failed'); }
      const { data: env, error: envError } = await db.from('project_environments')
        .insert({ project_id: project.id, name: 'ci' })
        .select('id')
        .single();
      if (envError || !env) { throw envError ?? new Error('environment seed failed'); }
      environmentIds[project.id] = env.id;
      if (label === 'main') { projectId = project.id; }
      else { siblingProjectId = project.id; }
    }

    const { data: test, error: testError } = await db.from('tests')
      .insert({ workspace_id: workspaceId, title: `${PREFIX} branch filter`, created_by: adminUserId })
      .select('id')
      .single();
    if (testError || !test) { throw testError ?? new Error('test seed failed'); }
    testId = test.id;

    userIds.member = await createUser(db, 'member');
    userIds.viewer = await createUser(db, 'viewer');
    userIds.outsider = await createUser(db, 'outsider');
    const { error: memberError } = await db.from('workspace_members').insert([
      { workspace_id: workspaceId, user_id: userIds.member, role: 'member', status: 'active' },
      { workspace_id: workspaceId, user_id: userIds.viewer, role: 'viewer', status: 'active' },
    ]);
    if (memberError) { throw memberError; }

    tokens.admin = await mint(db, adminUserId, 'admin', ['atc:read', 'workspace:admin']);
    tokens.member = await mint(db, userIds.member, 'member', ['atc:read', 'workspace:admin']);
    tokens.viewer = await mint(db, userIds.viewer, 'viewer', ['atc:read', 'workspace:admin']);

    await insertRun(db, 'r1', { project: projectId, branch: 'main', status: 'passed', minutesAgo: 300 });
    await insertRun(db, 'r2', { project: projectId, branch: 'main', status: 'failed', minutesAgo: 290 });
    await insertRun(db, 'r3', { project: projectId, branch: 'feature/checkout-discounts', status: 'passed', minutesAgo: 280 });
    await insertRun(db, 'r4', { project: projectId, branch: null, status: 'passed', minutesAgo: 270 });
    await insertRun(db, 'upper', { project: projectId, branch: 'Main', status: 'passed', minutesAgo: 260 });
    for (let i = 0; i < 18; i++) {
      await insertRun(db, `b${i}`, { project: projectId, branch: `release/${String(i).padStart(2, '0')}`, status: 'passed', minutesAgo: 200 - i });
    }
    await insertRun(db, 'secret', { project: siblingProjectId, branch: 'secret/acme-launch', status: 'passed', minutesAgo: 1 });
  });

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    const ids = Object.values(runIds);
    if (ids.length > 0) {
      await db.from('activity_log').delete().in('entity_id', ids);
      await db.from('runs').delete().in('id', ids);
    }
    if (testId) { await db.from('tests').delete().eq('id', testId); }
    for (const id of [projectId, siblingProjectId].filter(Boolean)) {
      await db.from('activity_log').delete().eq('entity_id', id);
      await db.from('project_repository_settings').delete().eq('project_id', id);
      await db.from('project_environments').delete().eq('project_id', id);
      await db.from('projects').delete().eq('id', id);
    }
    for (const id of createdTokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
    for (const id of createdUserIds) {
      await db.from('workspace_members').delete().eq('user_id', id);
      await db.auth.admin.deleteUser(id);
    }
  });

  it('T1: every touched function is byte-identical to the migration file, one overload each, with the expected grants', async () => {
    if (skipReason || !pgUrl) { return; }
    const file = readFileSync(MIGRATION, 'utf8');
    const sql = new SQL(pgUrl);
    try {
      const rows: { proname: string, md5: string }[] = await sql`
        select p.proname, md5(p.prosrc) as md5
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ${sql(TOUCHED)}
      `;
      expect(rows.map(r => r.proname).sort()).toEqual([...TOUCHED].sort());
      for (const row of rows) {
        expect({ fn: row.proname, md5: row.md5 }).toEqual({
          fn: row.proname,
          md5: createHash('md5').update(functionBody(file, row.proname)).digest('hex'),
        });
      }
      const [grants] = await sql`
        select has_function_privilege('authenticated', ${WRITER_SIGNATURE}, 'EXECUTE') as writer_authenticated,
               has_function_privilege('anon', ${WRITER_SIGNATURE}, 'EXECUTE') as writer_anon,
               has_function_privilege('service_role', ${WRITER_SIGNATURE}, 'EXECUTE') as writer_service,
               has_function_privilege('anon', ${REPORT_SIGNATURE}, 'EXECUTE') as report_anon,
               has_function_privilege('authenticated', ${REPORT_SIGNATURE}, 'EXECUTE') as report_authenticated,
               has_function_privilege('authenticated', 'public.bunkai_list_project_branches(uuid)', 'EXECUTE') as branches_authenticated,
               has_function_privilege('anon', 'public.bunkai_list_project_branches(uuid)', 'EXECUTE') as branches_anon
      `;
      expect(grants).toEqual({
        writer_authenticated: false,
        writer_anon: false,
        writer_service: true,
        report_anon: false,
        report_authenticated: true,
        branches_authenticated: true,
        branches_anon: false,
      });
    }
    finally {
      await sql.end();
    }
  });

  it('5.2 + 5.5: an admin saves the URL normalized, then changes it, then clears it', async () => {
    if (skipReason) { return; }
    const path = `/api/v1/projects/${projectId}/repository-settings`;
    const saved = await call(settingsRoute.PUT as Handler, 'PUT', path, tokens.admin, { repository_url: 'https://github.com/acme/web-store/' });
    expect(saved.status).toBe(200);
    expect(saved.json.repository_settings?.repository_url).toBe('https://github.com/acme/web-store');

    const git = await call(settingsRoute.PUT as Handler, 'PUT', path, tokens.admin, { repository_url: 'https://gitlab.com/acme/platform/web-store.git' });
    expect(git.json.repository_settings?.repository_url).toBe('https://gitlab.com/acme/platform/web-store');

    const read = await call(settingsRoute.GET as Handler, 'GET', path, tokens.viewer);
    expect(read.status).toBe(200);
    expect(read.json.repository_settings?.repository_url).toBe('https://gitlab.com/acme/platform/web-store');

    const cleared = await call(settingsRoute.PUT as Handler, 'PUT', path, tokens.admin, { repository_url: null });
    expect(cleared.status).toBe(200);
    const after = await service().from('project_repository_settings').select('project_id').eq('project_id', projectId);
    expect(after.data).toEqual([]);
  });

  it('5.3: a member and a viewer are refused with 403 and the value stays unchanged', async () => {
    if (skipReason) { return; }
    const path = `/api/v1/projects/${projectId}/repository-settings`;
    await call(settingsRoute.PUT as Handler, 'PUT', path, tokens.admin, { repository_url: 'https://github.com/acme/web-store' });
    for (const token of [tokens.member, tokens.viewer]) {
      const refused = await call(settingsRoute.PUT as Handler, 'PUT', path, token, { repository_url: 'https://github.com/evil/fork' });
      expect(refused.status).toBe(403);
    }
    const stored = await service().from('project_repository_settings').select('repository_url').eq('project_id', projectId).single();
    expect(stored.data?.repository_url).toBe('https://github.com/acme/web-store');
  });

  it('5.4: invalid URLs are rejected with the supported hosts named', async () => {
    if (skipReason) { return; }
    const path = `/api/v1/projects/${projectId}/repository-settings`;
    for (const value of ['http://github.com/x/y', 'https://', 'https://bitbucket.org/acme/web-store', `https://gitlab.com/acme/${'a'.repeat(2050)}`]) {
      const rejected = await call(settingsRoute.PUT as Handler, 'PUT', path, tokens.admin, { repository_url: value });
      expect(rejected.status).toBe(422);
      expect(rejected.json.error?.message).toContain('GitHub');
      expect(rejected.json.error?.message).toContain('GitLab');
    }
  });

  it('ADR-0012: a signed-in session cannot call the writer, and the table refuses a direct write', async () => {
    if (skipReason) { return; }
    const client = await userClient(adminUserId);
    const rpc = await client.rpc('bunkai_set_project_repository_url', {
      p_actor_user_id: adminUserId,
      p_project_id: projectId,
      p_repository_url: 'https://github.com/evil/fork',
    });
    expect(rpc.error?.code).toBe('42501');
    await client.from('project_repository_settings').upsert({ project_id: projectId, repository_url: 'https://github.com/evil/fork' });
    const stored = await service().from('project_repository_settings').select('repository_url').eq('project_id', projectId).single();
    expect(stored.data?.repository_url).toBe('https://github.com/acme/web-store');
  });

  it('ADR-0012: the writer refuses a spoofed actor and a non-member as a missing Project', async () => {
    if (skipReason) { return; }
    const db = service();
    const outsider = await db.rpc('bunkai_set_project_repository_url', {
      p_actor_user_id: userIds.outsider,
      p_project_id: projectId,
      p_repository_url: 'https://github.com/evil/fork',
    });
    expect(outsider.error?.code).toBe('P0002');
    const member = await db.rpc('bunkai_set_project_repository_url', {
      p_actor_user_id: userIds.member,
      p_project_id: projectId,
      p_repository_url: 'https://github.com/evil/fork',
    });
    expect(member.error?.code).toBe('42501');
    const shape = await db.rpc('bunkai_set_project_repository_url', {
      p_actor_user_id: adminUserId,
      p_project_id: projectId,
      p_repository_url: 'https://github.com/acme/web-store.git',
    });
    expect(shape.error?.code).toBe('45241');
  });

  it('2.1 + 2.3: the branch filter lists only that branch, excludes runs without one, and totals follow it', async () => {
    if (skipReason) { return; }
    const branch = encodeURIComponent('feature/checkout-discounts');
    const report = await call(reportRoute as Handler, 'GET', `/api/v1/projects/${projectId}/runs/report?branch=${branch}`, tokens.viewer);
    expect(report.status).toBe(200);
    expect(report.json.items?.map(i => i.id)).toEqual([runIds.r3]);
    expect(report.json.totals).toMatchObject({ passed: 1, failed: 0 });
  });

  it('2.2 + 2.5: the filter composes with outcome and is exact and case-sensitive', async () => {
    if (skipReason) { return; }
    const main = await call(reportRoute as Handler, 'GET', `/api/v1/projects/${projectId}/runs/report?branch=main`, tokens.viewer);
    expect(main.json.items?.map(i => i.id).sort()).toEqual([runIds.r1, runIds.r2].sort());
    const failed = await call(reportRoute as Handler, 'GET', `/api/v1/projects/${projectId}/runs/report?branch=main&status=failed`, tokens.viewer);
    expect(failed.json.items?.map(i => i.id)).toEqual([runIds.r2]);
    const upper = await call(reportRoute as Handler, 'GET', `/api/v1/projects/${projectId}/runs/report?branch=Main`, tokens.viewer);
    expect(upper.json.items?.map(i => i.id)).toEqual([runIds.upper]);
    const none = await call(reportRoute as Handler, 'GET', `/api/v1/projects/${projectId}/runs/report?branch=${encodeURIComponent('release/9.9')}`, tokens.viewer);
    expect(none.status).toBe(200);
    expect(none.json.items).toEqual([]);
    const tooLong = await call(reportRoute as Handler, 'GET', `/api/v1/projects/${projectId}/runs/report?branch=${'a'.repeat(256)}`, tokens.viewer);
    expect(tooLong.status).toBe(422);
  });

  it('2.6: suggestions are the 20 most recent branches of this Project only, read with the user session', async () => {
    if (skipReason) { return; }
    const viewer = await userClient(userIds.viewer);
    const { data, error } = await viewer.rpc('bunkai_list_project_branches', { p_project_id: projectId });
    expect(error).toBeNull();
    const branches = data as string[];
    expect(branches).toHaveLength(20);
    expect(branches[0]).toBe('release/17');
    expect(branches).toContain('Main');
    expect(branches).toContain('feature/checkout-discounts');
    expect(branches).not.toContain('main');
    expect(branches).not.toContain('release/9.9');
    expect(branches).not.toContain('secret/acme-launch');

    const outsider = await userClient(userIds.outsider);
    const foreign = await outsider.rpc('bunkai_list_project_branches', { p_project_id: siblingProjectId });
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
  });
});
