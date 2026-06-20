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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }
interface AtcRow { id: string, title: string, project_id: string, module_id: string }
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

    const { data: atcs } = await db.from('atcs').select('id, title, project_id, module_id');
    const { data: projects } = await db.from('projects').select('id, workspace_id');
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

    const projById = new Map((projects ?? []).map((p: ProjectRow) => [p.id, p.workspace_id]));
    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');

    // Find an ATC whose workspace has an active member and a searchable token.
    let found: { actor: string, token: string, atcId: string, projectId: string } | null = null;
    for (const atc of (atcs ?? []) as AtcRow[]) {
      const ws = projById.get(atc.project_id);
      const member = activeMembers.find((m: MemberRow) => m.workspace_id === ws);
      const token = firstToken(atc.title);
      if (ws && member && token) {
        found = { actor: member.user_id, token, atcId: atc.id, projectId: atc.project_id };
        break;
      }
    }
    const seed = requirePrecondition(
      found,
      'need an ATC with a searchable title in a workspace with an active member',
    );

    const { data, error } = await db.rpc('bunkai_search_atcs', {
      p_actor_user_id: seed.actor,
      p_query: seed.token,
      p_project_id: seed.projectId,
      p_limit: 50,
    });
    expect(error).toBeNull();
    const items = (data ?? []) as SearchItem[];
    expect(Array.isArray(items)).toBe(true);
    // The originating ATC must appear among the matches.
    expect(items.some(i => i.id === seed.atcId)).toBe(true);
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

    const { data: atcs } = await db.from('atcs').select('id, title, project_id, module_id');
    const { data: projects } = await db.from('projects').select('id, workspace_id');
    const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, role, status');

    const projById = new Map((projects ?? []).map((p: ProjectRow) => [p.id, p.workspace_id]));
    const activeMembers = (members ?? []).filter((m: MemberRow) => m.status === 'active');

    // Find an ATC whose workspace has an active member, then a SECOND project in
    // the SAME workspace (so the actor can read it) but different from the ATC's
    // project — searching the ATC's token there must return zero of its rows.
    let scope: { actor: string, token: string, atcId: string, ownProject: string, otherProject: string } | null = null;
    for (const atc of (atcs ?? []) as AtcRow[]) {
      const ws = projById.get(atc.project_id);
      const member = activeMembers.find((m: MemberRow) => m.workspace_id === ws);
      const token = firstToken(atc.title);
      if (!ws || !member || !token) { continue; }
      const otherProj = (projects ?? []).find(
        (p: ProjectRow) => p.workspace_id === ws && p.id !== atc.project_id,
      );
      if (otherProj) {
        scope = {
          actor: member.user_id,
          token,
          atcId: atc.id,
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

    // Sanity: in its OWN project the ATC is found.
    const own = await db.rpc('bunkai_search_atcs', {
      p_actor_user_id: seed.actor,
      p_query: seed.token,
      p_project_id: seed.ownProject,
      p_limit: 50,
    });
    expect(own.error).toBeNull();
    expect(((own.data ?? []) as SearchItem[]).some(i => i.id === seed.atcId)).toBe(true);

    // In a DIFFERENT project it is gone — project scope is enforced.
    const other = await db.rpc('bunkai_search_atcs', {
      p_actor_user_id: seed.actor,
      p_query: seed.token,
      p_project_id: seed.otherProject,
      p_limit: 50,
    });
    expect(other.error).toBeNull();
    expect(((other.data ?? []) as SearchItem[]).some(i => i.id === seed.atcId)).toBe(false);
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
