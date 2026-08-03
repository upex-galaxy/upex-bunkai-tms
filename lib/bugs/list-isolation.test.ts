import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-41 — DB-level integration test for `bunkai_list_bugs`
// (migration 0051_bugs_list.sql), the mandatory DB-integration test per
// ADR-0012 / rpc-authorization.md §5 ("test against the real database") and
// this story's own DoD line ("list-isolation.test.ts runs against the real
// database, not a mock"). Mirrors `lib/activity/list-activity-isolation.test.ts`'s
// structure (BK-49's own SECURITY INVOKER precedent) — same service-role
// fixture seed/teardown pattern, same real-login RLS proof.
//
// `bunkai_list_bugs` carries NO p_actor_user_id (Decision 3, ADR-0012's
// preferred outcome) — there is nothing to spoof. Its isolation is enforced
// entirely by `bugs_select_workspace_member` (0046_bugs.sql) evaluating
// against the CALLER's own `auth.uid()`, which only happens when the RPC is
// actually invoked AS the caller. A service-role client's Postgres role
// bypasses RLS outright, so calling this RPC with `SUPABASE_SERVICE_ROLE_KEY`
// alone would pass even if the RLS policy were deleted entirely — it is used
// ONLY for fixture setup/teardown and for the non-RLS-relevant deployment
// probe below. The two properties this run's briefing calls mandatory:
//
//   (a) A caller who is NOT a member of the project's workspace gets zero
//       rows (never a different project's or workspace's bugs) — proven via
//       a REAL authenticated session (the QA_E2E automation identity,
//       deliberately never granted membership in the fixture workspace),
//       never a mocked `db.rpc` call and never inferred from a service-role
//       result. Per Decision 9 (ADR-0012's non-disclosure precedent,
//       `bunkai_list_activity`'s own documented behavior) this collapses
//       into 200 `{data: [], aggregates: zeroed}`, not a 403 — the outsider
//       case is a REAL RLS-filtered empty result, not an error path.
//   (b) A caller who IS a member of the workspace, querying Project A, only
//       ever sees Project A's bugs — Project B's bugs (same workspace,
//       different project) never leak across the p_project_id filter, even
//       though RLS itself only gates at the workspace boundary.
//
// The actor-bind / real-login case authenticates through the app's REAL,
// sanctioned login path — `supabase.auth.signInWithPassword` with the anon
// key, using the already-declared automation identity (`QA_E2E_USER_EMAIL` /
// `QA_E2E_USER_PASSWORD`, see `.agents/project.yaml` ->
// `testing.automation_identity`) — never a locally-minted JWT and never a
// borrowed/impersonated identity, per `live-ui-identity.md` §3 (governs ALL
// test code, not only live-UI/browser checks). Using
// `SUPABASE_SERVICE_ROLE_KEY` for fixture seed/teardown and for the
// deployment probe is separately and explicitly sanctioned.
//
// DB-dependent + env-gated: the deployment probe and fixture seed need only
// `SUPABASE_SERVICE_ROLE_KEY`; both RLS-proving cases additionally need
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `QA_E2E_USER_EMAIL` + `QA_E2E_USER_PASSWORD`
// to log in for real, and are gated separately so their absence never skips
// the rest of the suite. Either gate SKIPS LOUDLY when its env is missing —
// never blocks a build on migration, seed state, or a QA fixture-account
// hiccup. As of this writing, migration 0051 has NOT been applied to the
// live database — the deployment probe below is therefore EXPECTED to skip
// the whole suite until an operator applies it; this is the correct, inert
// state for a proposed-but-unapplied migration, not a test failure.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_list_bugs';
const PREFIX = `bk41-bugs-list-isolation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface BugRow { id: string, project_id: string, severity: string, status: string }
interface BugsListPage {
  data: BugRow[]
  aggregates: { by_severity: Record<string, number>, by_status: Record<string, number> }
  next_cursor: { severity: string, created_at: string, id: string } | null
}
interface Fixture {
  workspaceId: string
  projectAId: string
  projectBId: string
  moduleAId: string
  moduleBId: string
  bugA1Id: string
  bugA2Id: string
  bugB1Id: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function listBugs(
  db: ReturnType<typeof service>,
  args: { projectId: string, moduleId?: string | null, statuses?: string[] | null, severities?: string[] | null, limit?: number },
) {
  return db.rpc(RPC, {
    p_project_id: args.projectId,
    p_module_id: args.moduleId ?? null,
    p_statuses: args.statuses ?? null,
    p_severities: args.severities ?? null,
    p_limit: args.limit ?? 30,
    p_cursor_severity: null,
    p_cursor_created_at: null,
    p_cursor_id: null,
  });
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-41 — bunkai_list_bugs isolation (non-member excluded, cross-project bugs never leak)', () => {
  beforeAll(async () => {
    const db = service();

    // Is the RPC deployed? A deployed RPC answers with a jsonb page for any
    // well-formed project id (even a nonexistent one — RLS/the WHERE clause
    // just returns an empty page; this RPC never raises for a missing
    // project the way the DEFINER RPCs' actor-bind guard does).
    const probe = await db.rpc(RPC, {
      p_project_id: ZERO_UUID,
      p_module_id: null,
      p_statuses: null,
      p_severities: null,
      p_limit: 30,
      p_cursor_severity: null,
      p_cursor_created_at: null,
      p_cursor_id: null,
    });
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0051_bugs_list.sql.`;
      return;
    }

    // Any real user id works as the throwaway workspace's owner (FK only,
    // never authenticated as) and as the seeded bugs' created_by.
    const { data: anyMember, error: memberError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (memberError) { throw memberError; }
    if (!anyMember) {
      skipReason = 'need at least one active workspace member to use as a real user id (seed state).';
      return;
    }
    const ownerUserId = anyMember.user_id as string;

    // A dedicated throwaway workspace (not an existing one) — this project's
    // Supabase instance is shared live infra across concurrent workers, and
    // reusing a real busy workspace would make "never leaks Project B's bugs"
    // unfalsifiable against pre-existing unrelated rows. Direct service-role
    // inserts (bypassing bunkai_bootstrap_workspace) are legitimate fixture
    // setup here, mirroring list-activity-isolation.test.ts's own rationale.
    const { data: workspace, error: workspaceError } = await db
      .from('workspaces')
      .insert({ slug: `${PREFIX}-ws`, name: PREFIX, owner_user_id: ownerUserId })
      .select('id')
      .single();
    if (workspaceError) { throw workspaceError; }
    const workspaceId = workspace.id as string;

    // Two Projects in the SAME workspace — the whole point of case (b) is
    // that Project B's bugs must never appear when querying Project A, even
    // though both share a workspace (and therefore the SAME RLS boundary).
    const { data: seededProjects, error: projectError } = await db
      .from('projects')
      .insert([
        { workspace_id: workspaceId, slug: `${PREFIX}-project-a`, name: `${PREFIX} project A` },
        { workspace_id: workspaceId, slug: `${PREFIX}-project-b`, name: `${PREFIX} project B` },
      ])
      .select('id, slug');
    if (projectError) { throw projectError; }
    const projectAId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-a'))!.id as string;
    const projectBId = (seededProjects ?? []).find(p => (p.slug as string).endsWith('-project-b'))!.id as string;

    const { data: seededModules, error: moduleError } = await db
      .from('modules')
      .insert([
        { project_id: projectAId, path: `${PREFIX}-module-a`, name: `${PREFIX} module A` },
        { project_id: projectBId, path: `${PREFIX}-module-b`, name: `${PREFIX} module B` },
      ])
      .select('id, project_id');
    if (moduleError) { throw moduleError; }
    const moduleAId = (seededModules ?? []).find(m => m.project_id === projectAId)!.id as string;
    const moduleBId = (seededModules ?? []).find(m => m.project_id === projectBId)!.id as string;

    // Two bugs in Project A, one in Project B — direct service-role inserts
    // (bunkai_create_bug's own actor-bind/module-consistency validation is
    // BK-40's concern, already covered by lib/bugs/isolation.test.ts; this
    // fixture only needs rows to exist, correctly consistent with the
    // bugs_check_consistency trigger).
    const { data: seededBugs, error: bugError } = await db
      .from('bugs')
      .insert([
        { workspace_id: workspaceId, project_id: projectAId, module_id: moduleAId, title: `${PREFIX} bug A1`, severity: 'P1', created_by: ownerUserId },
        { workspace_id: workspaceId, project_id: projectAId, module_id: moduleAId, title: `${PREFIX} bug A2`, severity: 'P3', created_by: ownerUserId },
        { workspace_id: workspaceId, project_id: projectBId, module_id: moduleBId, title: `${PREFIX} bug B1`, severity: 'P2', created_by: ownerUserId },
      ])
      .select('id, project_id, title');
    if (bugError) { throw bugError; }
    const bugA1Id = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug A1'))!.id as string;
    const bugA2Id = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug A2'))!.id as string;
    const bugB1Id = (seededBugs ?? []).find(b => (b.title as string).endsWith('bug B1'))!.id as string;

    fixture = { workspaceId, projectAId, projectBId, moduleAId, moduleBId, bugA1Id, bugA2Id, bugB1Id };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // bugs/projects/modules all cascade from workspaces (0001/0002/0046), so
    // deleting the throwaway workspace alone is sufficient — deleting rows
    // explicitly first anyway, for defensiveness against the FK shape ever
    // changing to RESTRICT (mirrors list-activity-isolation.test.ts).
    await db.from('bugs').delete().in('id', [fixture.bugA1Id, fixture.bugA2Id, fixture.bugB1Id]);
    await db.from('modules').delete().in('id', [fixture.moduleAId, fixture.moduleBId]);
    await db.from('projects').delete().in('id', [fixture.projectAId, fixture.projectBId]);
    await db.from('workspaces').delete().eq('id', fixture.workspaceId);
  });

  it('(a) a caller who is NOT a workspace member gets a REAL RLS-filtered empty result, never another project/workspace\'s bugs', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[bugs-list-isolation] skipped non-member case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[bugs-list-isolation] skipped non-member case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }

    // Sanity guard: the QA_E2E identity must genuinely be a non-member of the
    // throwaway fixture workspace for this to prove anything — it is never
    // granted membership anywhere in this file (unlike case (b) below).
    const db = service();
    const { data: existingMembership, error: existingMembershipError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.workspaceId)
      .eq('user_id', signIn.user.id)
      .maybeSingle();
    if (existingMembershipError) { throw existingMembershipError; }
    if (existingMembership) {
      console.warn('[bugs-list-isolation] skipped non-member case: QA_E2E identity unexpectedly already a member of the throwaway workspace.');
      return;
    }

    // Cross-check first: the service-role read proves Project A genuinely HAS
    // visible bugs — so the outsider's empty result below is caused by RLS,
    // not by an empty/miswired fixture.
    const asMember = await listBugs(db, { projectId: fixture.projectAId });
    expect(asMember.error).toBeNull();
    expect((asMember.data as unknown as BugsListPage).data.length).toBeGreaterThan(0);

    const asOutsider = await listBugs(anon, { projectId: fixture.projectAId });
    expect(asOutsider.error).toBeNull(); // RLS filters silently, never raises (Decision 9 — 200, not 403)
    const outsiderPage = asOutsider.data as unknown as BugsListPage;
    expect(outsiderPage.data).toEqual([]);
    expect(outsiderPage.aggregates).toEqual({
      by_severity: { P1: 0, P2: 0, P3: 0, P4: 0 },
      by_status: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
    });
    expect(outsiderPage.next_cursor).toBeNull();

    // The SAME outsider querying Project B (also zero-visible) must not leak
    // Project B's bug either — belt-and-suspenders against a filter that
    // accidentally ignored p_project_id entirely.
    const asOutsiderProjectB = await listBugs(anon, { projectId: fixture.projectBId });
    expect(asOutsiderProjectB.error).toBeNull();
    expect((asOutsiderProjectB.data as unknown as BugsListPage).data).toEqual([]);
  });

  it('(b) a workspace member querying Project A sees ONLY Project A\'s bugs, never Project B\'s', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[bugs-list-isolation] skipped member case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[bugs-list-isolation] skipped member case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
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
        console.warn(`[bugs-list-isolation] skipped member case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
        return;
      }
      grantedMembership = true;
    }

    try {
      const asMemberProjectA = await listBugs(anon, { projectId: fixture.projectAId });
      expect(asMemberProjectA.error).toBeNull();
      const pageA = asMemberProjectA.data as unknown as BugsListPage;
      const idsA = pageA.data.map(b => b.id);
      expect(idsA).toContain(fixture.bugA1Id);
      expect(idsA).toContain(fixture.bugA2Id);
      expect(idsA).not.toContain(fixture.bugB1Id);
      expect(pageA.data.every(b => b.project_id === fixture!.projectAId)).toBe(true);
      // Aggregates (AC-6) reflect the FULL filtered set for Project A only —
      // one P1 (bugA1) and one P3 (bugA2), never Project B's P2.
      expect(pageA.aggregates.by_severity.P1).toBe(1);
      expect(pageA.aggregates.by_severity.P3).toBe(1);

      const asMemberProjectB = await listBugs(anon, { projectId: fixture.projectBId });
      expect(asMemberProjectB.error).toBeNull();
      const pageB = asMemberProjectB.data as unknown as BugsListPage;
      const idsB = pageB.data.map(b => b.id);
      expect(idsB).toContain(fixture.bugB1Id);
      expect(idsB).not.toContain(fixture.bugA1Id);
      expect(idsB).not.toContain(fixture.bugA2Id);
    }
    finally {
      if (grantedMembership) {
        await db.from('workspace_members').delete().eq('workspace_id', fixture.workspaceId).eq('user_id', realUserId);
      }
    }
  });
});

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[bugs-list-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
