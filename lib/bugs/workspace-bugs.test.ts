import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeBugsCursor } from '@lib/bugs/list-cursor';
import { countWorkspaceBugs, listWorkspaceBugProjects, listWorkspaceBugs } from '@lib/bugs/workspace-bugs';
import { describe, expect, test } from 'bun:test';

// BK-555 — the shared read behind GET /api/v1/workspaces/{id}/bugs and the
// `/bugs` page. These tests pin the TypeScript half: what reaches the RPC, the
// archived-module predicate of the count, the cursor encoding, the assignee
// resolution, and that a failed part fails the whole page. Isolation itself is
// Postgres's (SECURITY INVOKER + RLS) and is proven against the real database
// in `workspace-bugs-isolation.test.ts`.

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const BUG_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_AT = '2026-11-17T10:00:00.123456+00:00';

const ZERO = {
  by_severity: { P1: 0, P2: 0, P3: 0, P4: 0 },
  by_status: { open: 0, in_progress: 0, resolved: 0, closed: 0 },
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: BUG_ID,
    workspace_id: WORKSPACE_ID,
    project_id: '22222222-2222-4222-8222-222222222222',
    project_slug: 'checkout',
    project_name: 'Checkout',
    module: { id: '55555555-5555-4555-8555-555555555555', name: 'Payments', path: 'payments' },
    run_id: null,
    title: 'Card form rejects a valid card',
    severity: 'P1',
    status: 'open',
    assignee_user_id: null,
    created_at: CREATED_AT,
    ...overrides,
  };
}

interface FakeState {
  rpcCalls: { name: string, args: Record<string, unknown> }[]
  countCalls: { select: string, filters: [string, string, unknown][] }[]
  rpcResults: Record<string, { data: unknown, error: unknown }>
  countResult: { count: number | null, error: unknown }
  projectsResult: { data: unknown, error: unknown }
}

function fakeDb(state: FakeState): SupabaseClient<Database> {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcResults[name];
    },
    from: (table: string) => {
      if (table === 'projects') {
        return {
          select: () => ({ eq: () => ({ order: async () => state.projectsResult }) }),
        };
      }
      expect(table).toBe('bugs');
      const call = { select: '', filters: [] as [string, string, unknown][] };
      state.countCalls.push(call);
      return {
        select: (columns: string) => {
          call.select = columns;
          return {
            eq: (column: string, value: unknown) => {
              call.filters.push(['eq', column, value]);
              return {
                is: async (isColumn: string, isValue: unknown) => {
                  call.filters.push(['is', isColumn, isValue]);
                  return state.countResult;
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
}

function newState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    rpcCalls: [],
    countCalls: [],
    rpcResults: {
      bunkai_list_workspace_bugs: { data: { data: [], aggregates: ZERO, next_cursor: null }, error: null },
      bunkai_resolve_activity_actors: { data: [], error: null },
    },
    countResult: { count: 0, error: null },
    projectsResult: { data: [], error: null },
    ...overrides,
  };
}

describe('countWorkspaceBugs', () => {
  test('counts the workspace\'s defects on live modules only (AC-02, AC-19)', async () => {
    const state = newState({ countResult: { count: 12, error: null } });
    expect(await countWorkspaceBugs(fakeDb(state), WORKSPACE_ID)).toBe(12);
    expect(state.countCalls[0].select).toBe('id, modules!inner(archived_at)');
    expect(state.countCalls[0].filters).toEqual([
      ['eq', 'workspace_id', WORKSPACE_ID],
      ['is', 'modules.archived_at', null],
    ]);
  });

  test('a failed count is null, so the badge hides instead of showing 0', async () => {
    const state = newState({ countResult: { count: null, error: { message: 'boom' } } });
    expect(await countWorkspaceBugs(fakeDb(state), WORKSPACE_ID)).toBeNull();
  });
});

describe('listWorkspaceBugs', () => {
  test('passes the filters and the cursor triple to the RPC, with the unfiltered count alongside', async () => {
    const state = newState({ countResult: { count: 9, error: null } });
    const result = await listWorkspaceBugs(fakeDb(state), {
      workspaceId: WORKSPACE_ID,
      projectId: '22222222-2222-4222-8222-222222222222',
      statuses: ['open', 'closed'],
      severities: ['P2'],
      limit: 10,
      cursor: { severity: 'P2', createdAt: CREATED_AT, id: BUG_ID },
    });

    expect(state.rpcCalls[0]).toEqual({
      name: 'bunkai_list_workspace_bugs',
      args: {
        p_workspace_id: WORKSPACE_ID,
        p_project_id: '22222222-2222-4222-8222-222222222222',
        p_statuses: ['open', 'closed'],
        p_severities: ['P2'],
        p_limit: 10,
        p_cursor_severity: 'P2',
        p_cursor_created_at: CREATED_AT,
        p_cursor_id: BUG_ID,
      },
    });
    expect(result).toEqual({ ok: true, page: { data: [], aggregates: ZERO, next_cursor: null, workspace_bug_count: 9 } });
  });

  test('empty filter lists are not sent: an empty list would mean "match nothing"', async () => {
    const state = newState();
    await listWorkspaceBugs(fakeDb(state), { workspaceId: WORKSPACE_ID, statuses: [], severities: [] });
    const args = state.rpcCalls[0].args;
    expect(args.p_statuses).toBeUndefined();
    expect(args.p_severities).toBeUndefined();
    expect(args.p_project_id).toBeUndefined();
    expect(args.p_limit).toBe(50);
  });

  test('encodes the next position as the Project list\'s opaque cursor', async () => {
    const state = newState();
    state.rpcResults.bunkai_list_workspace_bugs = {
      data: { data: [row()], aggregates: ZERO, next_cursor: { severity: 'P1', created_at: CREATED_AT, id: BUG_ID } },
      error: null,
    };
    const result = await listWorkspaceBugs(fakeDb(state), { workspaceId: WORKSPACE_ID });
    if (!result.ok || result.page.next_cursor === null) { throw new Error('expected a next cursor'); }
    expect(decodeBugsCursor(result.page.next_cursor)).toEqual({ ok: true, cursor: { severity: 'P1', createdAt: CREATED_AT, id: BUG_ID } });
  });

  test('resolves the page\'s assignees once, and keeps an unresolvable one as assigned without an email', async () => {
    const other = '66666666-6666-4666-8666-666666666666';
    const state = newState();
    state.rpcResults.bunkai_list_workspace_bugs = {
      data: {
        data: [row({ assignee_user_id: USER_ID }), row({ id: '77777777-7777-4777-8777-777777777777', assignee_user_id: other }), row({ id: '88888888-8888-4888-8888-888888888888' })],
        aggregates: ZERO,
        next_cursor: null,
      },
      error: null,
    };
    state.rpcResults.bunkai_resolve_activity_actors = { data: [{ user_id: USER_ID, email: 'mateo@example.com' }], error: null };

    const result = await listWorkspaceBugs(fakeDb(state), { workspaceId: WORKSPACE_ID });
    if (!result.ok) { throw new Error('expected ok'); }
    expect(result.page.data.map(r => r.assignee)).toEqual([
      { user_id: USER_ID, email: 'mateo@example.com' },
      { user_id: other, email: null },
      null,
    ]);
    const resolverCall = state.rpcCalls.find(c => c.name === 'bunkai_resolve_activity_actors')!;
    expect(resolverCall.args).toEqual({ p_workspace_id: WORKSPACE_ID, p_user_ids: [USER_ID, other] });
  });

  test('skips the resolver when no row is assigned', async () => {
    const state = newState();
    state.rpcResults.bunkai_list_workspace_bugs = { data: { data: [row()], aggregates: ZERO, next_cursor: null }, error: null };
    await listWorkspaceBugs(fakeDb(state), { workspaceId: WORKSPACE_ID });
    expect(state.rpcCalls.map(c => c.name)).toEqual(['bunkai_list_workspace_bugs']);
  });

  test('a failed list, count or assignee read fails the whole page, never an empty one (AC-17)', async () => {
    const listFails = newState();
    listFails.rpcResults.bunkai_list_workspace_bugs = { data: null, error: { message: 'boom' } };
    expect(await listWorkspaceBugs(fakeDb(listFails), { workspaceId: WORKSPACE_ID })).toEqual({ ok: false });

    const countFails = newState({ countResult: { count: null, error: { message: 'boom' } } });
    expect(await listWorkspaceBugs(fakeDb(countFails), { workspaceId: WORKSPACE_ID })).toEqual({ ok: false });

    const resolverFails = newState();
    resolverFails.rpcResults.bunkai_list_workspace_bugs = { data: { data: [row({ assignee_user_id: USER_ID })], aggregates: ZERO, next_cursor: null }, error: null };
    resolverFails.rpcResults.bunkai_resolve_activity_actors = { data: null, error: { message: 'boom' } };
    expect(await listWorkspaceBugs(fakeDb(resolverFails), { workspaceId: WORKSPACE_ID })).toEqual({ ok: false });
  });
});

describe('listWorkspaceBugProjects', () => {
  test('returns every Project of the workspace as an option', async () => {
    const state = newState({ projectsResult: { data: [{ id: 'p1', name: 'Checkout' }, { id: 'p2', name: 'Search' }], error: null } });
    expect(await listWorkspaceBugProjects(fakeDb(state), WORKSPACE_ID)).toEqual([{ id: 'p1', name: 'Checkout' }, { id: 'p2', name: 'Search' }]);
  });

  test('a failed read is null, never an empty option list', async () => {
    const state = newState({ projectsResult: { data: null, error: { message: 'boom' } } });
    expect(await listWorkspaceBugProjects(fakeDb(state), WORKSPACE_ID)).toBeNull();
  });
});
