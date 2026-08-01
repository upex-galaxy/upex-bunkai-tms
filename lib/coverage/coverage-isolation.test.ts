import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-46 — bunkai_report_project_coverage isolation + coverage-state correctness.
//
// Covers the PO-decided coverage-state model (Q1/Q2/Q3, BK-46 Jira comments
// 2026-06-27) end to end against REAL seeded rows, not just the pure-logic
// layer (lib/coverage/coverage-view.ts covers that separately):
//   * an AC with zero linked (non-archived) ATCs -> 'uncovered'
//   * an AC with >=1 linked ATC, at least one 'unrun' -> 'not_run' (Q3 union
//     rule — a second, 'pass' ATC on the SAME AC does not clear it)
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
  moduleIds: Record<'uncovered' | 'notRun' | 'executed' | 'mixed' | 'noAcs' | 'archivedAtc', string>
  atcIds: string[]
  acIds: string[]
  userStoryIds: string[]
  foreignProjectId: string | null
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

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

    // 6 modules in Project A, one per coverage-state case.
    const moduleSpecs = [
      { key: 'uncovered' as const, path: 'uncovered', name: 'Uncovered' },
      { key: 'notRun' as const, path: 'not-run', name: 'Not Run' },
      { key: 'executed' as const, path: 'executed', name: 'Executed' },
      { key: 'mixed' as const, path: 'mixed', name: 'Mixed (union rule)' },
      { key: 'noAcs' as const, path: 'no-acs', name: 'No ACs' },
      { key: 'archivedAtc' as const, path: 'archived-atc', name: 'Archived ATC only' },
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

    // One User Story per module (except "No ACs", which gets zero).
    const usSpecs: Array<{ key: keyof Fixture['moduleIds'] | 'b', moduleId: string }> = [
      { key: 'uncovered', moduleId: moduleIds.uncovered },
      { key: 'notRun', moduleId: moduleIds.notRun },
      { key: 'executed', moduleId: moduleIds.executed },
      { key: 'mixed', moduleId: moduleIds.mixed },
      { key: 'archivedAtc', moduleId: moduleIds.archivedAtc },
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

    // ATCs: notRun -> 1 unrun; executed -> 1 pass; mixed -> 1 pass + 1 unrun
    // (Q3 union rule — the AC must still read 'not_run'); archivedAtc -> 1
    // pass ATC that is ARCHIVED (must not count as coverage at all). The
    // 'uncovered'/'b' ACs get no ATC.
    const atcSpecs = [
      { key: 'notRun', moduleKey: 'notRun' as const, status: 'unrun', archived: false },
      { key: 'executed', moduleKey: 'executed' as const, status: 'pass', archived: false },
      { key: 'mixedPass', moduleKey: 'mixed' as const, status: 'pass', archived: false },
      { key: 'mixedUnrun', moduleKey: 'mixed' as const, status: 'unrun', archived: false },
      { key: 'archived', moduleKey: 'archivedAtc' as const, status: 'pass', archived: true },
    ];
    const { data: seededAtcs, error: atcsError } = await db
      .from('atcs')
      .insert(atcSpecs.map(a => ({
        project_id: projectAId,
        module_id: moduleIds[a.moduleKey],
        user_story_id: storyIdByKey.get(a.moduleKey)!,
        slug: `${PREFIX}-atc-${a.key}`,
        title: `${PREFIX} atc ${a.key}`,
        layer: 'UI',
        status: a.status,
        archived_at: a.archived ? new Date().toISOString() : null,
      })))
      .select('id, slug');
    if (atcsError) { throw atcsError; }
    const atcIdByKey = new Map(
      atcSpecs.map(a => [a.key, (seededAtcs ?? []).find(x => x.slug === `${PREFIX}-atc-${a.key}`)!.id as string]),
    );

    // Link: notRun's AC <- notRun ATC; executed's AC <- executed ATC;
    // mixed's AC <- BOTH mixedPass and mixedUnrun ATCs; archivedAtc's AC <-
    // the archived ATC only.
    const links = [
      { atcKey: 'notRun', acKey: 'notRun' },
      { atcKey: 'executed', acKey: 'executed' },
      { atcKey: 'mixedPass', acKey: 'mixed' },
      { atcKey: 'mixedUnrun', acKey: 'mixed' },
      { atcKey: 'archived', acKey: 'archivedAtc' },
    ];
    const { error: linkError } = await db
      .from('atc_acceptance_criteria')
      .insert(links.map(l => ({
        atc_id: atcIdByKey.get(l.atcKey)!,
        acceptance_criterion_id: acIdByKey.get(l.acKey)!,
      })));
    if (linkError) { throw linkError; }

    fixture = {
      actorUserId: anchor.user_id,
      workspaceId: anchor.workspace_id,
      projectAId,
      projectBId,
      moduleIds,
      atcIds: [...atcIdByKey.values()],
      acIds: [...acIdByKey.values()],
      userStoryIds: [...storyIdByKey.values()],
      foreignProjectId,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // FK order: atc_acceptance_criteria/atcs -> acceptance_criteria ->
    // user_stories -> modules/projects. Deleting the Projects cascades
    // modules/atcs/user_stories/acceptance_criteria (all ON DELETE CASCADE
    // from their respective parents per 0002/0003/0004).
    await db.from('projects').delete().in('id', [fixture.projectAId, fixture.projectBId]);
  });

  it('an AC with no linked (non-archived) ATC is uncovered', async () => {
    if (!fixture) { return warn(); }
    const page = await reportCoverage(fixture.projectAId, fixture.actorUserId);
    const mod = findModule(page, fixture.moduleIds.uncovered);
    expect(mod.status).toBe('uncovered');
    expect(mod.ac_uncovered).toBe(1);
    expect(page.no_coverage.some(nc => nc.module_id === fixture!.moduleIds.uncovered)).toBe(true);
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
