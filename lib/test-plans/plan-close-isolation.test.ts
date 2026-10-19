import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

// BK-207 — DB-integration guard for closing and reopening a Test Plan
// (`bunkai_close_test_plan` / `bunkai_reopen_test_plan`, migration
// 0095_plan_close.sql).
//
// Both functions are SECURITY DEFINER with NO identity parameter: the actor is
// auth.uid(), so a mocked `db.rpc` proves nothing about them. This suite signs in
// through the app's real password path as the declared automation identity
// (`QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD`, `.agents/project.yaml` ->
// `testing.automation_identity`), never a minted JWT and never an impersonated
// account. The identity's ROLE in the suite's own throwaway workspace is switched
// through the service client (viewer / member / admin / owner), and "somebody else
// created the plan" is modelled with `created_by = null`. Service role is used ONLY
// for fixture seed, role switching, read-back and teardown, which is sanctioned: it
// obtains no session.
//
// What it proves against the real database:
//   * close: verdict, trimmed summary, closer, close time and the BK-204 progress
//     snapshot are written together; summary is optional (empty, whitespace-only with
//     tab/newline/NBSP, absent) and stored NULL; 4000 characters pass, 4001 fail with
//     22001; an empty plan closes with an empty snapshot;
//   * the snapshot is FROZEN: a run recorded afterwards changes the live progress but
//     not the stored snapshot (run outcomes are never blocked by plan state);
//   * the error contract: 45604 verdict missing, 45605 verdict invalid, 45603 close of
//     a closed plan / reopen of an open plan, 45606 forbidden role, P0002 for a missing
//     plan, a foreign-workspace plan and a caller with no session; nothing is written
//     by any refused call;
//   * authorization: creator with write access, admin and owner may close and reopen;
//     a plain member who is not the creator, a viewer, and a creator demoted to viewer
//     may not; authorization is decided BEFORE the state check;
//   * a closed plan rejects edits and membership changes with 45603;
//   * reopen clears verdict, summary, closer, close time and snapshot, the history keeps
//     both entries, and the plan can be closed again;
//   * concurrency: two simultaneous closes produce exactly one success, one 45603 and
//     exactly one history entry;
//   * grants and the structural CHECK (an open plan cannot carry closure data).
//
// FAIL-CLOSED GATE. This file is evidence only when it EXECUTES. It is registered as
// SKIPPED, with a loud warning at module load, in exactly two legitimate cases:
//   1. there is no database environment at all (`NEXT_PUBLIC_SUPABASE_URL`,
//      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` absent), or
//   2. the database answers that `bunkai_close_test_plan` does not exist (migration
//      0095 not applied yet).
// In EVERY other case the suite FAILS instead of passing quietly: a missing automation
// identity, a failed login, a fixture that cannot be seeded, an unexpected answer from
// the probe, leftover fixtures at teardown. Every test also asserts at least one
// expectation (`expect.hasAssertions()`). A run counts as evidence only if its output
// shows zero skipped tests.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasDbEnv = Boolean(url && anonKey && serviceKey);
if (!hasDbEnv) {
  console.warn('[plan-close-isolation] SKIPPED ENTIRELY: no database environment (needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY). No assertion in this file ran, so nothing here is evidence about the functions.');
}

const CLOSE_RPC = 'bunkai_close_test_plan';
const REOPEN_RPC = 'bunkai_reopen_test_plan';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Is the function deployed? A deployed function answers P0002 to a caller with no
// session (the service role) for any id. "Function does not exist" (42883 / PGRST202)
// is the one legitimate reason to skip; ANY other answer is a failure of the file
// itself, never a quiet skip.
let deployed = false;
if (hasDbEnv) {
  const probe = await createClient(url!, serviceKey!, { auth: { persistSession: false } })
    .rpc(CLOSE_RPC, { p_test_plan_id: ZERO_UUID, p_verdict: 'passed' });
  const code = probe.error?.code ?? 'no error';
  if (code === 'P0002') {
    deployed = true;
  }
  else if (code === '42883' || code === 'PGRST202') {
    console.warn(`[plan-close-isolation] SKIPPED ENTIRELY: ${CLOSE_RPC} is not deployed (${code}). Apply migration 0095_plan_close.sql. No assertion in this file ran, so nothing here is evidence about the functions.`);
  }
  else {
    throw new Error(`[plan-close-isolation] unexpected answer from the ${CLOSE_RPC} deploy probe (${code}: ${probe.error?.message ?? 'no message'}). Expected P0002 (deployed) or 42883/PGRST202 (not deployed).`);
  }
}
const describeOrSkip = hasDbEnv && deployed ? describe : describe.skip;

const PREFIX = `bk207-close-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SEED_TIMEOUT = 60_000;

type Role = 'viewer' | 'member' | 'admin' | 'owner';
type RunStatus = 'passed' | 'failed' | 'aborted' | 'running';
interface RunSpec { status: RunStatus, start: string }
interface Fixture {
  workspaceId: string
  foreignWorkspaceId: string
  qaUserId: string
  projectId: string
  foreignProjectId: string
  envId: string
}
interface ClosedPlan {
  id: string
  status: string
  verdict: string | null
  summary: string | null
  closed_by: string | null
  closed_at: string | null
  progress_snapshot: { member_count: number, passed_pct: number | null, counts: Record<string, number>, tests: unknown[] } | null
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// Seeding failures are test failures: every step throws, nothing is swallowed.
function must<T>(result: { data: T, error: { message: string } | null }, what: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`[plan-close-isolation] fixture seed failed at "${what}": ${result.error?.message ?? 'no row returned'}`);
  }
  return result.data;
}

let fixture: Fixture | null = null;
let qa: ReturnType<typeof service>;
const createdWorkspaceIds: string[] = [];

// A test that runs while the fixture is missing FAILS (it never passes vacuously).
function need(): Fixture {
  if (!fixture) {
    throw new Error('[plan-close-isolation] the fixture was not seeded (see the beforeAll failure above); refusing to pass.');
  }
  return fixture;
}

describeOrSkip('BK-207 — close and reopen a plan against the real database', () => {
  beforeEach(() => {
    expect.hasAssertions();
  });

  beforeAll(async () => {
    if (!qaEmail || !qaPassword) {
      throw new Error('[plan-close-isolation] QA_E2E_USER_EMAIL and QA_E2E_USER_PASSWORD are required when a database environment is present (the functions read auth.uid(): only a real session proves them).');
    }
    const db = service();

    qa = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await qa.auth.signInWithPassword({ email: qaEmail, password: qaPassword });
    if (signInError || !signIn.session || !signIn.user) {
      throw new Error(`[plan-close-isolation] QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
    }
    const qaUserId = signIn.user.id;

    // The suite seeds BOTH workspaces itself, on the 'cloud' plan (the default
    // 'community' plan caps a workspace at 3 Projects). The identity is an active
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

    fixture = {
      workspaceId,
      foreignWorkspaceId,
      qaUserId,
      projectId: project.id as string,
      foreignProjectId: foreignProject.id as string,
      envId: env.id as string,
    };
  }, SEED_TIMEOUT);

  afterAll(async () => {
    if (createdWorkspaceIds.length === 0) { return; }
    const db = service();
    const ws = createdWorkspaceIds;
    // Children before parents: runs.test_id is ON DELETE RESTRICT; test_plan_tests
    // cascades from plans and tests; activity_log rows of the suite's workspaces go
    // first; the workspaces cascade the rest. A delete that fails is collected and
    // thrown, never swallowed: leftover fixtures must be loud.
    const failures: string[] = [];
    const attempt = async (what: string, op: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await op;
      if (error) { failures.push(`${what}: ${error.message}`); }
    };
    await attempt('runs', db.from('runs').delete().in('workspace_id', ws));
    await attempt('test_plans', db.from('test_plans').delete().in('workspace_id', ws));
    await attempt('tests', db.from('tests').delete().in('workspace_id', ws));
    await attempt('activity_log', db.from('activity_log').delete().in('workspace_id', ws));
    await attempt('projects', db.from('projects').delete().in('workspace_id', ws));
    await attempt('workspace_members', db.from('workspace_members').delete().in('workspace_id', ws));
    await attempt('workspaces', db.from('workspaces').delete().in('id', ws));
    if (failures.length > 0) {
      throw new Error(`[plan-close-isolation] teardown left fixtures behind (${PREFIX}): ${failures.join('; ')}`);
    }
  }, SEED_TIMEOUT);

  // ---------------------------------------------------------------- helpers
  let counter = 0;
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

  // created_by = qa means "the identity created it"; null means "somebody else did".
  async function newPlan(opts: { creator?: 'qa' | 'other', status?: 'open' | 'closed', foreign?: boolean } = {}): Promise<string> {
    const f = need();
    const foreign = opts.foreign ?? false;
    const { data, error } = await service().from('test_plans').insert({
      workspace_id: foreign ? f.foreignWorkspaceId : f.workspaceId,
      project_id: foreign ? f.foreignProjectId : f.projectId,
      name: `${PREFIX} plan ${++counter}`,
      status: opts.status ?? 'open',
      created_by: (opts.creator ?? 'qa') === 'qa' ? f.qaUserId : null,
    }).select('id').single();
    if (error) { throw error; }
    return data.id as string;
  }

  // One test per entry of `runsPerTest`, joined to the plan, with that test's runs.
  async function seedMembers(planId: string, runsPerTest: RunSpec[][]): Promise<string[]> {
    const f = need();
    const db = service();
    const tests = must(await db.from('tests').insert(runsPerTest.map((_, i) => ({
      workspace_id: f.workspaceId,
      title: `${PREFIX} t${++seq}-${i}`,
      created_by: f.qaUserId,
    }))).select('id'), 'tests');
    const testIds = tests.map(t => t.id as string);
    const base = Date.parse('2026-06-01T00:00:00.000Z');
    must(await db.from('test_plan_tests').insert(testIds.map((testId, i) => ({
      test_plan_id: planId,
      test_id: testId,
      added_by: f.qaUserId,
      created_at: new Date(base + i * 1000).toISOString(),
    }))).select('id'), 'plan members');
    const runs = runsPerTest.flatMap((specs, i) => specs.map(spec => seedRun(testIds[i], spec)));
    if (runs.length > 0) {
      must(await db.from('runs').insert(runs).select('id'), 'runs');
    }
    return testIds;
  }

  function seedRun(testId: string, spec: RunSpec) {
    const f = need();
    return {
      workspace_id: f.workspaceId,
      project_id: f.projectId,
      test_id: testId,
      environment_id: f.envId,
      status: spec.status,
      executor_mode: 'human',
      abort_reason: spec.status === 'aborted' ? 'seeded abort' : null,
      start_token: `${PREFIX}-${++seq}`,
      test_title: `${PREFIX} title`,
      started_at: spec.start,
      finished_at: spec.status === 'running' ? null : spec.start,
    };
  }

  const passedRun = (start = '2026-06-10T00:00:00.000Z'): RunSpec => ({ status: 'passed', start });

  async function close(planId: string, verdict: string | null, summary?: string | null, client = qa) {
    return client.rpc(CLOSE_RPC, { p_test_plan_id: planId, p_verdict: verdict as string, p_summary: summary as string });
  }

  async function reopen(planId: string, client = qa) {
    return client.rpc(REOPEN_RPC, { p_test_plan_id: planId });
  }

  async function row(planId: string): Promise<ClosedPlan> {
    const { data, error } = await service().from('test_plans').select('id, status, verdict, summary, closed_by, closed_at, progress_snapshot').eq('id', planId).single();
    if (error) { throw error; }
    return data as unknown as ClosedPlan;
  }

  async function history(planId: string, action?: string) {
    let query = service().from('activity_log').select('actor_user_id, action, payload').eq('entity_type', 'test_plan').eq('entity_id', planId).order('created_at', { ascending: true });
    if (action) { query = query.eq('action', action); }
    const { data, error } = await query;
    if (error) { throw error; }
    return data as unknown as Array<{ actor_user_id: string, action: string, payload: Record<string, unknown> }>;
  }

  // Nothing was written: still open, no closure data, no closure history.
  async function expectUntouchedOpen(planId: string) {
    const r = await row(planId);
    expect(r.status).toBe('open');
    expect([r.verdict, r.summary, r.closed_by, r.closed_at, r.progress_snapshot]).toEqual([null, null, null, null, null]);
    expect((await history(planId)).filter(h => h.action.startsWith('test_plan.c') || h.action === 'test_plan.reopened')).toHaveLength(0);
  }

  // ------------------------------------------------------------- the close
  it('closes an open plan: verdict, summary, closer, time and the progress snapshot are written together', async () => {
    const f = need();
    const planId = await newPlan();
    await seedMembers(planId, [[passedRun()], [passedRun()], []]);

    const { data, error } = await close(planId, 'passed', '  One known flaky test, accepted.  ');
    expect(error).toBeNull();
    const returned = data as unknown as ClosedPlan;
    expect(returned.status).toBe('closed');
    expect(returned.verdict).toBe('passed');
    expect(returned.summary).toBe('One known flaky test, accepted.');

    const stored = await row(planId);
    expect(stored.status).toBe('closed');
    expect(stored.verdict).toBe('passed');
    expect(stored.summary).toBe('One known flaky test, accepted.');
    expect(stored.closed_by).toBe(f.qaUserId);
    expect(stored.closed_at).not.toBeNull();
    expect(stored.progress_snapshot?.member_count).toBe(3);
    expect(stored.progress_snapshot?.passed_pct).toBe(66);
    expect(stored.progress_snapshot?.counts).toEqual({ passed: 2, failed: 0, aborted: 0, in_progress: 0, not_run: 1 });
    expect(stored.progress_snapshot?.tests).toHaveLength(3);

    const entries = await history(planId, 'test_plan.closed');
    expect(entries).toHaveLength(1);
    expect(entries[0].actor_user_id).toBe(f.qaUserId);
    expect(entries[0].payload).toMatchObject({ verdict: 'passed', member_count: 3, passed_pct: 66 });
  }, SEED_TIMEOUT);

  it('closes with verdict failed', async () => {
    const planId = await newPlan();
    const { error } = await close(planId, 'failed', 'Two regressions.');
    expect(error).toBeNull();
    expect((await row(planId)).verdict).toBe('failed');
  });

  it('stores an optional summary as NULL when absent, empty or whitespace-only (space, tab, newline, NBSP)', async () => {
    for (const summary of [undefined, null, '', '   ', '\t\n  \r\n']) {
      const planId = await newPlan();
      const { error } = await close(planId, 'passed', summary as string | null);
      expect(error).toBeNull();
      const stored = await row(planId);
      expect(stored.status).toBe('closed');
      expect(stored.summary).toBeNull();
    }
  }, SEED_TIMEOUT);

  it('bounds the summary at 4000 characters after trimming (emoji count as characters)', async () => {
    const ok = await newPlan();
    expect((await close(ok, 'passed', `  ${'x'.repeat(4000)}  `)).error).toBeNull();
    expect((await row(ok)).summary).toHaveLength(4000);

    const emoji = await newPlan();
    expect((await close(emoji, 'passed', '🙂'.repeat(4000))).error).toBeNull();

    const tooLong = await newPlan();
    const refused = await close(tooLong, 'passed', 'x'.repeat(4001));
    expect(refused.error?.code).toBe('22001');
    await expectUntouchedOpen(tooLong);
  }, SEED_TIMEOUT);

  it('closes a plan with zero member tests and snapshots an empty plan', async () => {
    const planId = await newPlan();
    const { error } = await close(planId, 'passed');
    expect(error).toBeNull();
    const stored = await row(planId);
    expect(stored.progress_snapshot?.member_count).toBe(0);
    expect(stored.progress_snapshot?.passed_pct).toBeNull();
    expect(stored.progress_snapshot?.tests).toEqual([]);
  });

  it('closes a plan whose members were never run (not-run is a warning, never a block)', async () => {
    const planId = await newPlan();
    await seedMembers(planId, [[], []]);
    expect((await close(planId, 'failed')).error).toBeNull();
    expect((await row(planId)).progress_snapshot?.counts.not_run).toBe(2);
  }, SEED_TIMEOUT);

  it('freezes the snapshot: a run recorded after the close changes live progress, not the stored one', async () => {
    const planId = await newPlan();
    const [testId] = await seedMembers(planId, [[]]);
    expect((await close(planId, 'passed')).error).toBeNull();
    const before = (await row(planId)).progress_snapshot;
    expect(before?.counts.not_run).toBe(1);

    // Run outcomes are never blocked by plan state (AI Product Owner decision).
    must(await service().from('runs').insert(seedRun(testId, passedRun('2026-07-01T00:00:00.000Z'))).select('id'), 'late run');

    const live = await qa.rpc('bunkai_plan_progress', { p_plan_id: planId });
    expect((live.data as unknown as { counts: { passed: number } }).counts.passed).toBe(1);
    expect((await row(planId)).progress_snapshot).toEqual(before);
  }, SEED_TIMEOUT);

  // ----------------------------------------------------------- the contract
  it('rejects a missing verdict with 45604 and writes nothing', async () => {
    for (const verdict of [null, '', '   ']) {
      const planId = await newPlan();
      const { error } = await close(planId, verdict, 'a summary is not a verdict');
      expect(error?.code).toBe('45604');
      await expectUntouchedOpen(planId);
    }
  }, SEED_TIMEOUT);

  it('rejects a verdict outside {passed, failed} with 45605 and writes nothing', async () => {
    for (const verdict of ['flaky', 'PASSED', 'pass', 'blocked']) {
      const planId = await newPlan();
      const { error } = await close(planId, verdict);
      expect(error?.code).toBe('45605');
      await expectUntouchedOpen(planId);
    }
  }, SEED_TIMEOUT);

  it('rejects a second close with 45603 and keeps exactly one history entry', async () => {
    const planId = await newPlan();
    expect((await close(planId, 'passed', 'first')).error).toBeNull();
    const second = await close(planId, 'failed', 'second');
    expect(second.error?.code).toBe('45603');
    const stored = await row(planId);
    expect(stored.verdict).toBe('passed');
    expect(stored.summary).toBe('first');
    expect(await history(planId, 'test_plan.closed')).toHaveLength(1);
  });

  it('rejects the reopen of an open plan with 45603', async () => {
    const planId = await newPlan();
    const { error } = await reopen(planId);
    expect(error?.code).toBe('45603');
    await expectUntouchedOpen(planId);
  });

  it('answers P0002 for a missing plan, a foreign-workspace plan and a caller with no session', async () => {
    expect((await close(ZERO_UUID, 'passed')).error?.code).toBe('P0002');
    expect((await reopen(ZERO_UUID)).error?.code).toBe('P0002');

    const foreignPlan = await newPlan({ foreign: true });
    expect((await close(foreignPlan, 'passed')).error?.code).toBe('P0002');
    expect((await reopen(foreignPlan)).error?.code).toBe('P0002');
    expect((await row(foreignPlan)).status).toBe('open');

    // The service role has no auth.uid(): it is a member of nothing, so it fails closed.
    const own = await newPlan();
    expect((await close(own, 'passed', null, service())).error?.code).toBe('P0002');
    expect((await reopen(own, service())).error?.code).toBe('P0002');
    await expectUntouchedOpen(own);
  });

  it('is not executable by anon', async () => {
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const own = await newPlan();
    const closed = await close(own, 'passed', null, anon);
    expect(closed.error).not.toBeNull();
    expect(closed.error?.code).toBe('42501');
    const reopened = await reopen(own, anon);
    expect(reopened.error?.code).toBe('42501');
    await expectUntouchedOpen(own);
  });

  // ---------------------------------------------------------- authorization
  it('lets the creator (member), an admin and an owner close, and refuses everyone else with 45606', async () => {
    // creator with the member role: allowed
    const creatorPlan = await newPlan({ creator: 'qa' });
    await asRole('member', async () => {
      expect((await close(creatorPlan, 'passed')).error).toBeNull();
    });
    expect((await row(creatorPlan)).status).toBe('closed');

    // non-creator: admin and owner allowed
    for (const role of ['admin', 'owner'] as const) {
      const planId = await newPlan({ creator: 'other' });
      await asRole(role, async () => {
        expect((await close(planId, 'passed')).error).toBeNull();
      });
      expect((await row(planId)).status).toBe('closed');
    }

    // non-creator plain member: refused
    const memberPlan = await newPlan({ creator: 'other' });
    await asRole('member', async () => {
      expect((await close(memberPlan, 'passed')).error?.code).toBe('45606');
    });
    await expectUntouchedOpen(memberPlan);

    // viewer who is not the creator, and a creator demoted to viewer: refused
    const viewerPlan = await newPlan({ creator: 'other' });
    const demotedPlan = await newPlan({ creator: 'qa' });
    await asRole('viewer', async () => {
      expect((await close(viewerPlan, 'passed')).error?.code).toBe('45606');
      expect((await close(demotedPlan, 'passed')).error?.code).toBe('45606');
    });
    await expectUntouchedOpen(viewerPlan);
    await expectUntouchedOpen(demotedPlan);
  }, SEED_TIMEOUT);

  it('decides authorization before state: a refused caller learns nothing about a closed plan', async () => {
    const planId = await newPlan({ creator: 'other' });
    expect((await close(planId, 'passed')).error).toBeNull();
    await asRole('member', async () => {
      expect((await close(planId, 'passed')).error?.code).toBe('45606');
      expect((await reopen(planId)).error?.code).toBe('45606');
    });
    await asRole('viewer', async () => {
      expect((await reopen(planId)).error?.code).toBe('45606');
    });
    expect((await row(planId)).status).toBe('closed');
  }, SEED_TIMEOUT);

  // --------------------------------------------------------- read-only state
  it('keeps a closed plan read-only: edits and membership changes are rejected with 45603', async () => {
    const planId = await newPlan();
    const [memberTestId] = await seedMembers(planId, [[passedRun()]]);
    const extra = must(await service().from('tests').insert({ workspace_id: need().workspaceId, title: `${PREFIX} extra`, created_by: need().qaUserId }).select('id').single(), 'extra test');
    expect((await close(planId, 'passed', 'frozen')).error).toBeNull();

    const edit = await qa.rpc('bunkai_update_test_plan', { p_test_plan_id: planId, p_name: `${PREFIX} renamed`, p_description: '', p_goal: '' });
    expect(edit.error?.code).toBe('45603');
    const add = await qa.rpc('bunkai_add_tests_to_plan', { p_test_plan_id: planId, p_test_ids: [extra.id as string] });
    expect(add.error?.code).toBe('45603');
    const remove = await qa.rpc('bunkai_remove_test_from_plan', { p_test_plan_id: planId, p_test_id: memberTestId });
    expect(remove.error?.code).toBe('45603');

    const stored = await row(planId);
    expect(stored.verdict).toBe('passed');
    expect(stored.summary).toBe('frozen');
    const members = await service().from('test_plan_tests').select('test_id').eq('test_plan_id', planId);
    expect(members.data).toHaveLength(1);
  }, SEED_TIMEOUT);

  // ----------------------------------------------------------------- reopen
  it('reopens a closed plan: closure data cleared, history kept, edits and a second close work again', async () => {
    const f = need();
    const planId = await newPlan();
    await seedMembers(planId, [[passedRun()]]);
    expect((await close(planId, 'failed', 'first cycle')).error).toBeNull();

    const { data, error } = await reopen(planId);
    expect(error).toBeNull();
    expect((data as unknown as ClosedPlan).status).toBe('open');

    const stored = await row(planId);
    expect(stored.status).toBe('open');
    expect([stored.verdict, stored.summary, stored.closed_by, stored.closed_at, stored.progress_snapshot]).toEqual([null, null, null, null, null]);

    const trail = await history(planId);
    expect(trail.map(h => h.action).filter(a => a === 'test_plan.closed' || a === 'test_plan.reopened')).toEqual(['test_plan.closed', 'test_plan.reopened']);
    const reopened = trail.find(h => h.action === 'test_plan.reopened');
    expect(reopened?.actor_user_id).toBe(f.qaUserId);
    expect(reopened?.payload).toEqual({ previous_verdict: 'failed' });

    const edit = await qa.rpc('bunkai_update_test_plan', { p_test_plan_id: planId, p_name: `${PREFIX} edited after reopen`, p_description: '', p_goal: '' });
    expect(edit.error).toBeNull();

    expect((await close(planId, 'passed', 'second cycle')).error).toBeNull();
    expect(await history(planId, 'test_plan.closed')).toHaveLength(2);
    expect((await row(planId)).summary).toBe('second cycle');
  }, SEED_TIMEOUT);

  it('lets an admin reopen a plan another member closed, and refuses a plain member with 45606', async () => {
    const planId = await newPlan({ creator: 'other' });
    expect((await close(planId, 'passed')).error).toBeNull();
    await asRole('member', async () => {
      expect((await reopen(planId)).error?.code).toBe('45606');
    });
    expect((await row(planId)).status).toBe('closed');
    await asRole('admin', async () => {
      expect((await reopen(planId)).error).toBeNull();
    });
    expect((await row(planId)).status).toBe('open');
  }, SEED_TIMEOUT);

  // ------------------------------------------------------------ concurrency
  it('serialises two simultaneous closes: one success, one 45603, one history entry', async () => {
    const planId = await newPlan();
    await seedMembers(planId, [[passedRun()], []]);
    const [a, b] = await Promise.all([
      close(planId, 'passed', 'from A'),
      close(planId, 'failed', 'from B'),
    ]);
    const outcomes = [a, b].map(r => r.error?.code ?? 'ok').sort();
    expect(outcomes).toEqual(['45603', 'ok']);
    expect(await history(planId, 'test_plan.closed')).toHaveLength(1);
    const stored = await row(planId);
    expect(['from A', 'from B']).toContain(stored.summary as string);
  }, SEED_TIMEOUT);

  // --------------------------------------------------- structural invariants
  it('refuses closure data on an open plan (CHECK) but still allows a closed row seeded without a verdict', async () => {
    const planId = await newPlan();
    const bad = await service().from('test_plans').update({ verdict: 'passed' }).eq('id', planId);
    expect(bad.error?.code).toBe('23514');

    const badVerdict = await newPlan({ status: 'closed' });
    const invalid = await service().from('test_plans').update({ verdict: 'flaky' }).eq('id', badVerdict);
    expect(invalid.error?.code).toBe('23514');

    // BK-202/BK-203 suites seed closed rows directly; that must stay legal.
    expect((await row(badVerdict)).status).toBe('closed');
  });
});
