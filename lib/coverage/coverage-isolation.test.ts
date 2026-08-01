import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-46 — bunkai_report_project_coverage isolation + coverage-state correctness.
//
// Covers the PO-decided coverage-state model (Q1/Q2/Q3, BK-46 Jira comments
// 2026-06-27) end to end against REAL seeded rows, not just the pure-logic
// layer (lib/coverage/coverage-view.ts covers that separately):
//   * an AC with zero linked (non-archived) ATCs -> 'uncovered'
//   * an AC with >=1 linked ATC, at least one 'unrun' -> 'not_run' (Q3 union
//     rule — a second, 'passed' ATC on the SAME AC does not clear it)
//   * an AC with >=1 linked ATC, none 'unrun' -> 'executed'
//   * a module whose every AC is 'executed' -> 'fully_covered'
//   * an ATC that is archived does not count as coverage at all (treated as
//     if the link did not exist)
//   * a module with zero User Stories/ACs -> 'no_acs', not an error
// Plus this run's standing security contract for any SECURITY DEFINER RPC
// taking an explicit actor id: project-scope isolation (a sibling Project's
// gaps never leak), non-disclosure (foreign/missing Project -> same P0002),
// and the actor-bind guard (a spoofed p_actor_user_id collapses into the same
// P0002, proven via a REAL login, never a minted/impersonated session —
// live-ui-identity.md §3 is satisfied the same way report-isolation.test.ts
// satisfies it: service-role client for fixture seed/teardown with an
// explicit actor id is not "obtaining a session", only the actor-bind case's
// login is, and that login goes through the app's real
// supabase.auth.signInWithPassword path).
//
// Migration 0050 (final-chain-review fix): "unrun"/"executed" is sourced
// from run_atcs (an ATC's most recent execution across any Run), NOT
// atcs.status — that column is never written by any production code path
// (0050's own header comment) and is kept here purely as a NOT NULL
// DB-constraint placeholder ('unrun' on every seeded ATC, with zero bearing
// on the RPC's output). The fixture below seeds real run_atcs rows to drive
// the 'executed' cases instead.
//
// DB-dependent + env-gated, same two-tier gate as report-isolation.test.ts:
// the isolation/coverage-state suite needs only SUPABASE_SERVICE_ROLE_KEY;
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

const RPC = 'bunkai_report_project_coverage';
const PREFIX = `bk46-coverage-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
// Deliberately NOT any real user's id — the actor-bind guard fires on a mere
// mismatch, so a well-formed but nonexistent uuid is sufficient to spoof.
const SPOOFED_ACTOR_UUID = '00000000-0000-0000-0000-000000000001';

interface MemberRow { user_id: string, workspace_id: string }
interface ModuleRow { module_id: string, module_name: string, ac_total: number, ac_uncovered: number, ac_not_run: number, ac_executed: number, status: string }
interface CoveragePayload {
  kpis: { ac_total: number, ac_bound: number, ac_executed: number, modules_total: number, modules_fully_covered: number }
  modules: ModuleRow[]
  no_coverage: Array<{ ac_id: string, ac_title: string, module_id: string, module_name: string }>
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

interface Fixture {
  actorUserId: string
  workspaceId: string
  projectAId: string
  projectBId: string
  moduleIds: Record<'uncovered' | 'notRun' | 'executed' | 'mixed' | 'noAcs' | 'archivedAtc' | 'moduleMix', string>
  atcIds: string[]
  acIds: string[]
  userStoryIds: string[]
  foreignProjectId: string | null
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;
// Tracked independently of `fixture` (only assigned once beforeAll fully
// completes) so afterAll can always reap the two throwaway Projects even if
// a LATER step in beforeAll throws — a partial fixture is still a fixture
// that needs cleanup, not a fixture-shaped hole in the shared DB.
let createdProjectIds: string[] = [];
// Cascades from createdProjectIds (runs.project_id/project_environments.project_id
// are both ON DELETE CASCADE), EXCEPT the Test row — runs.test_id is ON DELETE
// RESTRICT, so it must be deleted separately, AFTER the Projects (whose cascade
// removes the Run that references it).
let createdTestId: string | null = null;

describeOrSkip('BK-46 — bunkai_report_project_coverage isolation + coverage-state', () => {
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
    const foreignProjectId = (projects ?? [])
      .find(p => p.workspace_id !== anchor.workspace_id)?.id ?? null;

    // Two throwaway Projects in the anchor's workspace — Project B exists
    // purely to prove Project A's coverage report never leaks Project B's
    // uncovered ACs (project-scope boundary, same reasoning as
    // report-isolation.test.ts's Project A/B split).
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
    // Tracked immediately — everything else in this function cascades off
    // these two Project rows, so this is the one line that must run before
    // any later step that could throw.
    createdProjectIds = [projectAId, projectBId];

    // 7 modules in Project A, one per coverage-state case, plus "moduleMix"
    // which gets TWO ACs in different states (see usSpecs/acSpecs below) to
    // exercise the MODULE-level precedence order directly (uncovered >
    // not_run > fully_covered > no_acs) — the other 6 modules each carry
    // exactly one AC, which only proves the PER-AC state, not that a module
    // with heterogeneous AC states resolves to the right overall status.
    const moduleSpecs = [
      { key: 'uncovered' as const, path: 'uncovered', name: 'Uncovered' },
      { key: 'notRun' as const, path: 'not-run', name: 'Not Run' },
      { key: 'executed' as const, path: 'executed', name: 'Executed' },
      { key: 'mixed' as const, path: 'mixed', name: 'Mixed (union rule)' },
      { key: 'noAcs' as const, path: 'no-acs', name: 'No ACs' },
      { key: 'archivedAtc' as const, path: 'archived-atc', name: 'Archived ATC only' },
      { key: 'moduleMix' as const, path: 'module-mix', name: 'Module Mix (precedence)' },
    ];
    const { data: seededModules, error: modulesError } = await db
      .from('modules')
      .insert(moduleSpecs.map(m => ({ project_id: projectAId, path: m.path, name: m.name })))
      .select('id, path');
    if (modulesError) { throw modulesError; }
    const moduleIds = Object.fromEntries(
      moduleSpecs.map(m => [m.key, (seededModules ?? []).find(sm => sm.path === m.path)!.id as string]),
    ) as Fixture['moduleIds'];

    // One Project B module + AC, uncovered — the cross-project-leak probe.
    const { data: moduleB, error: moduleBError } = await db
      .from('modules')
      .insert({ project_id: projectBId, path: 'b-uncovered', name: 'B Uncovered' })
      .select('id')
      .single();
    if (moduleBError) { throw moduleBError; }

    // One User Story per module (except "No ACs", which gets zero) — EXCEPT
    // "moduleMix", which gets TWO (moduleMixUncovered / moduleMixNotRun) so
    // that one module carries ACs in two different states at once.
    const usSpecs: Array<{ key: keyof Fixture['moduleIds'] | 'b' | 'moduleMixUncovered' | 'moduleMixNotRun', moduleId: string }> = [
      { key: 'uncovered', moduleId: moduleIds.uncovered },
      { key: 'notRun', moduleId: moduleIds.notRun },
      { key: 'executed', moduleId: moduleIds.executed },
      { key: 'mixed', moduleId: moduleIds.mixed },
      { key: 'archivedAtc', moduleId: moduleIds.archivedAtc },
      { key: 'moduleMixUncovered', moduleId: moduleIds.moduleMix },
      { key: 'moduleMixNotRun', moduleId: moduleIds.moduleMix },
      { key: 'b', moduleId: moduleB.id as string },
    ];
    const { data: seededStories, error: storiesError } = await db
      .from('user_stories')
      .insert(usSpecs.map(u => ({ module_id: u.moduleId, title: `${PREFIX} story ${u.key}` })))
      .select('id, title');
    if (storiesError) { throw storiesError; }
    const storyIdByKey = new Map<string, string>(
      usSpecs.map(u => [u.key, (seededStories ?? []).find(s => s.title === `${PREFIX} story ${u.key}`)!.id as string]),
    );

    // One AC per User Story.
    const acSpecs = usSpecs.map(u => ({ key: u.key as string, userStoryId: storyIdByKey.get(u.key)! }));
    const { data: seededAcs, error: acsError } = await db
      .from('acceptance_criteria')
      .insert(acSpecs.map(a => ({ user_story_id: a.userStoryId, title: `${PREFIX} ac ${a.key}`, position: 0 })))
      .select('id, title, user_story_id');
    if (acsError) { throw acsError; }
    const acIdByKey = new Map<string, string>(
      acSpecs.map(a => [a.key, (seededAcs ?? []).find(ac => ac.title === `${PREFIX} ac ${a.key}`)!.id as string]),
    );

    // ATCs: notRun -> never run; executed -> run_atcs 'passed' (seeded below);
    // mixed -> one run_atcs 'passed' + one never-run (Q3 union rule — the AC
    // must still read 'not_run'); archivedAtc -> a run_atcs 'passed' ATC that
    // is ARCHIVED (must not count as coverage at all, regardless of
    // execution); moduleMixNotRun -> never run (its sibling
    // moduleMixUncovered AC gets no ATC, so module "moduleMix" carries one
    // uncovered + one not_run AC). The 'uncovered'/'b' ACs get no ATC.
    // `status` on the row itself is NOT read by the RPC post-0050 — it is
    // kept at the column's own default ('unrun') purely to satisfy the NOT
    // NULL constraint; real "executed" state comes from run_atcs, seeded
    // below via `atcSpecs[].runStatus`.
    const atcSpecs = [
      { key: 'notRun', moduleKey: 'notRun' as const, storyKey: 'notRun', archived: false, runStatus: null as string | null },
      { key: 'executed', moduleKey: 'executed' as const, storyKey: 'executed', archived: false, runStatus: 'passed' as string | null },
      { key: 'mixedPass', moduleKey: 'mixed' as const, storyKey: 'mixed', archived: false, runStatus: 'passed' as string | null },
      { key: 'mixedUnrun', moduleKey: 'mixed' as const, storyKey: 'mixed', archived: false, runStatus: null as string | null },
      { key: 'archived', moduleKey: 'archivedAtc' as const, storyKey: 'archivedAtc', archived: true, runStatus: 'passed' as string | null },
      { key: 'moduleMixNotRun', moduleKey: 'moduleMix' as const, storyKey: 'moduleMixNotRun', archived: false, runStatus: null as string | null },
    ];
    const { data: seededAtcs, error: atcsError } = await db
      .from('atcs')
      .insert(atcSpecs.map(a => ({
        project_id: projectAId,
        module_id: moduleIds[a.moduleKey],
        user_story_id: storyIdByKey.get(a.storyKey)!,
        slug: `${PREFIX}-atc-${a.key}`,
        title: `${PREFIX} atc ${a.key}`,
        layer: 'UI',
        status: 'unrun',
        archived_at: a.archived ? new Date().toISOString() : null,
      })))
      .select('id, slug');
    if (atcsError) { throw atcsError; }
    const atcIdByKey = new Map(
      atcSpecs.map(a => [a.key, (seededAtcs ?? []).find(x => x.slug === `${PREFIX}-atc-${a.key}`)!.id as string]),
    );

    // Cross-project mis-link probe: a Project-B ATC (its OWN project_id,
    // module_id and user_story_id all self-consistently belong to Project B)
    // linked via atc_acceptance_criteria to Project A's "uncovered" AC — the
    // exact "ATC mis-linked to an AC in a DIFFERENT project" threat the
    // ac_state CTE's `a.project_id = p_project_id` predicate (0048's own
    // header comment) exists to defend against. Given a real run_atcs
    // 'passed' row below (not 'unrun'): if the guard were ever missing, this
    // AC would flip 'uncovered' -> 'executed' (the module 'uncovered' ->
    // 'fully_covered'), matching the migration's own stated threat ("would
    // silently count as that AC's coverage") — a sharper regression signal
    // than an unexecuted ATC would give, which would only shift 'uncovered'
    // -> 'not_run'.
    const { data: crossProjectAtc, error: crossProjectAtcError } = await db
      .from('atcs')
      .insert({
        project_id: projectBId,
        module_id: moduleB.id as string,
        user_story_id: storyIdByKey.get('b')!,
        slug: `${PREFIX}-atc-crossProject`,
        title: `${PREFIX} atc crossProject`,
        layer: 'UI',
        status: 'unrun',
        archived_at: null,
      })
      .select('id')
      .single();
    if (crossProjectAtcError) { throw crossProjectAtcError; }

    // Link: notRun's AC <- notRun ATC; executed's AC <- executed ATC;
    // mixed's AC <- BOTH mixedPass and mixedUnrun ATCs; archivedAtc's AC <-
    // the archived ATC only; moduleMixNotRun's AC <- its unrun ATC; the
    // 'uncovered' AC <- the cross-project Project-B ATC above (must NOT
    // count).
    const links = [
      { atcKey: 'notRun', acKey: 'notRun' },
      { atcKey: 'executed', acKey: 'executed' },
      { atcKey: 'mixedPass', acKey: 'mixed' },
      { atcKey: 'moduleMixNotRun', acKey: 'moduleMixNotRun' },
      { atcKey: 'mixedUnrun', acKey: 'mixed' },
      { atcKey: 'archived', acKey: 'archivedAtc' },
    ];
    const { error: linkError } = await db
      .from('atc_acceptance_criteria')
      .insert([
        ...links.map(l => ({
          atc_id: atcIdByKey.get(l.atcKey)!,
          acceptance_criterion_id: acIdByKey.get(l.acKey)!,
        })),
        {
          atc_id: crossProjectAtc.id as string,
          acceptance_criterion_id: acIdByKey.get('uncovered')!,
        },
      ]);
    if (linkError) { throw linkError; }

    // Real execution source for migration 0050: a throwaway Environment +
    // Test + Run in Project A (run_atcs.run_id is a mandatory FK — there is
    // no way to seed an execution status without a real Run row), then one
    // run_atcs row per ATC whose `runStatus` above is non-null. run_atcs.atc_id
    // is "provenance only" (no FK-level requirement that it match the Run's
    // own project) — the crossProject ATC's row deliberately attaches to
    // THIS SAME Project-A Run despite the ATC itself belonging to Project B,
    // mirroring atc_real_status's own doc'd "unscoped by project" reasoning
    // (0050's header comment): scoping happens once, upstream, on the ATC id
    // itself, not on which Run's execution history is consulted.
    const { data: environmentA, error: environmentAError } = await db
      .from('project_environments')
      .insert({ project_id: projectAId, name: 'Staging' })
      .select('id')
      .single();
    if (environmentAError) { throw environmentAError; }

    const { data: seededTest, error: testError } = await db
      .from('tests')
      .insert({ workspace_id: anchor.workspace_id, title: `${PREFIX} test`, created_by: anchor.user_id })
      .select('id')
      .single();
    if (testError) { throw testError; }
    createdTestId = seededTest.id as string;

    const { data: seededRun, error: runError } = await db
      .from('runs')
      .insert({
        workspace_id: anchor.workspace_id,
        project_id: projectAId,
        test_id: createdTestId,
        environment_id: environmentA.id as string,
        test_title: `${PREFIX} test`,
        status: 'passed',
        executor_mode: 'human',
        start_token: `${PREFIX}-run`,
      })
      .select('id')
      .single();
    if (runError) { throw runError; }

    const runAtcSpecs = [
      ...atcSpecs
        .filter(a => a.runStatus !== null)
        .map(a => ({ atcId: atcIdByKey.get(a.key)!, atcTitle: `${PREFIX} atc ${a.key}`, status: a.runStatus! })),
      { atcId: crossProjectAtc.id as string, atcTitle: `${PREFIX} atc crossProject`, status: 'passed' },
    ];
    const { error: runAtcsError } = await db
      .from('run_atcs')
      .insert(runAtcSpecs.map((r, i) => ({
        run_id: seededRun.id as string,
        atc_id: r.atcId,
        position: i + 1,
        atc_title: r.atcTitle,
        status: r.status,
      })));
    if (runAtcsError) { throw runAtcsError; }

    fixture = {
      actorUserId: anchor.user_id,
      workspaceId: anchor.workspace_id,
      projectAId,
      projectBId,
      moduleIds,
      atcIds: [...atcIdByKey.values(), crossProjectAtc.id as string],
      acIds: [...acIdByKey.values()],
      userStoryIds: [...storyIdByKey.values()],
      foreignProjectId,
    };
  });

  afterAll(async () => {
    // Gated on createdProjectIds, NOT on `fixture` — fixture is only assigned
    // once every step below it succeeds, so gating cleanup on it would leak
    // both throwaway Projects (and everything cascaded into them) if any
    // later insert in this function throws.
    if (createdProjectIds.length === 0) { return; }
    const db = service();
    // FK order: atc_acceptance_criteria/atcs/run_atcs -> acceptance_criteria/
    // runs -> user_stories/project_environments -> modules/projects. Deleting
    // the Projects cascades modules/atcs/user_stories/acceptance_criteria
    // (0002/0003/0004) AND runs/project_environments/run_atcs (0031/0032) —
    // all ON DELETE CASCADE. The Test row is NOT cascaded (runs.test_id is ON
    // DELETE RESTRICT) — delete it AFTER the Projects, once the Run
    // referencing it is already gone.
    await db.from('projects').delete().in('id', createdProjectIds);
    if (createdTestId) {
      await db.from('tests').delete().eq('id', createdTestId);
    }
  });

  it('an AC with no linked (non-archived) ATC is uncovered', async () => {
    if (!fixture) { return warn(); }
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.uncovered);
    expect(mod.status).toBe('uncovered');
    expect(mod.ac_uncovered).toBe(1);
    expect(page.no_coverage.some(nc => nc.module_id === fixture!.moduleIds.uncovered)).toBe(true);
  });

  it('a cross-project ATC mis-linked to this AC does not count as coverage (ac_state project-scope guard)', async () => {
    if (!fixture) { return warn(); }
    // The 'uncovered' AC is ALSO linked (via the beforeAll fixture) to a
    // 'pass'-status ATC that legitimately belongs to Project B. If the
    // ac_state CTE's `a.project_id = p_project_id` predicate on the atcs
    // join were ever missing, this AC would read 'executed' and the module
    // 'fully_covered' instead of 'uncovered' — the exact leak 0048's own
    // header comment names as the reason for that predicate.
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.uncovered);
    expect(mod.status).toBe('uncovered');
    expect(mod.ac_uncovered).toBe(1);
    expect(mod.ac_executed).toBe(0);
  });

  it('an AC linked to an unrun ATC is not_run', async () => {
    if (!fixture) { return warn(); }
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.notRun);
    expect(mod.status).toBe('not_run');
    expect(mod.ac_not_run).toBe(1);
    expect(mod.ac_uncovered).toBe(0);
  });

  it('an AC linked to an executed (non-unrun) ATC is executed, and the module is fully_covered', async () => {
    if (!fixture) { return warn(); }
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.executed);
    expect(mod.status).toBe('fully_covered');
    expect(mod.ac_executed).toBe(1);
  });

  it('Q3 union rule: one executed + one unrun ATC on the SAME AC still reads not_run', async () => {
    if (!fixture) { return warn(); }
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.mixed);
    expect(mod.status).toBe('not_run');
    expect(mod.ac_not_run).toBe(1);
    expect(mod.ac_executed).toBe(0);
  });

  it('module-level precedence: a module with BOTH an uncovered and a not_run AC reads uncovered overall', async () => {
    if (!fixture) { return warn(); }
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.moduleMix);
    expect(mod.ac_total).toBe(2);
    expect(mod.ac_uncovered).toBe(1);
    expect(mod.ac_not_run).toBe(1);
    // uncovered outranks not_run in the module-status precedence.
    expect(mod.status).toBe('uncovered');
  });

  it('an archived ATC does not count as coverage — the AC reads uncovered', async () => {
    if (!fixture) { return warn(); }
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.archivedAtc);
    expect(mod.status).toBe('uncovered');
    expect(mod.ac_uncovered).toBe(1);
  });

  it('a module with zero User Stories/ACs is no_acs, not an error', async () => {
    if (!fixture) { return warn(); }
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.noAcs);
    expect(mod.status).toBe('no_acs');
    expect(mod.ac_total).toBe(0);
  });

  it('Project B\'s uncovered AC never leaks into Project A\'s report (project-scope boundary)', async () => {
    if (!fixture) { return warn(); }
    const pageA = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const moduleIdsA = new Set(pageA.modules.map(m => m.module_id));
    const pageB = await reportCoverage(fixture.projectBId, fixture.actorUserId);
    for (const m of pageB.modules) {
      expect(moduleIdsA.has(m.module_id)).toBe(false);
    }
    expect(pageA.no_coverage.every(nc => pageA.modules.some(m => m.module_id === nc.module_id))).toBe(true);
  });

  it('a FOREIGN-workspace Project resolves to the SAME P0002 as a nonexistent Project (non-disclosure)', async () => {
    if (!fixture) { return warn(); }
    if (!fixture.foreignProjectId) {
      console.warn('[coverage-isolation] skipped foreign-workspace case: need a Project outside the anchor\'s workspace (seed state).');
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
      console.warn('[coverage-isolation] skipped actor-bind case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    // Real, sanctioned login — never a minted/impersonated session.
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[coverage-isolation] skipped actor-bind case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
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
        console.warn(`[coverage-isolation] skipped actor-bind case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
        return;
      }
      grantedMembership = true;
    }

    try {
      // Legitimate self-call succeeds first — proves the session is genuinely
      // authenticated and the rejection below fails for the RIGHT reason.
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

async function reportCoverage(projectId: string, actorUserId: string): Promise<CoveragePayload> {
  const db = service();
  const { data, error } = await db.rpc(RPC, { p_actor_user_id: actorUserId, p_project_id: projectId });
  if (error) { throw error; }
  return data as unknown as CoveragePayload;
}

function findModule(page: CoveragePayload, moduleId: string): ModuleRow {
  const mod = page.modules.find(m => m.module_id === moduleId);
  if (!mod) { throw new Error(`module ${moduleId} not found in coverage report`); }
  return mod;
}

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[coverage-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
