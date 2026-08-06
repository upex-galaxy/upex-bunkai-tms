import type { ApiErrorCode } from '@lib/api/error-envelope';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import {
  assertModuleInProject,
  emptyBugsListPage,
  fetchBugsListPage,
  mapBugsListRpcError,
  resolveBugsProjectVisibility,
  ZERO_BUGS_AGGREGATES,
} from './list-response';

// BK-41 (Slice 2: API) — GET /api/v1/bugs. The route itself is a thin
// `withApiHandler` wrapper (no dedicated NextRequest/ctx test harness exists
// in this repo — same convention `app/api/v1/activity/route.test.ts` notes);
// every branch that needs coverage lives in the pure/DB-parametrized
// functions in `./list-response.ts`, tested directly with a fake-chainable
// `db`, mirroring `app/api/v1/activity/response.test.ts`'s own style. This
// slice's tests are for the HTTP/parsing/response-shaping layer, mocked at
// the RPC-call boundary — the authorization proof itself already happened
// against a real database in Slice 1 (`lib/bugs/list-isolation.test.ts`).

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const BUG_ID = '44444444-4444-4444-4444-444444444444';

interface RpcResult { data: unknown, error: { code?: string, message: string } | null }
interface Call { fn: string, args: unknown }

// Minimal stand-in for `db.from(table).select('id').eq(...).eq(...).maybeSingle()`.
function fakeMaybeSingleDb(result: { data: { id: string } | null, error: { message: string } | null }): SupabaseClient<Database> {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient<Database>;
}

function fakeRpcDb(response: RpcResult, calls: Call[] = []): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return response;
    },
  } as unknown as SupabaseClient<Database>;
}

// BK-264 — a fake `db` that answers DIFFERENTLY per RPC name, needed once
// `fetchBugsListPage` makes a SECOND rpc call (`bunkai_resolve_activity_
// actors`) whenever a page has at least one assigned bug.
function fakeRpcDbByFn(responses: Record<string, RpcResult>, calls: Call[] = []): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      const response = responses[fn];
      if (!response) {
        throw new Error(`fakeRpcDbByFn: no canned response for "${fn}"`);
      }
      return response;
    },
  } as unknown as SupabaseClient<Database>;
}

describe('resolveBugsProjectVisibility (Decision 9)', () => {
  it('returns true when the project row is visible under the caller\'s RLS', async () => {
    const db = fakeMaybeSingleDb({ data: { id: PROJECT_ID }, error: null });
    expect(await resolveBugsProjectVisibility(db, PROJECT_ID)).toBe(true);
  });

  it('returns false (never throws) when the project is foreign or nonexistent — RLS silently empties the row', async () => {
    const db = fakeMaybeSingleDb({ data: null, error: null });
    expect(await resolveBugsProjectVisibility(db, PROJECT_ID)).toBe(false);
  });

  it('propagates a genuine db error as internal_error', async () => {
    const db = fakeMaybeSingleDb({ data: null, error: { message: 'connection reset' } });
    await expectApiError(resolveBugsProjectVisibility(db, PROJECT_ID), 'internal_error', 500);
  });
});

describe('assertModuleInProject (Decision 10)', () => {
  it('resolves without throwing when the module belongs to the project', async () => {
    const db = fakeMaybeSingleDb({ data: { id: MODULE_ID }, error: null });
    const result = await assertModuleInProject(db, { projectId: PROJECT_ID, moduleId: MODULE_ID });
    expect(result).toBeUndefined();
  });

  it('throws validation_failed / module_not_in_project when the module is outside the project', async () => {
    const db = fakeMaybeSingleDb({ data: null, error: null });
    try {
      await assertModuleInProject(db, { projectId: PROJECT_ID, moduleId: MODULE_ID });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('validation_failed');
      expect((err as ApiError).status).toBe(422);
      expect((err as ApiError).details).toEqual({ reason: 'module_not_in_project' });
    }
  });
});

describe('mapBugsListRpcError', () => {
  it('maps bugs_list_cursor_invalid (45308) to 400 bad_request', () => {
    try {
      mapBugsListRpcError({ code: '45308', message: 'bugs_list_cursor_invalid' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('bad_request');
      expect((err as ApiError).status).toBe(400);
    }
  });

  it('maps an unrecognized error code to 500 internal_error', () => {
    try {
      mapBugsListRpcError({ code: '99999', message: 'boom' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('internal_error');
      expect((err as ApiError).status).toBe(500);
    }
  });
});

describe('emptyBugsListPage (AC-7 / Decision 9)', () => {
  it('returns a zeroed page shape, never null aggregates', () => {
    expect(emptyBugsListPage()).toEqual({ data: [], aggregates: ZERO_BUGS_AGGREGATES, next_cursor: null });
  });
});

describe('fetchBugsListPage', () => {
  it('forwards project/module/filters/limit/cursor to the RPC call args unchanged', async () => {
    const calls: Call[] = [];
    const db = fakeRpcDb({ data: { data: [], aggregates: ZERO_BUGS_AGGREGATES, next_cursor: null }, error: null }, calls);

    await fetchBugsListPage(db, {
      projectId: PROJECT_ID,
      moduleId: MODULE_ID,
      statuses: ['open', 'in_progress'],
      severities: ['P1', 'P2'],
      limit: 17,
      cursorSeverity: 'P1',
      cursorCreatedAt: '2026-07-29T11:52:00+00:00',
      cursorId: BUG_ID,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('bunkai_list_bugs');
    expect(calls[0].args).toEqual({
      p_project_id: PROJECT_ID,
      p_module_id: MODULE_ID,
      p_statuses: ['open', 'in_progress'],
      p_severities: ['P1', 'P2'],
      p_limit: 17,
      p_cursor_severity: 'P1',
      p_cursor_created_at: '2026-07-29T11:52:00+00:00',
      p_cursor_id: BUG_ID,
    });
  });

  it('AC-6/ATP-7: passes the aggregates through unchanged from the RPC (the full filtered set, not page-derived)', async () => {
    const aggregates = {
      by_severity: { P1: 5, P2: 3, P3: 0, P4: 0 },
      by_status: { open: 8, in_progress: 0, resolved: 0, closed: 0 },
    };
    const db = fakeRpcDb({ data: { data: [], aggregates, next_cursor: null }, error: null });

    const page = await fetchBugsListPage(db, {
      projectId: PROJECT_ID,
      moduleId: null,
      statuses: null,
      severities: null,
      limit: 30,
      cursorSeverity: null,
      cursorCreatedAt: null,
      cursorId: null,
    });

    expect(page.aggregates).toEqual(aggregates);
  });

  it('pagination boundary: a non-null next_cursor from the RPC round-trips through the opaque wire token', async () => {
    const db = fakeRpcDb({
      data: {
        data: [],
        aggregates: ZERO_BUGS_AGGREGATES,
        next_cursor: { severity: 'P2', created_at: '2026-07-29T11:52:00+00:00', id: BUG_ID },
      },
      error: null,
    });

    const page = await fetchBugsListPage(db, {
      projectId: PROJECT_ID,
      moduleId: null,
      statuses: null,
      severities: null,
      limit: 30,
      cursorSeverity: null,
      cursorCreatedAt: null,
      cursorId: null,
    });

    expect(page.next_cursor).not.toBeNull();
    expect(typeof page.next_cursor).toBe('string');
  });

  it('pagination boundary: a null next_cursor (last page) stays null on the wire', async () => {
    const db = fakeRpcDb({ data: { data: [], aggregates: ZERO_BUGS_AGGREGATES, next_cursor: null }, error: null });
    const page = await fetchBugsListPage(db, {
      projectId: PROJECT_ID,
      moduleId: null,
      statuses: null,
      severities: null,
      limit: 30,
      cursorSeverity: null,
      cursorCreatedAt: null,
      cursorId: null,
    });
    expect(page.next_cursor).toBeNull();
  });

  it('propagates a bunkai_list_bugs RPC error through mapBugsListRpcError', async () => {
    const db = fakeRpcDb({ data: null, error: { code: '45308', message: 'bugs_list_cursor_invalid' } });
    await expectApiError(
      fetchBugsListPage(db, {
        projectId: PROJECT_ID,
        moduleId: null,
        statuses: null,
        severities: null,
        limit: 30,
        cursorSeverity: null,
        cursorCreatedAt: null,
        cursorId: null,
      }),
      'bad_request',
      400,
    );
  });
});

// BK-264 (Slice 2) — GET /api/v1/bugs now surfaces `assignee_user_id` +
// resolved display info, the SAME way GET /api/v1/activity resolves actor
// display info (ADR-0011's `bunkai_resolve_activity_actors`).
const WORKSPACE_ID = '55555555-5555-4555-8555-555555555555';
const ASSIGNEE_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_ASSIGNEE_ID = '77777777-7777-4777-8777-777777777777';

function bugRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: BUG_ID,
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    module_id: MODULE_ID,
    module: { id: MODULE_ID, name: 'Checkout', path: 'checkout' },
    run_id: null,
    run_step_id: null,
    atc_id: null,
    title: 'A perfectly reasonable bug title',
    severity: 'P2',
    status: 'open',
    description: null,
    steps_to_reproduce: '',
    evidence_urls: [],
    assignee_user_id: null,
    created_by: null,
    created_at: '2026-07-29T11:52:00+00:00',
    updated_at: '2026-07-29T11:52:00+00:00',
    ...overrides,
  };
}

describe('fetchBugsListPage — assignee display resolution (BK-264)', () => {
  it('an unassigned row gets assignee: null WITHOUT calling bunkai_resolve_activity_actors at all', async () => {
    const calls: Call[] = [];
    const db = fakeRpcDbByFn({
      bunkai_list_bugs: { data: { data: [bugRow()], aggregates: ZERO_BUGS_AGGREGATES, next_cursor: null }, error: null },
    }, calls);

    const page = await fetchBugsListPage(db, {
      projectId: PROJECT_ID,
      moduleId: null,
      statuses: null,
      severities: null,
      limit: 30,
      cursorSeverity: null,
      cursorCreatedAt: null,
      cursorId: null,
    });

    expect(page.data).toHaveLength(1);
    expect(page.data[0].assignee).toBeNull();
    expect(page.data[0].assignee_user_id).toBeNull();
    expect(calls.map(c => c.fn)).toEqual(['bunkai_list_bugs']);
  });

  it('an assigned row resolves assignee {user_id, email} via bunkai_resolve_activity_actors, scoped to the row\'s own workspace_id', async () => {
    const calls: Call[] = [];
    const db = fakeRpcDbByFn({
      bunkai_list_bugs: {
        data: { data: [bugRow({ assignee_user_id: ASSIGNEE_ID })], aggregates: ZERO_BUGS_AGGREGATES, next_cursor: null },
        error: null,
      },
      bunkai_resolve_activity_actors: { data: [{ user_id: ASSIGNEE_ID, email: 'jane@example.com' }], error: null },
    }, calls);

    const page = await fetchBugsListPage(db, {
      projectId: PROJECT_ID,
      moduleId: null,
      statuses: null,
      severities: null,
      limit: 30,
      cursorSeverity: null,
      cursorCreatedAt: null,
      cursorId: null,
    });

    expect(page.data[0].assignee).toEqual({ user_id: ASSIGNEE_ID, email: 'jane@example.com' });
    const resolveCall = calls.find(c => c.fn === 'bunkai_resolve_activity_actors');
    expect(resolveCall?.args).toEqual({ p_workspace_id: WORKSPACE_ID, p_user_ids: [ASSIGNEE_ID] });
  });

  it('resolves only the DISTINCT assignee ids on the page (not one call per row)', async () => {
    const calls: Call[] = [];
    const db = fakeRpcDbByFn({
      bunkai_list_bugs: {
        data: {
          data: [
            bugRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', assignee_user_id: ASSIGNEE_ID }),
            bugRow({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', assignee_user_id: ASSIGNEE_ID }),
            bugRow({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', assignee_user_id: OTHER_ASSIGNEE_ID }),
          ],
          aggregates: ZERO_BUGS_AGGREGATES,
          next_cursor: null,
        },
        error: null,
      },
      bunkai_resolve_activity_actors: {
        data: [
          { user_id: ASSIGNEE_ID, email: 'jane@example.com' },
          { user_id: OTHER_ASSIGNEE_ID, email: 'john@example.com' },
        ],
        error: null,
      },
    }, calls);

    await fetchBugsListPage(db, {
      projectId: PROJECT_ID,
      moduleId: null,
      statuses: null,
      severities: null,
      limit: 30,
      cursorSeverity: null,
      cursorCreatedAt: null,
      cursorId: null,
    });

    const resolveCall = calls.find(c => c.fn === 'bunkai_resolve_activity_actors');
    expect(resolveCall?.args).toEqual({ p_workspace_id: WORKSPACE_ID, p_user_ids: [ASSIGNEE_ID, OTHER_ASSIGNEE_ID] });
  });

  it('an assignee id the resolver does not return (edge case) falls back to assignee.email: null, never a crash', async () => {
    const db = fakeRpcDbByFn({
      bunkai_list_bugs: {
        data: { data: [bugRow({ assignee_user_id: ASSIGNEE_ID })], aggregates: ZERO_BUGS_AGGREGATES, next_cursor: null },
        error: null,
      },
      bunkai_resolve_activity_actors: { data: [], error: null },
    });

    const page = await fetchBugsListPage(db, {
      projectId: PROJECT_ID,
      moduleId: null,
      statuses: null,
      severities: null,
      limit: 30,
      cursorSeverity: null,
      cursorCreatedAt: null,
      cursorId: null,
    });

    expect(page.data[0].assignee).toEqual({ user_id: ASSIGNEE_ID, email: null });
  });
});

async function expectApiError(promise: Promise<unknown>, code: ApiErrorCode, status: number): Promise<void> {
  try {
    await promise;
    throw new Error('expected an ApiError but none was thrown');
  }
  catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(code);
    expect((err as ApiError).status).toBe(status);
  }
}
