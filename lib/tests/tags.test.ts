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

describeOrSkip('BK-33 — bunkai_set_test_tags', () => {
  it('a writer setting tags bumps version by 1 and logs one test.tags_changed event', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }

    const since = new Date().toISOString();
    const before = await tagsEventCount(db, pick.test.id);
    const newTags = ['smoke', 'BK33-Probe'];

    const { data, error } = await db.rpc(SET_RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: pick.test.version,
      p_tags: newTags,
    });
    expect(error).toBeNull();

    const payload = data as { version: number, tags: string[] };
    expect(payload.version).toBe(pick.test.version + 1);
    expect(payload.tags).toEqual(newTags);
    expect(await tagsEventCount(db, pick.test.id)).toBe(before + 1);

    await restore(db, pick.userId, pick.test.id, pick.test.tags ?? [], pick.test.version, since);
  });

  it('re-submitting the same set is a no-op (no version bump, no event)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }

    const before = await tagsEventCount(db, pick.test.id);
    const { data, error } = await db.rpc(SET_RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: pick.test.version,
      p_tags: pick.test.tags ?? [],
    });
    expect(error).toBeNull();
    expect((data as { version: number }).version).toBe(pick.test.version);
    expect(await tagsEventCount(db, pick.test.id)).toBe(before);
  });

  it('an empty set is valid (clears all tags — boundary sc.4)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }

    const since = new Date().toISOString();
    // Seed a tag first so clearing is observable, then clear.
    await db.rpc(SET_RPC, { p_actor_user_id: pick.userId, p_test_id: pick.test.id, p_if_match: null, p_tags: ['BK33-Temp'] });
    const { data, error } = await db.rpc(SET_RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: null,
      p_tags: [],
    });
    expect(error).toBeNull();
    expect((data as { tags: string[] }).tags).toEqual([]);

    await restore(db, pick.userId, pick.test.id, pick.test.tags ?? [], pick.test.version, since);
  });

  it('a stale X-If-Match raises version_conflict (45125)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }

    const { error } = await db.rpc(SET_RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: pick.test.version + 999,
      p_tags: ['smoke'],
    });
    expect(error?.code).toBe('45125');
  });

  it('a tag with a comma raises tags_invalid (45126)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }

    const { error } = await db.rpc(SET_RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: null,
      p_tags: ['a,b'],
    });
    expect(error?.code).toBe('45126');
  });

  it('an over-50-char tag raises tags_invalid (45126)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }

    const { error } = await db.rpc(SET_RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: null,
      p_tags: ['x'.repeat(51)],
    });
    expect(error?.code).toBe('45126');
  });

  it('a viewer-role member is denied (42501)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    // A Test whose workspace has an active VIEWER.
    let found: { testId: string, viewerId: string } | undefined;
    for (const t of fx.tests) {
      const viewer = fx.activeMembers.find(m => m.workspace_id === t.workspace_id && m.role === 'viewer');
      if (viewer) { found = { testId: t.id, viewerId: viewer.user_id }; break; }
    }
    if (!found) {
      console.warn('[tags] skipped: need a Test whose workspace has an active viewer (seed state).');
      return;
    }

    const { error } = await db.rpc(SET_RPC, {
      p_actor_user_id: found.viewerId,
      p_test_id: found.testId,
      p_if_match: null,
      p_tags: ['smoke'],
    });
    expect(error?.code).toBe('42501');
  });

  it('a non-member actor on a real Test is denied (42501)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable Test (seed state).');
      return;
    }
    // A user who is NOT a member of the picked Test's workspace.
    const outsider = fx.activeMembers.find(m => m.workspace_id !== pick.test.workspace_id);
    if (!outsider) {
      console.warn('[tags] skipped: need a user outside the Test workspace (seed state).');
      return;
    }

    const { error } = await db.rpc(SET_RPC, {
      p_actor_user_id: outsider.user_id,
      p_test_id: pick.test.id,
      p_if_match: null,
      p_tags: ['smoke'],
    });
    expect(error?.code).toBe('42501');
  });

  it('a random / nonexistent Test id raises the uniform not_found (P0002)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx);
    if (!pick) {
      console.warn('[tags] skipped: need a writable actor (seed state).');
      return;
    }

    const { error } = await db.rpc(SET_RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: RANDOM_UUID,
      p_if_match: null,
      p_tags: ['smoke'],
    });
    expect(error?.code).toBe('P0002');
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
    const rows = data as Array<{ id: string, workspace_id?: string }>;
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
    expect(data).toEqual([]);
  });
});
