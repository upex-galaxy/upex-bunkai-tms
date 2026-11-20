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
const { POST: submitRoute } = await import('@app/api/v1/runs/submissions/route');
const { POST: startRoute } = await import('@app/api/v1/runs/route');
const { GET: runRoute } = await import('@app/api/v1/runs/[id]/route');
const { POST: markRoute } = await import('@app/api/v1/runs/[id]/steps/[stepId]/mark/route');
const { POST: finishRoute } = await import('@app/api/v1/runs/[id]/finish/route');
const { POST: abortRoute } = await import('@app/api/v1/runs/[id]/abort/route');
const { GET: compareRoute } = await import('@app/api/v1/runs/[id]/compare/route');
const { GET: historyRoute } = await import('@app/api/v1/tests/[id]/runs/route');
const { GET: reportRoute } = await import('@app/api/v1/projects/[id]/runs/report/route');
const { mintPat } = await import('@lib/api/pat');
const { mintUserJwt } = await import('@lib/api/user-jwt');

const PREFIX = `bk1995-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const WRITER_ROLES = new Set(['member', 'admin', 'owner']);
const MIGRATION = join(import.meta.dir, '../../supabase/migrations/0137_run_ci_context.sql');
const TOUCHED = [
  'bunkai_run_json',
  'bunkai_list_test_runs',
  'bunkai_report_project_runs',
  'bunkai_compare_run_header',
  'bunkai_create_run',
  'bunkai_submit_automated_run',
];
const CI = {
  commit: 'a1b2c3d',
  branch: 'feature/checkout-discounts',
  pipeline_name: 'nightly-regression',
  pipeline_url: 'https://ci.acme.dev/p/42',
};
const NO_CI = { commit: null, branch: null, pipeline_name: null, pipeline_url: null };

setDefaultTimeout(120_000);

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}
type Db = ReturnType<typeof service>;
type Handler = (req: NextRequest, ctx: never) => Promise<Response>;

interface Anchor {
  workspaceId: string
  writerUserId: string
  projectId: string
  environmentId: string
  environmentName: string
  atcIds: string[]
}

interface RunStepJson { id: string }
interface RunJson {
  id: string
  project_id: string
  status: string
  executor_mode: string
  commit: string | null
  branch: string | null
  pipeline_name: string | null
  pipeline_url: string | null
  replayed?: boolean
  atcs: { steps: RunStepJson[] }[]
}
interface Envelope {
  run?: RunJson
  error?: { code: string, message: string, details?: { reason?: string, field?: string } }
}

async function findAnchor(db: Db): Promise<Anchor | null> {
  const members = await selectAll<{ user_id: string, workspace_id: string, role: string, status: string }>(
    ({ from, to }) => db.from('workspace_members').select('user_id, workspace_id, role, status').order('user_id').range(from, to),
  );
  const live = new Set((await selectAll<{ id: string }>(
    ({ from, to }) => db.from('workspaces').select('id').is('deleted_at', null).order('id').range(from, to),
  )).map(w => w.id));
  const projects = await selectAll<{ id: string, workspace_id: string }>(
    ({ from, to }) => db.from('projects').select('id, workspace_id').order('id').range(from, to),
  );
  const envs = await selectAll<{ id: string, project_id: string, name: string }>(
    ({ from, to }) => db.from('project_environments').select('id, project_id, name').order('id').range(from, to),
  );
  const atcs = await selectAll<{ id: string, project_id: string }>(
    ({ from, to }) => db.from('atcs').select('id, project_id').order('id').range(from, to),
  );
  const steps = await selectAll<{ atc_id: string }>(
    ({ from, to }) => db.from('atc_steps').select('atc_id').order('id').range(from, to),
  );
  const withSteps = new Set(steps.map(s => s.atc_id));
  for (const p of projects) {
    if (!live.has(p.workspace_id)) { continue; }
    const writer = members.find(m => m.workspace_id === p.workspace_id && m.status === 'active' && WRITER_ROLES.has(m.role));
    const env = envs.find(e => e.project_id === p.id);
    const projectAtcs = atcs.filter(a => a.project_id === p.id && withSteps.has(a.id)).slice(0, 2);
    if (writer && env && projectAtcs.length >= 1) {
      return {
        workspaceId: p.workspace_id,
        writerUserId: writer.user_id,
        projectId: p.id,
        environmentId: env.id,
        environmentName: env.name,
        atcIds: projectAtcs.map(a => a.id),
      };
    }
  }
  return null;
}

function functionBody(sql: string, name: string): string {
  const start = sql.lastIndexOf(`create or replace function public.${name}(`);
  const open = sql.indexOf('$$', start) + 2;
  return sql.slice(open, sql.indexOf('$$', open));
}

let skipReason: string | null = null;
let anchor!: Anchor;
let testId = '';
let memberToken = '';
let viewerToken = '';
const createdTokenIds: string[] = [];
const createdUserIds: string[] = [];
const createdMemberships: { user_id: string, workspace_id: string }[] = [];
let counter = 0;

async function call(handler: Handler, method: 'GET' | 'POST', path: string, token: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await handler(new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({}) } as never);
  const text = await response.text();
  return { status: response.status, json: JSON.parse(text) as Envelope & Record<string, unknown> };
}

function submission(extra: Record<string, unknown> = {}) {
  return {
    test_id: testId,
    environment: anchor.environmentName,
    verdict: 'passed',
    duration_seconds: 0,
    steps: anchor.atcIds.map((_, i) => ({ position: i + 1, result: 'pass' })),
    ...extra,
  };
}

async function submit(token: string, extra: Record<string, unknown> = {}) {
  return call(submitRoute as Handler, 'POST', '/api/v1/runs/submissions', token, submission(extra));
}

async function open(token: string, extra: Record<string, unknown>, idempotencyKey?: string) {
  counter += 1;
  return call(startRoute as Handler, 'POST', '/api/v1/runs', token, {
    test_id: testId,
    environment_id: anchor.environmentId,
    ...extra,
  }, { 'idempotency-key': idempotencyKey ?? `${PREFIX}-open-${counter}` });
}

function ciOf(value: object | null | undefined) {
  const run = (value ?? {}) as Record<string, unknown>;
  return {
    commit: run.commit ?? null,
    branch: run.branch ?? null,
    pipeline_name: run.pipeline_name ?? null,
    pipeline_url: run.pipeline_url ?? null,
  };
}

async function runCount(db: Db): Promise<number> {
  const { count, error } = await db.from('runs').select('id', { count: 'exact', head: true }).eq('test_id', testId);
  if (error) { throw error; }
  return count ?? 0;
}

async function storedCi(db: Db, runId: string) {
  const { data, error } = await db.from('runs').select('ci_commit, ci_branch, ci_pipeline_name, ci_pipeline_url').eq('id', runId).single();
  if (error) { throw error; }
  return {
    commit: data.ci_commit,
    branch: data.ci_branch,
    pipeline_name: data.ci_pipeline_name,
    pipeline_url: data.ci_pipeline_url,
  };
}

describeOrSkip('BK-1995 — CI context reported with a run (real database, real handlers)', () => {
  beforeAll(async () => {
    const db = service();
    const probe = await db.from('runs').select('ci_commit').limit(1);
    if (probe.error) {
      skipReason = `runs.ci_commit is missing (${probe.error.code ?? 'unknown'}). Apply migration 0137_run_ci_context.sql.`;
      console.warn(`[ci-context-isolation] skipped: ${skipReason}`);
      return;
    }
    const found = await findAnchor(db);
    if (!found) {
      skipReason = 'need a live workspace with a writer, a project with an environment and an ATC that has steps (seed state).';
      console.warn(`[ci-context-isolation] skipped: ${skipReason}`);
      return;
    }
    anchor = found;

    const { data: test, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspaceId, title: `${PREFIX} ci context`, created_by: anchor.writerUserId })
      .select('id')
      .single();
    if (testError || !test) { throw testError ?? new Error('test seed failed'); }
    testId = test.id;
    const { error: chainError } = await db
      .from('test_steps')
      .insert(anchor.atcIds.map((atc_id, i) => ({ test_id: testId, atc_id, position: i + 1 })));
    if (chainError) { throw chainError; }

    const { data: viewer, error: viewerError } = await db.auth.admin.createUser({
      email: `${PREFIX}-viewer@bunkai.test`,
      password: `Bk1995-viewer-Test!${Date.now()}`,
      email_confirm: true,
    });
    if (viewerError || !viewer.user) { throw viewerError ?? new Error('createUser failed'); }
    createdUserIds.push(viewer.user.id);
    const { error: memberError } = await db
      .from('workspace_members')
      .insert({ workspace_id: anchor.workspaceId, user_id: viewer.user.id, role: 'viewer', status: 'active' });
    if (memberError) { throw memberError; }
    createdMemberships.push({ user_id: viewer.user.id, workspace_id: anchor.workspaceId });

    const member = await mintPat({ admin: db as never, userId: anchor.writerUserId, name: `${PREFIX}-sara-pipeline`, workspaceId: anchor.workspaceId, scopes: ['atc:read', 'run:execute'], expiresInDays: null });
    createdTokenIds.push(member.id);
    memberToken = member.token;
    const viewerPat = await mintPat({ admin: db as never, userId: viewer.user.id, name: `${PREFIX}-viewer`, workspaceId: anchor.workspaceId, scopes: ['atc:read', 'run:execute'], expiresInDays: null });
    createdTokenIds.push(viewerPat.id);
    viewerToken = viewerPat.token;
  });

  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    if (testId) {
      const { data: runs } = await db.from('runs').select('id').eq('test_id', testId);
      const ids = ((runs ?? []) as { id: string }[]).map(r => r.id);
      if (ids.length > 0) {
        await db.from('run_submission_keys').delete().in('run_id', ids);
        await db.from('notifications').delete().in('entity_id', ids);
        await db.from('activity_log').delete().in('entity_id', ids);
        await db.from('runs').delete().in('id', ids);
      }
      await db.from('test_steps').delete().eq('test_id', testId);
      await db.from('tests').delete().eq('id', testId);
    }
    for (const id of createdTokenIds) {
      await db.from('access_token_secrets').delete().eq('token_id', id);
      await db.from('access_tokens').delete().eq('id', id);
    }
    for (const m of createdMemberships) {
      await db.from('workspace_members').delete().eq('user_id', m.user_id).eq('workspace_id', m.workspace_id);
    }
    for (const id of createdUserIds) {
      await db.auth.admin.deleteUser(id);
    }
  });

  it('T3/T5: the live body of every touched function is byte-identical to the migration file, one overload each', async () => {
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
    }
    finally {
      await sql.end();
    }
  });

  it('AC1 + AC12: a one-call report records the four details and every read surface returns them', async () => {
    if (skipReason) { return; }
    const previous = await submit(memberToken, { verdict: 'passed' });
    expect(previous.status).toBe(201);

    const reported = await submit(memberToken, CI);
    expect(reported.status).toBe(201);
    const run = reported.json.run!;
    expect(ciOf(run)).toEqual(CI);
    expect(run.executor_mode).toBe('agent');

    const detail = await call(runRoute as Handler, 'GET', `/api/v1/runs/${run.id}`, memberToken);
    expect(detail.status).toBe(200);
    expect(ciOf(detail.json.run)).toEqual(CI);

    const history = await call(historyRoute as Handler, 'GET', `/api/v1/tests/${testId}/runs`, memberToken);
    expect(history.status).toBe(200);
    const historyItems = history.json.items as Record<string, unknown>[];
    expect(ciOf(historyItems.find(i => i.id === run.id))).toEqual(CI);
    expect(ciOf(historyItems.find(i => i.id === previous.json.run!.id))).toEqual(NO_CI);

    const report = await call(reportRoute as Handler, 'GET', `/api/v1/projects/${run.project_id}/runs/report`, memberToken);
    expect(report.status).toBe(200);
    const reportItems = report.json.items as Record<string, unknown>[];
    expect(ciOf(reportItems.find(i => i.id === run.id))).toEqual(CI);
    expect(ciOf(reportItems.find(i => i.id === previous.json.run!.id))).toEqual(NO_CI);

    const compare = await call(compareRoute as Handler, 'GET', `/api/v1/runs/${run.id}/compare`, memberToken);
    expect(compare.status).toBe(200);
    expect(ciOf(compare.json.run)).toEqual(CI);
    expect(ciOf(compare.json.previous as object)).toEqual(NO_CI);
  });

  it('AC3: any subset is accepted and only the given details come back', async () => {
    if (skipReason) { return; }
    const branchOnly = await submit(memberToken, { branch: 'feature/checkout-discounts' });
    expect(branchOnly.status).toBe(201);
    expect(ciOf(branchOnly.json.run)).toEqual({ ...NO_CI, branch: 'feature/checkout-discounts' });

    const commitOnly = await submit(memberToken, { commit: 'A1B2C3D' });
    expect(commitOnly.status).toBe(201);
    expect(ciOf(commitOnly.json.run)).toEqual({ ...NO_CI, commit: 'a1b2c3d' });

    const none = await submit(memberToken);
    expect(none.status).toBe(201);
    expect(ciOf(none.json.run)).toEqual(NO_CI);
  });

  it('AC4 + AC14 + AC15: an invalid value is refused, names the field and records nothing', async () => {
    if (skipReason) { return; }
    const db = service();
    const before = await runCount(db);
    const cases: [Record<string, unknown>, string][] = [
      [{ commit: 'zz!' }, 'commit'],
      [{ branch: 'b'.repeat(256) }, 'branch'],
      [{ pipeline_url: 'javascript:alert(1)' }, 'pipeline_url'],
      [{ pipeline_url: 'ftp://ci.acme.dev' }, 'pipeline_url'],
      [{ pipeline_url: 'https://ci:s3cret@ci.acme.dev/p/42' }, 'pipeline_url'],
      [{ pipeline_name: ['nightly'] }, 'pipeline_name'],
    ];
    for (const [extra, field] of cases) {
      const refused = await submit(memberToken, extra);
      expect({ field, status: refused.status }).toEqual({ field, status: 422 });
      expect(refused.json.error!.details?.field).toBe(field);
      expect(refused.json.error!.message.startsWith(field)).toBe(true);
    }
    const openRefused = await open(memberToken, { executor_mode: 'ci', commit: 'zz!' });
    expect(openRefused.status).toBe(422);
    expect(openRefused.json.error!.details?.field).toBe('commit');
    expect(await runCount(db)).toBe(before);
  });

  it('AC16: a tag build records the tag name as the branch', async () => {
    if (skipReason) { return; }
    const tagged = await submit(memberToken, { branch: 'v1.4.0' });
    expect(tagged.status).toBe(201);
    expect(tagged.json.run!.branch).toBe('v1.4.0');
  });

  it('AC7 + AC7d: the same key replays with the same details, conflicts with others, and is free after 24 hours', async () => {
    if (skipReason) { return; }
    const db = service();
    const key = `${PREFIX}-retry`;
    const original = await submit(memberToken, { idempotency_key: key, branch: 'feature/checkout-discounts' });
    expect(original.status).toBe(201);

    const replay = await submit(memberToken, { idempotency_key: key, branch: 'feature/checkout-discounts' });
    expect(replay.status).toBe(200);
    expect(replay.json.run!.id).toBe(original.json.run!.id);

    const before = await runCount(db);
    const conflict = await submit(memberToken, { idempotency_key: key, branch: 'main' });
    expect(conflict.status).toBe(409);
    expect(await runCount(db)).toBe(before);
    expect((await storedCi(db, original.json.run!.id)).branch).toBe('feature/checkout-discounts');

    const { error } = await db
      .from('run_submission_keys')
      .update({ created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() })
      .eq('workspace_id', anchor.workspaceId)
      .eq('idempotency_key', key);
    if (error) { throw error; }
    const fresh = await submit(memberToken, { idempotency_key: key, branch: 'main' });
    expect(fresh.status).toBe(201);
    expect(fresh.json.run!.id).not.toBe(original.json.run!.id);
    expect(fresh.json.run!.branch).toBe('main');
    expect((await storedCi(db, original.json.run!.id)).branch).toBe('feature/checkout-discounts');
  });

  it('a report without details under a key keeps the pre-change hash (older keys still replay)', async () => {
    if (skipReason) { return; }
    const key = `${PREFIX}-plain`;
    const first = await submit(memberToken, { idempotency_key: key });
    expect(first.status).toBe(201);
    const again = await submit(memberToken, { idempotency_key: key, commit: null, branch: null });
    expect(again.status).toBe(200);
    expect(again.json.run!.id).toBe(first.json.run!.id);
  });

  it('AC2 + AC6: a streamed run keeps the details from open to finish; later calls with other details change nothing', async () => {
    if (skipReason) { return; }
    const db = service();
    const opened = await open(memberToken, { executor_mode: 'ci', start_token: `${PREFIX}-stream`, ...CI });
    expect(opened.status).toBe(201);
    const run = opened.json.run!;
    expect(run.status).toBe('running');
    expect(ciOf(run)).toEqual(CI);

    const other = { commit: '9f8e7d6', branch: 'main', pipeline_name: 'other', pipeline_url: 'https://ci.acme.dev/p/99' };
    for (const step of run.atcs.flatMap(a => a.steps)) {
      const marked = await call(markRoute as Handler, 'POST', `/api/v1/runs/${run.id}/steps/${step.id}/mark`, memberToken, { status: 'passed', ...other });
      expect(marked.status).toBe(200);
      expect(ciOf(marked.json.run)).toEqual(CI);
    }
    const finished = await call(finishRoute as Handler, 'POST', `/api/v1/runs/${run.id}/finish`, memberToken, { verdict: 'passed', ...other });
    expect(finished.status).toBe(200);
    expect(finished.json.run!.status).toBe('passed');
    expect(ciOf(finished.json.run)).toEqual(CI);
    expect(await storedCi(db, run.id)).toEqual(CI);
  });

  it('AC6: abort with other details aborts the run and keeps the stored ones', async () => {
    if (skipReason) { return; }
    const db = service();
    const opened = await open(memberToken, { executor_mode: 'agent', branch: 'feature/checkout-discounts', commit: 'a1b2c3d' });
    expect(opened.status).toBe(201);
    const aborted = await call(abortRoute as Handler, 'POST', `/api/v1/runs/${opened.json.run!.id}/abort`, memberToken, { reason: 'runner died', branch: 'main', commit: '9f8e7d6' });
    expect(aborted.status).toBe(200);
    expect(aborted.json.run!.status).toBe('aborted');
    expect(ciOf(aborted.json.run)).toEqual({ ...NO_CI, branch: 'feature/checkout-discounts', commit: 'a1b2c3d' });
    expect(await storedCi(db, opened.json.run!.id)).toEqual({ ...NO_CI, branch: 'feature/checkout-discounts', commit: 'a1b2c3d' });
  });

  it('AC7c: a streamed open retried under the same start token replays with the same details and conflicts with others', async () => {
    if (skipReason) { return; }
    const db = service();
    const startToken = `${PREFIX}-reopen`;
    const opened = await open(memberToken, { executor_mode: 'ci', start_token: startToken, branch: 'feature/checkout-discounts' });
    expect(opened.status).toBe(201);

    const replay = await open(memberToken, { executor_mode: 'ci', start_token: startToken, branch: 'feature/checkout-discounts' });
    expect(replay.status).toBe(200);
    expect(replay.json.run!.id).toBe(opened.json.run!.id);

    const before = await runCount(db);
    const conflict = await open(memberToken, { executor_mode: 'ci', start_token: startToken, branch: 'main' });
    expect(conflict.status).toBe(409);
    expect(conflict.json.error!.details?.reason).toBe('ci_context_conflict');
    expect(await runCount(db)).toBe(before);
    expect((await storedCi(db, opened.json.run!.id)).branch).toBe('feature/checkout-discounts');
  });

  it('T2: the same Idempotency-Key header with other details is a conflict', async () => {
    if (skipReason) { return; }
    const header = `${PREFIX}-header-key`;
    const startToken = `${PREFIX}-header`;
    const first = await open(memberToken, { executor_mode: 'ci', start_token: startToken, branch: 'feature/checkout-discounts' }, header);
    expect(first.status).toBe(201);
    const replay = await open(memberToken, { executor_mode: 'ci', start_token: startToken, branch: 'feature/checkout-discounts' }, header);
    expect(replay.status).toBe(201);
    expect(replay.json.run!.id).toBe(first.json.run!.id);
    const conflict = await open(memberToken, { executor_mode: 'ci', start_token: startToken, branch: 'main' }, header);
    expect(conflict.status).toBe(409);
  });

  it('AC8b: a token open without executor_mode records the details on a human run', async () => {
    if (skipReason) { return; }
    const opened = await open(memberToken, { commit: 'a1b2c3d' });
    expect(opened.status).toBe(201);
    expect(opened.json.run!.executor_mode).toBe('human');
    expect(opened.json.run!.commit).toBe('a1b2c3d');
  });

  it('AC13: a viewer token is refused exactly as without the details and nothing is recorded', async () => {
    if (skipReason) { return; }
    const db = service();
    const before = await runCount(db);
    const plain = await submit(viewerToken);
    const withCi = await submit(viewerToken, { commit: 'a1b2c3d' });
    expect(withCi.status).toBe(plain.status);
    expect(withCi.status).toBe(403);
    expect(withCi.json.error!.code).toBe(plain.json.error!.code);
    expect(await runCount(db)).toBe(before);
  });

  it('AC9: a run created before the change reads with null details and every earlier field', async () => {
    if (skipReason) { return; }
    const db = service();
    const { data: older, error } = await db
      .from('runs')
      .select('id')
      .lt('created_at', '2026-11-20T00:00:00Z')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) { throw error; }
    if (!older || older.length === 0) { return; }
    const { data: json, error: jsonError } = await db.rpc('bunkai_run_json', { p_run_id: older[0].id });
    if (jsonError) { throw jsonError; }
    const run = json as Record<string, unknown>;
    expect(ciOf(run)).toEqual(NO_CI);
    for (const key of ['id', 'status', 'executor_mode', 'executor_name', 'evidence_urls', 'module_name', 'abort_reason', 'test_title', 'atcs', 'step_count']) {
      expect(Object.keys(run)).toContain(key);
    }
  });

  it('T4: a hostile direct insert into runs through PostgREST is refused by the database', async () => {
    if (skipReason) { return; }
    const token = await mintUserJwt(anchor.writerUserId, jwtSecret!);
    const member = createClient(url!, anonKey!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const base = {
      workspace_id: anchor.workspaceId,
      project_id: anchor.projectId,
      test_id: testId,
      environment_id: anchor.environmentId,
      status: 'running',
      executor_mode: 'ci',
      executor_user_id: anchor.writerUserId,
      start_token: `${PREFIX}-hostile`,
      test_title: 'hostile',
    };
    for (const hostile of [
      { ci_pipeline_url: 'javascript:alert(1)' },
      { ci_pipeline_url: 'https://ci:s3cret@ci.acme.dev/p/42' },
      { ci_commit: 'ZZ!' },
      { ci_branch: '' },
      { ci_branch: 'main\nother' },
      { ci_pipeline_name: 'n'.repeat(101) },
    ]) {
      const { error } = await member.from('runs').insert({ ...base, ...hostile });
      expect({ hostile, code: error?.code }).toEqual({ hostile, code: '23514' });
    }
  });
});
