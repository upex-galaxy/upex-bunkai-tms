import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { coveragePercent, summarizeWorkspaceCoverage } from '@lib/home/coverage';
import { describe, expect, test } from 'bun:test';

// BK-881 — the Home Coverage card and GET /api/v1/workspaces/{id}/coverage
// both publish through `coveragePercent`, so these cases pin both surfaces.
describe('coveragePercent', () => {
  test('199 of 200 bound reads 99, not a false 100', () => {
    expect(coveragePercent(199, 200)).toBe(99);
  });

  test('1 of 201 bound reads 1, not a false 0', () => {
    expect(coveragePercent(1, 201)).toBe(1);
  });

  test('0 and 100 only for the exact states', () => {
    expect(coveragePercent(0, 57)).toBe(0);
    expect(coveragePercent(57, 57)).toBe(100);
  });

  test('keeps half-up rounding in the middle of the range', () => {
    expect(coveragePercent(78, 100)).toBe(78);
    expect(coveragePercent(2, 3)).toBe(67);
  });

  test('an empty workspace is null, never 0', () => {
    expect(coveragePercent(0, 0)).toBeNull();
  });

  test('a non-finite input is null, never NaN', () => {
    expect(coveragePercent(Number.NaN, 200)).toBeNull();
    expect(coveragePercent(199, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

// BK-1169 — a 1171-project workspace answered 500: the rollup made one RPC
// call per project behind a 60-project ceiling. It is now ONE call to
// `bunkai_report_workspace_coverage`, whatever the number of projects; these
// cases pin how its answer is mapped.
describe('summarizeWorkspaceCoverage', () => {
  const WS = 'a53d640a-23e7-4b74-b728-b32e31204941';
  const ACTOR = '11111111-1111-4111-8111-111111111111';

  function fakeDb(answer: { data: unknown, error: { code?: string, message: string } | null }) {
    const calls: { fn: string, args: unknown }[] = [];
    const db = {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return answer;
      },
    } as unknown as SupabaseClient<Database>;
    return { db, calls };
  }

  const kpis = { ac_total: 11, ac_bound: 9, ac_executed: 4, modules_total: 1, modules_fully_covered: 0 };

  test('maps the workspace kpis and project count from a single RPC call', async () => {
    const { db, calls } = fakeDb({ data: { kpis, project_count: 1171 }, error: null });
    const result = await summarizeWorkspaceCoverage(db, { workspaceId: WS, actorUserId: ACTOR });
    expect(calls).toEqual([{ fn: 'bunkai_report_workspace_coverage', args: { p_actor_user_id: ACTOR, p_workspace_id: WS } }]);
    expect(result).toEqual({
      ok: true,
      acTotal: 11,
      acBound: 9,
      acExecuted: 4,
      acNotRun: 5,
      acUncovered: 2,
      modulesTotal: 1,
      modulesFullyCovered: 0,
      projectCount: 1171,
    });
  });

  test('a workspace the caller cannot read (P0002) answers like an empty one', async () => {
    const { db } = fakeDb({ data: null, error: { code: 'P0002', message: 'test_not_found' } });
    expect(await summarizeWorkspaceCoverage(db, { workspaceId: WS, actorUserId: ACTOR })).toEqual({
      ok: true,
      acTotal: 0,
      acBound: 0,
      acExecuted: 0,
      acNotRun: 0,
      acUncovered: 0,
      modulesTotal: 0,
      modulesFullyCovered: 0,
      projectCount: 0,
    });
  });

  test('any other RPC error is a failed read, never zeroes', async () => {
    const { db } = fakeDb({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    expect(await summarizeWorkspaceCoverage(db, { workspaceId: WS, actorUserId: ACTOR })).toEqual({ ok: false });
  });

  test('a payload that does not parse fails the read', async () => {
    for (const data of [null, { kpis }, { kpis: { ...kpis, ac_bound: 12 }, project_count: 3 }, { kpis: { ...kpis, ac_total: '11' }, project_count: 3 }]) {
      const { db } = fakeDb({ data, error: null });
      expect(await summarizeWorkspaceCoverage(db, { workspaceId: WS, actorUserId: ACTOR })).toEqual({ ok: false });
    }
  });
});
