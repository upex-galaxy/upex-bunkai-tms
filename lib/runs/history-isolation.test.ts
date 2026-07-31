import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

// BK-37 — integration guard for the Run-history RPC (`bunkai_list_test_runs`).
// This is the DB-side sibling of the pure unit suites
// (`lib/runs/history-validation.test.ts`, `lib/runs/duration.test.ts`): it
// exercises the REAL server-side rulebook against a live database and asserts —
//
//   * INV-3 tenant isolation: an actor from a DIFFERENT workspace reading a
//     foreign Test's history is denied with P0002, byte-identical to a
//     nonexistent Test (no existence signal);
//   * terminal-only: a `running` Run appears in neither `items` nor `totals`;
//   * ordering: newest first by started_at, with `id` descending as the
//     tie-break for identical timestamps (PO decision);
//   * keyset continuity: two consecutive pages cover the set exactly once — no
//     duplicate, no skipped row;
//   * filter × pagination compose server-side: page 2 of a filtered history
//     contains ONLY the filtered outcome;
//   * `totals` is all-time and filter-invariant;
//   * the page-size boundaries: exactly 50 matching rows -> `next_cursor` null;
//     51 rows -> the second page carries exactly the one extra row.
//
// The RPC is SECURITY DEFINER and takes the actor EXPLICITLY (p_actor_user_id),
// so we drive it through the service-role client passing each actor id directly
// — the exact contract the API route uses (admin client, explicit actor), with
// no JWT impersonation needed.
//
// DB-dependent + env-gated, cloned from `lib/tests/read-isolation.test.ts`: when
// the Supabase env is absent (CI without DB creds) the suite SKIPS rather than
// fails. When the env is present but the RPC has not been deployed yet, or the
// seed state cannot satisfy a precondition (no active member / project /
// environment to hang a fixture off), it logs and passes — it never blocks a
// build on migration or seed state.
//
// Unlike the read-only isolation suites this one SEEDS its own fixtures so the
// counts are exact: two throwaway Tests plus their Runs, all tagged with a
// unique `start_token` prefix and purged in afterAll.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

const describeOrSkip = hasEnv ? describe : describe.skip;

// Every seeded row carries this in `start_token`, so the purge can target
// exactly this run of the suite and nothing else.
const PREFIX = `bk37-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const ABORT_REASON = 'Seeded by the BK-37 run-history isolation suite.';

// Test A — a mixed, hand-laid history: 4 passed, 3 failed, 2 aborted, plus one
// `running` Run that must never surface. Index 3 and 4 deliberately share a
// started_at to exercise the id tie-break.
const A_STATUSES = ['passed', 'failed', 'aborted', 'passed', 'failed', 'passed', 'aborted', 'failed', 'passed'] as const;
const A_TOTALS = { passed: 4, failed: 3, aborted: 2 };
const TIE_INDEX_A = 3;
const TIE_INDEX_B = 4;

// Test B — the page-size boundary fixture: 50 passed + 1 failed = 51 terminal
// Runs. `outcome=passed` yields exactly 50 (last page, no cursor); unfiltered
// yields 51 (one row spills onto a second page).
const B_PASSED = 50;

interface MemberRow { user_id: string, workspace_id: string, status: string }
interface HistoryItem {
  id: string
  status: string
  environment_id: string
  environment_name: string | null
  executor_mode: string
  started_at: string
  finished_at: string | null
}
interface HistoryPage {
  items: HistoryItem[]
  totals: { passed: number, failed: number, aborted: number }
  next_cursor: { started_at: string, id: string } | null
}
interface SeedRun {
  id: string
  workspace_id: string
  project_id: string
  test_id: string
  environment_id: string
  status: string
  abort_reason: string | null
  executor_mode: string
  executor_user_id: string
  start_token: string
  test_title: string
  started_at: string
  finished_at: string | null
}
interface Fixture {
  workspaceId: string
  actorUserId: string
  foreignActorUserId: string | null
  testAId: string
  testBId: string
  runAIds: string[]
}

function service() {
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

// Milliseconds are dropped so the tie pair shares a byte-identical timestamp.
function isoMinutesBefore(base: number, minutes: number): string {
  return new Date(base - minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

let fixture: Fixture | null = null;
let skipReason: string | null = null;

describeOrSkip('BK-37 — bunkai_list_test_runs history isolation', () => {
  beforeAll(async () => {
    const db = service();

    // 0. Is the RPC deployed? Probe with a nonexistent Test: a deployed RPC
    //    answers P0002; an undeployed one answers "function does not exist".
    const probe = await db.rpc('bunkai_list_test_runs', {
      p_actor_user_id: ZERO_UUID,
      p_test_id: ZERO_UUID,
    });
    if (probe.error && probe.error.code !== 'P0002') {
      skipReason = `bunkai_list_test_runs is not deployed yet (${probe.error.code ?? 'unknown'}). Apply migration 0038_run_history.sql.`;
      return;
    }

    // 1. A workspace with an active member, a project, and an environment — the
    //    three FKs a Run row needs.
    const { data: members, error: membersError } = await db
      .from('workspace_members')
      .select('user_id, workspace_id, status')
      .eq('status', 'active');
    if (membersError) { throw membersError; }

    const { data: projects, error: projectsError } = await db
      .from('projects')
      .select('id, workspace_id');
    if (projectsError) { throw projectsError; }

    const { data: environments, error: environmentsError } = await db
      .from('project_environments')
      .select('id, project_id');
    if (environmentsError) { throw environmentsError; }

    const active = (members ?? []) as MemberRow[];
    const anchor = findAnchor(
      active,
      (projects ?? []) as Array<{ id: string, workspace_id: string }>,
      (environments ?? []) as Array<{ id: string, project_id: string }>,
    );
    if (!anchor) {
      skipReason = 'need an active member whose workspace has a project with at least one environment (seed state).';
      return;
    }

    // 2. Two throwaway Tests so every count below is exact — a pre-existing Test
    //    could already carry Runs and make `totals` unassertable.
    const { data: seededTests, error: testsError } = await db
      .from('tests')
      .insert([
        { workspace_id: anchor.workspaceId, title: `${PREFIX} mixed history`, created_by: anchor.userId },
        { workspace_id: anchor.workspaceId, title: `${PREFIX} page boundary`, created_by: anchor.userId },
      ])
      .select('id, title');
    if (testsError) { throw testsError; }
    const testAId = (seededTests ?? []).find(t => t.title.endsWith('mixed history'))!.id as string;
    const testBId = (seededTests ?? []).find(t => t.title.endsWith('page boundary'))!.id as string;

    const base = Date.parse('2026-07-29T12:00:00.000Z');
    const common = {
      workspace_id: anchor.workspaceId,
      project_id: anchor.projectId,
      environment_id: anchor.environmentId,
      executor_mode: 'human',
      executor_user_id: anchor.userId,
    };

    // 3a. Test A — the mixed set. Indices 3 and 4 share a started_at; ids are
    //     minted client-side so the tie-break assertion knows which is greater.
    const runAIds = A_STATUSES.map(() => crypto.randomUUID());
    const runsA: SeedRun[] = A_STATUSES.map((status, i) => {
      const startedAt = isoMinutesBefore(base, i === TIE_INDEX_B ? TIE_INDEX_A : i);
      return {
        ...common,
        id: runAIds[i],
        test_id: testAId,
        status,
        abort_reason: status === 'aborted' ? ABORT_REASON : null,
        start_token: `${PREFIX}-a-${i}`,
        test_title: `${PREFIX} mixed history`,
        started_at: startedAt,
        finished_at: new Date(Date.parse(startedAt) + 41_000).toISOString(),
      };
    });
    // The in-progress Run: never listed, never counted.
    runsA.push({
      ...common,
      id: crypto.randomUUID(),
      test_id: testAId,
      status: 'running',
      abort_reason: null,
      start_token: `${PREFIX}-a-running`,
      test_title: `${PREFIX} mixed history`,
      started_at: isoMinutesBefore(base, -1),
      finished_at: null,
    });

    // 3b. Test B — 50 passed + 1 failed, strictly decreasing timestamps.
    const runsB: SeedRun[] = Array.from({ length: B_PASSED + 1 }, (_, i) => {
      const startedAt = isoMinutesBefore(base, i);
      return {
        ...common,
        id: crypto.randomUUID(),
        test_id: testBId,
        status: i < B_PASSED ? 'passed' : 'failed',
        abort_reason: null,
        start_token: `${PREFIX}-b-${i}`,
        test_title: `${PREFIX} page boundary`,
        started_at: startedAt,
        finished_at: new Date(Date.parse(startedAt) + 12_000).toISOString(),
      };
    });

    const { error: runsError } = await db.from('runs').insert([...runsA, ...runsB]);
    if (runsError) { throw runsError; }

    fixture = {
      workspaceId: anchor.workspaceId,
      actorUserId: anchor.userId,
      foreignActorUserId: active.find(m => m.workspace_id !== anchor.workspaceId)?.user_id ?? null,
      testAId,
      testBId,
      runAIds,
    };
  });

  afterAll(async () => {
    if (!fixture) { return; }
    const db = service();
    // Runs first: runs.test_id is ON DELETE RESTRICT.
    await db.from('runs').delete().like('start_token', `${PREFIX}%`);
    await db.from('tests').delete().in('id', [fixture.testAId, fixture.testBId]);
  });

  it('an active member reads their own Test\'s history newest first', async () => {
    if (!fixture) { return warn(); }
    const page = await listRuns(fixture.testAId, fixture.actorUserId);

    expect(page.items).toHaveLength(A_STATUSES.length);
    // Non-increasing by started_at; ties resolved by id descending.
    for (let i = 1; i < page.items.length; i++) {
      const prev = page.items[i - 1];
      const curr = page.items[i];
      const prevAt = Date.parse(prev.started_at);
      const currAt = Date.parse(curr.started_at);
      expect(prevAt).toBeGreaterThanOrEqual(currAt);
      if (prevAt === currAt) {
        expect(prev.id > curr.id).toBe(true);
      }
    }
    // Every row carries the fields the history table renders.
    for (const item of page.items) {
      expect(typeof item.environment_id).toBe('string');
      expect(item.executor_mode).toBe('human');
      expect(typeof item.started_at).toBe('string');
      expect(item.finished_at).not.toBeNull();
    }
  });

  it('excludes a running Run from BOTH items and totals', async () => {
    if (!fixture) { return warn(); }
    const page = await listRuns(fixture.testAId, fixture.actorUserId);

    expect(page.items.every(i => i.status !== 'running')).toBe(true);
    expect(page.items).toHaveLength(A_STATUSES.length);
    expect(page.totals).toEqual(A_TOTALS);
    // 9 terminal + 1 running were seeded; the running one is invisible in both.
    expect(page.totals.passed + page.totals.failed + page.totals.aborted).toBe(A_STATUSES.length);
  });

  it('breaks an identical started_at tie by id descending', async () => {
    if (!fixture) { return warn(); }
    const page = await listRuns(fixture.testAId, fixture.actorUserId);

    const tied = [fixture.runAIds[TIE_INDEX_A], fixture.runAIds[TIE_INDEX_B]];
    const positions = tied.map(id => page.items.findIndex(i => i.id === id));
    expect(positions.every(p => p >= 0)).toBe(true);

    const [first, second] = positions[0] < positions[1] ? tied : [tied[1], tied[0]];
    expect(page.items[Math.min(...positions)].started_at).toBe(page.items[Math.max(...positions)].started_at);
    // The one listed first must be the greater uuid.
    expect(first > second).toBe(true);
  });

  it('a FOREIGN-workspace actor is denied with P0002 and no data leak', async () => {
    if (!fixture) { return warn(); }
    if (!fixture.foreignActorUserId) {
      console.warn('[history-isolation] skipped: need an active member of a DIFFERENT workspace (seed state).');
      return;
    }

    const db = service();
    const { data, error } = await db.rpc('bunkai_list_test_runs', {
      p_actor_user_id: fixture.foreignActorUserId,
      p_test_id: fixture.testAId,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  it('a nonexistent Test id raises the SAME P0002 (no existence signal)', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const { data, error } = await db.rpc('bunkai_list_test_runs', {
      p_actor_user_id: fixture.actorUserId,
      p_test_id: ZERO_UUID,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('P0002');
    expect(data).toBeNull();
  });

  it('pages by keyset across two pages with no duplicate and no skipped row', async () => {
    if (!fixture) { return warn(); }

    const first = await listRuns(fixture.testBId, fixture.actorUserId, { limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(first.next_cursor).not.toBeNull();

    const second = await listRuns(fixture.testBId, fixture.actorUserId, {
      limit: 50,
      cursor: first.next_cursor,
    });
    // 51 seeded terminal runs -> exactly one row spills onto page 2.
    expect(second.items).toHaveLength(1);
    expect(second.next_cursor).toBeNull();

    const ids = [...first.items, ...second.items].map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(B_PASSED + 1);
    // The join is still globally newest-first across the page seam.
    const timestamps = [...first.items, ...second.items].map(i => Date.parse(i.started_at));
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
    }
  });

  it('exactly 50 matching runs returns a null next_cursor (boundary)', async () => {
    if (!fixture) { return warn(); }
    const page = await listRuns(fixture.testBId, fixture.actorUserId, { outcome: 'passed', limit: 50 });

    expect(page.items).toHaveLength(B_PASSED);
    expect(page.items.every(i => i.status === 'passed')).toBe(true);
    // The limit+1 probe found nothing beyond the page — no "load older" affordance.
    expect(page.next_cursor).toBeNull();
  });

  it('keeps the outcome filter applied across pages', async () => {
    if (!fixture) { return warn(); }

    const first = await listRuns(fixture.testAId, fixture.actorUserId, { outcome: 'failed', limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.items.every(i => i.status === 'failed')).toBe(true);
    expect(first.next_cursor).not.toBeNull();

    const second = await listRuns(fixture.testAId, fixture.actorUserId, {
      outcome: 'failed',
      limit: 2,
      cursor: first.next_cursor,
    });
    // 3 failed runs seeded -> the filtered second page holds the remaining one,
    // and it is still a FAILED run (pagination scopes to the active filter).
    expect(second.items).toHaveLength(1);
    expect(second.items.every(i => i.status === 'failed')).toBe(true);
    expect(second.next_cursor).toBeNull();

    const ids = [...first.items, ...second.items].map(i => i.id);
    expect(new Set(ids).size).toBe(A_TOTALS.failed);
  });

  it('totals stay all-time under an active filter and across pages', async () => {
    if (!fixture) { return warn(); }

    const unfiltered = await listRuns(fixture.testAId, fixture.actorUserId);
    const filtered = await listRuns(fixture.testAId, fixture.actorUserId, { outcome: 'aborted' });
    const pagedFiltered = await listRuns(fixture.testAId, fixture.actorUserId, { outcome: 'failed', limit: 1 });

    expect(unfiltered.totals).toEqual(A_TOTALS);
    expect(filtered.totals).toEqual(A_TOTALS);
    expect(pagedFiltered.totals).toEqual(A_TOTALS);
    // ...while the filtered LIST does narrow.
    expect(filtered.items).toHaveLength(A_TOTALS.aborted);
    expect(pagedFiltered.items).toHaveLength(1);
  });

  it('a Test with no terminal runs returns an empty page with zeroed totals', async () => {
    if (!fixture) { return warn(); }
    const db = service();

    const { data: created, error } = await db
      .from('tests')
      .insert({ workspace_id: fixture.workspaceId, title: `${PREFIX} never run`, created_by: fixture.actorUserId })
      .select('id')
      .single();
    if (error) { throw error; }

    try {
      const page = await listRuns(created.id as string, fixture.actorUserId);
      expect(page.items).toHaveLength(0);
      expect(page.totals).toEqual({ passed: 0, failed: 0, aborted: 0 });
      expect(page.next_cursor).toBeNull();
    }
    finally {
      await db.from('tests').delete().eq('id', created.id);
    }
  });

  it('rejects an out-of-enum outcome with 45208 (RPC backstop)', async () => {
    if (!fixture) { return warn(); }
    const db = service();
    const { data, error } = await db.rpc('bunkai_list_test_runs', {
      p_actor_user_id: fixture.actorUserId,
      p_test_id: fixture.testAId,
      // `running` is not an outcome — the HTTP layer rejects it first, this is
      // the direct-caller backstop.
      p_outcome: 'running',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('45208');
    expect(data).toBeNull();
  });
});

// One RPC call, typed at the seam.
async function listRuns(
  testId: string,
  actorUserId: string,
  opts: { outcome?: string, limit?: number, cursor?: { started_at: string, id: string } | null } = {},
): Promise<HistoryPage> {
  const db = service();
  const { data, error } = await db.rpc('bunkai_list_test_runs', {
    p_actor_user_id: actorUserId,
    p_test_id: testId,
    p_outcome: opts.outcome ?? undefined,
    p_limit: opts.limit ?? undefined,
    p_cursor_started_at: opts.cursor?.started_at ?? undefined,
    p_cursor_id: opts.cursor?.id ?? undefined,
  });
  if (error) { throw error; }
  return data as unknown as HistoryPage;
}

// The suite never fails on missing migration / seed state — it says why and passes.
function warn() {
  console.warn(`[history-isolation] skipped: ${skipReason ?? 'fixture unavailable.'}`);
}

// Pick the first (member, project, environment) triple that shares a workspace —
// everything a seeded Run row needs to satisfy its NOT NULL foreign keys.
function findAnchor(
  members: MemberRow[],
  projects: Array<{ id: string, workspace_id: string }>,
  environments: Array<{ id: string, project_id: string }>,
) {
  const envByProject = new Map<string, string>();
  for (const e of environments) {
    if (!envByProject.has(e.project_id)) { envByProject.set(e.project_id, e.id); }
  }
  for (const m of members) {
    for (const p of projects) {
      const environmentId = envByProject.get(p.id);
      if (p.workspace_id === m.workspace_id && environmentId) {
        return { workspaceId: m.workspace_id, userId: m.user_id, projectId: p.id, environmentId };
      }
    }
  }
  return undefined;
}
