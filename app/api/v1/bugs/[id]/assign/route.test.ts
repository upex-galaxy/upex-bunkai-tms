import type { ApiErrorCode } from '@lib/api/error-envelope';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, mock } from 'bun:test';

// The route imports `@lib/api/handler`, which pulls in `server-only`
// (transitively via `@lib/api/principal`); shim it so the module graph loads
// under Bun, then import the testable exports. Same convention as
// app/api/v1/bugs/route.test.ts / app/api/v1/runs/route.test.ts.
void mock.module('server-only', () => ({}));
const { performBugAssign } = await import('./route');
const { ApiError } = await import('@lib/api/error-envelope');

// BK-264 (Slice 2) — POST /api/v1/bugs/{id}/assign. No dedicated
// NextRequest/ctx test harness exists in this repo (see
// app/api/v1/bugs/route.test.ts's own header), so — same isolation style —
// this exercises the route's own extracted pure/DB-parametrized piece
// (`performBugAssign`) directly, with a fake `db` that mocks `.rpc()`.
//
// The RPC's own DB-level authorization + adjacency + audit-log behavior is
// ALREADY proven against a real database in Slice 1's
// `lib/bugs/assign-bug-isolation.test.ts` (non-member/Viewer rejection,
// actor-bind, reassign/unassign, no-op). These tests instead prove the
// HTTP-layer wiring: the RPC is called with the right args, its success
// payload passes through unchanged, and every SQLSTATE it can raise maps to
// the exact HTTP status/code this slice's briefing specifies.

const BUG_ID = '11111111-1111-4111-8111-111111111111';
const ASSIGNEE_ID = '22222222-2222-4222-8222-222222222222';

interface RpcCall { fn: string, args: unknown }

function fakeRpcDb(response: { data: unknown, error: { code?: string, message: string } | null }, calls: RpcCall[] = []): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return response;
    },
  } as unknown as SupabaseClient<Database>;
}

async function expectApiError(promise: Promise<unknown>, code: ApiErrorCode, status: number): Promise<void> {
  try {
    await promise;
    throw new Error('expected an ApiError but none was thrown');
  }
  catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).code).toBe(code);
    expect((err as InstanceType<typeof ApiError>).status).toBe(status);
  }
}

describe('performBugAssign', () => {
  it('happy path: assigns to a new assignee and calls bunkai_assign_bug with the exact args', async () => {
    const calls: RpcCall[] = [];
    const bug = { id: BUG_ID, assignee_user_id: ASSIGNEE_ID };
    const db = fakeRpcDb({ data: bug, error: null }, calls);

    const result = await performBugAssign(db, { bugId: BUG_ID, assigneeUserId: ASSIGNEE_ID });

    expect(result).toEqual(bug);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('bunkai_assign_bug');
    expect(calls[0].args).toEqual({ p_bug_id: BUG_ID, p_assignee_user_id: ASSIGNEE_ID });
  });

  it('reassign: a second assign call to a different assignee succeeds and returns the updated bug', async () => {
    const otherAssigneeId = '33333333-3333-4333-8333-333333333333';
    const bug = { id: BUG_ID, assignee_user_id: otherAssigneeId };
    const db = fakeRpcDb({ data: bug, error: null });

    const result = await performBugAssign(db, { bugId: BUG_ID, assigneeUserId: otherAssigneeId });

    expect(result).toEqual(bug);
  });

  it('unassign: assigneeUserId null calls the RPC with p_assignee_user_id undefined (Postgres default null)', async () => {
    const calls: RpcCall[] = [];
    const bug = { id: BUG_ID, assignee_user_id: null };
    const db = fakeRpcDb({ data: bug, error: null }, calls);

    const result = await performBugAssign(db, { bugId: BUG_ID, assigneeUserId: null });

    expect(result).toEqual(bug);
    expect(calls[0].args).toEqual({ p_bug_id: BUG_ID, p_assignee_user_id: undefined });
  });

  it('assignee-not-a-member (45312) maps to 422 validation_failed', async () => {
    const db = fakeRpcDb({ data: null, error: { code: '45312', message: 'bug_assignee_not_workspace_member' } });
    await expectApiError(
      performBugAssign(db, { bugId: BUG_ID, assigneeUserId: ASSIGNEE_ID }),
      'validation_failed',
      422,
    );
  });

  it('assignee-view-only (45313) maps to 422 validation_failed', async () => {
    const db = fakeRpcDb({ data: null, error: { code: '45313', message: 'bug_assignee_view_only' } });
    await expectApiError(
      performBugAssign(db, { bugId: BUG_ID, assigneeUserId: ASSIGNEE_ID }),
      'validation_failed',
      422,
    );
  });

  it('caller-not-a-member (P0002) maps to 404 not_found with the generic "Bug not found" message (non-disclosure)', async () => {
    const db = fakeRpcDb({ data: null, error: { code: 'P0002', message: 'bug_not_found' } });
    try {
      await performBugAssign(db, { bugId: BUG_ID, assigneeUserId: ASSIGNEE_ID });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe('not_found');
      expect((err as InstanceType<typeof ApiError>).status).toBe(404);
      expect((err as InstanceType<typeof ApiError>).message).toBe('Bug not found.');
    }
  });

  it('caller-view-only (42501) maps to 403 forbidden', async () => {
    const db = fakeRpcDb({ data: null, error: { code: '42501', message: 'forbidden' } });
    await expectApiError(
      performBugAssign(db, { bugId: BUG_ID, assigneeUserId: ASSIGNEE_ID }),
      'forbidden',
      403,
    );
  });
});
