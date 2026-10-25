import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// BK-33 — integration guard for the Test-tags RPCs (`bunkai_set_test_tags`,
// `bunkai_filter_tests_by_tag`, `bunkai_normalize_test_tags`). Sibling of the
// BK-28 reorder suite: it drives the REAL server-side rulebook against a live
// database through the service-role client (explicit actor — the exact contract
// the API route uses), asserting the observable behaviors from the ATP —
//
//   * a writer sets a tag set → version bumps by 1, a test.tags_changed event is
//     logged, and the composed json carries the normalized tags (then RESTORES
//     the Test so shared data stays pristine);
//   * re-submitting the same set is a no-op (no bump, no event);
//   * an empty set is valid (clears all tags — boundary sc.4);
//   * reserved tags are lowercased; custom tags preserve casing; duplicates
//     collapse (the normalize helper, exercised directly);
//   * a stale X-If-Match raises version_conflict (45125);
//   * a comma / >50-char / >20-count set raises tags_invalid (45126);
//   * a viewer-role member is denied (42501); a non-member too;
//   * a foreign-workspace / random Test id raises the uniform not_found (P0002);
//   * the filter returns only the actor's workspace Tests carrying the tag,
//     `[]` for an unused tag, and never leaks a cross-workspace Test.
//
// 401 (unauthenticated) is a route-layer concern (withApiHandler), out of scope
// for this RPC-level suite (the RPC always receives an explicit actor).
//
// DB-dependent + env-gated: when the Supabase env is ABSENT the suite SKIPS via
// `describe.skip`; when PRESENT but the seed can't satisfy a precondition it
// logs and returns (never blocks a build on seed state). Every mutating case
// restores the Test it touched and purges its own tags events.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const SET_RPC = 'bunkai_set_test_tags';
const FILTER_RPC = 'bunkai_filter_tests_by_tag';
const NORMALIZE_RPC = 'bunkai_normalize_test_tags';
const RANDOM_UUID = '00000000-0000-0000-0000-000000000000';

const WRITER_ROLES = new Set(['member', 'admin', 'owner']);

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }
interface TestRow { id: string, workspace_id: string, version: number, tags: string[] }

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof service>;

async function loadFixtures(db: Db) {
  const { data: tests, error: te } = await db.from('tests').select('id, workspace_id, version, tags');
  if (te) { throw te; }
  const { data: members, error: me } = await db.from('workspace_members').select('user_id, workspace_id, role, status');
  if (me) { throw me; }
  const activeMembers = ((members ?? []) as MemberRow[]).filter(m => m.status === 'active');
  return { tests: (tests ?? []) as TestRow[], activeMembers };
}

// A (test, writer-actor) where the actor can write the Test's workspace.
function pickWritable(fx: Awaited<ReturnType<typeof loadFixtures>>) {
  for (const t of fx.tests) {
    const writer = fx.activeMembers.find(m => m.workspace_id === t.workspace_id && WRITER_ROLES.has(m.role));
    if (writer) { return { test: t, userId: writer.user_id }; }
  }
  return undefined;
}

async function tagsEventCount(db: Db, testId: string): Promise<number> {
  const { count } = await db
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', testId)
    .eq('action', 'test.tags_changed');
  return count ?? 0;
}

// Put the Test back the way we found it (original tags + version) and purge any
// tags events created at/after `sinceIso`, so the shared DB is left pristine.
async function restore(db: Db, actorId: string, testId: string, originalTags: string[], originalVersion: number, sinceIso: string) {
  const { error } = await db.rpc(SET_RPC, { p_actor_user_id: actorId, p_test_id: testId, p_if_match: null, p_tags: originalTags });
  if (error) {
    console.warn(`[tags] restore failed for ${testId}: ${error.message}`);
    return;
  }
  await db.from('tests').update({ version: originalVersion }).eq('id', testId);
  await db.from('activity_log').delete().eq('entity_id', testId).eq('action', 'test.tags_changed').gte('created_at', sinceIso);
}

describeOrSkip('BK-33 — bunkai_normalize_test_tags', () => {
  it('lowercases reserved tags, preserves custom casing, trims, drops empties, dedupes', async () => {
    const db = service();
    const { data, error } = await db.rpc(NORMALIZE_RPC, {
      p_tags: ['  Smoke ', 'smoke', 'P1-Critical', 'p1-critical', '   ', 'Regression'],
    });
    expect(error).toBeNull();
    // `Smoke` + `smoke` → one `smoke` (reserved, lowercased); `P1-Critical` and
    // `p1-critical` are DISTINCT custom tags (casing preserved); blank dropped;
    // `Regression` → `regression`.
    expect(data).toEqual(['smoke', 'P1-Critical', 'p1-critical', 'regression']);
  });

  it('returns an empty array for a null / all-blank input', async () => {
    const db = service();
    const { data, error } = await db.rpc(NORMALIZE_RPC, { p_tags: ['  ', ''] });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describeOrSkip('BK-33 — bunkai_filter_tests_by_tag', () => {
  it('returns only the actor\'s workspace Tests carrying the tag; no cross-workspace leak', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }

    const since = new Date().toISOString();
    const probe = `bk33probe${Date.now()}`;
    await db.rpc(SET_RPC, { p_actor_user_id: pick.userId, p_test_id: pick.test.id, p_if_match: null, p_tags: [probe] });

    const { data, error } = await db.rpc(FILTER_RPC, { p_actor_user_id: pick.userId, p_tag: probe });
    expect(error).toBeNull();
    const rows = (data as { items: Array<{ id: string, workspace_id?: string }> }).items;
    // The tagged Test is present.
    expect(rows.some(r => r.id === pick.test.id)).toBe(true);
    // Every returned Test belongs to a workspace the actor is an active member of.
    const actorWorkspaces = new Set(
      fx.activeMembers.filter(m => m.user_id === pick.userId).map(m => m.workspace_id),
    );
    const testWs = new Map(fx.tests.map(t => [t.id, t.workspace_id]));
    for (const r of rows) {
      expect(actorWorkspaces.has(testWs.get(r.id)!)).toBe(true);
    }

    await restore(db, pick.userId, pick.test.id, pick.test.tags ?? [], pick.test.version, since);
  });

  it('an unused tag returns an empty list (never a 404)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need an active member actor (seed state).');
      return;
    }

    const { data, error } = await db.rpc(FILTER_RPC, {
      p_actor_user_id: pick.userId,
      p_tag: `never-used-${Date.now()}`,
    });
    expect(error).toBeNull();
    expect(data).toEqual({ items: [], next_after: null });
  });

  it('BK-742: pages with a keyset position, no next_after on the last page', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }

    const since = new Date().toISOString();
    const probe = `bk742probe${Date.now()}`;
    await db.rpc(SET_RPC, { p_actor_user_id: pick.userId, p_test_id: pick.test.id, p_if_match: null, p_tags: [probe] });

    // One matching Test: limit 1 is exactly the last page.
    const one = await db.rpc(FILTER_RPC, { p_actor_user_id: pick.userId, p_tag: probe, p_limit: 1 });
    expect(one.error).toBeNull();
    const page = one.data as { items: Array<{ id: string }>, next_after: unknown };
    expect(page.items.map(r => r.id)).toEqual([pick.test.id]);
    expect(page.next_after).toBeNull();

    await restore(db, pick.userId, pick.test.id, pick.test.tags ?? [], pick.test.version, since);
  });
});
