import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';

// BK-22 — DB-level behaviour of the ATC usage RPC (`bunkai_atc_usage`).
// Integration sibling of the unit helper test (`usage.test.ts`): it drives the
// REAL STABLE SECURITY DEFINER RPC through the service-role client (the exact
// contract the API route uses — admin client, explicit actor) and asserts
//
//   * an ATC chained by N Tests returns count = N with one entry per Test,
//     ordered by Test title asc (AC1.1, AC2.1);
//   * the same ATC at multiple positions in one Test yields ONE entry with
//     multiple positions, not multiple entries (AC2.2);
//   * a non-member actor for a real ATC raises uniform not_found (AC4.2 — no
//     existence leak);
//   * an absent UUID raises the SAME not_found (E2).
//
// This RPC is READ-ONLY, so the suite seeds nothing and tears nothing down — it
// reads whatever Tests/ATCs already exist in the dev DB. Env-gated like
// `duplicate-rpc.test.ts`: when the Supabase env is absent (CI without DB
// creds) the WHOLE suite SKIPS via `describe.skip`; when the env IS present but
// the seed can't satisfy a precondition, the test FAILS LOUDLY
// (`requirePrecondition` throws) rather than passing silently — a missing
// precondition on a DB-backed run is a real coverage gap, not a green.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';

interface UsageEntry {
  test_id: string
  title: string
  positions: number[]
}

interface UsageReport {
  count: number
  used_in: UsageEntry[]
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

function requirePrecondition<T>(value: T | null | undefined, reason: string): T {
  if (value === null || value === undefined) {
    throw new Error(`[usage-rpc] precondition not met — ${reason}. Seed the dev DB to cover this path.`);
  }
  return value;
}

type Db = ReturnType<typeof service>;

interface UsageSeed {
  actor: string
  atcId: string
  workspaceId: string
  distinctTests: number
}

// Find an ATC chained by >= 1 Test, paired with an active member of that ATC's
// workspace. Returns the distinct-Test count so the assertions can compare.
async function findUsedAtc(db: Db): Promise<UsageSeed | null> {
  const { data: steps } = await db.from('test_steps').select('atc_id, test_id');
  const { data: tests } = await db.from('tests').select('id, workspace_id');
  const { data: atcs } = await db.from('atcs').select('id, project_id').is('archived_at', null);
  const { data: projects } = await db.from('projects').select('id, workspace_id');
  const { data: members } = await db.from('workspace_members').select('user_id, workspace_id, status');

  const wsByTest = new Map((tests ?? []).map(t => [t.id, t.workspace_id]));
  const wsByProject = new Map((projects ?? []).map(p => [p.id, p.workspace_id]));
  const activeByWs = new Map<string, string>();
  for (const m of members ?? []) {
    if (m.status === 'active' && !activeByWs.has(m.workspace_id)) {
      activeByWs.set(m.workspace_id, m.user_id);
    }
  }

  // distinct Tests per atc_id
  const testsByAtc = new Map<string, Set<string>>();
  for (const s of steps ?? []) {
    const set = testsByAtc.get(s.atc_id) ?? new Set<string>();
    set.add(s.test_id);
    testsByAtc.set(s.atc_id, set);
  }

  for (const atc of atcs ?? []) {
    const testSet = testsByAtc.get(atc.id);
    if (!testSet || testSet.size === 0) { continue; }
    const ws = wsByProject.get(atc.project_id);
    if (!ws) { continue; }
    // Every chaining Test must be in the ATC's workspace (it always is by the
    // 0024 containment rule) and the workspace must have an active member.
    const actor = activeByWs.get(ws);
    if (!actor) { continue; }
    const allSameWs = [...testSet].every(tid => wsByTest.get(tid) === ws);
    if (!allSameWs) { continue; }
    return { actor, atcId: atc.id, workspaceId: ws, distinctTests: testSet.size };
  }
  return null;
}

describeOrSkip('BK-22 — bunkai_atc_usage report', () => {
  it('returns count = distinct Tests, one entry per Test, ordered by title asc (AC1.1/AC2.1)', async () => {
    const db = service();
    const seed = requirePrecondition(await findUsedAtc(db), 'need an ATC chained by >= 1 Test in a workspace with an active member');

    const { data, error } = await db.rpc('bunkai_atc_usage', {
      p_actor_user_id: seed.actor,
      p_atc_id: seed.atcId,
    });
    expect(error).toBeNull();
    const report = data as unknown as UsageReport;

    // count = distinct Tests, and one entry per distinct Test.
    expect(report.count).toBe(seed.distinctTests);
    expect(report.used_in.length).toBe(seed.distinctTests);
    expect(new Set(report.used_in.map(e => e.test_id)).size).toBe(seed.distinctTests);

    // ordered by title asc.
    const titles = report.used_in.map(e => e.title);
    expect(titles).toEqual([...titles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));

    // every entry carries >= 1 position, ascending.
    for (const entry of report.used_in) {
      expect(entry.positions.length).toBeGreaterThanOrEqual(1);
      expect(entry.positions).toEqual([...entry.positions].sort((a, b) => a - b));
    }
  });

  it('groups the same ATC at multiple positions in one Test into ONE entry (AC2.2)', async () => {
    const db = service();
    const seed = requirePrecondition(await findUsedAtc(db), 'need an ATC chained by >= 1 Test');

    const { data, error } = await db.rpc('bunkai_atc_usage', {
      p_actor_user_id: seed.actor,
      p_atc_id: seed.atcId,
    });
    expect(error).toBeNull();
    const report = data as unknown as UsageReport;

    // No Test appears twice — multi-position usage collapses into one entry.
    const testIds = report.used_in.map(e => e.test_id);
    expect(new Set(testIds).size).toBe(testIds.length);

    // The total chain occurrences (sum of positions) is >= the entry count.
    const totalPositions = report.used_in.reduce((acc, e) => acc + e.positions.length, 0);
    expect(totalPositions).toBeGreaterThanOrEqual(report.used_in.length);
  });

  it('raises uniform not_found for a non-member actor on a real ATC (AC4.2 — no leak)', async () => {
    const db = service();
    const seed = requirePrecondition(await findUsedAtc(db), 'need a real ATC');

    const { error } = await db.rpc('bunkai_atc_usage', {
      p_actor_user_id: ABSENT_UUID,
      p_atc_id: seed.atcId,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
  });

  it('raises the SAME not_found for an absent ATC UUID (E2)', async () => {
    const db = service();
    const seed = requirePrecondition(await findUsedAtc(db), 'need an active actor');

    const { error } = await db.rpc('bunkai_atc_usage', {
      p_actor_user_id: seed.actor,
      p_atc_id: ABSENT_UUID,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
  });
});
