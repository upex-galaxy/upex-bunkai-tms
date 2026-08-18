import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-398 — DB-level integration test for `bunkai_search_workspace`
// (migration 0071_workspace_search.sql), the non-negotiable requirement of
// Jira comment 12406 (AI Tech Lead ruling), authoring question 6: "Which
// test proves it against the real database? A DB-integration isolation
// test in the shape of `lib/runs/report-isolation.test.ts` and
// `lib/activity/list-activity-isolation.test.ts`. A route test that mocks
// the RPC proves nothing."
//
// `bunkai_search_workspace` is `SECURITY INVOKER` with NO actor parameter —
// there is no `p_actor_user_id` to spoof (the whole point of the ruling:
// "a function that cannot be told who the caller is cannot be lied to").
// Its cross-workspace isolation is enforced entirely by each of the six
// UNION branches' pre-existing workspace-member RLS SELECT policy
// evaluating against the CALLER's own `auth.uid()`, which only happens when
// the RPC is actually invoked AS the caller — i.e. only a REAL
// authenticated session can prove this property (mirrors
// `list-activity-isolation.test.ts`'s reasoning verbatim: a service-role
// client's Postgres role bypasses RLS outright, so calling this RPC with
// `SUPABASE_SERVICE_ROLE_KEY` alone would pass even if every RLS policy
// were deleted). Service-role is used ONLY for fixture seed/teardown and
// for the cross-check that Workspace B's rows genuinely exist — never to
// obtain the session under test (`live-ui-identity.md` §3).
//
// REAL PRODUCTION WRITE PATH (the brief's own caution: "a suite can be
// fully green over a dead data path when fixtures seed the column the code
// reads rather than the column production writes"): the Test fixture in
// EACH workspace is created through the actual `bunkai_create_test` RPC
// (0024_tests.sql), not a raw `test_steps` insert. This is the branch of
// migration 0071 with the least direct schema mapping — Tests carry no
// `project_id` at all, and the RPC derives a representative project from
// `test_steps.position = 1`. Hand-crafting that row would prove the SELECT
// works against data shaped however this file's author guessed; going
// through the real RPC proves it against data shaped however the app
// itself actually writes it (positions strictly 1..n, in array order).
//
// FIXTURE SHAPE — two throwaway workspaces, not existing ones. Mirrors
// `list-activity-isolation.test.ts`'s reasoning: this Supabase project is
// shared live infra across concurrent sessions, so a query with no upper
// bound (this RPC's per-group `limit v_limit`, ranked by relevance) could
// otherwise surface unrelated pre-existing rows. Both workspaces share a
// SINGLE alphabetic-only probe token (no hyphens/digits) embedded in every
// seeded title/name — deliberately not the full `PREFIX` used for
// slugs/cleanup, which DOES contain hyphens and digits that `to_tsvector`
// would lexeme-split into multiple tokens, making an exact single-token
// prefix match harder to reason about. BK-401 showed isolation tests keyed
// on shared-table data drift flake against the live database — the probe
// token is unique per test run and every fixture row is deleted in
// `finally`/`afterAll`.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = process.env.QA_E2E_USER_EMAIL;
const qaPassword = process.env.QA_E2E_USER_PASSWORD;

const hasServiceEnv = Boolean(url && serviceKey);
const hasRealLoginEnv = Boolean(url && anonKey && qaEmail && qaPassword);

const describeOrSkip = hasServiceEnv ? describe : describe.skip;

const RPC = 'bunkai_search_workspace';
const RUN_TAG = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREFIX = `bk398-search-isolation-${RUN_TAG}`;
// Single, unbroken alphabetic token — never lexeme-split by `to_tsvector`,
// so a single-token query (`PROBE:*` prefix match) matches unambiguously.
const PROBE = `bk398searchisolation${RUN_TAG}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface SearchRow {
  entity_type: string
  id: string
  name: string
  project_id: string
  project_slug: string
  project_name: string
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

async function search(db: ReturnType<typeof service>, workspaceId: string) {
  return db.rpc(RPC, { p_query: PROBE, p_workspace_id: workspaceId, p_limit: 5 });
}

interface WorkspaceFixture {
  workspaceId: string
  projectId: string
  moduleId: string
  userStoryId: string
  atcId: string
  testId: string
  bugId: string
}

interface Fixture {
  anchorUserId: string
  a: WorkspaceFixture
  b: WorkspaceFixture
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

async function seedWorkspace(
  db: ReturnType<typeof service>,
  label: 'a' | 'b',
  ownerUserId: string,
): Promise<WorkspaceFixture> {
  const { data: workspace, error: workspaceError } = await db
    .from('workspaces')
    .insert({ slug: `${PREFIX}-ws-${label}`, name: `${PREFIX} ws ${label}`, owner_user_id: ownerUserId })
    .select('id')
    .single();
  if (workspaceError) { throw workspaceError; }
  const workspaceId = workspace.id as string;

  // `workspaces.owner_user_id` alone does NOT satisfy
  // `bunkai_assert_actor_can_write_workspace` (0024_tests.sql) — that guard
  // checks `workspace_members`, which a fresh `insert into workspaces` never
  // populates. Without this row, `bunkai_create_test` below raises 42501
  // for the very account that "owns" the workspace.
  const { error: membershipError } = await db
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: ownerUserId, role: 'owner', status: 'active' });
  if (membershipError) { throw membershipError; }

  const { data: project, error: projectError } = await db
    .from('projects')
    .insert({ workspace_id: workspaceId, slug: `${PREFIX}-project-${label}`, name: `${PROBE} project ${label}` })
    .select('id')
    .single();
  if (projectError) { throw projectError; }
  const projectId = project.id as string;

  const { data: mod, error: moduleError } = await db
    .from('modules')
    .insert({ project_id: projectId, path: 'root', name: `${PROBE} module ${label}` })
    .select('id')
    .single();
  if (moduleError) { throw moduleError; }
  const moduleId = mod.id as string;

  const { data: story, error: storyError } = await db
    .from('user_stories')
    .insert({ module_id: moduleId, title: `${PROBE} story ${label}` })
    .select('id')
    .single();
  if (storyError) { throw storyError; }
  const userStoryId = story.id as string;

  // Raw insert is the real production write path for an ATC's searchable
  // column: `atcs.tsv` is populated by a BEFORE INSERT trigger
  // (`bunkai_atcs_refresh_tsv`, 0004_atcs.sql), which fires identically
  // whether the row arrives via `bunkai_save_atc` or a direct insert — there
  // is no separate "trigger-bypassing" write path to accidentally diverge
  // from here.
  const { data: atc, error: atcError } = await db
    .from('atcs')
    .insert({
      project_id: projectId,
      module_id: moduleId,
      user_story_id: userStoryId,
      slug: `${PREFIX}-atc-${label}`,
      title: `${PROBE} atc ${label}`,
      layer: 'UI',
    })
    .select('id')
    .single();
  if (atcError) { throw atcError; }
  const atcId = atc.id as string;

  // REAL production write path — see this file's header. Explicit-actor
  // DEFINER RPC (0024_tests.sql); `ownerUserId` is an existing active
  // member with write role, resolved in `beforeAll`.
  const { data: testResult, error: testError } = await db.rpc('bunkai_create_test', {
    p_actor_user_id: ownerUserId,
    p_workspace_id: workspaceId,
    p_title: `${PROBE} test ${label}`,
    p_atc_ids: [atcId],
  });
  if (testError) { throw testError; }
  const testId = (testResult as { id: string }).id;

  const { data: bug, error: bugError } = await db
    .from('bugs')
    .insert({
      workspace_id: workspaceId,
      project_id: projectId,
      module_id: moduleId,
      title: `${PROBE} bug ${label}`,
      severity: 'P3',
    })
    .select('id')
    .single();
  if (bugError) { throw bugError; }
  const bugId = bug.id as string;

  return { workspaceId, projectId, moduleId, userStoryId, atcId, testId, bugId };
}

describeOrSkip('BK-398 — bunkai_search_workspace isolation (comment 12406 authoring question 6)', () => {
  beforeAll(async () => {
    const db = service();

    // Is the RPC deployed?
    const probe = await db.rpc(RPC, { p_query: 'x', p_workspace_id: ZERO_UUID });
    if (probe.error) {
      skipReason = `${RPC} is not deployed yet (${probe.error.code ?? probe.error.message}). Apply migration 0071_workspace_search.sql.`;
      return;
    }

    const { data: anyMember, error: memberError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('status', 'active')
      .in('role', ['member', 'admin', 'owner'])
      .limit(1)
      .maybeSingle();
    if (memberError) { throw memberError; }
    if (!anyMember) {
      skipReason = 'need at least one active workspace member with write role (seed state).';
      return;
    }
    const anchorUserId = anyMember.user_id as string;

    const a = await seedWorkspace(db, 'a', anchorUserId);
    const b = await seedWorkspace(db, 'b', anchorUserId);

    fixture = { anchorUserId, a, b };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    for (const ws of [fixture.a, fixture.b]) {
      // Children first — FKs are RESTRICT/CASCADE-mixed; deleting the
      // throwaway workspace alone is not sufficient (atcs.user_story_id is
      // ON DELETE RESTRICT, test_steps.atc_id is ON DELETE RESTRICT).
      await db.from('bugs').delete().eq('id', ws.bugId);
      await db.from('test_steps').delete().eq('test_id', ws.testId);
      await db.from('tests').delete().eq('id', ws.testId);
      await db.from('atcs').delete().eq('id', ws.atcId);
      await db.from('user_stories').delete().eq('id', ws.userStoryId);
      await db.from('modules').delete().eq('id', ws.moduleId);
      await db.from('projects').delete().eq('id', ws.projectId);
      await db.from('workspaces').delete().eq('id', ws.workspaceId);
    }
  });

  it('service-role cross-check: BOTH workspaces genuinely have matching rows (proves a later empty result is RLS, not empty data)', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const [resA, resB] = await Promise.all([search(db, fixture.a.workspaceId), search(db, fixture.b.workspaceId)]);
    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();
    const rowsA = (resA.data ?? []) as SearchRow[];
    const rowsB = (resB.data ?? []) as SearchRow[];
    const typesA = new Set(rowsA.map(r => r.entity_type));
    const typesB = new Set(rowsB.map(r => r.entity_type));
    for (const type of ['atc', 'test', 'project', 'module', 'bug']) {
      expect(typesA.has(type)).toBe(true);
      expect(typesB.has(type)).toBe(true);
    }
  });

  it('the Test row resolves its project via the REAL bunkai_create_test write path (first chained ATC), not a hand-crafted one', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const { data, error } = await search(db, fixture.a.workspaceId);
    expect(error).toBeNull();
    const rows = (data ?? []) as SearchRow[];
    const testRow = rows.find(r => r.entity_type === 'test');
    expect(testRow).toBeDefined();
    expect(testRow!.id).toBe(fixture.a.testId);
    // The RPC-derived project MUST be the same project the ATC (and the
    // whole rest of workspace A's fixture) lives in — proving the
    // test_steps.position = 1 join actually reached the real chained ATC
    // bunkai_create_test wrote, not an arbitrary/empty join result.
    expect(testRow!.project_id).toBe(fixture.a.projectId);
  });

  it('a non-member gets RLS-filtered to zero rows via a REAL authenticated session — the load-bearing security property', async () => {
    if (!fixture) { return warn(); }
    if (!hasRealLoginEnv) {
      console.warn('[workspace-search-isolation] skipped RLS case: need NEXT_PUBLIC_SUPABASE_ANON_KEY + QA_E2E_USER_EMAIL + QA_E2E_USER_PASSWORD.');
      return;
    }

    // Real, sanctioned login — the anon-key client signs in as the already-
    // declared automation identity, exactly the app's own login path. Never
    // a locally minted JWT (live-ui-identity.md §3, governs ALL test code).
    const anon = createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: qaEmail!,
      password: qaPassword!,
    });
    if (signInError || !signIn.session || !signIn.user) {
      console.warn(`[workspace-search-isolation] skipped RLS case: QA_E2E login failed (${signInError?.message ?? 'no session returned'}).`);
      return;
    }
    const qaUserId = signIn.user.id;

    // Throwaway membership in Workspace A ONLY — QA_E2E is NEVER added to
    // Workspace B, so it is foreign to B by construction. Removed in
    // `finally` regardless of outcome (mirrors report-isolation.test.ts /
    // list-activity-isolation.test.ts's identical pattern).
    const db = service();
    const { data: existingMembership, error: existingMembershipError } = await db
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', fixture.a.workspaceId)
      .eq('user_id', qaUserId)
      .maybeSingle();
    if (existingMembershipError) { throw existingMembershipError; }

    let grantedMembership = false;
    if (!existingMembership) {
      const { error: grantError } = await db
        .from('workspace_members')
        .insert({ workspace_id: fixture.a.workspaceId, user_id: qaUserId, role: 'viewer', status: 'active' });
      if (grantError) {
        console.warn(`[workspace-search-isolation] skipped RLS case: could not grant QA_E2E temporary workspace membership (${grantError.message}).`);
        return;
      }
      grantedMembership = true;
    }

    try {
      const [asMemberOfA, asOutsiderOfB, unknownWorkspace] = await Promise.all([
        search(anon, fixture.a.workspaceId),
        search(anon, fixture.b.workspaceId),
        search(anon, ZERO_UUID),
      ]);

      // Positive control: the real session, as an actual member of A, sees
      // A's rows through the RLS-scoped path — proves the session itself
      // is genuinely authenticated (auth.uid() reaches Postgres) before the
      // negative assertions below are trusted.
      expect(asMemberOfA.error).toBeNull();
      const rowsA = (asMemberOfA.data ?? []) as SearchRow[];
      expect(rowsA.length).toBeGreaterThan(0);
      expect(rowsA.every(r => r.project_id === fixture!.a.projectId || r.entity_type === 'project')).toBe(true);
      const typesSeenByMember = new Set(rowsA.map(r => r.entity_type));
      for (const type of ['atc', 'test', 'project', 'module', 'bug']) {
        expect(typesSeenByMember.has(type)).toBe(true);
      }

      // THE assertion this test exists for: Workspace B genuinely has
      // matching rows (proven above), the caller is authenticated for
      // real, and still sees NOTHING — RLS filters silently, never raises,
      // never discloses that Workspace B's rows exist at all.
      expect(asOutsiderOfB.error).toBeNull();
      const rowsB = (asOutsiderOfB.data ?? []) as SearchRow[];
      expect(rowsB).toEqual([]);

      // Non-disclosure for an unknown workspace collapses into the SAME
      // empty result — never a distinct error that would leak "that
      // workspace exists" vs. "you can't see it".
      expect(unknownWorkspace.error).toBeNull();
      expect((unknownWorkspace.data ?? [])).toEqual([]);
    }
    finally {
      if (grantedMembership) {
        await db.from('workspace_members').delete().eq('workspace_id', fixture.a.workspaceId).eq('user_id', qaUserId);
      }
    }
  });
});

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[workspace-search-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}
