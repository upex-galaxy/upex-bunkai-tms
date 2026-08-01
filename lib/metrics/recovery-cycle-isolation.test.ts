import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-47 — `bunkai_report_project_recovery_cycles` isolation + correctness
// (migration 0049_recovery_cycle_report.sql).
//
// Covers the plan's Step 1 Definition of Done exactly: an isolation/security
// test proving a workspace-A member cannot read workspace-B's project via
// this RPC even with a real project id from B (the direct BK-49 regression
// guard, Decision 2/Risk 4), plus a fixture-driven correctness test for all 3
// ACs (recovered / still-failing / never-failed) and the Decision 4 edge
// cases (non-terminal runs never contribute a data point).
//
// SECURITY DEFINER + explicit actor (mirrors `lib/coverage/coverage-isolation.test.ts`
// and `lib/runs/report-isolation.test.ts` — NOT `lib/activity/list-activity-isolation.test.ts`'s
// shape, which tests a SECURITY INVOKER RPC with no explicit-actor parameter
// to spoof). Isolation/correctness assertions need only
// `SUPABASE_SERVICE_ROLE_KEY` (service-role client, explicit actor — the SAME
// contract the API route uses, since that route calls `createAdminClient()`
// per the migration's own header comment); the actor-bind spoof case
// additionally needs a REAL authenticated session — never a minted/impersonated
// one — via the already-declared `QA_E2E_USER_EMAIL` / `QA_E2E_USER_PASSWORD`
// automation identity signing in through the app's real
// `supabase.auth.signInWithPassword` path, per `live-ui-identity.md` §3
// (which governs ALL test code, not only live-UI/browser checks; service-role
// use here is ordinary fixture setup/teardown plus explicit-actor RPC calls,
// never obtaining a session, so it stays within §3 as written — same
// reasoning `report-isolation.test.ts` and `coverage-isolation.test.ts`
// already established for this exact report family).
//
// FIXTURE SHAPE — two throwaway Projects in the anchor's EXISTING workspace
// (not a throwaway workspace). This RPC is an unpaged, project-scoped
// aggregate, not a keyset-paginated feed — unlike `list-activity-isolation.test.ts`'s
// concern (an unbounded cursor comparison against a shared live DB's
// pre-existing history), every row here is already bounded by an explicit
// `project_id = p_project_id` predicate the RPC itself enforces, so a fresh
// throwaway Project (scoped by construction) is sufficient isolation for the
// fixture, exactly as `coverage-isolation.test.ts` / `report-isolation.test.ts`
// already established for this same report family.
//
// DB-dependent + env-gated, same two-tier gate as the sibling isolation
// suites: the isolation/correctness suite needs only SUPABASE_SERVICE_ROLE_KEY;
// the actor-bind case additionally needs NEXT_PUBLIC_SUPABASE_ANON_KEY +
// QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD. Either gate SKIPS LOUDLY (never
// silently) when its env or seed-state precondition is missing.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_report_project_recovery_cycles';
const PREFIX = `bk47-recovery-cycle-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
// Deliberately NOT any real user's id — the actor-bind guard fires on a mere
// mismatch, so a well-formed but nonexistent uuid is sufficient to spoof.
const SPOOFED_ACTOR_UUID = '00000000-0000-0000-0000-000000000001';

interface MemberRow { user_id: string, workspace_id: string }
interface ProjectRow { id: string, workspace_id: string }
interface ReportItem {
  user_story_id: string
  title: string
  external_id: string | null
  module_id: string
  module_path: string
  first_fail_at: string | null
  first_green_at: string | null
  state: 'recovered' | 'in_progress' | 'no_cycle'
}
interface ReportPayload { items: ReportItem[], generated_at: string }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

const base = Date.parse('2026-06-01T12:00:00.000Z');
function at(offsetMinutes: number): string {
  return new Date(base + offsetMinutes * 60_000).toISOString();
}

interface StoryIds {
  recovered: string
  inProgress: string
  neverFailed: string
  noRunHistory: string
  ambiguousOnly: string
  preExistingPassIgnored: string
  archivedStory: string
  bLeak: string
}

interface Fixture {
  actorUserId: string
  workspaceId: string
  projectAId: string
  projectBId: string
  moduleAId: string
  storyIds: StoryIds
  foreignProjectId: string | null
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;
// Tracked independently of `fixture` so afterAll can always reap the
// throwaway rows even if a LATER step in beforeAll throws — a partial
// fixture is still a fixture that needs cleanup (mirrors
// coverage-isolation.test.ts's own defensive pattern).
let createdProjectIds: string[] = [];
let createdTestIds: string[] = [];

describeOrSkip('BK-47 — bunkai_report_project_recovery_cycles isolation + correctness', () => {
  beforeAll(async () => {
    const db = service();

    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id')
      .eq('status', 'active')
      .limit(1);
    if (membersError) { throw membersError; }
    const anchor = (members as MemberRow[] | null)?.[0];
    if (!anchor) {
      skipReason = 'need at least one active workspace member (seed state).';
      return;
    }

    const { data: projects, error: projectsError } = await db
      .from('projects')
      .select('id, workspace_id');
    if (projectsError) { throw projectsError; }
    const foreignProjectId = ((projects ?? []) as ProjectRow[])
      .find(p => p.workspace_id !== anchor.workspace_id)
      ?.id ?? null;

    // Two throwaway Projects in the anchor's workspace — Project B exists
    // purely to prove Project A's report never leaks Project B's story into
    // its rows (project-scope boundary), same reasoning as
    // report-isolation.test.ts / coverage-isolation.test.ts's own A/B split.
    const { data: seededProjects, error: projectsInsertError } = await db
      .from('projects')
      .insert([
        { workspace_id: anchor.workspace_id, slug: `${PREFIX}-project-a`, name: `${PREFIX} project A` },
        { workspace_id: anchor.workspace_id, slug: `${PREFIX}-project-b`, name: `${PREFIX} project B` },
      ])
      .select('id, slug');
    if (projectsInsertError) { throw projectsInsertError; }
    const projectAId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-a'))!.id as string;
    const projectBId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-b'))!.id as string;
    // Tracked immediately — everything else cascades off these two rows.
    createdProjectIds = [projectAId, projectBId];

    const { data: environments, error: environmentsError } = await db
      .from('project_environments')
      .insert([
        { project_id: projectAId, name: 'Staging' },
        { project_id: projectBId, name: 'Staging' },
      ])
      .select('id, project_id');
    if (environmentsError) { throw environmentsError; }
    const environmentAId = (environments ?? []).find(e => e.project_id === projectAId)!.id as string;
    const environmentBId = (environments ?? []).find(e => e.project_id === projectBId)!.id as string;

    // runs.test_id is not null / ON DELETE RESTRICT — one Test per Project,
    // referenced by every Run below (mirrors report-isolation.test.ts).
    const { data: tests, error: testsError } = await db
      .from('tests')
      .insert([
        { workspace_id: anchor.workspace_id, title: `${PREFIX} test A`, created_by: anchor.user_id },
        { workspace_id: anchor.workspace_id, title: `${PREFIX} test B`, created_by: anchor.user_id },
      ])
      .select('id, title');
    if (testsError) { throw testsError; }
    const testAId = (tests ?? []).find(t => (t.title as string).endsWith('test A'))!.id as string;
    const testBId = (tests ?? []).find(t => (t.title as string).endsWith('test B'))!.id as string;
    createdTestIds = [testAId, testBId];

    const { data: modules, error: modulesError } = await db
      .from('modules')
      .insert([
        { project_id: projectAId, path: 'recovery-cycle', name: 'Recovery Cycle' },
        { project_id: projectBId, path: 'b-module', name: 'B Module' },
      ])
      .select('id, project_id');
    if (modulesError) { throw modulesError; }
    const moduleAId = (modules ?? []).find(m => m.project_id === projectAId)!.id as string;
    const moduleBId = (modules ?? []).find(m => m.project_id === projectBId)!.id as string;

    // 8 User Stories: one per state/edge-case under test.
    const storySpecs = [
      { key: 'recovered', moduleId: moduleAId, externalId: `${PREFIX}-ext-recovered` },
      { key: 'inProgress', moduleId: moduleAId, externalId: null },
      { key: 'neverFailed', moduleId: moduleAId, externalId: null },
      { key: 'noRunHistory', moduleId: moduleAId, externalId: null },
      { key: 'ambiguousOnly', moduleId: moduleAId, externalId: null },
      { key: 'preExistingPassIgnored', moduleId: moduleAId, externalId: null },
      { key: 'archivedStory', moduleId: moduleAId, externalId: null },
      { key: 'bLeak', moduleId: moduleBId, externalId: null },
    ] as const;
    const { data: seededStories, error: storiesError } = await db
      .from('user_stories')
      .insert(storySpecs.map(s => ({ module_id: s.moduleId, title: `${PREFIX} story ${s.key}`, external_id: s.externalId })))
      .select('id, title');
    if (storiesError) { throw storiesError; }
    const storyIdByKey = new Map<string, string>(
      storySpecs.map(s => [s.key, (seededStories ?? []).find(row => row.title === `${PREFIX} story ${s.key}`)!.id as string]),
    );
    const storyIds: StoryIds = {
      recovered: storyIdByKey.get('recovered')!,
      inProgress: storyIdByKey.get('inProgress')!,
      neverFailed: storyIdByKey.get('neverFailed')!,
      noRunHistory: storyIdByKey.get('noRunHistory')!,
      ambiguousOnly: storyIdByKey.get('ambiguousOnly')!,
      preExistingPassIgnored: storyIdByKey.get('preExistingPassIgnored')!,
      archivedStory: storyIdByKey.get('archivedStory')!,
      bLeak: storyIdByKey.get('bLeak')!,
    };

    // Archive the "archivedStory" story right after seeding it — proves an
    // archived Story is excluded from `items` even though it has run history
    // (the soft-delete gap found during this ticket's own schema
    // investigation, not named in the Stage 1 plan).
    const { error: archiveError } = await db
      .from('user_stories')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', storyIds.archivedStory);
    if (archiveError) { throw archiveError; }

    // One ATC per story, except "ambiguousOnly" (needs two, so one run can
    // touch it via a passed+skipped MIX) and "preExistingPassIgnored" (reused
    // across 3 runs).
    const atcSpecs = [
      { key: 'recovered', storyId: storyIds.recovered, moduleId: moduleAId, projectId: projectAId },
      { key: 'inProgress', storyId: storyIds.inProgress, moduleId: moduleAId, projectId: projectAId },
      { key: 'neverFailed', storyId: storyIds.neverFailed, moduleId: moduleAId, projectId: projectAId },
      { key: 'ambiguous1', storyId: storyIds.ambiguousOnly, moduleId: moduleAId, projectId: projectAId },
      { key: 'ambiguous2', storyId: storyIds.ambiguousOnly, moduleId: moduleAId, projectId: projectAId },
      { key: 'mixed', storyId: storyIds.preExistingPassIgnored, moduleId: moduleAId, projectId: projectAId },
      { key: 'archived', storyId: storyIds.archivedStory, moduleId: moduleAId, projectId: projectAId },
      { key: 'b', storyId: storyIds.bLeak, moduleId: moduleBId, projectId: projectBId },
    ] as const;
    const { data: seededAtcs, error: atcsError } = await db
      .from('atcs')
      .insert(atcSpecs.map(a => ({
        project_id: a.projectId,
        module_id: a.moduleId,
        user_story_id: a.storyId,
        slug: `${PREFIX}-atc-${a.key}`,
        title: `${PREFIX} atc ${a.key}`,
        layer: 'UI',
        status: 'unrun',
      })))
      .select('id, slug');
    if (atcsError) { throw atcsError; }
    const atcIdByKey = new Map(
      atcSpecs.map(a => [a.key, (seededAtcs ?? []).find(row => row.slug === `${PREFIX}-atc-${a.key}`)!.id as string]),
    );

    // Runs. Each `start_token` is unique and PREFIX-tagged for cleanup.
    interface RunSpec { key: string, projectId: string, testId: string, environmentId: string, status: string, finishedAt: string | null, startedAt: string }
    const runSpecs: RunSpec[] = [
      // recovered: fail then pass (AC1).
      { key: 'recovered-fail', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'failed', finishedAt: at(0), startedAt: at(-1) },
      { key: 'recovered-pass', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'passed', finishedAt: at(10), startedAt: at(9) },
      // inProgress: fail only, still failing (AC2).
      { key: 'in-progress-fail', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'failed', finishedAt: at(0), startedAt: at(-1) },
      // neverFailed: pass only (AC3).
      { key: 'never-failed-pass', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'passed', finishedAt: at(0), startedAt: at(-1) },
      // ambiguousOnly: one run touches it via passed+skipped (no failure) —
      // must contribute NO verdict (neither red nor green).
      { key: 'ambiguous-mixed', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'passed', finishedAt: at(0), startedAt: at(-1) },
      // preExistingPassIgnored: pass BEFORE any failure, then fail, then pass
      // AFTER the failure — first_green_at must be the LATER pass, not the
      // earlier pre-existing one.
      { key: 'mixed-pre-pass', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'passed', finishedAt: at(-30), startedAt: at(-31) },
      { key: 'mixed-fail', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'failed', finishedAt: at(0), startedAt: at(-1) },
      { key: 'mixed-post-pass', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'passed', finishedAt: at(10), startedAt: at(9) },
      // archivedStory: fails, but the Story is archived — must not appear.
      { key: 'archived-fail', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'failed', finishedAt: at(0), startedAt: at(-1) },
      // Decision 4 — non-terminal runs never contribute a data point, even
      // when their run_atcs rows say 'failed'. Both touch "neverFailed" —
      // if either were counted, neverFailed would wrongly stop being
      // 'no_cycle'.
      { key: 'aborted-would-be-fail', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'aborted', finishedAt: at(5), startedAt: at(4) },
      { key: 'still-running-would-be-fail', projectId: projectAId, testId: testAId, environmentId: environmentAId, status: 'running', finishedAt: null, startedAt: at(6) },
      // Project B leak probe.
      { key: 'b-fail', projectId: projectBId, testId: testBId, environmentId: environmentBId, status: 'failed', finishedAt: at(0), startedAt: at(-1) },
    ];
    const { data: seededRuns, error: runsError } = await db
      .from('runs')
      .insert(runSpecs.map(r => ({
        workspace_id: anchor.workspace_id,
        project_id: r.projectId,
        test_id: r.testId,
        environment_id: r.environmentId,
        status: r.status,
        executor_mode: 'human',
        abort_reason: r.status === 'aborted' ? `${PREFIX} throwaway abort` : null,
        start_token: `${PREFIX}-${r.key}`,
        test_title: `${PREFIX} test`,
        started_at: r.startedAt,
        finished_at: r.finishedAt,
      })))
      .select('id, start_token');
    if (runsError) { throw runsError; }
    const runIdByKey = new Map(
      runSpecs.map(r => [r.key, (seededRuns ?? []).find(row => row.start_token === `${PREFIX}-${r.key}`)!.id as string]),
    );

    // run_atcs — the per-run touching rows that drive each verdict.
    interface RunAtcSpec { runKey: string, atcKey: string, status: string, position: number }
    const runAtcSpecs: RunAtcSpec[] = [
      { runKey: 'recovered-fail', atcKey: 'recovered', status: 'failed', position: 1 },
      { runKey: 'recovered-pass', atcKey: 'recovered', status: 'passed', position: 1 },
      { runKey: 'in-progress-fail', atcKey: 'inProgress', status: 'failed', position: 1 },
      { runKey: 'never-failed-pass', atcKey: 'neverFailed', status: 'passed', position: 1 },
      // Mix: one passed, one skipped, zero failed — must be excluded.
      { runKey: 'ambiguous-mixed', atcKey: 'ambiguous1', status: 'passed', position: 1 },
      { runKey: 'ambiguous-mixed', atcKey: 'ambiguous2', status: 'skipped', position: 2 },
      { runKey: 'mixed-pre-pass', atcKey: 'mixed', status: 'passed', position: 1 },
      { runKey: 'mixed-fail', atcKey: 'mixed', status: 'failed', position: 1 },
      { runKey: 'mixed-post-pass', atcKey: 'mixed', status: 'passed', position: 1 },
      { runKey: 'archived-fail', atcKey: 'archived', status: 'failed', position: 1 },
      { runKey: 'aborted-would-be-fail', atcKey: 'neverFailed', status: 'failed', position: 1 },
      { runKey: 'still-running-would-be-fail', atcKey: 'neverFailed', status: 'failed', position: 1 },
      { runKey: 'b-fail', atcKey: 'b', status: 'failed', position: 1 },
    ];
    const { error: runAtcsError } = await db
      .from('run_atcs')
      .insert(runAtcSpecs.map(ra => ({
        run_id: runIdByKey.get(ra.runKey)!,
        atc_id: atcIdByKey.get(ra.atcKey)!,
        position: ra.position,
        atc_title: `${PREFIX} atc ${ra.atcKey}`,
        status: ra.status,
      })));
    if (runAtcsError) { throw runAtcsError; }

    fixture = {
      actorUserId: anchor.user_id,
      workspaceId: anchor.workspace_id,
      projectAId,
      projectBId,
      moduleAId,
      storyIds,
      foreignProjectId,
    };
  });

  afterAll(async () => {
    // Gated on createdProjectIds, NOT on `fixture` — mirrors
    // coverage-isolation.test.ts's own defensive teardown.
    if (createdProjectIds.length === 0) { return; }
    const db = service();
    // Runs first: runs.test_id is ON DELETE RESTRICT. Deleting Runs cascades
    // run_atcs (run_id ON DELETE CASCADE, 0031).
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    // Project delete cascades modules/atcs/user_stories/project_environments
    // (all project_id-rooted ON DELETE CASCADE per 0002/0003/0004/0031).
    await db.from('projects').delete().in('id', createdProjectIds);
    await db.from('tests').delete().in('id', createdTestIds);
  });

  it('AC1 — recovered: elapsed time runs from the first failing run to the first subsequent all-passing run', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    const row = findStory(page, fixture.storyIds.recovered);
    expect(row.state).toBe('recovered');
    expect(row.first_fail_at).toBe(at(0));
    expect(row.first_green_at).toBe(at(10));
    expect(row.external_id).toBe(`${PREFIX}-ext-recovered`);
  });

  it('AC2 — still failing: reads in_progress with first_fail_at set and no first_green_at', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    const row = findStory(page, fixture.storyIds.inProgress);
    expect(row.state).toBe('in_progress');
    expect(row.first_fail_at).toBe(at(0));
    expect(row.first_green_at).toBeNull();
  });

  it('AC3 — never failed: reads no_cycle with both timestamps null', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    const row = findStory(page, fixture.storyIds.neverFailed);
    expect(row.state).toBe('no_cycle');
    expect(row.first_fail_at).toBeNull();
    expect(row.first_green_at).toBeNull();
  });

  it('a story with zero candidate runs touching it is omitted from items entirely', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    expect(page.items.some(i => i.user_story_id === fixture!.storyIds.noRunHistory)).toBe(false);
  });

  it('a run touching a story via a passed+skipped MIX (no failure) contributes no verdict — the story still reads no_cycle', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    const row = findStory(page, fixture.storyIds.ambiguousOnly);
    expect(row.state).toBe('no_cycle');
    expect(row.first_fail_at).toBeNull();
  });

  it('a pass BEFORE the first failure does not count as the recovery — first_green_at is the pass AFTER the fail', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    const row = findStory(page, fixture.storyIds.preExistingPassIgnored);
    expect(row.state).toBe('recovered');
    expect(row.first_fail_at).toBe(at(0));
    expect(row.first_green_at).toBe(at(10));
    // The pre-existing pass at at(-30) must never surface as first_green_at.
    expect(row.first_green_at).not.toBe(at(-30));
  });

  it('an archived Story is excluded from items even though it has run history', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    expect(page.items.some(i => i.user_story_id === fixture!.storyIds.archivedStory)).toBe(false);
  });

  it('Decision 4 — an aborted run\'s failing run_atcs status is never counted (non-terminal runs are excluded)', async () => {
    if (!fixture) { return warn(); }
    const page = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    // neverFailed is ALSO touched by an aborted run and a still-running run,
    // both recording 'failed' at the run_atcs level — if either counted, this
    // story would read in_progress/recovered instead of no_cycle.
    const row = findStory(page, fixture.storyIds.neverFailed);
    expect(row.state).toBe('no_cycle');
    expect(row.first_fail_at).toBeNull();
  });

  it('Project B\'s story never leaks into Project A\'s report (project-scope boundary)', async () => {
    if (!fixture) { return warn(); }
    const pageA = await reportRecoveryCycles(fixture.projectAId, fixture.actorUserId);
    expect(pageA.items.some(i => i.user_story_id === fixture!.storyIds.bLeak)).toBe(false);

    const pageB = await reportRecoveryCycles(fixture.projectBId, fixture.actorUserId);
    const bRow = findStory(pageB, fixture.storyIds.bLeak);
    expect(bRow.state).toBe('in_progress');
    // ...and none of Project A's stories ever appear in Project B's report.
    const aStoryIds = new Set(Object.values(fixture.storyIds));
    for (const item of pageB.items) {
      if (item.user_story_id !== fixture.storyIds.bLeak) {
        expect(aStoryIds.has(item.user_story_id)).toBe(false);
      }
    }
  });

  it('a FOREIGN-workspace Project resolves to the SAME P0002 as a nonexistent Project (non-disclosure)', async () => {
    if (!fixture) { return warn(); }
    if (!fixture.foreignProjectId) {
      console.warn('[recovery-cycle-isolation] skipped foreign-workspace case: need a Project outside the anchor\'s workspace (seed state).');
      return;
    }
    const db = service();
    const [foreign, missing] = await Promise.all([
      db.rpc(RPC, { p_actor_user_id: fixture.actorUserId, p_project_id: fixture.foreignProjectId }),
      db.rpc(RPC, { p_actor_user_id: fixture.actorUserId, p_project_id: ZERO_UUID }),
    ]);
    expect(foreign.error).not.toBeNull();
    expect(foreign.error?.code).toBe('P0002');
    expect(foreign.data).toBeNull();
    expect(missing.error).not.toBeNull();
    expect(missing.error?.code).toBe('P0002');
    expect(missing.data).toBeNull();
  });

  it('the actor-bind guard rejects a spoofed p_actor_user_id', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[recovery-cycle-isolation] skipped actor-bind case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    // Real, sanctioned login — never a minted/impersonated session.
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[recovery-cycle-isolation] skipped actor-bind case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }
    const realUserId = signIn.user.id;

    const db = service();
    const { data: existingMembership, error: existingMembershipError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', realUserId)
      .maybeSingle();
    if (existingMembershipError) { throw existingMembershipError; }

    let grantedMembership = false;
    if (!existingMembership) {
      const { error: grantError } = await db
        .from('workspace_members')
        .insert({ workspace_id: fixture.workspaceId, user_id: realUserId, role: 'viewer', status: 'active' });
      if (grantError) {
        console.warn(`[recovery-cycle-isolation] skipped actor-bind case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
        return;
      }
      grantedMembership = true;
    }

    try {
      // Legitimate self-call succeeds first — proves the session is
      // genuinely authenticated and the rejection below fails for the RIGHT
      // reason (an identity mismatch), not an unrelated failure.
      const self = await anon.rpc(RPC, { p_actor_user_id: realUserId, p_project_id: fixture.projectAId });
      expect(self.error).toBeNull();

      // Same real session, but p_actor_user_id claims a DIFFERENT user.
      const spoofed = await anon.rpc(RPC, { p_actor_user_id: SPOOFED_ACTOR_UUID, p_project_id: fixture.projectAId });
      expect(spoofed.error).not.toBeNull();
      expect(spoofed.error?.code).toBe('P0002');
      expect(spoofed.data).toBeNull();
    }
    finally {
      if (grantedMembership) {
        await db.from('workspace_members').delete().eq('workspace_id', fixture.workspaceId).eq('user_id', realUserId);
      }
    }
  });
});

async function reportRecoveryCycles(projectId: string, actorUserId: string): Promise<ReportPayload> {
  const db = service();
  const { data, error } = await db.rpc(RPC, { p_actor_user_id: actorUserId, p_project_id: projectId });
  if (error) { throw error; }
  return data as unknown as ReportPayload;
}

function findStory(page: ReportPayload, userStoryId: string): ReportItem {
  const row = page.items.find(i => i.user_story_id === userStoryId);
  if (!row) { throw new Error(`user story ${userStoryId} not found in recovery-cycle report`); }
  return row;
}

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[recovery-cycle-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
