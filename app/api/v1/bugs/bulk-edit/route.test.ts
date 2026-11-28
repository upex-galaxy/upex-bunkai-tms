import type { BugBulkEditBody } from '@lib/bugs/bulk-edit-validation';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, mock, test } from 'bun:test';

// BK-2098 — gate order T4 in the route (Project visible, token workspace) and the
// error mapping of bunkai_bulk_edit_bugs. Doubles stand in for both clients; the
// function itself is proven in lib/bugs/bulk-edit-isolation.test.ts.

void mock.module('server-only', () => ({}));
const { performBugBulkEdit } = await import('./route');

const PROJECT = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const OTHER_WORKSPACE = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';

const BODY: BugBulkEditBody = {
  project_id: PROJECT,
  field: 'status',
  change: { status: 'in_progress' },
  items: [{ id: '22222222-2222-4222-8222-222222222222', version: null }],
  dry_run: true,
};

function userDb(project: { id: string, workspace_id: string } | null) {
  return {
    from: (table: string) => {
      expect(table).toBe('projects');
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            expect([column, value]).toEqual(['id', PROJECT]);
            return { maybeSingle: async () => ({ data: project, error: null }) };
          },
        }),
      };
    },
  };
}

function admin(result: { data: unknown, error: { code?: string, message: string } | null }) {
  const calls: Array<{ fn: string, args: Record<string, unknown> }> = [];
  return {
    calls,
    client: { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return result; } },
  };
}

function principal(via: 'cookie' | 'bearer', workspaceId: string | null, project: { id: string, workspace_id: string } | null = { id: PROJECT, workspace_id: WORKSPACE }) {
  return { userId: USER, workspaceId, via, db: userDb(project) } as never;
}

async function failure(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  }
  catch (error) {
    if (error instanceof ApiError) { return error; }
    throw error;
  }
  throw new Error('expected an ApiError');
}

describe('performBugBulkEdit', () => {
  test('a Project the caller cannot see is 404 and the function is never called', async () => {
    const a = admin({ data: {}, error: null });
    const error = await failure(async () => performBugBulkEdit(principal('cookie', null, null), BODY, a.client as never));
    expect([error.status, error.code]).toEqual([404, 'not_found']);
    expect(a.calls).toHaveLength(0);
  });

  test('a token scoped to another workspace is 403 token_workspace_mismatch before the function runs', async () => {
    const a = admin({ data: {}, error: null });
    const error = await failure(async () => performBugBulkEdit(principal('bearer', OTHER_WORKSPACE), BODY, a.client as never));
    expect([error.status, error.details]).toEqual([403, { reason: 'token_workspace_mismatch' }]);
    expect(a.calls).toHaveLength(0);
  });

  test('a token of the same workspace, an unscoped token and a cookie reach the function with the principal as actor', async () => {
    for (const p of [principal('bearer', WORKSPACE.toUpperCase()), principal('bearer', null), principal('cookie', null)]) {
      const a = admin({ data: { requested: 1 }, error: null });
      expect(await performBugBulkEdit(p, BODY, a.client as never)).toEqual({ requested: 1 });
      expect(a.calls).toEqual([{
        fn: 'bunkai_bulk_edit_bugs',
        args: {
          p_actor_user_id: USER,
          p_project_id: PROJECT,
          p_items: BODY.items,
          p_field: 'status',
          p_change: { status: 'in_progress' },
          p_dry_run: true,
        },
      }]);
    }
  });

  test.each([
    ['P0002', 404, 'not_found', 'not_found'],
    ['42501', 403, 'forbidden', 'insufficient_role'],
    ['45701', 422, 'project_read_only', 'project_read_only'],
    ['45319', 422, 'validation_failed', 'bulk_selection_invalid'],
    ['45320', 422, 'validation_failed', 'bulk_change_invalid'],
  ])('maps %s to %i %s', async (code, status, apiCode, reason) => {
    const a = admin({ data: null, error: { code, message: 'raw' } });
    const error = await failure(async () => performBugBulkEdit(principal('cookie', null), BODY, a.client as never));
    expect([error.status, error.code, error.details]).toEqual([status, apiCode, { reason }]);
  });

  test('a missing execute grant is a generic 500, never a role error', async () => {
    const a = admin({ data: null, error: { code: '42501', message: 'permission denied for function bunkai_bulk_edit_bugs' } });
    const original = console.error;
    console.error = () => {};
    try {
      const error = await failure(async () => performBugBulkEdit(principal('cookie', null), BODY, a.client as never));
      expect([error.status, error.message]).toEqual([500, 'Failed to bulk-edit Bugs.']);
    }
    finally {
      console.error = original;
    }
  });

  test('an unexpected database error is a generic 500 without the raw text', async () => {
    const a = admin({ data: null, error: { code: 'XX000', message: 'relation secret_table does not exist' } });
    const original = console.error;
    console.error = () => {};
    try {
      const error = await failure(async () => performBugBulkEdit(principal('cookie', null), BODY, a.client as never));
      expect([error.status, error.message]).toEqual([500, 'Failed to bulk-edit Bugs.']);
    }
    finally {
      console.error = original;
    }
  });
});
