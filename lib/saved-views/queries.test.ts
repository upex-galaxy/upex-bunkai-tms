import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from './queries';

// BK-443 — the saved-views queries, driven with a recording client. The
// database policies are the real guard (proved in saved-views-rls.test.ts);
// what is asserted here is that every query CARRIES the user / project / id
// filters it promises, so a refactor cannot silently widen a query, and that
// each outcome maps to the documented envelope.

const USER = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const VIEW = '33333333-3333-4333-8333-333333333333';
const MODULE = '44444444-4444-4444-8444-444444444444';

interface Call {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  payload?: unknown
  columns?: string
  filters: Record<string, unknown>
  orders: string[]
  limit?: number
}
interface Result {
  data: unknown
  error: { code?: string, message: string } | null
}

function fakeDb(results: Result[]): { db: SupabaseClient<Database>, calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...results];
  const db = {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: {}, orders: [] };
      calls.push(call);
      const next = (): Result => queue.shift() ?? { data: null, error: { message: 'unexpected extra query' } };
      const chain = {
        select: (columns: string) => { call.columns = columns; return chain; },
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return chain; },
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return chain; },
        delete: () => { call.op = 'delete'; return chain; },
        eq: (column: string, value: unknown) => { call.filters[column] = value; return chain; },
        order: (column: string) => { call.orders.push(column); return chain; },
        limit: (n: number) => { call.limit = n; return chain; },
        single: async () => next(),
        maybeSingle: async () => next(),
        then: (resolve: (r: Result) => unknown) => resolve(next()),
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
  return { db, calls };
}

const ROW = {
  id: VIEW,
  project_id: PROJECT,
  view_kind: 'bugs' as const,
  name: 'Critical bugs',
  state: { severity: 'P1' },
  created_at: '2026-10-15T00:00:00Z',
  updated_at: '2026-10-15T00:00:00Z',
};

async function failure(fn: () => Promise<unknown>): Promise<ApiError> {
  try {
    await fn();
  }
  catch (error) {
    if (error instanceof ApiError) { return error; }
    throw error;
  }
  throw new Error('expected an ApiError');
}

describe('listSavedViews', () => {
  test('filters by the caller, the project and the surface, ordered by case-folded name, capped at 25', async () => {
    const { db, calls } = fakeDb([{ data: [ROW], error: null }]);
    const items = await listSavedViews(db, { userId: USER, projectId: PROJECT }, 'bugs');
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('user_view_state');
    expect(calls[0].filters).toEqual({ user_id: USER, project_id: PROJECT, view_kind: 'bugs' });
    expect(calls[0].orders).toEqual(['name_key', 'id']);
    expect(calls[0].limit).toBe(25);
    expect(items).toEqual([ROW]);
  });

  test('never selects the owner column', async () => {
    const { db, calls } = fakeDb([{ data: [], error: null }]);
    await listSavedViews(db, { userId: USER, projectId: PROJECT }, 'workbench');
    expect(calls[0].columns).not.toContain('user_id');
  });

  test('an empty result is an empty list, not an error', async () => {
    const { db } = fakeDb([{ data: [], error: null }]);
    expect(await listSavedViews(db, { userId: USER, projectId: PROJECT }, 'bugs')).toEqual([]);
  });

  describe('on a database error', () => {
    let spy: ReturnType<typeof spyOn>;
    beforeEach(() => { spy = spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { spy.mockRestore(); });

    test('answers the fixed 500 and logs the real code', async () => {
      const { db } = fakeDb([{ data: null, error: { code: 'XX000', message: 'secret relation detail' } }]);
      const e = await failure(async () => listSavedViews(db, { userId: USER, projectId: PROJECT }, 'bugs'));
      expect(e.status).toBe(500);
      expect(e.message).not.toContain('secret');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createSavedView', () => {
  const body = { view_kind: 'bugs' as const, name: 'Critical bugs', state: { severity: 'P1' } };

  test('inserts the caller as owner, never an id from the body, with the canonical state', async () => {
    const { db, calls } = fakeDb([{ data: ROW, error: null }]);
    const item = await createSavedView(db, { userId: USER, projectId: PROJECT }, { ...body, state: { severity: 'P2,P1', module: MODULE } });
    expect(calls[0].op).toBe('insert');
    expect(calls[0].payload).toEqual({
      user_id: USER,
      project_id: PROJECT,
      view_kind: 'bugs',
      name: 'Critical bugs',
      state: { severity: 'P1,P2', module: MODULE },
    });
    expect(item.id).toBe(VIEW);
  });

  test('an empty state is refused before any query (nothing to save)', async () => {
    const { db, calls } = fakeDb([]);
    const e = await failure(async () => createSavedView(db, { userId: USER, projectId: PROJECT }, { ...body, state: {} }));
    expect(e.status).toBe(422);
    expect((e.details as { reason: string }).reason).toBe('state_empty');
    expect(calls).toHaveLength(0);
  });

  test('a state that is invalid for the surface is refused before any query', async () => {
    const { db, calls } = fakeDb([]);
    const e = await failure(async () => createSavedView(db, { userId: USER, projectId: PROJECT }, { ...body, state: { outcome: 'failed' } }));
    expect((e.details as { reason: string }).reason).toBe('state_invalid');
    expect(calls).toHaveLength(0);
  });

  test('a duplicate name is a 409 saved_view_name_taken', async () => {
    const { db } = fakeDb([{ data: null, error: { code: '23505', message: 'duplicate key' } }]);
    const e = await failure(async () => createSavedView(db, { userId: USER, projectId: PROJECT }, body));
    expect(e.status).toBe(409);
    expect((e.details as { reason: string }).reason).toBe('saved_view_name_taken');
  });

  test('the 26th view is a 409 saved_view_limit_reached', async () => {
    const { db } = fakeDb([{ data: null, error: { code: '45100', message: 'saved_view_limit_reached' } }]);
    const e = await failure(async () => createSavedView(db, { userId: USER, projectId: PROJECT }, body));
    expect((e.details as { reason: string }).reason).toBe('saved_view_limit_reached');
  });

  test('a project the caller is not a member of is a 404 project_not_found', async () => {
    const { db } = fakeDb([{ data: null, error: { code: '42501', message: 'rls' } }]);
    const e = await failure(async () => createSavedView(db, { userId: USER, projectId: PROJECT }, body));
    expect(e.status).toBe(404);
    expect((e.details as { reason: string }).reason).toBe('project_not_found');
  });
});

describe('updateSavedView', () => {
  const scope = { userId: USER, projectId: PROJECT, viewId: VIEW };

  test('a rename touches only the name and carries the id, project and user filters', async () => {
    const { db, calls } = fakeDb([{ data: [{ ...ROW, name: 'P1 bugs' }], error: null }]);
    const item = await updateSavedView(db, scope, { name: 'P1 bugs' });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('update');
    expect(calls[0].payload).toEqual({ name: 'P1 bugs' });
    expect(calls[0].filters).toEqual({ id: VIEW, project_id: PROJECT, user_id: USER });
    expect(item.name).toBe('P1 bugs');
  });

  test('a state update first reads the surface through the same filters, then replaces the state', async () => {
    const { db, calls } = fakeDb([{ data: { view_kind: 'bugs' }, error: null }, { data: [ROW], error: null }]);
    await updateSavedView(db, scope, { state: { severity: 'P2,P1' } });
    expect(calls).toHaveLength(2);
    expect(calls[0].filters).toEqual({ id: VIEW, project_id: PROJECT, user_id: USER });
    expect(calls[1].op).toBe('update');
    expect(calls[1].payload).toEqual({ state: { severity: 'P1,P2' } });
    expect(calls[1].filters).toEqual({ id: VIEW, project_id: PROJECT, user_id: USER });
  });

  test('rename and state together send both fields in one update', async () => {
    const { db, calls } = fakeDb([{ data: { view_kind: 'run_history' }, error: null }, { data: [ROW], error: null }]);
    await updateSavedView(db, scope, { name: 'Failing runs', state: { outcome: 'failed' } });
    expect(calls[1].payload).toEqual({ name: 'Failing runs', state: { outcome: 'failed' } });
  });

  test('a state that does not fit the view\'s own surface is refused and nothing is updated', async () => {
    const { db, calls } = fakeDb([{ data: { view_kind: 'run_history' }, error: null }]);
    const e = await failure(async () => updateSavedView(db, scope, { state: { severity: 'P1' } }));
    expect(e.status).toBe(422);
    expect(calls).toHaveLength(1);
  });

  test('an empty replacement state is refused (nothing to save)', async () => {
    const { db } = fakeDb([{ data: { view_kind: 'bugs' }, error: null }]);
    const e = await failure(async () => updateSavedView(db, scope, { state: {} }));
    expect((e.details as { reason: string }).reason).toBe('state_empty');
  });

  test('a view the caller cannot see (foreign or missing) is a 404 before any write', async () => {
    const { db, calls } = fakeDb([{ data: null, error: null }]);
    const e = await failure(async () => updateSavedView(db, scope, { state: { severity: 'P1' } }));
    expect(e.status).toBe(404);
    expect((e.details as { reason: string }).reason).toBe('saved_view_not_found');
    expect(calls).toHaveLength(1);
  });

  test('an update that matches zero rows is the same 404', async () => {
    const { db } = fakeDb([{ data: [], error: null }]);
    const e = await failure(async () => updateSavedView(db, scope, { name: 'x' }));
    expect(e.status).toBe(404);
  });

  test('renaming onto another view\'s name is a 409', async () => {
    const { db } = fakeDb([{ data: null, error: { code: '23505', message: 'duplicate key' } }]);
    const e = await failure(async () => updateSavedView(db, scope, { name: 'Taken' }));
    expect(e.status).toBe(409);
  });
});

describe('deleteSavedView', () => {
  const scope = { userId: USER, projectId: PROJECT, viewId: VIEW };

  test('deletes by id, project and user only', async () => {
    const { db, calls } = fakeDb([{ data: [{ id: VIEW }], error: null }]);
    await deleteSavedView(db, scope);
    expect(calls[0].op).toBe('delete');
    expect(calls[0].filters).toEqual({ id: VIEW, project_id: PROJECT, user_id: USER });
  });

  test('another member\'s view, another project\'s view and a missing id all answer the same 404', async () => {
    const { db } = fakeDb([{ data: [], error: null }]);
    const e = await failure(async () => deleteSavedView(db, scope));
    expect(e.status).toBe(404);
    expect((e.details as { reason: string }).reason).toBe('saved_view_not_found');
  });
});
