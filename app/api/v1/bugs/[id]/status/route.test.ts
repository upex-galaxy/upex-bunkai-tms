import type { ApiErrorCode } from '@lib/api/error-envelope';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, mock } from 'bun:test';

// The route imports `@lib/api/handler`, which pulls in `server-only`
// (transitively via `@lib/api/principal`); shim it so the module graph loads
// under Bun, then import the testable exports. Same convention as the
// sibling app/api/v1/bugs/[id]/assign/route.test.ts.
void mock.module('server-only', () => ({}));
const { performBugStatusTransition } = await import('./route');
const { ApiError } = await import('@lib/api/error-envelope');

// BK-264 (Slice 2) — POST /api/v1/bugs/{id}/status. Same isolation style as
// the sibling /assign route's test: no live NextRequest/ctx harness exists in
// this repo, so this exercises `performBugStatusTransition` directly with a
// fake `db` that mocks `.rpc()`. The RPC's own DB-level adjacency +
// authorization + audit-log behavior is already proven against a real
// database in Slice 1's `lib/bugs/transition-bug-status-isolation.test.ts`
// (skip/backward rejection, non-member/Viewer rejection, full lifecycle).
// These tests instead prove the HTTP-layer wiring: the RPC is called with the
// right args, and every SQLSTATE it can raise maps to the exact HTTP
// status/code this slice's briefing specifies.

const BUG_ID = '11111111-1111-4111-8111-111111111111';

interface RpcCall { fn: string, args: unknown }

// `currentStatus`, when given, backs the `.from('bugs').select('status')...`
// follow-up read `performBugStatusTransition` issues ONLY on the 45310 error
// path (review fix — see route.ts + lib/bugs/errors.ts's 45310 case).
function fakeRpcDb(
  response: { data: unknown, error: { code?: string, message: string } | null },
  calls: RpcCall[] = [],
  currentStatus?: string,
): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return response;
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: currentStatus ? { status: currentStatus } : null, error: null }),
        }),
      }),
    }),
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

describe('performBugStatusTransition', () => {
  it.each([
    ['open', 'in_progress'],
    ['in_progress', 'resolved'],
    ['resolved', 'closed'],
  ])('valid transition %s -> %s calls bunkai_transition_bug_status with the exact args and returns the updated bug', async (_from, to) => {
    const calls: RpcCall[] = [];
    const bug = { id: BUG_ID, status: to };
    const db = fakeRpcDb({ data: bug, error: null }, calls);

    const result = await performBugStatusTransition(db, { bugId: BUG_ID, newStatus: to });

    expect(result).toEqual(bug);
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('bunkai_transition_bug_status');
    expect(calls[0].args).toEqual({ p_bug_id: BUG_ID, p_new_status: to });
  });

  it('skip-stage transition (45310) maps to 422 validation_failed, naming the actual next required stage', async () => {
    const db = fakeRpcDb({ data: null, error: { code: '45310', message: 'bug_status_transition_skipped' } }, [], 'open');
    try {
      await performBugStatusTransition(db, { bugId: BUG_ID, newStatus: 'resolved' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe('validation_failed');
      expect((err as InstanceType<typeof ApiError>).status).toBe(422);
      expect((err as InstanceType<typeof ApiError>).details).toEqual({ reason: 'status_transition_skipped' });
      expect((err as InstanceType<typeof ApiError>).message).toBe('A bug must move to \'in_progress\' first.');
    }
  });

  it('backward-move transition (45311) maps to 422 validation_failed with a backward-specific reason', async () => {
    const db = fakeRpcDb({ data: null, error: { code: '45311', message: 'bug_status_transition_backward' } });
    try {
      await performBugStatusTransition(db, { bugId: BUG_ID, newStatus: 'open' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe('validation_failed');
      expect((err as InstanceType<typeof ApiError>).status).toBe(422);
      expect((err as InstanceType<typeof ApiError>).details).toEqual({ reason: 'status_transition_backward' });
    }
  });

  it('caller-not-a-member (P0002) maps to 404 not_found with the generic "Bug not found" message (non-disclosure)', async () => {
    const db = fakeRpcDb({ data: null, error: { code: 'P0002', message: 'bug_not_found' } });
    try {
      await performBugStatusTransition(db, { bugId: BUG_ID, newStatus: 'in_progress' });
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
      performBugStatusTransition(db, { bugId: BUG_ID, newStatus: 'in_progress' }),
      'forbidden',
      403,
    );
  });
});
