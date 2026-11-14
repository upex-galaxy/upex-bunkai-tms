import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeRunCursor } from '@lib/runs/history-validation';
import { countWorkspaceRuns, distinctEnvironmentNames, listWorkspaceRuns } from '@lib/runs/workspace-runs';
import { describe, expect, test } from 'bun:test';

// BK-513 — the shared read behind GET /api/v1/workspaces/{id}/runs and the
// `/runs` page. These tests pin the TypeScript half: what reaches the RPC, the
// cursor encoding, the count, and that a failed part fails the whole page.
// Isolation itself is Postgres's (SECURITY INVOKER + RLS) and is proven
// against the real database in `workspace-runs-isolation.test.ts`.

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const STARTED_AT = '2026-11-14T10:00:00.123456+00:00';

interface FakeState {
  rpcCalls: { name: string, args: Record<string, unknown> }[]
  countFilters: [string, unknown][]
  rpcResult: { data: unknown, error: unknown }
  countResult: { count: number | null, error: unknown }
}

function fakeDb(state: FakeState): SupabaseClient<Database> {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResult;
    },
    from: (table: string) => {
      expect(table).toBe('runs');
      return {
        select: () => ({
          eq: async (column: string, value: unknown) => {
            state.countFilters.push([column, value]);
            return state.countResult;
          },
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;
}

function newState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    rpcCalls: [],
    countFilters: [],
    rpcResult: { data: { items: [], next_cursor: null }, error: null },
    countResult: { count: 0, error: null },
    ...overrides,
  };
}

describe('listWorkspaceRuns', () => {
  test('passes the filters to the RPC and the unfiltered count alongside', async () => {
    const state = newState({ countResult: { count: 7, error: null } });
    const result = await listWorkspaceRuns(fakeDb(state), {
      workspaceId: WORKSPACE_ID,
      projectId: null,
      status: ['failed'],
      environment: 'staging',
      mode: 'automated',
      limit: 20,
      cursor: { startedAt: STARTED_AT, id: RUN_ID },
    });

    expect(state.rpcCalls).toEqual([{
      name: 'bunkai_list_workspace_runs',
      args: {
        p_workspace_id: WORKSPACE_ID,
        p_project_id: undefined,
        p_status: ['failed'],
        p_environment_name: 'staging',
        p_mode: 'automated',
        p_limit: 20,
        p_cursor_started_at: STARTED_AT,
        p_cursor_id: RUN_ID,
      },
    }]);
    // The count is the workspace predicate only: no filter narrows it (AC-02).
    expect(state.countFilters).toEqual([['workspace_id', WORKSPACE_ID]]);
    expect(result).toEqual({ ok: true, page: { items: [], next_cursor: null, workspace_run_count: 7 } });
  });

  test('an empty outcome list is no filter, not "no outcome"', async () => {
    const state = newState();
    await listWorkspaceRuns(fakeDb(state), { workspaceId: WORKSPACE_ID, status: [] });
    expect(state.rpcCalls[0]?.args.p_status).toBeUndefined();
  });

  test('encodes the raw keyset position into the opaque cursor', async () => {
    const state = newState({
      rpcResult: { data: { items: [], next_cursor: { started_at: STARTED_AT, id: RUN_ID } }, error: null },
    });
    const result = await listWorkspaceRuns(fakeDb(state), { workspaceId: WORKSPACE_ID });
    if (!result.ok || result.page.next_cursor === null) {
      throw new Error('expected a page with a cursor');
    }
    expect(decodeRunCursor(result.page.next_cursor)).toEqual({ ok: true, cursor: { startedAt: STARTED_AT, id: RUN_ID } });
  });

  test('a failed list read fails the page instead of returning an empty one', async () => {
    const state = newState({ rpcResult: { data: null, error: { message: 'boom' } } });
    expect(await listWorkspaceRuns(fakeDb(state), { workspaceId: WORKSPACE_ID })).toEqual({ ok: false });
  });

  test('a failed count fails the page too', async () => {
    const state = newState({ countResult: { count: null, error: { message: 'boom' } } });
    expect(await listWorkspaceRuns(fakeDb(state), { workspaceId: WORKSPACE_ID })).toEqual({ ok: false });
  });
});

describe('countWorkspaceRuns', () => {
  test('a failed read is null, so the badge hides instead of showing 0', async () => {
    const state = newState({ countResult: { count: null, error: { message: 'boom' } } });
    expect(await countWorkspaceRuns(fakeDb(state), WORKSPACE_ID)).toBeNull();
  });

  test('a workspace with no Runs counts 0', async () => {
    expect(await countWorkspaceRuns(fakeDb(newState()), WORKSPACE_ID)).toBe(0);
  });
});

describe('distinctEnvironmentNames', () => {
  test('one option per name across Projects, case-insensitive, sorted', () => {
    expect(distinctEnvironmentNames(['staging', 'Production', 'Staging', ' dev ', 'production', ''])).toEqual(['dev', 'Production', 'staging']);
  });
});
