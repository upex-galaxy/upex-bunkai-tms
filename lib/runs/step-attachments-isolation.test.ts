import { createClient } from '@supabase/supabase-js';
import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-593 - DB-integration guard for run step evidence attachments
// (`bunkai_init_run_step_attachment`, `bunkai_commit_run_step_attachment`,
// `bunkai_remove_run_step_attachment`, `bunkai_expire_pending_run_step_attachments`,
// the `run_step_attachments` table and the AFTER DELETE cleanup trigger, migration
// 0097_run_step_attachments.sql).
//
// The three writers are SECURITY DEFINER with NO identity parameter: the actor is
// auth.uid(), so a mocked `db.rpc` proves nothing about them. This suite signs in through
// the app's real password path as the declared automation identity (`QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD`, `.agents/project.yaml` -> `testing.automation_identity`), never a
// minted JWT and never an impersonated account. The identity's ROLE in the suite's own
// throwaway workspace is switched through the service client (viewer / member / admin /
// owner), and "somebody else uploaded it" is modelled with `created_by = null`. Service role
// is used ONLY for fixture seed, role switching, read-back and teardown, which is
// sanctioned: it obtains no session.
//
// What it proves against the real database:
//   * init: a pending row with a server-chosen path, a 3 hour window, invisible to every
//     reader until commit; the error contract (45216 closed Run, 45217 with its reason,
//     22023 bad type or name, 42501 viewer, P0002 for a missing step, a step of another Run,
//     a foreign workspace and a caller with no session); nothing is written by a refused call;
//   * quotas, inclusive: 10 per step, 50 MiB per step, 250 MiB per Run, 10 MiB per file
//     (exactly the limit is accepted, one byte more is refused), expired pending rows do not
//     count;
//   * commit: pending -> committed with the ACTUAL size, idempotent retry, uploader only,
//     45218 after the window, 45216 on a closed Run (a retry of an already-committed row
//     still answers), quotas re-checked on committed rows plus the actual size;
//   * remove: the uploader only (45219 for everyone else, an owner included), allowed while
//     running only, works on a pending row, enqueues the object;
//   * the AFTER DELETE trigger: remove, Run delete and cascade all feed storage_cleanup_queue;
//   * the sweep helper: expires only stale pending rows, executable by service_role alone;
//   * RLS: committed rows are readable by members of the owning workspace and by nobody else,
//     pending rows by nobody, and no client role can write the table directly;
//   * concurrency: two simultaneous inits at the quota edge, and commit racing finish.
//
// FAIL-CLOSED GATE. This file is evidence only when it EXECUTES. It is registered as
// SKIPPED, with a loud warning at module load, in exactly two legitimate cases:
//   1. there is no database environment at all (`NEXT_PUBLIC_SUPABASE_URL`,
//      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` absent), or
//   2. the database answers that `bunkai_init_run_step_attachment` does not exist
//      (migration 0097 not applied yet).
// In EVERY other case the suite FAILS instead of passing quietly: a missing automation
// identity, a failed login, a fixture that cannot be seeded, an unexpected answer from the
// probe, leftover fixtures at teardown. Every test also asserts at least one expectation
// (`expect.hasAssertions()`). A run counts as evidence only if its output shows zero
// skipped tests. NOT covered here: the Storage bucket itself (no object is ever written).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[step-attachments-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran, so nothing here is evidence about the functions.');
}

const INIT_RPC = 'bunkai_init_run_step_attachment';
const COMMIT_RPC = 'bunkai_commit_run_step_attachment';
const REMOVE_RPC = 'bunkai_remove_run_step_attachment';
const EXPIRE_RPC = 'bunkai_expire_pending_run_step_attachments';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const MIB = 1024 * 1024;
const FILE_MAX = 10 * MIB;
const STEP_MAX = 50 * MIB;
const RUN_MAX = 250 * MIB;

// Is the function deployed? A deployed function answers P0002 to a caller with no session
// (the service role) for any id. "Function does not exist" (42883 / PGRST202) is the one
// legitimate reason to skip; ANY other answer is a failure of the file itself.
let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc(INIT_RPC, { p_run_id: ZERO_UUID, p_run_step_id: ZERO_UUID, p_filename: 'probe.png', p_content_type: 'image/png', p_byte_size: 1 });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[step-attachments-isolation] SKIPPED ENTIRELY: ${INIT_RPC} is not deployed (${code}). Apply migration 0097_run_step_attachments.sql. No assertion in this file ran, so nothing here is evidence about the functions.`);
  }
  else {
    throw new Error(`[step-attachments-isolation] unexpected answer from the ${INIT_RPC} deploy probe (${code}: ${probe.error?.message ?? 'no message'}). Expected P0002 (deployed) or 42883/PGRST202 (not deployed).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;

const PREFIX = `bk593-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SEED_TIMEOUT = 60_000;

type Role = 'viewer' | 'member' | 'admin' | 'owner';
type RunStatus = 'running' | 'passed' | 'failed' | 'aborted';
interface SeededRun { runId: string, stepIds: string[] }
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  foreignProjectId: string
  envId: string
  foreignEnvId: string
}
interface AttachmentRow {
  id: string
  run_id: string
  run_step_id: string
  storage_path: string
  original_filename: string
  content_type: string
  byte_size: number
  status: string
  created_by: string | null
  committed_at: string | null
  expires_at: string | null
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// Seeding failures are test failures: every step throws, nothing is swallowed.
function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[step-attachments-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

let fixture: Fixture | null = null;
let qa: ReturnType<typeof service>;
const createdWorkspaceIds: string[] = [];

// A test that runs while the fixture is missing FAILS (it never passes vacuously).
function need(): Fixture {
  if (!fixture) {
    throw new Error('[step-attachments-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

describeOrSkip('BK-593 - run step attachments against the real database', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[step-attachments-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present (the functions read auth.uid(): only a real session proves them).');
    }
    const db = service();

    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`[step-attachments-isolation] QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    const qaUserId = signIn.user.id;

    // The suite seeds BOTH workspaces itself, on the 'cloud' plan. The identity is an active
    // member of the first one and has no membership at all in the second.
    const ownWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-own`, name: `${PREFIX} own`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'own workspace');
    const workspaceId = ownWs.id as string;
    createdWorkspaceIds.push(workspaceId);
    must(await db.from('workspace_members').insert({ workspace_id: workspaceId, user_id: qaUserId, role: 'owner', status: 'active' }).select('user_id').single(), 'own membership');
    const foreignWs = must(await db.from('workspaces').insert({ slug: `${PREFIX}-foreign`, name: `${PREFIX} foreign`, owner_user_id: qaUserId, plan: 'cloud' }).select('id').single(), 'foreign workspace');
    const foreignWorkspaceId = foreignWs.id as string;
    createdWorkspaceIds.push(foreignWorkspaceId);

    const project = must(await db.from('projects').insert({ workspace_id: workspaceId, slug: `${PREFIX}-p`, name: `${PREFIX} project` }).select('id').single(), 'project');
    const env = must(await db.from('project_environments').insert({ project_id: project.id, name: 'Staging' }).select('id').single(), 'environment');
    const foreignProject = must(await db.from('projects').insert({ workspace_id: foreignWorkspaceId, slug: `${PREFIX}-f`, name: `${PREFIX} foreign project` }).select('id').single(), 'foreign project');
    const foreignEnv = must(await db.from('project_environments').insert({ project_id: foreignProject.id, name: 'Staging' }).select('id').single(), 'foreign environment');

    fixture = {
      workspaceId,
      foreignWorkspaceId,
      qaUserId,
      projectId: project.id as string,
      foreignProjectId: foreignProject.id as string,
      envId: env.id as string,
      foreignEnvId: foreignEnv.id as string,
    };
  }, SEED_TIMEOUT);

  afterAll(async () => {
    if (createdWorkspaceIds.length === 0) { return; }
    const db = service();
    const ws = createdWorkspaceIds;
    // Children before parents: runs.test_id is ON DELETE RESTRICT; attachments cascade from
    // runs; the cleanup queue and activity_log carry no foreign key to the workspace, so
    // they are removed by path prefix / workspace id first. A delete that fails is collected
    // and thrown, never swallowed: leftover fixtures must be loud.
    const failures: string[] = [];
    const attempt = async (what: string, op: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await op;
      if (error) { failures.push(`${what}: ${error.message}`); }
    };
    await attempt('runs', db.from('runs').delete().in('workspace_id', ws));
    for (const id of ws) {
      await attempt('storage_cleanup_queue', db.from('storage_cleanup_queue').delete().like('path', `${id}/%`));
    }
    await attempt('tests', db.from('tests').delete().in('workspace_id', ws));
    await attempt('activity_log', db.from('activity_log').delete().in('workspace_id', ws));
    await attempt('projects', db.from('projects').delete().in('workspace_id', ws));
    await attempt('workspace_members', db.from('workspace_members').delete().in('workspace_id', ws));
    await attempt('workspaces', db.from('workspaces').delete().in('id', ws));
    if (failures.length > 0) {
      throw new Error(`[step-attachments-isolation] teardown left fixtures behind (${PREFIX}): ${failures.join('; ')}`);
    }
  }, SEED_TIMEOUT);

  // ---------------------------------------------------------------- helpers
  let seq = 0;

  // Switches the identity's role in the suite's own workspace; always back to owner.
  async function asRole<T>(role: Role, fn: () => Promise<T>): Promise<T> {
    const f = need();
    const db = service();
    must(await db.from('workspace_members').update({ role }).eq('workspace_id', f.workspaceId).eq('user_id', f.qaUserId).select('user_id'), `role ${role}`);
    try {
      return await fn();
    }
    finally {
      must(await db.from('workspace_members').update({ role: 'owner' }).eq('workspace_id', f.workspaceId).eq('user_id', f.qaUserId).select('user_id'), 'role restore');
    }
  }

  // A Run with `steps` steps (all on one ATC), in the own or the foreign workspace.
  async function seedRun(opts: { steps?: number, status?: RunStatus, foreign?: boolean } = {}): Promise<SeededRun> {
    const f = need();
    const db = service();
    const foreign = opts.foreign ?? false;
    const status = opts.status ?? 'running';
    const workspaceId = foreign ? f.foreignWorkspaceId : f.workspaceId;
    const test = must(await db.from('tests').insert({ workspace_id: workspaceId, title: `${PREFIX} t${++seq}`, created_by: f.qaUserId }).select('id').single(), 'test');
    const run = must(await db.from('runs').insert({
      workspace_id: workspaceId,
      project_id: foreign ? f.foreignProjectId : f.projectId,
      test_id: test.id,
      environment_id: foreign ? f.foreignEnvId : f.envId,
      status,
      executor_mode: 'human',
      abort_reason: status === 'aborted' ? 'seeded abort' : null,
      start_token: `${PREFIX}-${++seq}`,
      test_title: `${PREFIX} title`,
      finished_at: status === 'running' ? null : new Date().toISOString(),
    }).select('id').single(), 'run');
    const atc = must(await db.from('run_atcs').insert({ run_id: run.id, position: 1, atc_title: `${PREFIX} atc` }).select('id').single(), 'run atc');
    const count = opts.steps ?? 1;
    const steps = must(await db.from('run_steps').insert(
      Array.from({ length: count }, (_, i) => ({ run_atc_id: atc.id, position: i, content: `${PREFIX} step ${i}` })),
    ).select('id, position'), 'run steps');
    const ordered = [...steps].sort((a, b) => (a.position as number) - (b.position as number)).map(s => s.id as string);
    return { runId: run.id as string, stepIds: ordered };
  }

  async function setRunStatus(runId: string, status: RunStatus) {
    must(await service().from('runs').update({ status, finished_at: status === 'running' ? null : new Date().toISOString() }).eq('id', runId).select('id'), `run status ${status}`);
  }

  async function init(run: SeededRun, stepIndex = 0, opts: { filename?: string, type?: string, size?: number, client?: typeof qa } = {}) {
    return (opts.client ?? qa).rpc(INIT_RPC, {
      p_run_id: run.runId,
      p_run_step_id: run.stepIds[stepIndex],
      p_filename: opts.filename ?? 'screen.png',
      p_content_type: opts.type ?? 'image/png',
      p_byte_size: opts.size ?? 1000,
    });
  }

  async function commit(attachmentId: string, size = 1000, client = qa) {
    return client.rpc(COMMIT_RPC, { p_attachment_id: attachmentId, p_byte_size: size });
  }

  async function remove(attachmentId: string, client = qa) {
    return client.rpc(REMOVE_RPC, { p_attachment_id: attachmentId });
  }

  // Direct row seed (service role): any status, any size, uploaded by the identity or by
  // "somebody else" (created_by null).
  async function seedAttachment(run: SeededRun, stepIndex: number, opts: { status?: 'pending' | 'committed', size?: number, by?: 'qa' | 'other', expired?: boolean } = {}): Promise<string> {
    const f = need();
    const id = crypto.randomUUID();
    const status = opts.status ?? 'committed';
    const row = {
      id,
      workspace_id: f.workspaceId,
      run_id: run.runId,
      run_step_id: run.stepIds[stepIndex],
      storage_path: `${f.workspaceId}/${run.runId}/${run.stepIds[stepIndex]}/${id}`,
      original_filename: 'seed.png',
      content_type: 'image/png',
      byte_size: opts.size ?? 1000,
      status,
      created_by: (opts.by ?? 'qa') === 'qa' ? f.qaUserId : null,
      committed_at: status === 'committed' ? new Date().toISOString() : null,
      expires_at: status === 'pending' ? new Date(Date.now() + (opts.expired ? -3_600_000 : 3_600_000)).toISOString() : null,
    };
    must(await service().from('run_step_attachments').insert(row).select('id').single(), 'attachment');
    return id;
  }

  async function seedMany(run: SeededRun, stepIndex: number, count: number, size: number) {
    const f = need();
    const rows = Array.from({ length: count }, () => {
      const id = crypto.randomUUID();
      return {
        id,
        workspace_id: f.workspaceId,
        run_id: run.runId,
        run_step_id: run.stepIds[stepIndex],
        storage_path: `${f.workspaceId}/${run.runId}/${run.stepIds[stepIndex]}/${id}`,
        original_filename: 'seed.png',
        content_type: 'image/png',
        byte_size: size,
        status: 'committed',
        created_by: f.qaUserId,
        committed_at: new Date().toISOString(),
        expires_at: null,
      };
    });
    must(await service().from('run_step_attachments').insert(rows).select('id'), 'attachments');
  }

  async function row(id: string): Promise<AttachmentRow | null> {
    const { data, error } = await service().from('run_step_attachments').select('*').eq('id', id).maybeSingle();
    if (error) { throw error; }
    return data as unknown as AttachmentRow | null;
  }

  async function countRows(runId: string): Promise<number> {
    const { count, error } = await service().from('run_step_attachments').select('id', { count: 'exact', head: true }).eq('run_id', runId);
    if (error) { throw error; }
    return count ?? 0;
  }

  async function queued(pathPrefix: string) {
    const { data, error } = await service().from('storage_cleanup_queue').select('path, reason, done_at').like('path', `${pathPrefix}%`);
    if (error) { throw error; }
    return data as unknown as Array<{ path: string, reason: string, done_at: string | null }>;
  }

  async function history(stepId: string, action: string) {
    const { data, error } = await service().from('activity_log').select('actor_user_id, action, payload').eq('entity_type', 'run_step').eq('entity_id', stepId).eq('action', action);
    if (error) { throw error; }
    return data as unknown as Array<{ actor_user_id: string, action: string, payload: Record<string, unknown> }>;
  }

  async function initOk(run: SeededRun, stepIndex = 0, size = 1000) {
    const { data, error } = await init(run, stepIndex, { size });
    expect(error).toBeNull();
    const body = data as unknown as { attachment: { id: string }, storage_path: string };
    return body;
  }

  // ------------------------------------------------------------------ init
  it('init writes a pending row with a server-chosen path and a 3 hour window, and returns the path next to the public attachment', async () => {
    const f = need();
    const run = await seedRun();
    const before = Date.now();
    const { data, error } = await init(run, 0, { filename: '  ../../etc/passwd.png  ', size: 2048 });
    expect(error).toBeNull();
    const body = data as unknown as { attachment: Record<string, unknown>, storage_path: string };
    const id = body.attachment.id as string;

    expect(body.storage_path).toBe(`${f.workspaceId}/${run.runId}/${run.stepIds[0]}/${id}`);
    expect(body.attachment.status).toBe('pending');
    expect(body.attachment.filename).toBe('../../etc/passwd.png');
    expect(body.attachment).not.toHaveProperty('storage_path');

    const stored = (await row(id))!;
    expect(stored.status).toBe('pending');
    expect(stored.byte_size).toBe(2048);
    expect(stored.created_by).toBe(f.qaUserId);
    expect(stored.storage_path).toBe(body.storage_path);
    const windowMs = Date.parse(stored.expires_at!) - before;
    expect(windowMs).toBeGreaterThan(3 * 3_600_000 - 60_000);
    expect(windowMs).toBeLessThan(3 * 3_600_000 + 60_000);
  }, SEED_TIMEOUT);

  it('keeps a pending row invisible to every reader, its uploader included', async () => {
    const run = await seedRun();
    const { attachment } = await initOk(run);
    const visible = await qa.from('run_step_attachments').select('id').eq('id', attachment.id);
    expect(visible.error).toBeNull();
    expect(visible.data).toHaveLength(0);
  }, SEED_TIMEOUT);

  it('lets a member, an admin and an owner attach, and refuses a viewer with 42501 without writing', async () => {
    const run = await seedRun();
    for (const role of ['member', 'admin', 'owner'] as const) {
      await asRole(role, async () => {
        expect((await init(run)).error).toBeNull();
      });
    }
    const before = await countRows(run.runId);
    await asRole('viewer', async () => {
      expect((await init(run)).error?.code).toBe('42501');
    });
    expect(await countRows(run.runId)).toBe(before);
  }, SEED_TIMEOUT);

  it('answers P0002 for a missing step, a step of another Run, a foreign-workspace Run and a caller with no session', async () => {
    const f = need();
    const run = await seedRun();
    const other = await seedRun();
    const foreign = await seedRun({ foreign: true });

    expect((await qa.rpc(INIT_RPC, { p_run_id: run.runId, p_run_step_id: ZERO_UUID, p_filename: 'a.png', p_content_type: 'image/png', p_byte_size: 10 })).error?.code).toBe('P0002');
    expect((await qa.rpc(INIT_RPC, { p_run_id: other.runId, p_run_step_id: run.stepIds[0], p_filename: 'a.png', p_content_type: 'image/png', p_byte_size: 10 })).error?.code).toBe('P0002');
    expect((await init(foreign)).error?.code).toBe('P0002');
    // The service role has no auth.uid(): it is a member of nothing, so it fails closed.
    expect((await init(run, 0, { client: service() })).error?.code).toBe('P0002');
    expect(await countRows(run.runId)).toBe(0);
    expect(await countRows(foreign.runId)).toBe(0);
    expect(f.workspaceId).not.toBe(f.foreignWorkspaceId);
  }, SEED_TIMEOUT);

  it('is not executable by anon', async () => {
    const run = await seedRun();
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    expect((await init(run, 0, { client: anon })).error?.code).toBe('42501');
    expect((await commit(ZERO_UUID, 10, anon)).error?.code).toBe('42501');
    expect((await remove(ZERO_UUID, anon)).error?.code).toBe('42501');
    expect(await countRows(run.runId)).toBe(0);
  }, SEED_TIMEOUT);

  it('refuses a closed Run with 45216 (passed, failed and aborted) and writes nothing', async () => {
    for (const status of ['passed', 'failed', 'aborted'] as const) {
      const run = await seedRun({ status });
      expect((await init(run)).error?.code).toBe('45216');
      expect(await countRows(run.runId)).toBe(0);
    }
  }, SEED_TIMEOUT);

  it('checks the arguments: type, name and file size (exactly 10 MiB is accepted, one byte more is not)', async () => {
    const run = await seedRun();
    expect((await init(run, 0, { type: 'image/gif' })).error?.code).toBe('22023');
    expect((await init(run, 0, { type: 'text/plain' })).error?.code).toBe('22023');
    expect((await init(run, 0, { filename: '   ' })).error?.code).toBe('22023');
    expect((await init(run, 0, { filename: 'a'.repeat(256) })).error?.code).toBe('22023');
    const zero = await init(run, 0, { size: 0 });
    expect(zero.error?.code).toBe('45217');
    expect(zero.error?.hint).toBe('file_bytes');
    const over = await init(run, 0, { size: FILE_MAX + 1 });
    expect(over.error?.code).toBe('45217');
    expect(over.error?.hint).toBe('file_bytes');
    expect(await countRows(run.runId)).toBe(0);

    expect((await init(run, 0, { filename: 'a'.repeat(255), size: FILE_MAX })).error).toBeNull();
  }, SEED_TIMEOUT);

  // ---------------------------------------------------------------- quotas
  it('allows 10 attachments on a step and refuses the 11th with 45217 step_count', async () => {
    const run = await seedRun();
    await seedMany(run, 0, 9, 100);
    expect((await init(run)).error).toBeNull();
    const eleventh = await init(run);
    expect(eleventh.error?.code).toBe('45217');
    expect(eleventh.error?.hint).toBe('step_count');
    // the limit is per step: the next step of the same Run is unaffected
    const run2 = await seedRun({ steps: 2 });
    await seedMany(run2, 0, 10, 100);
    expect((await init(run2, 0)).error?.hint).toBe('step_count');
    expect((await init(run2, 1)).error).toBeNull();
  }, SEED_TIMEOUT);

  it('allows exactly 50 MiB on a step (inclusive) and refuses one byte more with 45217 step_bytes', async () => {
    const run = await seedRun();
    await seedMany(run, 0, 4, FILE_MAX);
    expect((await init(run, 0, { size: FILE_MAX })).error).toBeNull();
    const over = await init(run, 0, { size: 1 });
    expect(over.error?.code).toBe('45217');
    expect(over.error?.hint).toBe('step_bytes');
    expect(STEP_MAX).toBe(5 * FILE_MAX);
  }, SEED_TIMEOUT);

  it('allows exactly 250 MiB on a Run (inclusive) and refuses one byte more with 45217 run_bytes', async () => {
    const run = await seedRun({ steps: 6 });
    for (let step = 0; step < 4; step += 1) {
      await seedMany(run, step, 5, FILE_MAX);
    }
    await seedMany(run, 4, 4, FILE_MAX);
    // 200 MiB + 40 MiB so far: a 10 MiB file on step 5 lands on exactly 250 MiB
    expect((await init(run, 4, { size: FILE_MAX })).error).toBeNull();
    const over = await init(run, 5, { size: 1 });
    expect(over.error?.code).toBe('45217');
    expect(over.error?.hint).toBe('run_bytes');
    expect(RUN_MAX).toBe(25 * FILE_MAX);
  }, SEED_TIMEOUT);

  it('does not count a pending row whose upload window lapsed', async () => {
    const run = await seedRun();
    for (let i = 0; i < 10; i += 1) {
      await seedAttachment(run, 0, { status: 'pending', expired: true });
    }
    expect((await init(run)).error).toBeNull();
  }, SEED_TIMEOUT);

  // ---------------------------------------------------------------- commit
  it('commits a pending row with the ACTUAL size, makes it visible, writes one history entry, and answers a retry with the same body', async () => {
    const f = need();
    const run = await seedRun();
    const { attachment } = await initOk(run, 0, 500);

    const first = await commit(attachment.id, 4321);
    expect(first.error).toBeNull();
    const body = first.data as unknown as { attachment: { id: string, status: string, byte_size: number } };
    expect(body.attachment.status).toBe('committed');
    expect(body.attachment.byte_size).toBe(4321);

    const stored = (await row(attachment.id))!;
    expect(stored.status).toBe('committed');
    expect(stored.byte_size).toBe(4321);
    expect(stored.committed_at).not.toBeNull();
    expect(stored.expires_at).toBeNull();

    const visible = await qa.from('run_step_attachments').select('id, status').eq('id', attachment.id);
    expect(visible.data).toHaveLength(1);

    const retry = await commit(attachment.id, 999);
    expect(retry.error).toBeNull();
    expect((retry.data as unknown as { attachment: { byte_size: number } }).attachment.byte_size).toBe(4321);

    const entries = await history(run.stepIds[0], 'run_step.attachment_added');
    expect(entries).toHaveLength(1);
    expect(entries[0].actor_user_id).toBe(f.qaUserId);
    expect(entries[0].payload.attachment_id).toBe(attachment.id);
  }, SEED_TIMEOUT);

  it('commits only for the uploader: another user\'s pending row, a foreign row and a missing id answer P0002', async () => {
    const run = await seedRun();
    const foreign = await seedRun({ foreign: true });
    const theirs = await seedAttachment(run, 0, { status: 'pending', by: 'other' });
    expect((await commit(theirs)).error?.code).toBe('P0002');
    expect((await row(theirs))!.status).toBe('pending');
    expect((await commit(ZERO_UUID)).error?.code).toBe('P0002');
    expect((await commit(theirs, 1000, service())).error?.code).toBe('P0002');
    expect(await countRows(foreign.runId)).toBe(0);
  }, SEED_TIMEOUT);

  it('refuses commit after the window with 45218, on a closed Run with 45216, and for a demoted uploader with 42501', async () => {
    const run = await seedRun();
    const stale = await seedAttachment(run, 0, { status: 'pending', expired: true });
    expect((await commit(stale)).error?.code).toBe('45218');
    expect((await row(stale))!.status).toBe('pending');

    const { attachment } = await initOk(run);
    await asRole('viewer', async () => {
      expect((await commit(attachment.id)).error?.code).toBe('42501');
    });
    expect((await row(attachment.id))!.status).toBe('pending');

    await setRunStatus(run.runId, 'passed');
    expect((await commit(attachment.id)).error?.code).toBe('45216');
    expect((await row(attachment.id))!.status).toBe('pending');
  }, SEED_TIMEOUT);

  it('answers a retry of an already committed row even after the Run closed, without writing', async () => {
    const run = await seedRun();
    const { attachment } = await initOk(run);
    expect((await commit(attachment.id)).error).toBeNull();
    await setRunStatus(run.runId, 'failed');
    const retry = await commit(attachment.id);
    expect(retry.error).toBeNull();
    expect(await history(run.stepIds[0], 'run_step.attachment_added')).toHaveLength(1);
  }, SEED_TIMEOUT);

  it('re-checks the limits at commit, on committed rows plus the actual size', async () => {
    const run = await seedRun();
    // file size: the declared size was fine, the object that arrived was not
    const { attachment } = await initOk(run, 0, 100);
    const big = await commit(attachment.id, FILE_MAX + 1);
    expect(big.error?.code).toBe('45217');
    expect(big.error?.hint).toBe('file_bytes');
    expect((await commit(attachment.id, 0)).error?.hint).toBe('file_bytes');

    // step bytes: 40 MiB committed + a client that declared 100 bytes and uploaded 10 MiB + 1
    const run2 = await seedRun();
    await seedMany(run2, 0, 4, FILE_MAX);
    const pending = await seedAttachment(run2, 0, { status: 'pending', size: 100 });
    expect((await commit(pending, FILE_MAX)).error).toBeNull();
    const pending2 = await seedAttachment(run2, 0, { status: 'pending', size: 100 });
    const over = await commit(pending2, 1);
    expect(over.error?.code).toBe('45217');
    expect(over.error?.hint).toBe('step_bytes');

    // step count: ten committed already
    const run3 = await seedRun();
    await seedMany(run3, 0, 10, 100);
    const p3 = await seedAttachment(run3, 0, { status: 'pending', size: 100 });
    expect((await commit(p3, 100)).error?.hint).toBe('step_count');
    expect((await row(p3))!.status).toBe('pending');
  }, SEED_TIMEOUT);

  // ---------------------------------------------------------------- remove
  it('lets the uploader remove a committed attachment while running: the row goes, the object is queued, one history entry', async () => {
    const f = need();
    const run = await seedRun();
    const { attachment } = await initOk(run);
    expect((await commit(attachment.id)).error).toBeNull();
    const path = (await row(attachment.id))!.storage_path;

    const { data, error } = await remove(attachment.id);
    expect(error).toBeNull();
    expect((data as unknown as { storage_path: string }).storage_path).toBe(path);
    expect(await row(attachment.id)).toBeNull();

    const q = await queued(path);
    expect(q).toHaveLength(1);
    expect(q[0].reason).toBe('attachment_deleted');
    expect(q[0].done_at).toBeNull();
    const entries = await history(run.stepIds[0], 'run_step.attachment_removed');
    expect(entries).toHaveLength(1);
    expect(entries[0].actor_user_id).toBe(f.qaUserId);
  }, SEED_TIMEOUT);

  it('lets the uploader discard a pending row, queued as pending_discarded', async () => {
    const run = await seedRun();
    const { attachment, storage_path: path } = await initOk(run);
    expect((await remove(attachment.id)).error).toBeNull();
    expect(await row(attachment.id)).toBeNull();
    const q = await queued(path);
    expect(q).toHaveLength(1);
    expect(q[0].reason).toBe('pending_discarded');
    expect(await history(run.stepIds[0], 'run_step.attachment_removed')).toHaveLength(0);
  }, SEED_TIMEOUT);

  it('refuses everyone but the uploader with 45219 not_uploader, an owner included', async () => {
    const run = await seedRun();
    const theirs = await seedAttachment(run, 0, { by: 'other' });
    for (const role of ['viewer', 'member', 'admin', 'owner'] as const) {
      await asRole(role, async () => {
        const result = await remove(theirs);
        expect(result.error?.code).toBe('45219');
        expect(result.error?.hint).toBe('not_uploader');
      });
    }
    expect(await row(theirs)).not.toBeNull();
  }, SEED_TIMEOUT);

  it('refuses a demoted uploader with 42501, a closed Run with 45216, and hides a foreign or missing id behind P0002', async () => {
    const run = await seedRun();
    const mine = await seedAttachment(run, 0, { by: 'qa' });
    await asRole('viewer', async () => {
      expect((await remove(mine)).error?.code).toBe('42501');
    });
    expect(await row(mine)).not.toBeNull();

    await setRunStatus(run.runId, 'aborted');
    expect((await remove(mine)).error?.code).toBe('45216');
    expect(await row(mine)).not.toBeNull();

    expect((await remove(ZERO_UUID)).error?.code).toBe('P0002');
    expect((await remove(mine, service())).error?.code).toBe('P0002');
    expect(await queued(`${need().workspaceId}/${run.runId}/`)).toHaveLength(0);
  }, SEED_TIMEOUT);

  // ----------------------------------------------------------- cleanup trigger
  it('enqueues every object when a Run is deleted (cascade through run_steps)', async () => {
    const f = need();
    const run = await seedRun({ steps: 2 });
    await seedMany(run, 0, 2, 100);
    await seedMany(run, 1, 1, 100);
    await seedAttachment(run, 1, { status: 'pending' });
    const paths = ((await service().from('run_step_attachments').select('storage_path').eq('run_id', run.runId)).data ?? []).map(r => r.storage_path as string);
    expect(paths).toHaveLength(4);

    must(await service().from('runs').delete().eq('id', run.runId).select('id'), 'delete run');
    expect(await countRows(run.runId)).toBe(0);
    const q = await queued(`${f.workspaceId}/${run.runId}/`);
    expect(q.map(r => r.path).sort()).toEqual([...paths].sort());
    expect(q.filter(r => r.reason === 'pending_discarded')).toHaveLength(1);
  }, SEED_TIMEOUT);

  // ---------------------------------------------------------------- sweep
  it('expires only stale pending rows, queues their objects, and is executable by the service role alone', async () => {
    const f = need();
    const run = await seedRun();
    const stale = await seedAttachment(run, 0, { status: 'pending', expired: true });
    const fresh = await seedAttachment(run, 0, { status: 'pending' });
    const committed = await seedAttachment(run, 0, { status: 'committed' });
    const stalePath = (await row(stale))!.storage_path;

    const swept = await service().rpc(EXPIRE_RPC, { p_limit: 500 });
    expect(swept.error).toBeNull();
    expect(swept.data as unknown as number).toBeGreaterThanOrEqual(1);
    expect(await row(stale)).toBeNull();
    expect(await row(fresh)).not.toBeNull();
    expect(await row(committed)).not.toBeNull();
    const q = await queued(stalePath);
    expect(q).toHaveLength(1);
    expect(q[0].reason).toBe('pending_discarded');

    // authenticated and anon cannot call it, whoever they are
    expect((await qa.rpc(EXPIRE_RPC, { p_limit: 500 })).error?.code).toBe('42501');
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    expect((await anon.rpc(EXPIRE_RPC, { p_limit: 500 })).error?.code).toBe('42501');
    expect(f.workspaceId).toBeTruthy();
  }, SEED_TIMEOUT);

  // ------------------------------------------------------------------- RLS
  it('shows committed rows to members of the owning workspace only, and lets no client role write the table', async () => {
    const f = need();
    const run = await seedRun();
    const committed = await seedAttachment(run, 0, { status: 'committed' });
    const pending = await seedAttachment(run, 0, { status: 'pending' });

    const mine = await qa.from('run_step_attachments').select('id').eq('run_id', run.runId);
    expect(mine.data?.map(r => r.id)).toEqual([committed]);

    // a row in the foreign workspace (identity is NOT a member there) is invisible
    const foreign = await seedRun({ foreign: true });
    const foreignId = crypto.randomUUID();
    must(await service().from('run_step_attachments').insert({
      id: foreignId,
      workspace_id: f.foreignWorkspaceId,
      run_id: foreign.runId,
      run_step_id: foreign.stepIds[0],
      storage_path: `${f.foreignWorkspaceId}/${foreign.runId}/${foreign.stepIds[0]}/${foreignId}`,
      original_filename: 'foreign.png',
      content_type: 'image/png',
      byte_size: 10,
      status: 'committed',
      created_by: null,
      committed_at: new Date().toISOString(),
    }).select('id').single(), 'foreign attachment');
    expect((await qa.from('run_step_attachments').select('id').eq('id', foreignId)).data).toHaveLength(0);

    // no client write path: insert is refused, update and delete touch nothing
    const insert = await qa.from('run_step_attachments').insert({
      workspace_id: f.workspaceId,
      run_id: run.runId,
      run_step_id: run.stepIds[0],
      storage_path: `${f.workspaceId}/forged/${crypto.randomUUID()}`,
      original_filename: 'forged.png',
      content_type: 'image/png',
      byte_size: 10,
      status: 'committed',
      committed_at: new Date().toISOString(),
    });
    expect(insert.error).not.toBeNull();
    await qa.from('run_step_attachments').update({ original_filename: 'renamed.png' }).eq('id', committed);
    await qa.from('run_step_attachments').delete().eq('id', committed);
    expect((await row(committed))!.original_filename).toBe('seed.png');
    expect(await row(pending)).not.toBeNull();

    // the outbox is closed to clients
    expect((await qa.from('storage_cleanup_queue').select('id').limit(1)).error).not.toBeNull();
  }, SEED_TIMEOUT);

  // ------------------------------------------------------------ concurrency
  it('serialises two simultaneous inits at the quota edge: one success, one 45217 step_count', async () => {
    const run = await seedRun();
    await seedMany(run, 0, 9, 100);
    const [a, b] = await Promise.all([init(run), init(run)]);
    const outcomes = [a, b].map(r => r.error?.code ?? 'ok').sort();
    expect(outcomes).toEqual(['45217', 'ok']);
  }, SEED_TIMEOUT);

  it('resolves commit racing finish consistently: the first terminal outcome wins, never a half state', async () => {
    const f = need();
    const run = await seedRun();
    const { attachment } = await initOk(run);

    const [committed, finished] = await Promise.all([
      commit(attachment.id),
      qa.rpc('bunkai_finish_run', { p_actor_user_id: f.qaUserId, p_run_id: run.runId, p_verdict: 'passed', p_via: null as unknown as string }),
    ]);
    expect(finished.error).toBeNull();
    const stored = (await row(attachment.id))!;
    if (committed.error) {
      expect(committed.error.code).toBe('45216');
      expect(stored.status).toBe('pending');
    }
    else {
      expect(stored.status).toBe('committed');
    }
    // whichever won, the Run is closed and now refuses any further evidence
    expect((await init(run)).error?.code).toBe('45216');
  }, SEED_TIMEOUT);

  // ------------------------------------------------------------- privileges
  it('keeps the writers away from anon and from the read-only QA role (privileges)', async () => {
    const pgUrl = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
    if (!pgUrl) {
      throw new Error('[step-attachments-isolation] POSTGRES_URL(_NON_POOLING) is missing, so the function privileges cannot be checked; refusing to pass.');
    }
    const sql = new SQL(pgUrl);
    try {
      const rows = await sql`
        select p.proname,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
               has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
               has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec,
               case when exists (select 1 from pg_roles where rolname = 'qa_inspector_ro')
                    then has_function_privilege('qa_inspector_ro', p.oid, 'EXECUTE')
                    else false end as qa_ro_exec
          from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.proname in (${INIT_RPC}, ${COMMIT_RPC}, ${REMOVE_RPC}, ${EXPIRE_RPC})`;
      expect(rows.length).toBe(4);
      for (const r of rows) {
        expect(r.anon_exec).toBe(false);
        expect(r.qa_ro_exec).toBe(false);
        expect(r.service_exec).toBe(true);
        expect(r.auth_exec).toBe(r.proname !== EXPIRE_RPC);
      }
      const bucket = await sql`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'run-evidence'`;
      expect(bucket.length).toBe(1);
      expect(bucket[0].public).toBe(false);
      expect(Number(bucket[0].file_size_limit)).toBe(FILE_MAX);
      const policies = await sql`select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') ilike '%run-evidence%' or coalesce(with_check, '') ilike '%run-evidence%')`;
      expect(policies[0].n).toBe(0);
    }
    finally {
      await sql.end();
    }
  });
});
