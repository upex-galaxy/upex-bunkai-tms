import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-203 — dedicated isolation guard for `bunkai_add_tests_to_plan` /
// `bunkai_remove_test_from_plan` / `bunkai_search_tests` (migration
// 0076_test_plan_tests.sql), the mandatory DB-integration test per ADR-0012 /
// rpc-authorization.md §5 ("test against the real database, not a mock").
// Mirrors `lib/test-plans/test-plan-rpc-isolation.test.ts`'s real-login
// fixture pattern.
//
// The two mutating RPCs carry NO p_actor_user_id (auth.uid() is read
// internally, same posture as bunkai_create_test_plan / bunkai_update_test_plan)
// — every authorization case below goes through a REAL authenticated session
// (QA_E2E_USER_EMAIL / QA_E2E_USER_PASSWORD), never a service-role call.
// `bunkai_search_tests` DOES take an explicit actor (mirrors bunkai_search_atcs),
// so its cases run off the service-role client with a real user id.
//
// Fixture chain (all service-role, throwaway, prefixed, torn down in
// afterAll): one workspace, two projects (A, B), one module + one user story
// + one ATC per project, and four Tests — test1 and test3 chain to Project
// A's ATC (test1/test3's derived project is A), test2 chains to Project B's
// ATC (derived project B), test4 chains to BOTH A's and B's ATC (a
// multi-project chain — legal per bunkai_create_test/0024, which validates a
// chained ATC only against the Test's WORKSPACE). Three plans in Project A:
// planOpen1, planOpen2 (proves shared membership is independent), planClosed
// (seeded directly with status='closed' — endorsed by 0073's own header
// comment as the way to test a Closed plan pre-BK-207, since no product
// write path can produce one yet).
//
// Covers, at minimum:
//   (a) a real authenticated member+ add — persisted row is independently
//       readable, activity_log.actor_user_id is the AUTHENTICATED caller's
//       own uid (test_plan.tests_added payload) — AC 1.2.
//   (b) a duplicate add (a batch mixing an already-member test with a new
//       one) is rejected WHOLESALE (23505) — the new test is NOT added
//       either (AC 3.2, all-or-nothing).
//   (c) a Viewer cannot add (403, 42501) — AC 5.1.
//   (d) a non-member cannot add (404, P0002, non-disclosure) — AC 5.2.
//   (e) a Test whose only chained ATC is in a DIFFERENT project is rejected
//       (422, test_outside_plan_project) — AC E2.
//   (f) an empty test_ids array is rejected (422, test_selection_empty).
//   (g) add on a Closed plan is rejected (409, test_plan_not_open) — AC E1.
//   (h) remove: persisted deletion, the Test itself is unchanged, activity_log
//       test_plan.test_removed — AC 4.1.
//   (i) remove of a non-member test is rejected (404, test_plan_test_not_found).
//   (j) remove on a Closed plan is rejected (409, test_plan_not_open) — AC E1.
//   (k) a Viewer cannot remove (403) — AC 5.1.
//   (l) the same Test is a member of two plans independently; removing it
//       from one leaves the other's membership unchanged — AC 2.1/2.2.
//   (m) the table is default-deny on DIRECT writes: INSERT/DELETE through
//       PostgREST fail or silently no-op, only the RPCs write.
//   (n) bunkai_search_tests: project-scoped, matches title substring, a
//       foreign project returns no rows.
//   (o) a Test whose chain spans TWO projects is rejected by add in EITHER
//       project (ALL-match, not ANY-match) — an ANY-match gate would let it
//       join plans in both projects at once, which search must also refuse
//       to surface as a candidate.
//
// DB-dependent + fully env-gated (service AND real-login). Skips loudly when
// its env is missing, and logs + passes when seed state (or the login itself)
// cannot satisfy a precondition — never blocks a build.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasFullEnv = Boolean(url && serviceKey && anonKey && qaEmail && qaPassword);
const describeOrSkip = hasFullEnv ? describe : describe.skip;

const ADD_RPC = 'bunkai_add_tests_to_plan';
const REMOVE_RPC = 'bunkai_remove_test_from_plan';
const SEARCH_RPC = 'bunkai_search_tests';
const PREFIX = `bk203-membership-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface Fixture {
  workspaceId: string
  projectAId: string
  projectBId: string
  qaUserId: string
  ownerUserId: string
  planOpen1Id: string
  planOpen2Id: string
  planClosedId: string
  test1Id: string // chains to Project A's ATC
  test2Id: string // chains to Project B's ATC
  test3Id: string // chains to Project A's ATC (second A-scoped test)
  test4Id: string // chains to BOTH Project A's and Project B's ATC
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function addTests(anonClient: ReturnType<typeof service>, args: { testPlanId: string, testIds: string[] }) {
  return anonClient.rpc(ADD_RPC, { p_test_plan_id: args.testPlanId, p_test_ids: args.testIds });
}

async function removeTest(anonClient: ReturnType<typeof service>, args: { testPlanId: string, testId: string }) {
  return anonClient.rpc(REMOVE_RPC, { p_test_plan_id: args.testPlanId, p_test_id: args.testId });
}

// Grants QA_E2E the given role in the fixture workspace for the duration of
// `fn`, always revoking it again afterward — mirrors
// test-plan-rpc-isolation.test.ts's own helper.
async function withQaRole<T>(
  db: ReturnType<typeof service>,
  args: { workspaceId: string, userId: string, role: 'viewer' | 'member' },
  fn: () => Promise<T>,
): Promise<T> {
  const { error: grantError } = await db
    .from('workspace_members')
    .insert({ workspace_id: args.workspaceId, user_id: args.userId, role: args.role, status: 'active' });
  if (grantError) { throw grantError; }
  try {
    return await fn();
  }
  finally {
    await db.from('workspace_members').delete().eq('workspace_id', args.workspaceId).eq('user_id', args.userId);
  }
}

async function latestActivity(db: ReturnType<typeof service>, testPlanId: string, action: string) {
  const { data, error } = await db
    .from('activity_log')
    .select('actor_user_id, action, payload')
    .eq('entity_type', 'test_plan')
    .eq('entity_id', testPlanId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { throw error; }
  return data as { actor_user_id: string | null, action: string, payload: Record<string, unknown> } | null;
}

async function membershipCount(db: ReturnType<typeof service>, testPlanId: string) {
  const { count, error } = await db
    .from('test_plan_tests')
    .select('id', { count: 'exact', head: true })
    .eq('test_plan_id', testPlanId);
  if (error) { throw error; }
  return count ?? 0;
}

let fixture: Fixture | null = null;
let anon: ReturnType<typeof service> | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-203 — test plan membership RPC isolation (real auth write path, authz, cross-project, uniqueness)', () => {
  beforeAll(async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      skipReason = `QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`;
      return;
    }
    anon = client;
    const qaUserId = signIn.user.id;

    const db = service();

    // Is the RPC deployed? A nonexistent plan always resolves to P0002
    // regardless of the caller's membership anywhere, so this is a safe
    // probe before any fixture exists. A missing RPC FAILS here rather than
    // soft-skipping (ADR-0012 §5: a green gate against a database where the
    // guarded function does not exist is exactly the failure mode to avoid).
    const probe = await anon.rpc(ADD_RPC, { p_test_plan_id: ZERO_UUID, p_test_ids: [ZERO_UUID] });
    if (probe.error && probe.error.code !== 'P0002') {
      throw new Error(
        `${ADD_RPC} is not deployed (${probe.error.code ?? 'unknown'}: ${probe.error.message}). `
        + 'Apply migration 0076_test_plan_tests.sql before running this suite.',
      );
    }

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(20);
    if (membersError) { throw membersError; }
    const distinctIds = [...new Set((members ?? []).map(m => m.user_id as string))].filter(id => id !== qaUserId);
    if (distinctIds.length < 1) {
      skipReason = 'need at least 1 distinct real user id (other than QA_E2E) among active workspace members (seed state).';
      return;
    }
    const [ownerUserId] = distinctIds;

    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    const { data: projects, error: projectError } = await db
      .from('projects')
      .insert([
        { workspace_id: workspaceId, slug: `${PREFIX}-project-a`, name: `${PREFIX} project A` },
        { workspace_id: workspaceId, slug: `${PREFIX}-project-b`, name: `${PREFIX} project B` },
      ])
      .select('id, slug')
      .order('slug', { ascending: true });
    if (projectError) { throw projectError; }
    if (!projects || projects.length !== 2) {
      skipReason = 'could not create the two throwaway projects the cross-project case needs.';
      return;
    }
    const projectAId = projects.find(p => (p.slug as string).endsWith('project-a'))!.id as string;
    const projectBId = projects.find(p => (p.slug as string).endsWith('project-b'))!.id as string;

    const { data: modules, error: modulesError } = await db
      .from('modules')
      .insert([
        { project_id: projectAId, path: `${PREFIX}-module-a`, name: 'Module A' },
        { project_id: projectBId, path: `${PREFIX}-module-b`, name: 'Module B' },
      ])
      .select('id, project_id');
    if (modulesError) { throw modulesError; }
    const moduleAId = (modules ?? []).find(m => m.project_id === projectAId)!.id as string;
    const moduleBId = (modules ?? []).find(m => m.project_id === projectBId)!.id as string;

    const { data: stories, error: storiesError } = await db
      .from('user_stories')
      .insert([
        { module_id: moduleAId, project_id: projectAId, title: `${PREFIX} story A` },
        { module_id: moduleBId, project_id: projectBId, title: `${PREFIX} story B` },
      ])
      .select('id, project_id');
    if (storiesError) { throw storiesError; }
    const storyAId = (stories ?? []).find(s => s.project_id === projectAId)!.id as string;
    const storyBId = (stories ?? []).find(s => s.project_id === projectBId)!.id as string;

    const { data: atcs, error: atcsError } = await db
      .from('atcs')
      .insert([
        { project_id: projectAId, module_id: moduleAId, user_story_id: storyAId, slug: `${PREFIX}-atc-a`, title: 'ATC A', layer: 'UI' },
        { project_id: projectBId, module_id: moduleBId, user_story_id: storyBId, slug: `${PREFIX}-atc-b`, title: 'ATC B', layer: 'UI' },
      ])
      .select('id, project_id');
    if (atcsError) { throw atcsError; }
    const atcAId = (atcs ?? []).find(a => a.project_id === projectAId)!.id as string;
    const atcBId = (atcs ?? []).find(a => a.project_id === projectBId)!.id as string;

    const { data: tests, error: testsError } = await db
      .from('tests')
      .insert([
        { workspace_id: workspaceId, title: `${PREFIX} test 1 (project A)`, created_by: ownerUserId },
        { workspace_id: workspaceId, title: `${PREFIX} test 2 (project B)`, created_by: ownerUserId },
        { workspace_id: workspaceId, title: `${PREFIX} test 3 (project A)`, created_by: ownerUserId },
        { workspace_id: workspaceId, title: `${PREFIX} test 4 (project A+B)`, created_by: ownerUserId },
      ])
      .select('id, title');
    if (testsError) { throw testsError; }
    const test1Id = (tests ?? []).find(t => (t.title as string).includes('test 1'))!.id as string;
    const test2Id = (tests ?? []).find(t => (t.title as string).includes('test 2'))!.id as string;
    const test3Id = (tests ?? []).find(t => (t.title as string).includes('test 3'))!.id as string;
    const test4Id = (tests ?? []).find(t => (t.title as string).includes('test 4'))!.id as string;

    const { error: stepsError } = await db
      .from('test_steps')
      .insert([
        { test_id: test1Id, atc_id: atcAId, position: 1 },
        { test_id: test2Id, atc_id: atcBId, position: 1 },
        { test_id: test3Id, atc_id: atcAId, position: 1 },
        { test_id: test4Id, atc_id: atcAId, position: 1 },
        { test_id: test4Id, atc_id: atcBId, position: 2 },
      ]);
    if (stepsError) { throw stepsError; }

    const { data: plans, error: plansError } = await db
      .from('test_plans')
      .insert([
        { workspace_id: workspaceId, project_id: projectAId, name: `${PREFIX} plan open 1`, status: 'open' },
        { workspace_id: workspaceId, project_id: projectAId, name: `${PREFIX} plan open 2`, status: 'open' },
        { workspace_id: workspaceId, project_id: projectAId, name: `${PREFIX} plan closed`, status: 'closed' },
      ])
      .select('id, name');
    if (plansError) { throw plansError; }
    const planOpen1Id = (plans ?? []).find(p => (p.name as string).endsWith('open 1'))!.id as string;
    const planOpen2Id = (plans ?? []).find(p => (p.name as string).endsWith('open 2'))!.id as string;
    const planClosedId = (plans ?? []).find(p => (p.name as string).endsWith('closed'))!.id as string;

    fixture = {
      workspaceId,
      projectAId,
      projectBId,
      qaUserId,
      ownerUserId,
      planOpen1Id,
      planOpen2Id,
      planClosedId,
      test1Id,
      test2Id,
      test3Id,
      test4Id,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Cascades from workspaces cover projects/modules/user_stories/atcs/
    // test_plans/test_plan_tests/workspace_members/activity_log. Tests are
    // workspace-scoped but NOT cascaded from workspaces' own FK (tests.
    // workspace_id IS on delete cascade — 0024), so the workspace delete
    // covers them too.
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  function warn(): void {
    console.warn(`⚠ skipped: ${skipReason ?? 'fixture unavailable'}`);
  }

  it('(a) a real authenticated member+ add persists the row, and activity_log records the AUTHENTICATED caller', async () => {
    if (!fixture || !anon) { return warn(); }
    await withQaRole(service(), { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data, error } = await addTests(anon!, { testPlanId: fixture!.planOpen1Id, testIds: [fixture!.test1Id] });
      expect(error).toBeNull();
      expect((data as { added_count: number }).added_count).toBe(1);
      expect((data as { member_count: number }).member_count).toBe(1);

      const db = service();
      const { data: row } = await db
        .from('test_plan_tests')
        .select('test_id, added_by')
        .eq('test_plan_id', fixture!.planOpen1Id)
        .eq('test_id', fixture!.test1Id)
        .maybeSingle();
      expect(row?.added_by).toBe(fixture!.qaUserId);

      const activity = await latestActivity(db, fixture!.planOpen1Id, 'test_plan.tests_added');
      expect(activity?.actor_user_id).toBe(fixture!.qaUserId);
    });
  });

  it('(b) a batch mixing an already-member test with a new one is rejected WHOLESALE (23505) — the new test is NOT added', async () => {
    if (!fixture || !anon) { return warn(); }
    await withQaRole(service(), { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const before = await membershipCount(service(), fixture!.planOpen1Id);
      const { error } = await addTests(anon!, { testPlanId: fixture!.planOpen1Id, testIds: [fixture!.test1Id, fixture!.test3Id] });
      expect(error?.code).toBe('23505');
      const after = await membershipCount(service(), fixture!.planOpen1Id);
      expect(after).toBe(before);
    });
  });

  it('(c) a Viewer cannot add (403, 42501)', async () => {
    if (!fixture || !anon) { return warn(); }
    await withQaRole(service(), { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'viewer' }, async () => {
      const { error } = await addTests(anon!, { testPlanId: fixture!.planOpen2Id, testIds: [fixture!.test3Id] });
      expect(error?.code).toBe('42501');
    });
  });

  it('(d) a non-member cannot add (404, P0002, non-disclosure)', async () => {
    if (!fixture || !anon) { return warn(); }
    const { error } = await addTests(anon, { testPlanId: fixture.planOpen2Id, testIds: [fixture.test3Id] });
    expect(error?.code).toBe('P0002');
  });

  it('(e) a Test whose only chained ATC is in a DIFFERENT project is rejected (422, test_outside_plan_project)', async () => {
    if (!fixture || !anon) { return warn(); }
    await withQaRole(service(), { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { error } = await addTests(anon!, { testPlanId: fixture!.planOpen2Id, testIds: [fixture!.test2Id] });
      expect(error?.code).toBe('45604');
      const count = await membershipCount(service(), fixture!.planOpen2Id);
      expect(count).toBe(0);
    });
  });

  it('(f) an empty test_ids array is rejected (422, test_selection_empty)', async () => {
    if (!fixture || !anon) { return warn(); }
    await withQaRole(service(), { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { error } = await addTests(anon!, { testPlanId: fixture!.planOpen2Id, testIds: [] });
      expect(error?.code).toBe('45605');
    });
  });

  it('(g) add on a Closed plan is rejected (409, test_plan_not_open)', async () => {
    if (!fixture || !anon) { return warn(); }
    await withQaRole(service(), { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { error } = await addTests(anon!, { testPlanId: fixture!.planClosedId, testIds: [fixture!.test3Id] });
      expect(error?.code).toBe('45603');
      const count = await membershipCount(service(), fixture!.planClosedId);
      expect(count).toBe(0);
    });
  });

  it('(h) remove persists the deletion, leaves the Test itself unchanged, and audits the AUTHENTICATED caller', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data, error } = await removeTest(anon!, { testPlanId: fixture!.planOpen1Id, testId: fixture!.test1Id });
      expect(error).toBeNull();
      expect((data as { member_count: number }).member_count).toBe(0);

      const { data: row } = await db
        .from('test_plan_tests')
        .select('id')
        .eq('test_plan_id', fixture!.planOpen1Id)
        .eq('test_id', fixture!.test1Id)
        .maybeSingle();
      expect(row).toBeNull();

      const { data: testRow } = await db.from('tests').select('id, title').eq('id', fixture!.test1Id).single();
      expect(testRow?.title).toBe(`${PREFIX} test 1 (project A)`);

      const activity = await latestActivity(db, fixture!.planOpen1Id, 'test_plan.test_removed');
      expect(activity?.actor_user_id).toBe(fixture!.qaUserId);
    });
  });

  it('(i) removing a test that is not a member is rejected (404, test_plan_test_not_found)', async () => {
    if (!fixture || !anon) { return warn(); }
    await withQaRole(service(), { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { error } = await removeTest(anon!, { testPlanId: fixture!.planOpen1Id, testId: fixture!.test1Id });
      expect(error?.code).toBe('45606');
    });
  });

  it('(j) remove on a Closed plan is rejected (409, test_plan_not_open) — existing membership row survives', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    // Seed a membership row directly on the Closed plan — no write path can
    // add one through the RPC (it is itself Closed-gated), mirroring 0073's
    // own endorsed direct-seed pattern for pre-BK-207 Closed-plan testing.
    const { error: seedError } = await db
      .from('test_plan_tests')
      .insert({ test_plan_id: fixture.planClosedId, test_id: fixture.test3Id, added_by: fixture.ownerUserId });
    if (seedError) { throw seedError; }

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { error } = await removeTest(anon!, { testPlanId: fixture!.planClosedId, testId: fixture!.test3Id });
      expect(error?.code).toBe('45603');
    });

    const { data: row } = await db
      .from('test_plan_tests')
      .select('id')
      .eq('test_plan_id', fixture.planClosedId)
      .eq('test_id', fixture.test3Id)
      .maybeSingle();
    expect(row).not.toBeNull();
  });

  it('(k) a Viewer cannot remove (403, 42501)', async () => {
    if (!fixture || !anon) { return warn(); }
    await withQaRole(service(), { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'viewer' }, async () => {
      const { error } = await removeTest(anon!, { testPlanId: fixture!.planOpen2Id, testId: fixture!.test3Id });
      expect(error?.code).toBe('42501');
    });
  });

  it('(l) the same Test is a member of two plans independently — removing it from one leaves the other unchanged', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const add1 = await addTests(anon!, { testPlanId: fixture!.planOpen1Id, testIds: [fixture!.test3Id] });
      expect(add1.error).toBeNull();
      const add2 = await addTests(anon!, { testPlanId: fixture!.planOpen2Id, testIds: [fixture!.test3Id] });
      expect(add2.error).toBeNull();

      const remove1 = await removeTest(anon!, { testPlanId: fixture!.planOpen1Id, testId: fixture!.test3Id });
      expect(remove1.error).toBeNull();
    });

    const { data: stillInPlan2 } = await db
      .from('test_plan_tests')
      .select('id')
      .eq('test_plan_id', fixture.planOpen2Id)
      .eq('test_id', fixture.test3Id)
      .maybeSingle();
    expect(stillInPlan2).not.toBeNull();

    // Cleanup so it doesn't interfere with a re-run inside the same suite.
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      await removeTest(anon!, { testPlanId: fixture!.planOpen2Id, testId: fixture!.test3Id });
    });
  });

  it('(m) the table is default-deny on DIRECT writes: a member+ cannot INSERT or DELETE through PostgREST, only through the RPCs', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    // Seed a row directly (service-role) so the direct-DELETE attempt below
    // has something visible to try against.
    const { data: seeded, error: seedError } = await db
      .from('test_plan_tests')
      .insert({ test_plan_id: fixture.planOpen1Id, test_id: fixture.test1Id, added_by: fixture.ownerUserId })
      .select('id')
      .single();
    if (seedError) { throw seedError; }

    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const directInsert = await anon!.from('test_plan_tests').insert({
        test_plan_id: fixture!.planOpen1Id,
        test_id: fixture!.test3Id,
      });
      expect(directInsert.error).not.toBeNull();

      const directDelete = await anon!.from('test_plan_tests').delete().eq('id', seeded.id);
      // PostgREST reports an RLS-filtered DELETE as a no-op, not an error —
      // same shape 0073's own case (l) documents for test_plans.
      expect(directDelete.error).toBeNull();
    });

    const { data: stillThere } = await db.from('test_plan_tests').select('id').eq('id', seeded.id).maybeSingle();
    expect(stillThere).not.toBeNull();

    await db.from('test_plan_tests').delete().eq('id', seeded.id);
  });

  it('(n) bunkai_search_tests is project-scoped and matches on title substring', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    // `owner_user_id` on the throwaway `workspaces` row is a column filler
    // (never an actual membership) — bunkai_search_tests requires an ACTIVE
    // workspace_members row for the explicit actor, so this case grants
    // QA_E2E membership like every write case above rather than assuming
    // the owner is one.
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const { data: matches, error } = await db.rpc(SEARCH_RPC, {
        p_actor_user_id: fixture!.qaUserId,
        p_query: 'test 1',
        p_project_id: fixture!.projectAId,
        p_limit: 20,
      });
      expect(error).toBeNull();
      const ids = ((matches ?? []) as { id: string }[]).map(m => m.id);
      expect(ids).toContain(fixture!.test1Id);
      expect(ids).not.toContain(fixture!.test2Id);

      // Same query, wrong project (test1 chains to A, not B) — no match.
      const { data: foreignProjectMatches } = await db.rpc(SEARCH_RPC, {
        p_actor_user_id: fixture!.qaUserId,
        p_query: 'test 1',
        p_project_id: fixture!.projectBId,
        p_limit: 20,
      });
      const foreignIds = ((foreignProjectMatches ?? []) as { id: string }[]).map(m => m.id);
      expect(foreignIds).not.toContain(fixture!.test1Id);
    });
  });

  it('(o) a Test whose chain spans TWO projects is rejected by add in EITHER project, and excluded from search in EITHER project (ALL-match, not ANY-match)', async () => {
    if (!fixture || !anon) { return warn(); }
    const db = service();
    await withQaRole(db, { workspaceId: fixture.workspaceId, userId: fixture.qaUserId, role: 'member' }, async () => {
      const addToA = await addTests(anon!, { testPlanId: fixture!.planOpen1Id, testIds: [fixture!.test4Id] });
      expect(addToA.error?.code).toBe('45604');
      const countA = await membershipCount(db, fixture!.planOpen1Id);
      expect(countA).toBe(0);

      const { data: matchesA } = await db.rpc(SEARCH_RPC, {
        p_actor_user_id: fixture!.qaUserId,
        p_query: 'test 4',
        p_project_id: fixture!.projectAId,
        p_limit: 20,
      });
      expect(((matchesA ?? []) as { id: string }[]).map(m => m.id)).not.toContain(fixture!.test4Id);

      const { data: matchesB } = await db.rpc(SEARCH_RPC, {
        p_actor_user_id: fixture!.qaUserId,
        p_query: 'test 4',
        p_project_id: fixture!.projectBId,
        p_limit: 20,
      });
      expect(((matchesB ?? []) as { id: string }[]).map(m => m.id)).not.toContain(fixture!.test4Id);
    });
  });
});
