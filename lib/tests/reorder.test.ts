import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// BK-28 — integration guard for the Test chain-reorder RPC
// (`bunkai_reorder_test_steps`). Sibling of the BK-32 read-isolation suite: it
// drives the REAL server-side reorder rulebook against a live database through
// the service-role client (explicit actor, the exact contract the API route
// uses), asserting the observable behaviors from the ATP —
//
//   * a real reorder bumps version by 1 and logs exactly one test.reordered
//     event (then RESTORES the Test so shared data stays pristine);
//   * submitting the current order is a no-op (no bump, no event);
//   * a single-step Test reorder is a no-op;
//   * a stale X-If-Match raises version_conflict (45125);
//   * a wrong step set raises chain_mismatch (45123);
//   * an empty chain and a duplicate-step chain both raise chain_invalid (45124);
//   * a viewer-role member is denied (42501);
//   * a retry of an already-applied order is a no-op (one event total).
//
// 401 (unauthenticated) is enforced at the route layer (withApiHandler), not the
// RPC — the RPC always receives an explicit resolved actor — so it is out of
// scope for this RPC-level suite.
//
// DB-dependent + env-gated: when the Supabase env is absent the suite SKIPS; when
// present but the seed can't satisfy a precondition it logs and passes (never
// blocks a build on seed state). Every mutating case restores the Test it touched
// and purges its own reorder events.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const RPC = 'bunkai_reorder_test_steps';
const RANDOM_UUID = '00000000-0000-0000-0000-000000000000';

interface MemberRow { user_id: string, workspace_id: string, role: string, status: string }
interface TestRow { id: string, workspace_id: string, version: number }
interface StepRow { id: string, test_id: string, position: number }

const WRITER_ROLES = new Set(['member', 'admin', 'owner']);

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof service>;

async function loadFixtures(db: Db) {
  const { data: tests, error: te } = await db.from('tests').select('id, workspace_id, version');
  if (te) { throw te; }
  const { data: steps, error: se } = await db.from('test_steps').select('id, test_id, position');
  if (se) { throw se; }
  const { data: members, error: me } = await db.from('workspace_members').select('user_id, workspace_id, role, status');
  if (me) { throw me; }

  const stepsByTest = new Map<string, StepRow[]>();
  for (const s of (steps ?? []) as StepRow[]) {
    if (!stepsByTest.has(s.test_id)) { stepsByTest.set(s.test_id, []); }
    stepsByTest.get(s.test_id)!.push(s);
  }
  for (const list of stepsByTest.values()) { list.sort((a, b) => a.position - b.position); }

  const activeMembers = ((members ?? []) as MemberRow[]).filter(m => m.status === 'active');

  return { tests: (tests ?? []) as TestRow[], stepsByTest, activeMembers };
}

// A (test, writer-actor, ordered step_ids) where the actor can write the Test's
// workspace and the chain has at least `minSteps` steps.
function pickWritable(
  fx: Awaited<ReturnType<typeof loadFixtures>>,
  minSteps: number,
  exactSteps?: number,
) {
  for (const t of fx.tests) {
    const steps = fx.stepsByTest.get(t.id) ?? [];
    if (steps.length < minSteps) { continue; }
    if (exactSteps != null && steps.length !== exactSteps) { continue; }
    const writer = fx.activeMembers.find(m => m.workspace_id === t.workspace_id && WRITER_ROLES.has(m.role));
    if (writer) {
      return { test: t, userId: writer.user_id, stepIds: steps.map(s => s.id) };
    }
  }
  return undefined;
}

async function reorderEventCount(db: Db, testId: string): Promise<number> {
  const { count } = await db
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', testId)
    .eq('action', 'test.reordered');
  return count ?? 0;
}

// Put a Test back the way we found it and delete any reorder events this test
// created (created at/after `sinceIso`), so the shared DB is left pristine.
async function restore(db: Db, actorId: string, testId: string, originalStepIds: string[], originalVersion: number, sinceIso: string) {
  // Put the order back first; only override version + purge events if that
  // succeeded, so a failed restore does not corrupt the row's version.
  const { error } = await db.rpc(RPC, { p_actor_user_id: actorId, p_test_id: testId, p_if_match: null, p_step_ids: originalStepIds });
  if (error) {
    console.warn(`[reorder] restore failed for ${testId}: ${error.message}`);
    return;
  }
  await db.from('tests').update({ version: originalVersion }).eq('id', testId);
  await db.from('activity_log').delete().eq('entity_id', testId).eq('action', 'test.reordered').gte('created_at', sinceIso);
}

describeOrSkip('BK-28 — bunkai_reorder_test_steps', () => {
  it('a real reorder bumps version by 1 and logs exactly one test.reordered event', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx, 2);
    if (!pick) {
      console.warn('[reorder] skipped: need a writable Test with >= 2 steps (seed state).');
      return;
    }

    const since = new Date().toISOString();
    const before = await reorderEventCount(db, pick.test.id);
    const reversed = [...pick.stepIds].reverse();

    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: pick.test.version,
      p_step_ids: reversed,
    });
    expect(error).toBeNull();

    const payload = data as { version: number, atcs: Array<{ step_id: string }> };
    expect(payload.version).toBe(pick.test.version + 1);
    expect(payload.atcs.map(a => a.step_id)).toEqual(reversed);
    expect(await reorderEventCount(db, pick.test.id)).toBe(before + 1);

    await restore(db, pick.userId, pick.test.id, pick.stepIds, pick.test.version, since);
  });

  it('submitting the current order is a no-op (no version bump, no event)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx, 2);
    if (!pick) {
      console.warn('[reorder] skipped: need a writable Test with >= 2 steps (seed state).');
      return;
    }

    const before = await reorderEventCount(db, pick.test.id);
    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: pick.test.version,
      p_step_ids: pick.stepIds,
    });
    expect(error).toBeNull();
    expect((data as { version: number }).version).toBe(pick.test.version);
    expect(await reorderEventCount(db, pick.test.id)).toBe(before);
  });

  it('a single-step Test reorder is a no-op', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx, 1, 1);
    if (!pick) {
      console.warn('[reorder] skipped: need a writable single-step Test (seed state).');
      return;
    }

    const before = await reorderEventCount(db, pick.test.id);
    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: pick.test.version,
      p_step_ids: pick.stepIds,
    });
    expect(error).toBeNull();
    expect((data as { version: number }).version).toBe(pick.test.version);
    expect(await reorderEventCount(db, pick.test.id)).toBe(before);
  });

  it('a stale X-If-Match raises version_conflict (45125)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx, 2);
    if (!pick) {
      console.warn('[reorder] skipped: need a writable Test with >= 2 steps (seed state).');
      return;
    }

    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      // Deliberately stale: a version that cannot be current.
      p_if_match: pick.test.version + 999,
      p_step_ids: [...pick.stepIds].reverse(),
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45125');
    expect(data).toBeNull();
  });

  it('a wrong step set raises chain_mismatch (45123)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx, 2);
    if (!pick) {
      console.warn('[reorder] skipped: need a writable Test with >= 2 steps (seed state).');
      return;
    }

    // Drop the last real step, add a foreign uuid — same length, different set.
    const wrong = [...pick.stepIds.slice(0, -1), RANDOM_UUID];
    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: null,
      p_step_ids: wrong,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45123');
    expect(data).toBeNull();
  });

  it('an empty chain raises chain_invalid (45124)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx, 1);
    if (!pick) {
      console.warn('[reorder] skipped: need a writable Test (seed state).');
      return;
    }

    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: null,
      p_step_ids: [],
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45124');
    expect(data).toBeNull();
  });

  it('a duplicate-step chain raises chain_invalid (45124)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx, 2);
    if (!pick) {
      console.warn('[reorder] skipped: need a writable Test with >= 2 steps (seed state).');
      return;
    }

    // Same first step twice — duplicate reference.
    const dup = [pick.stepIds[0], ...pick.stepIds.slice(0, -1)];
    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: null,
      p_step_ids: dup,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45124');
    expect(data).toBeNull();
  });

  it('a viewer-role member is denied (42501)', async () => {
    const db = service();
    const fx = await loadFixtures(db);

    let probe: { testId: string, userId: string, stepIds: string[] } | undefined;
    for (const t of fx.tests) {
      const steps = fx.stepsByTest.get(t.id) ?? [];
      if (steps.length < 1) { continue; }
      const viewer = fx.activeMembers.find(m => m.workspace_id === t.workspace_id && m.role === 'viewer');
      if (viewer) {
        probe = { testId: t.id, userId: viewer.user_id, stepIds: steps.map(s => s.id) };
        break;
      }
    }
    if (!probe) {
      console.warn('[reorder] skipped: need a Test whose workspace has an active VIEWER (seed state).');
      return;
    }

    const { data, error } = await db.rpc(RPC, {
      p_actor_user_id: probe.userId,
      p_test_id: probe.testId,
      p_if_match: null,
      p_step_ids: probe.stepIds,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });

  it('retrying an already-applied order is a no-op (one event total)', async () => {
    const db = service();
    const fx = await loadFixtures(db);
    const pick = pickWritable(fx, 2);
    if (!pick) {
      console.warn('[reorder] skipped: need a writable Test with >= 2 steps (seed state).');
      return;
    }

    const since = new Date().toISOString();
    const before = await reorderEventCount(db, pick.test.id);
    const reversed = [...pick.stepIds].reverse();

    // First apply (real change): version v -> v+1, one event.
    const first = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: pick.test.version,
      p_step_ids: reversed,
    });
    expect(first.error).toBeNull();
    const bumped = (first.data as { version: number }).version;
    expect(bumped).toBe(pick.test.version + 1);

    // Retry the SAME order with the now-current version: no-op, no new event.
    const retry = await db.rpc(RPC, {
      p_actor_user_id: pick.userId,
      p_test_id: pick.test.id,
      p_if_match: bumped,
      p_step_ids: reversed,
    });
    expect(retry.error).toBeNull();
    expect((retry.data as { version: number }).version).toBe(bumped);
    expect(await reorderEventCount(db, pick.test.id)).toBe(before + 1);

    await restore(db, pick.userId, pick.test.id, pick.stepIds, pick.test.version, since);
  });
});
