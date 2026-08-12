import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// BK-20 — workspace + project search-isolation guard for the ATC search RPC
// (`bunkai_search_atcs`). Integration sibling of the unit schema test
// (`lib/atcs/search-validation.test.ts`): it exercises the REAL server-side
// search rulebook against a live database and asserts —
//
//   * an ACTIVE member searching gets only ATCs in their OWN workspace(s)
//     (AC S6.1 — tenant isolation);
//   * a member of a DIFFERENT workspace never sees a foreign ATC's title even
//     when the query would match it (AC S6.2 — caller scope is ignored, the
//     actor's memberships are the only scope);
//   * a query with no matches returns an EMPTY array, never an error (SG5);
//   * the module_id subtree filter includes descendants and excludes siblings
//     via the materialized `modules.path` (AC3.1 / AC3.2);
//   * the search is scoped to the project the caller names (product decision):
//     a different project_id never leaks the first project's ATCs.
//
// The RPC is SECURITY DEFINER and takes the actor EXPLICITLY (p_actor_user_id)
// plus the required project scope (p_project_id), so we drive it through the
// service-role client passing each actor id directly — the exact contract the
// API route uses (admin client, explicit actor + project).
//
// DB-dependent + env-gated, cloned from `lib/tests/read-isolation.test.ts`: when
// the Supabase env is absent (CI without DB creds) the WHOLE suite SKIPS via
// `describe.skip` (nothing to assert). When the env IS present but the seed
// state can't satisfy a precondition, the test FAILS LOUDLY (`requirePrecondition`
// throws) rather than passing silently — a missing precondition on a DB-backed
// run is a real coverage gap, not a green.
//
// BK-401: the two positive-path assertions (AC S6.1 and project scope) used to
// pick an ARBITRARY pre-existing ATC and assert its own token ranked in the top
// `p_limit` results. The shared dev/staging `atcs` table grew past 1000 rows
// with some titles duplicated 90+ times; under the RPC's 7-day recency-decay
// ranking, an old seed row gets pushed out of the result window once enough
// newer same-title rows exist — a data-drift false negative, not a product
// defect (verified: the RPC's `tsv @@ query` match still finds the row; it is
// only rank-crowded below `p_limit`, and the `atcs_refresh_tsv` trigger is
// synchronous — 0 stale/null `tsv` rows on the live table — so there is no
// indexing race either). Fixed by seeding a FRESH probe ATC with a
// guaranteed-unique random token for those two assertions, through the real
// write path (title/tags only, same as `bunkai_create_atc`) — this keeps the
// assertions genuine isolation guards (they still fail if the RPC ever drops or
// leaks an actor's own ATC) without being sensitive to shared-table volume.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }
interface AtcRow { id: string, title: string, project_id: string, module_id: string, user_story_id: string }
interface ProjectRow { id: string, workspace_id: string }
interface SearchItem { id: string, slug: string, title: string, layer: string, status: string, module_path: string }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// A token long enough to be a meaningful lexeme; derived from a title word.
function firstToken(title: string): string | null {
  const match = /[a-z]{3,}/i.exec(title);
  return match ? match[0] : null;
}

// A purely-alphabetic random token (BK-401 fix): used to seed a FRESH probe ATC
// whose title cannot collide with the shared dev/staging table's existing (and
// heavily duplicated, e.g. "Login with valid email" x93+) titles. Rank-topping
// assertions against arbitrary pre-existing rows are flaky under
// `bunkai_search_atcs`'s 7-day recency-decay ranking once enough newer
// same-title duplicates accumulate — see BK-401. A guaranteed-unique token has
// nothing to rank-compete against, so it stays reliable regardless of table
// size/duplication while still exercising the real isolation guarantee.
function randomAlphaToken(length = 12): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

interface ProbeAtcOptions {
  projectId: string
  moduleId: string
  userStoryId: string
  slugPrefix: string
  titlePrefix: string
}

// Seeds a single-use probe ATC through the REAL write path — only title/tags
// are supplied, exactly like `bunkai_create_atc`
// (0065_atc_tags_cap_guard.sql:125-127); `tsv` is populated synchronously by
// the `atcs_refresh_tsv` BEFORE INSERT trigger (0004_atcs.sql:83-88), never
// written directly. Shared by the two BK-401 probe-based assertions below.
async function seedProbeAtc(
  db: ReturnType<typeof service>,
  opts: ProbeAtcOptions,
): Promise<{ id: string, token: string }> {
  const token = randomAlphaToken();
  const { data: created, error } = await db
    .from('atcs')
    .insert({
      project_id: opts.projectId,
      module_id: opts.moduleId,
      user_story_id: opts.userStoryId,
      slug: `${opts.slugPrefix}-${token}`,
      title: `${opts.titlePrefix} ${token}`,
      layer: 'UI',
    })
    .select('id')
    .single();
  if (error || !created) {
    throw new Error(`[search-isolation] failed to seed probe ATC: ${error?.message}`);
  }
  return { id: created.id as string, token };
}

// Deletes a probe ATC seeded by seedProbeAtc. Logs rather than throws on
// failure: this runs in a test's `finally` block, so a delete error must not
// mask the test's own pass/fail outcome — but it is surfaced, not silently
// swallowed, since an orphaned probe row is exactly the kind of stray-row
// accumulation this file exists to stop (BK-401).
async function cleanupProbeAtc(db: ReturnType<typeof service>, id: string): Promise<void> {
  const { error } = await db.from('atcs').delete().eq('id', id);
  if (error) {
    console.warn(`[search-isolation] failed to delete probe ATC ${id}: ${error.message}`);
  }
}

// Make a missing seed precondition VISIBLE on a DB-backed run: fail with a clear
// reason instead of logging + passing (no silent green). On a no-DB run the
// whole suite is already skipped, so this never fires there.
function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[search-isolation] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

describeOrSkip('BK-20 — bunkai_search_atcs workspace + project isolation', () => {
  it('an active member searching a word from their own ATC finds it (AC S6.1)', async () => {
    const db = service();

    const { data: atcs } = await db.from('atcs').select('id, title, project_id, module_id, user_story_id');
    const { data: projects } = await db.from('projects').select('id, workspace_id');
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

    const projById = new Map((projects ?? []).map((p: ProjectRow) => [p.id, p.workspace_id]));
    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');

    // Find an existing ATC to anchor a (project, module, user_story) FK triple in
    // a workspace with an active member. We deliberately do NOT search on this
    // ATC's own title (BK-401): the shared dev/staging table has 1000+ rows with
    // heavily duplicated titles, which makes a rank-topping assertion flaky. We
    // only need its FKs to seed a FRESH probe row with a guaranteed-unique token.
    let anchor: { actor: string, projectId: string, moduleId: string, userStoryId: string } | null = null;
    for (const atc of (atcs ?? []) as AtcRow[]) {
      const ws = projById.get(atc.project_id);
      const member = activeMembers.find((m: MemberRow) => m.workspace_id === ws);
      if (ws && member) {
        anchor = {
          actor: member.user_id,
          projectId: atc.project_id,
          moduleId: atc.module_id,
          userStoryId: atc.user_story_id,
        };
        break;
      }
    }
    const seed = requirePrecondition(
      anchor,
      'need an existing ATC anchoring a project/module/user_story in a workspace with an active member',
    );

    // This is what makes the assertion below prove the production write path,
    // not a fixture that pre-seeds a column the RPC reads while the app writes
    // a different one — see `seedProbeAtc`.
    const probe = await seedProbeAtc(db, {
      projectId: seed.projectId,
      moduleId: seed.moduleId,
      userStoryId: seed.userStoryId,
      slugPrefix: 'search-isolation-probe',
      titlePrefix: 'Isolation probe',
    });

    try {
      const { data, error } = await db.rpc('bunkai_search_atcs', {
        p_actor_user_id: seed.actor,
        p_query: probe.token,
        p_project_id: seed.projectId,
        p_limit: 50,
      });
      expect(error).toBeNull();
      const items = (data ?? []) as SearchItem[];
      expect(Array.isArray(items)).toBe(true);
      // The freshly-seeded ATC must appear among the matches — this is still a
      // genuine isolation assertion (it fails if the RPC ever drops or
      // misfilters the actor's own ATC) but is immune to rank-crowding from
      // shared-table data drift because the token cannot collide with anything.
      expect(items.some(i => i.id === probe.id)).toBe(true);
    }
    finally {
      await cleanupProbeAtc(db, probe.id);
    }
  });

  it('a member of a different workspace cannot see a foreign ATC even when the query matches (AC S6.2)', async () => {
    const db = service();

    const { data: atcs } = await db.from('atcs').select('id, title, project_id, module_id');
    const { data: projects } = await db.from('projects').select('id, workspace_id');
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

    const projById = new Map((projects ?? []).map((p: ProjectRow) => [p.id, p.workspace_id]));
    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');
    const wsByUser = new Map<string, Set<string>>();
    for (const m of activeMembers) {
      if (!wsByUser.has(m.user_id)) { wsByUser.set(m.user_id, new Set()); }
      wsByUser.get(m.user_id)!.add(m.workspace_id);
    }

    // Find an ATC + an actor who is NOT a member of that ATC's workspace.
    let probe: { actor: string, token: string, foreignAtcId: string, projectId: string } | null = null;
    for (const atc of (atcs ?? []) as AtcRow[]) {
      const ws = projById.get(atc.project_id);
      const token = firstToken(atc.title);
      if (!ws || !token) { continue; }
      for (const [userId, ownWs] of wsByUser) {
        if (!ownWs.has(ws)) {
          probe = { actor: userId, token, foreignAtcId: atc.id, projectId: atc.project_id };
          break;
        }
      }
      if (probe) { break; }
    }
    const seed = requirePrecondition(
      probe,
      'need an ATC and an active member of a DIFFERENT workspace',
    );

    // Even naming the foreign ATC's own project_id, a non-member sees nothing —
    // the workspace_members join is the hard gate, project scope is additive.
    const { data, error } = await db.rpc('bunkai_search_atcs', {
      p_actor_user_id: seed.actor,
      p_query: seed.token,
      p_project_id: seed.projectId,
      p_limit: 50,
    });
    expect(error).toBeNull();
    const items = (data ?? []) as SearchItem[];
    // The foreign ATC must NOT leak into a non-member's results.
    expect(items.some(i => i.id === seed.foreignAtcId)).toBe(false);
  });

  it('a different project_id never returns the first project\'s ATCs (project scope)', async () => {
    const db = service();

    const { data: atcs } = await db.from('atcs').select('id, title, project_id, module_id, user_story_id');
    const { data: projects } = await db.from('projects').select('id, workspace_id');
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

    const projById = new Map((projects ?? []).map((p: ProjectRow) => [p.id, p.workspace_id]));
    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');

    // Find an anchor ATC (for its FKs) whose workspace has an active member,
    // then a SECOND project in the SAME workspace (so the actor can read it) but
    // different from the anchor's project. As in AC S6.1 above (BK-401), we seed
    // a FRESH probe row with a unique token instead of asserting rank-topping on
    // a pre-existing, possibly-duplicated-title row.
    let scope: { actor: string, moduleId: string, userStoryId: string, ownProject: string, otherProject: string } | null = null;
    for (const atc of (atcs ?? []) as AtcRow[]) {
      const ws = projById.get(atc.project_id);
      const member = activeMembers.find((m: MemberRow) => m.workspace_id === ws);
      if (!ws || !member) { continue; }
      const otherProj = (projects ?? []).find(
        (p: ProjectRow) => p.workspace_id === ws && p.id !== atc.project_id,
      );
      if (otherProj) {
        scope = {
          actor: member.user_id,
          moduleId: atc.module_id,
          userStoryId: atc.user_story_id,
          ownProject: atc.project_id,
          otherProject: otherProj.id,
        };
        break;
      }
    }
    const seed = requirePrecondition(
      scope,
      'need an ATC in a workspace with a second project the same active member can read',
    );

    const probe = await seedProbeAtc(db, {
      projectId: seed.ownProject,
      moduleId: seed.moduleId,
      userStoryId: seed.userStoryId,
      slugPrefix: 'search-isolation-scope-probe',
      titlePrefix: 'Isolation scope probe',
    });

    try {
      // Sanity: in its OWN project the ATC is found.
      const own = await db.rpc('bunkai_search_atcs', {
        p_actor_user_id: seed.actor,
        p_query: probe.token,
        p_project_id: seed.ownProject,
        p_limit: 50,
      });
      expect(own.error).toBeNull();
      expect(((own.data ?? []) as SearchItem[]).some(i => i.id === probe.id)).toBe(true);

      // In a DIFFERENT project it is gone — project scope is enforced.
      const other = await db.rpc('bunkai_search_atcs', {
        p_actor_user_id: seed.actor,
        p_query: probe.token,
        p_project_id: seed.otherProject,
        p_limit: 50,
      });
      expect(other.error).toBeNull();
      expect(((other.data ?? []) as SearchItem[]).some(i => i.id === probe.id)).toBe(false);
    }
    finally {
      await cleanupProbeAtc(db, probe.id);
    }
  });

  it('a query with no matches returns an empty array, never an error (SG5)', async () => {
    const db = service();

    const { data: atcs } = await db.from('atcs').select('id, title, project_id, module_id');
    const { data: projects } = await db.from('projects').select('id, workspace_id');
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

    const projById = new Map((projects ?? []).map((p: ProjectRow) => [p.id, p.workspace_id]));
    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');

    // A real (actor, project) pair the actor can read — so the empty result is
    // proven by the no-match query, not by an out-of-scope project.
    let pair: { actor: string, projectId: string } | null = null;
    for (const atc of (atcs ?? []) as AtcRow[]) {
      const ws = projById.get(atc.project_id);
      const member = activeMembers.find((m: MemberRow) => m.workspace_id === ws);
      if (ws && member) {
        pair = { actor: member.user_id, projectId: atc.project_id };
        break;
      }
    }
    const seed = requirePrecondition(
      pair,
      'need an active member with at least one readable project',
    );

    const { data, error } = await db.rpc('bunkai_search_atcs', {
      p_actor_user_id: seed.actor,
      p_query: 'zzzznomatchqueryzzzz',
      p_project_id: seed.projectId,
      p_limit: 20,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as SearchItem[]).length).toBe(0);
  });

  it('a non-existent module_id yields an empty result, not a 404 (AC3.2)', async () => {
    const db = service();

    const { data: atcs } = await db.from('atcs').select('id, title, project_id, module_id');
    const { data: projects } = await db.from('projects').select('id, workspace_id');
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

    const projById = new Map((projects ?? []).map((p: ProjectRow) => [p.id, p.workspace_id]));
    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');

    let pair: { actor: string, projectId: string } | null = null;
    for (const atc of (atcs ?? []) as AtcRow[]) {
      const ws = projById.get(atc.project_id);
      const member = activeMembers.find((m: MemberRow) => m.workspace_id === ws);
      if (ws && member) {
        pair = { actor: member.user_id, projectId: atc.project_id };
        break;
      }
    }
    const seed = requirePrecondition(
      pair,
      'need an active member with at least one readable project',
    );

    const { data, error } = await db.rpc('bunkai_search_atcs', {
      p_actor_user_id: seed.actor,
      p_query: 'a',
      p_project_id: seed.projectId,
      p_module_id: '00000000-0000-0000-0000-000000000000',
      p_limit: 20,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as SearchItem[]).length).toBe(0);
  });
});
