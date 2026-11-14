import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-513 — isolation, step counts and filters of `bunkai_list_workspace_runs`
// (migration 0127), proven against the REAL database.
//
// The function is SECURITY INVOKER with no identity parameter (ADR-0012's
// preferred form), so isolation is Postgres RLS running as the caller. A
// service-role call bypasses RLS and would prove nothing, so every assertion
// below runs through a REAL authenticated session: the declared automation
// identity (`.agents/project.yaml` -> `testing.automation_identity`), logged in
// with `signInWithPassword` on the anon key, the app's own login path. The
// service-role client only seeds and removes fixtures.
//
// Fixture: two workspaces, IN (the identity is an active member, granted a
// throwaway membership if it was not one already) and OUT (the identity is not
// a member). Each gets a throwaway Project, environment, Test and Runs.
//
// Env-gated: needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL, QA_E2E_USER_PASSWORD. It
// skips loudly when they are missing, and logs + passes when the function is
// not deployed yet or seed state cannot satisfy a precondition.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasEnv = Boolean(url && anonKey && serviceKey && qaEmail && qaPassword);
const describeOrSkip = hasEnv ? describe : describe.skip;
if (!hasEnv) {
  console.warn('[workspace-runs-isolation] skipped: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_E2E_USER_EMAIL, QA_E2E_USER_PASSWORD.');
}

const RPC = 'bunkai_list_workspace_runs';
const PREFIX = `bk513-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface Item {
  id: string
  project_id: string
  project_slug: string | null
  environment_name: string | null
  executor_mode: string
  status: string
  passed_steps: number
  failed_steps: number
  blocked_steps: number
}
interface Page { items: Item[], next_cursor: { started_at: string, id: string } | null }

interface Seeded {
  projectId: string
  testId: string
  runIds: string[]
}
interface Fixture {
  inWorkspaceId: string
  outWorkspaceId: string
  in: Seeded
  out: Seeded
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

let fixture: Fixture | null = null;
let caller: SupabaseClient | null = null;
let skipReason: string | null = null;
// Recorded as soon as it happens, so cleanup runs even when seeding fails halfway.
let grantedMembership: { workspaceId: string, userId: string } | null = null;

// Runs of one throwaway Project, newest first by construction:
//   0: passed, human, env "Staging"   (2 passed, 1 failed, 1 blocked, 1 pending, 1 skipped steps)
//   1: failed, agent, env "Staging"
//   2: running, human, env "Staging"
//   3: aborted, ci, env "Staging"
const RUN_SHAPES = [
  { status: 'passed', executor_mode: 'human' },
  { status: 'failed', executor_mode: 'agent' },
  { status: 'running', executor_mode: 'human' },
  { status: 'aborted', executor_mode: 'ci' },
] as const;

async function seedWorkspace(db: SupabaseClient, workspaceId: string, userId: string, tag: string): Promise<Seeded> {
  const { data: project, error: projectError } = await db
    .from('projects')
    .insert({ workspace_id: workspaceId, slug: `${PREFIX}-${tag}`, name: `${PREFIX} ${tag}` })
    .select('id')
    .single();
  if (projectError) { throw projectError; }

  const { data: environment, error: environmentError } = await db
    .from('project_environments')
    .insert({ project_id: project.id, name: 'Staging' })
    .select('id')
    .single();
  if (environmentError) { throw environmentError; }

  const { data: test, error: testError } = await db
    .from('tests')
    .insert({ workspace_id: workspaceId, title: `${PREFIX} test ${tag}`, created_by: userId })
    .select('id')
    .single();
  if (testError) { throw testError; }

  const base = Date.parse('2026-06-01T12:00:00.000Z');
  const { data: runs, error: runsError } = await db
    .from('runs')
    .insert(RUN_SHAPES.map((shape, i) => ({
      workspace_id: workspaceId,
      project_id: project.id,
      test_id: test.id,
      environment_id: environment.id,
      test_title: `${PREFIX} test ${tag}`,
      status: shape.status,
      executor_mode: shape.executor_mode,
      start_token: `${PREFIX}-${tag}-${i}`,
      // runs_abort_reason_chk (0036): an aborted Run carries a reason, any other has none.
      abort_reason: shape.status === 'aborted' ? `${PREFIX} aborted` : null,
      started_at: new Date(base - i * 60_000).toISOString(),
      finished_at: shape.status === 'running' ? null : new Date(base - i * 60_000 + 30_000).toISOString(),
    })))
    .select('id, start_token');
  if (runsError) { throw runsError; }
  const runIds = RUN_SHAPES.map((_, i) => (runs ?? []).find(r => r.start_token === `${PREFIX}-${tag}-${i}`)!.id as string);

  // Steps on the newest Run: 2 passed, 1 failed, 1 blocked, 1 pending, 1 skipped.
  const { data: runAtc, error: runAtcError } = await db
    .from('run_atcs')
    .insert({ run_id: runIds[0], position: 1, atc_title: `${PREFIX} atc` })
    .select('id')
    .single();
  if (runAtcError) { throw runAtcError; }
  const { error: stepsError } = await db
    .from('run_steps')
    .insert(['passed', 'passed', 'failed', 'blocked', 'pending', 'skipped'].map((status, position) => ({
      run_atc_id: runAtc.id,
      position,
      content: `${PREFIX} step ${position}`,
      status,
    })));
  if (stepsError) { throw stepsError; }

  return { projectId: project.id as string, testId: test.id as string, runIds };
}

describeOrSkip('BK-513 — bunkai_list_workspace_runs (real session, RLS as the caller)', () => {
  beforeAll(async () => {
    const db = service();

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no user'}).`;
      return;
    }
    const userId = signIn.user.id;

    const probe = await anon.rpc(RPC, { p_workspace_id: ZERO_UUID });
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0127_workspace_runs_index.sql.`;
      return;
    }

    const { data: workspaces, error: workspacesError } = await db
      .from('workspaces')
      .select('id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (workspacesError) { throw workspacesError; }
    const { data: memberships, error: membershipsError } = await db
      .from('workspace_members')
      .select('workspace_id, status')
      .eq('user_id', userId);
    if (membershipsError) { throw membershipsError; }
    const memberOf = new Set((memberships ?? []).filter(m => m.status === 'active').map(m => m.workspace_id as string));
    const anyMembership = new Set((memberships ?? []).map(m => m.workspace_id as string));
    const ids = (workspaces ?? []).map(w => w.id as string);

    const out = ids.find(id => !anyMembership.has(id));
    let inWs = ids.find(id => memberOf.has(id));
    if (!out) {
      skipReason = 'need a live workspace the QA identity does not belong to (seed state).';
      return;
    }
    if (!inWs) {
      inWs = ids.find(id => id !== out && !anyMembership.has(id));
      if (!inWs) {
        skipReason = 'need a second live workspace for the QA identity (seed state).';
        return;
      }
      const { error: grantError } = await db
        .from('workspace_members')
        .insert({ workspace_id: inWs, user_id: userId, role: 'viewer', status: 'active' });
      if (grantError) {
        skipReason = `could not grant a temporary membership (${grantError.message}).`;
        return;
      }
      grantedMembership = { workspaceId: inWs, userId };
    }

    fixture = {
      inWorkspaceId: inWs,
      outWorkspaceId: out,
      in: await seedWorkspace(db, inWs, userId, 'in'),
      out: await seedWorkspace(db, out, userId, 'out'),
    };
    caller = anon;
  });

  // Cleans by PREFIX, not by the fixture object, so a seed that failed halfway
  // leaves nothing behind either.
  afterAll(async () => {
    if (!hasEnv) { return; }
    const db = service();
    // Runs first (runs.test_id is ON DELETE RESTRICT); run_atcs/run_steps cascade,
    // and a Project delete cascades its environments.
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    await db.from('projects').delete().like('slug', `${PREFIX}%`);
    await db.from('tests').delete().like('title', `${PREFIX}%`);
    if (grantedMembership) {
      await db.from('workspace_members').delete().eq('workspace_id', grantedMembership.workspaceId).eq('user_id', grantedMembership.userId);
    }
  });

  async function list(args: Record<string, unknown>): Promise<Page> {
    const { data, error } = await caller!.rpc(RPC, args);
    if (error) { throw error; }
    return data as unknown as Page;
  }

  it('lists every Run of the caller\'s Project, newest first, including running and aborted', async () => {
    if (!fixture) { return warn(); }
    const page = await list({ p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.in.projectId });
    expect(page.items.map(i => i.id)).toEqual(fixture.in.runIds);
    expect(page.items.map(i => i.status)).toEqual(['passed', 'failed', 'running', 'aborted']);
    expect(page.next_cursor).toBeNull();
  });

  it('a workspace the caller does not belong to lists nothing (AC-19)', async () => {
    if (!fixture) { return warn(); }
    const page = await list({ p_workspace_id: fixture.outWorkspaceId });
    expect(page.items).toEqual([]);
  });

  it('a foreign Project id used as a filter on the caller\'s workspace lists nothing', async () => {
    if (!fixture) { return warn(); }
    const page = await list({ p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.out.projectId });
    expect(page.items).toEqual([]);
  });

  it('the caller\'s workspace never lists a Run of the other workspace', async () => {
    if (!fixture) { return warn(); }
    const outIds = new Set(fixture.out.runIds);
    let cursor: Page['next_cursor'] = null;
    for (let i = 0; i < 200; i++) {
      const page = await list({
        p_workspace_id: fixture.inWorkspaceId,
        p_cursor_started_at: cursor?.started_at,
        p_cursor_id: cursor?.id,
      });
      expect(page.items.some(item => outIds.has(item.id))).toBe(false);
      cursor = page.next_cursor;
      if (cursor === null) { break; }
    }
  });

  it('the count the sidebar reads excludes the other workspace', async () => {
    if (!fixture) { return warn(); }
    const { count, error } = await caller!
      .from('runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', fixture.outWorkspaceId);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('counts passed, failed and blocked steps of each Run only', async () => {
    if (!fixture) { return warn(); }
    const page = await list({ p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.in.projectId });
    const [newest, second] = page.items;
    expect([newest.passed_steps, newest.failed_steps, newest.blocked_steps]).toEqual([2, 1, 1]);
    expect([second.passed_steps, second.failed_steps, second.blocked_steps]).toEqual([0, 0, 0]);
  });

  it('filters compose: outcome, mode and a case-insensitive environment name', async () => {
    if (!fixture) { return warn(); }
    const scope = { p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.in.projectId };
    const failed = await list({ ...scope, p_status: ['failed'] });
    expect(failed.items.map(i => i.id)).toEqual([fixture.in.runIds[1]]);

    const manual = await list({ ...scope, p_mode: 'manual' });
    expect(manual.items.map(i => i.id)).toEqual([fixture.in.runIds[0], fixture.in.runIds[2]]);

    const automatedPassed = await list({ ...scope, p_mode: 'automated', p_status: ['passed'] });
    expect(automatedPassed.items).toEqual([]);

    const staging = await list({ ...scope, p_environment_name: 'staging' });
    expect(staging.items).toHaveLength(4);
    const production = await list({ ...scope, p_environment_name: 'production' });
    expect(production.items).toEqual([]);
  });

  it('pages with the cursor until the last Run, filters travelling with it', async () => {
    if (!fixture) { return warn(); }
    const scope = { p_workspace_id: fixture.inWorkspaceId, p_project_id: fixture.in.projectId, p_limit: 3 };
    const first = await list(scope);
    expect(first.items.map(i => i.id)).toEqual(fixture.in.runIds.slice(0, 3));
    expect(first.next_cursor).not.toBeNull();
    const second = await list({ ...scope, p_cursor_started_at: first.next_cursor!.started_at, p_cursor_id: first.next_cursor!.id });
    expect(second.items.map(i => i.id)).toEqual(fixture.in.runIds.slice(3));
    expect(second.next_cursor).toBeNull();
  });
});

function warn() {
  console.warn(`[workspace-runs-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
