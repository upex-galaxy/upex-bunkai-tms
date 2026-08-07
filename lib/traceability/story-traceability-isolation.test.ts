import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-45 — bunkai_report_story_traceability isolation + chain-assembly
// correctness. Mirrors coverage-isolation.test.ts's (BK-46) two-tier env
// gate and fixture-teardown discipline, against REAL seeded rows — this is
// the DB-integration test contract handed over in Jira comment 12176 (AI
// Tech Lead, "Test contract", 5 cases) plus the run's own adversarial-review
// gates (foreign-PROJECT-in-same-workspace leak, standalone-bug neither
// vanishing nor leaking, no-dedupe across ACs, in-flight-run state).
//
// Covers:
//   * a legitimate member reads their own story's chain successfully
//   * a spoofed p_actor_user_id (real login, never a minted session) -> P0002
//   * a story in a FOREIGN WORKSPACE -> P0002, zero rows disclosed
//   * a FOREIGN PROJECT IN THE SAME WORKSPACE — an ATC belonging to a
//     sibling project, hand-linked via atc_acceptance_criteria to this
//     story's AC — never appears (the `pair` CTE's scoping, independent of
//     the actor bind; this is the exact BK-49-shaped leak class named in the
//     run's mandatory gates)
//   * an archived ATC, and an ATC under an archived ANCESTOR module, are
//     both absent (EC7 — no ghost coverage)
//   * a standalone bug (atc_id null) neither vanishes from nor leaks into
//     the chain — it simply never matches `pair`, proven by NOT crashing and
//     by not appearing under any ATC
//   * an ATC bound to 2 ACs on the same story repeats under EACH (no dedupe)
//   * an in-flight run renders `state: 'in_flight'`, never a stale verdict
//
// DB-dependent + env-gated, same two-tier gate as coverage-isolation.test.ts:
// the isolation/assembly suite needs only SUPABASE_SERVICE_ROLE_KEY; the
// actor-bind case additionally needs NEXT_PUBLIC_SUPABASE_ANON_KEY +
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

const RPC = 'bunkai_report_story_traceability';
const PREFIX = `bk45-trace-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
// Deliberately NOT any real user's id — the actor-bind guard fires on a mere
// mismatch, so a well-formed but nonexistent uuid is sufficient to spoof.
const SPOOFED_ACTOR_UUID = '00000000-0000-0000-0000-000000000001';

interface MemberRow { user_id: string, workspace_id: string }
interface TraceabilityAtcRow {
  id: string
  slug: string
  title: string
  layer: string
  test: { id: string, title: string } | null
  latest_run: { run_id: string, run_status: string, atc_status: string, state: string } | null
  defects: Array<{ id: string, title: string, run_id: string | null }>
}
interface TraceabilityCriterionRow { id: string, title: string, atcs: TraceabilityAtcRow[] }
interface TraceabilityPayload {
  story: { id: string, title: string, status: string, archived_at: string | null }
  criteria: TraceabilityCriterionRow[]
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

interface Fixture {
  actorUserId: string
  workspaceId: string
  projectAId: string
  projectBId: string
  storyId: string
  acSingleId: string
  acSharedId: string
  acArchivedId: string
  atcRunId: string
  atcNoTestId: string
  atcNoRunId: string
  atcArchivedSelfId: string
  atcArchivedAncestorId: string
  atcSharedId: string
  foreignWorkspaceStoryId: string | null
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;
let createdProjectIds: string[] = [];
let createdTestId: string | null = null;
let createdStandaloneBugId: string | null = null;

describeOrSkip('BK-45 — bunkai_report_story_traceability isolation + chain assembly', () => {
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

    const { data: allProjects, error: allProjectsError } = await db
      .from('projects')
      .select('id, workspace_id');
    if (allProjectsError) { throw allProjectsError; }
    const foreignWorkspaceProject = (allProjects ?? []).find(p => p.workspace_id !== anchor.workspace_id) ?? null;

    // Two Projects in the anchor's workspace: A hosts the story under test,
    // B exists purely to seed the cross-project-leak ATC (same shape as
    // coverage-isolation.test.ts's Project A/B split).
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
    createdProjectIds = [projectAId, projectBId];

    const moduleSpecs = [
      { key: 'live' as const, path: 'live', name: 'Live' },
      { key: 'toArchive' as const, path: 'to-archive', name: 'To Archive' },
    ];
    const { data: seededModules, error: modulesError } = await db
      .from('modules')
      .insert(moduleSpecs.map(m => ({ project_id: projectAId, path: m.path, name: m.name })))
      .select('id, path');
    if (modulesError) { throw modulesError; }
    const moduleIds = Object.fromEntries(
      moduleSpecs.map(m => [m.key, (seededModules ?? []).find(sm => sm.path === m.path)!.id as string]),
    ) as Record<'live' | 'toArchive', string>;

    // Child module UNDER "toArchive" — the archived-ANCESTOR case (EC7):
    // this child module itself is never archived, only its parent is.
    const { data: childModule, error: childModuleError } = await db
      .from('modules')
      .insert({ project_id: projectAId, parent_module_id: moduleIds.toArchive, path: 'to-archive/child', name: 'Child' })
      .select('id')
      .single();
    if (childModuleError) { throw childModuleError; }

    const { data: moduleB, error: moduleBError } = await db
      .from('modules')
      .insert({ project_id: projectBId, path: 'b-live', name: 'B Live' })
      .select('id')
      .single();
    if (moduleBError) { throw moduleBError; }

    // ONE User Story in Project A, with 4 acceptance criteria: single-ATC,
    // shared-ATC-target (2 ACs bind the SAME ATC — no-dedupe case), and an
    // archived AC (AC-06, must never appear).
    const { data: story, error: storyError } = await db
      .from('user_stories')
      .insert({ module_id: moduleIds.live, title: `${PREFIX} story` })
      .select('id')
      .single();
    if (storyError) { throw storyError; }
    const storyId = story.id as string;

    const acSpecs = [
      { key: 'single', title: `${PREFIX} ac single`, archived: false },
      { key: 'sharedA', title: `${PREFIX} ac sharedA`, archived: false },
      { key: 'sharedB', title: `${PREFIX} ac sharedB`, archived: false },
      { key: 'archived', title: `${PREFIX} ac archived`, archived: true },
    ];
    const { data: seededAcs, error: acsError } = await db
      .from('acceptance_criteria')
      .insert(acSpecs.map((a, i) => ({
        user_story_id: storyId,
        title: a.title,
        position: i,
        archived_at: a.archived ? new Date().toISOString() : null,
      })))
      .select('id, title');
    if (acsError) { throw acsError; }
    const acIdByKey = new Map(acSpecs.map(a => [a.key, (seededAcs ?? []).find(ac => ac.title === a.title)!.id as string]));

    // ATCs in Project A: atcRun (chained by a Test, has a run + a defect),
    // atcNoTest (no Test at all -> "No test written yet"), atcNoRun (chained
    // by a Test, never run -> "No run recorded yet"), atcArchivedSelf (own
    // archived_at set), atcShared (bound to BOTH sharedA and sharedB — the
    // no-dedupe proof). atcArchivedAncestor lives in the CHILD module (never
    // archived itself) whose PARENT module gets archived in a later step.
    const atcSpecs = [
      { key: 'run', moduleId: moduleIds.live, archived: false },
      { key: 'noTest', moduleId: moduleIds.live, archived: false },
      { key: 'noRun', moduleId: moduleIds.live, archived: false },
      { key: 'archivedSelf', moduleId: moduleIds.live, archived: true },
      { key: 'archivedAncestor', moduleId: childModule.id as string, archived: false },
      { key: 'shared', moduleId: moduleIds.live, archived: false },
    ];
    const { data: seededAtcs, error: atcsError } = await db
      .from('atcs')
      .insert(atcSpecs.map(a => ({
        project_id: projectAId,
        module_id: a.moduleId,
        user_story_id: storyId,
        slug: `${PREFIX}-atc-${a.key}`,
        title: `${PREFIX} atc ${a.key}`,
        layer: 'UI',
        status: 'unrun',
        archived_at: a.archived ? new Date().toISOString() : null,
      })))
      .select('id, slug');
    if (atcsError) { throw atcsError; }
    const atcIdByKey = new Map(atcSpecs.map(a => [a.key, (seededAtcs ?? []).find(x => x.slug === `${PREFIX}-atc-${a.key}`)!.id as string]));

    // Cross-project leak probe: a Project-B ATC linked (hand-crafted, the
    // exact class atc_acceptance_criteria's own lack of a project/workspace
    // column permits) to Project A's "single" AC.
    const { data: crossProjectAtc, error: crossProjectAtcError } = await db
      .from('atcs')
      .insert({
        project_id: projectBId,
        module_id: moduleB.id as string,
        user_story_id: storyId,
        slug: `${PREFIX}-atc-crossProject`,
        title: `${PREFIX} atc crossProject`,
        layer: 'API',
        status: 'unrun',
        archived_at: null,
      })
      .select('id')
      .single();
    if (crossProjectAtcError) { throw crossProjectAtcError; }

    // Links: single <- run, noTest, crossProject; sharedA <- shared;
    // sharedB <- shared (no-dedupe); archived <- archivedSelf (must never
    // surface, the AC itself is archived so this ATC wouldn't show even if
    // it weren't). noRun and archivedAncestor are linked to "single" too, so
    // every ATC in this fixture lives under a real AC.
    const { error: linkError } = await db
      .from('atc_acceptance_criteria')
      .insert([
        { atc_id: atcIdByKey.get('run')!, acceptance_criterion_id: acIdByKey.get('single')! },
        { atc_id: atcIdByKey.get('noTest')!, acceptance_criterion_id: acIdByKey.get('single')! },
        { atc_id: atcIdByKey.get('noRun')!, acceptance_criterion_id: acIdByKey.get('single')! },
        { atc_id: atcIdByKey.get('archivedAncestor')!, acceptance_criterion_id: acIdByKey.get('single')! },
        { atc_id: atcIdByKey.get('archivedSelf')!, acceptance_criterion_id: acIdByKey.get('archived')! },
        { atc_id: atcIdByKey.get('shared')!, acceptance_criterion_id: acIdByKey.get('sharedA')! },
        { atc_id: atcIdByKey.get('shared')!, acceptance_criterion_id: acIdByKey.get('sharedB')! },
        { atc_id: crossProjectAtc.id as string, acceptance_criterion_id: acIdByKey.get('single')! },
      ]);
    if (linkError) { throw linkError; }

    // A Test that chains "run" and "noRun" (NOT "noTest" — that ATC must
    // read "No test written yet").
    const { data: seededTest, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspace_id, title: `${PREFIX} test`, created_by: anchor.user_id })
      .select('id')
      .single();
    if (testError) { throw testError; }
    createdTestId = seededTest.id as string;

    const { error: testStepsError } = await db
      .from('test_steps')
      .insert([
        { test_id: createdTestId, atc_id: atcIdByKey.get('run')!, position: 1 },
        { test_id: createdTestId, atc_id: atcIdByKey.get('noRun')!, position: 2 },
      ]);
    if (testStepsError) { throw testStepsError; }

    // A Run touching "run" only (in-flight — proves the state discriminator
    // AND exercises the runs.test_id/test_title carry-through for the Test
    // column).
    const { data: environmentA, error: environmentAError } = await db
      .from('project_environments')
      .insert({ project_id: projectAId, name: 'Staging' })
      .select('id')
      .single();
    if (environmentAError) { throw environmentAError; }

    const { data: seededRun, error: runError } = await db
      .from('runs')
      .insert({
        workspace_id: anchor.workspace_id,
        project_id: projectAId,
        test_id: createdTestId,
        environment_id: environmentA.id as string,
        test_title: `${PREFIX} test`,
        status: 'running',
        executor_mode: 'human',
        start_token: `${PREFIX}-run`,
      })
      .select('id')
      .single();
    if (runError) { throw runError; }

    const { error: runAtcsError } = await db
      .from('run_atcs')
      .insert([
        { run_id: seededRun.id as string, atc_id: atcIdByKey.get('run')!, position: 1, atc_title: `${PREFIX} atc run`, status: 'pending' },
      ]);
    if (runAtcsError) { throw runAtcsError; }

    // A defect on "run" (provenance-scoped, must appear), plus a STANDALONE
    // defect (atc_id null) that must neither vanish (no crash) nor ever
    // surface under any ATC.
    const { error: bugError } = await db
      .from('bugs')
      .insert({
        workspace_id: anchor.workspace_id,
        project_id: projectAId,
        module_id: moduleIds.live,
        run_id: seededRun.id as string,
        atc_id: atcIdByKey.get('run')!,
        title: `${PREFIX} bug on run atc`,
        severity: 'P3',
        status: 'open',
      });
    if (bugError) { throw bugError; }

    const { data: standaloneBug, error: standaloneBugError } = await db
      .from('bugs')
      .insert({
        workspace_id: anchor.workspace_id,
        project_id: projectAId,
        module_id: moduleIds.live,
        atc_id: null,
        title: `${PREFIX} standalone bug`,
        severity: 'P4',
        status: 'open',
      })
      .select('id')
      .single();
    if (standaloneBugError) { throw standaloneBugError; }
    createdStandaloneBugId = standaloneBug.id as string;

    // Archive the PARENT module last — after every seed above already
    // references the child module, so this exercises the archived-ancestor
    // predicate against a child that itself was never archived.
    const { error: archiveModuleError } = await db
      .from('modules')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', moduleIds.toArchive);
    if (archiveModuleError) { throw archiveModuleError; }

    fixture = {
      actorUserId: anchor.user_id,
      workspaceId: anchor.workspace_id,
      projectAId,
      projectBId,
      storyId,
      acSingleId: acIdByKey.get('single')!,
      acSharedId: acIdByKey.get('sharedA')!,
      acArchivedId: acIdByKey.get('archived')!,
      atcRunId: atcIdByKey.get('run')!,
      atcNoTestId: atcIdByKey.get('noTest')!,
      atcNoRunId: atcIdByKey.get('noRun')!,
      atcArchivedSelfId: atcIdByKey.get('archivedSelf')!,
      atcArchivedAncestorId: atcIdByKey.get('archivedAncestor')!,
      atcSharedId: atcIdByKey.get('shared')!,
      foreignWorkspaceStoryId: null,
    };

    // Foreign-workspace probe: find (do not create) an existing story
    // outside the anchor's workspace, if one exists in seed data.
    if (foreignWorkspaceProject) {
      const { data: foreignModules } = await db
        .from('modules')
        .select('id')
        .eq('project_id', foreignWorkspaceProject.id)
        .limit(1);
      const foreignModuleId = (foreignModules ?? [])[0]?.id as string | undefined;
      if (foreignModuleId) {
        const { data: foreignStories } = await db
          .from('user_stories')
          .select('id')
          .eq('module_id', foreignModuleId)
          .limit(1);
        fixture.foreignWorkspaceStoryId = (foreignStories ?? [])[0]?.id as string | undefined ?? null;
      }
    }
  });

  afterAll(async () => {
    if (createdProjectIds.length === 0) { return; }
    const db = service();
    // FK order, verified against the live schema: test_steps.atc_id is ON
    // DELETE RESTRICT (0024_tests.sql:65) — deleting the Project cascades
    // to atcs, and a live test_steps row referencing one of them would
    // RESTRICT that cascade and silently no-op the whole projects delete
    // (the client doesn't throw on an RLS/FK failure it doesn't check).
    // test_steps MUST be cleared first. bugs.project_id and
    // atcs/modules/user_stories/acceptance_criteria/atc_acceptance_criteria/
    // runs/run_atcs/project_environments are all ON DELETE CASCADE off
    // projects (0002/0003/0004/0031/0032/0046) — the standalone bug is
    // covered by that cascade too, the explicit delete below is just belt
    // and braces for clarity. runs.test_id is ON DELETE RESTRICT
    // (0031_runs.sql:76), so the Test row is deleted LAST, once the
    // Project cascade has already removed the Run referencing it.
    if (createdTestId) {
      await db.from('test_steps').delete().eq('test_id', createdTestId);
    }
    if (createdStandaloneBugId) {
      await db.from('bugs').delete().eq('id', createdStandaloneBugId);
    }
    const { error: deleteProjectsError } = await db.from('projects').delete().in('id', createdProjectIds);
    if (deleteProjectsError) { throw deleteProjectsError; }
    if (createdTestId) {
      const { error: deleteTestError } = await db.from('tests').delete().eq('id', createdTestId);
      if (deleteTestError) { throw deleteTestError; }
    }
  });

  it('a legitimate member reads their own story\'s chain successfully', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    expect(page.story.id).toBe(fixture.storyId);
    expect(page.criteria.length).toBeGreaterThan(0);
  });

  it('a spoofed p_actor_user_id is rejected with P0002 (real login, never a minted session)', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[traceability-isolation] skipped actor-bind case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email: qaEmail!, password: qaPassword! });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[traceability-isolation] skipped actor-bind case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }
    const realUserId = signIn.user.id;

    const db = service();
    const { data: existingMembership } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', realUserId)
      .maybeSingle();

    let grantedMembership = false;
    if (!existingMembership) {
      const { error: grantError } = await db
        .from('workspace_members')
        .insert({ workspace_id: fixture.workspaceId, user_id: realUserId, role: 'viewer', status: 'active' });
      if (grantError) {
        console.warn(`[traceability-isolation] skipped actor-bind case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
        return;
      }
      grantedMembership = true;
    }

    try {
      const self = await anon.rpc(RPC, { p_actor_user_id: realUserId, p_user_story_id: fixture.storyId });
      expect(self.error).toBeNull();

      const spoofed = await anon.rpc(RPC, { p_actor_user_id: SPOOFED_ACTOR_UUID, p_user_story_id: fixture.storyId });
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

  it('a story in a FOREIGN WORKSPACE resolves to the SAME P0002 as a nonexistent story (non-disclosure)', async () => {
    if (!fixture) { return warn(); }
    if (!fixture.foreignWorkspaceStoryId) {
      console.warn('[traceability-isolation] skipped foreign-workspace case: need a User Story outside the anchor\'s workspace (seed state).');
      return;
    }
    const db = service();
    const [foreign, missing] = await Promise.all([
      db.rpc(RPC, { p_actor_user_id: fixture.actorUserId, p_user_story_id: fixture.foreignWorkspaceStoryId }),
      db.rpc(RPC, { p_actor_user_id: fixture.actorUserId, p_user_story_id: ZERO_UUID }),
    ]);
    expect(foreign.error).not.toBeNull();
    expect(foreign.error?.code).toBe('P0002');
    expect(foreign.data).toBeNull();
    expect(missing.error).not.toBeNull();
    expect(missing.error?.code).toBe('P0002');
    expect(missing.data).toBeNull();
  });

  it('a FOREIGN PROJECT in the SAME workspace: an ATC hand-linked cross-project never appears (pair CTE scoping, independent of the actor bind)', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    const single = findCriterion(page, fixture.acSingleId);
    // The cross-project ATC (`${PREFIX}-atc-crossProject`, seeded in
    // Project B, hand-linked via atc_acceptance_criteria to this Project-A
    // AC in beforeAll) must never surface — its absence here is the whole
    // point of the test, not an incidental check. If the `pair` CTE's join
    // through the already-scoped `live_atc` (rather than the raw `atcs`
    // table) were ever dropped, this assertion is what would catch it.
    expect(single.atcs.some(a => a.slug.includes('crossProject'))).toBe(false);
    // Every ATC that DOES appear under "single" must legitimately belong to
    // Project A (proven indirectly: only run/noTest/noRun were linked to
    // this AC from Project A in beforeAll — archivedAncestor is excluded by
    // its own archived-ancestor predicate, covered separately).
    const expectedIds = new Set([fixture.atcRunId, fixture.atcNoTestId, fixture.atcNoRunId]);
    for (const atc of single.atcs) {
      expect(expectedIds.has(atc.id)).toBe(true);
    }
  });

  it('an archived ATC (own archived_at) is absent from the chain', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    const allAtcIds = page.criteria.flatMap(c => c.atcs.map(a => a.id));
    expect(allAtcIds).not.toContain(fixture.atcArchivedSelfId);
    // Its parent AC is itself archived (AC-06) — the whole criterion must
    // also be absent.
    expect(page.criteria.some(c => c.id === fixture!.acArchivedId)).toBe(false);
  });

  it('an ATC under an ARCHIVED ANCESTOR module (own archived_at still null) is absent — EC7, no ghost coverage', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    const allAtcIds = page.criteria.flatMap(c => c.atcs.map(a => a.id));
    expect(allAtcIds).not.toContain(fixture.atcArchivedAncestorId);
  });

  it('a standalone bug (atc_id null) neither vanishes the read nor leaks into any ATC\'s defect list', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    const allDefectIds = page.criteria.flatMap(c => c.atcs.flatMap(a => a.defects.map(d => d.id)));
    expect(allDefectIds).not.toContain(createdStandaloneBugId);
    // The read itself must succeed (a null-atc_id bug must not crash the
    // chain_bug CTE's `in (select atc_id from pair)` predicate).
    expect(page.story.id).toBe(fixture.storyId);
  });

  it('an ATC bound to 2 ACs on the same story repeats under EACH — no dedupe', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    const criteriaCarryingShared = page.criteria.filter(c => c.atcs.some(a => a.id === fixture!.atcSharedId));
    expect(criteriaCarryingShared.length).toBe(2);
  });

  it('the "run" ATC exercises the full chain: a Test (from run_atcs/runs, not test_steps alone), an in-flight run state, and its defect', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    const single = findCriterion(page, fixture.acSingleId);
    const runAtc = single.atcs.find(a => a.id === fixture!.atcRunId);
    expect(runAtc).toBeDefined();
    expect(runAtc!.test?.title).toBe(`${PREFIX} test`);
    expect(runAtc!.latest_run?.state).toBe('in_flight');
    expect(runAtc!.defects.length).toBe(1);
    expect(runAtc!.defects[0].title).toBe(`${PREFIX} bug on run atc`);
  });

  it('the "noTest" ATC has test: null (no Test chains it) — distinct from "noRun"', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    const single = findCriterion(page, fixture.acSingleId);
    const noTestAtc = single.atcs.find(a => a.id === fixture!.atcNoTestId);
    expect(noTestAtc).toBeDefined();
    expect(noTestAtc!.test).toBeNull();
    expect(noTestAtc!.latest_run).toBeNull();
  });

  it('the "noRun" ATC has a test but latest_run: null — distinct from "noTest"', async () => {
    if (!fixture) { return warn(); }
    const page = await reportTraceability(fixture.storyId, fixture.actorUserId);
    const single = findCriterion(page, fixture.acSingleId);
    const noRunAtc = single.atcs.find(a => a.id === fixture!.atcNoRunId);
    expect(noRunAtc).toBeDefined();
    expect(noRunAtc!.test?.title).toBe(`${PREFIX} test`);
    expect(noRunAtc!.latest_run).toBeNull();
  });
});

async function reportTraceability(userStoryId: string, actorUserId: string): Promise<TraceabilityPayload> {
  const db = service();
  const { data, error } = await db.rpc(RPC, { p_actor_user_id: actorUserId, p_user_story_id: userStoryId });
  if (error) { throw error; }
  return data as unknown as TraceabilityPayload;
}

function findCriterion(page: TraceabilityPayload, acId: string): TraceabilityCriterionRow {
  const c = page.criteria.find(cr => cr.id === acId);
  if (!c) { throw new Error(`criterion ${acId} not found in traceability chain`); }
  return c;
}

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[traceability-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
