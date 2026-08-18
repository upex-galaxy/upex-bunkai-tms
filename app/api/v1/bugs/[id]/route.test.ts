import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, mock } from 'bun:test';

// Same shim + isolation-style convention as the sibling `/assign` and
// `/status` route tests: exercise the route's own extracted pure/DB-
// parametrized piece (`performBugDetailRead`) with a fake `db` that mocks
// `.rpc()`. The composer's DB-level RLS-scoping behavior is proven against a
// real database in `lib/bugs/detail-isolation.test.ts` — these tests instead
// prove the HTTP-layer wiring: the RPC is called with the right args, its
// success payload passes through unchanged, and a null composer result maps
// to the exact 404 Scenario E-1/E-2 specify.
void mock.module('server-only', () => ({}));
const { performBugDetailRead } = await import('./route');
const { ApiError } = await import('@lib/api/error-envelope');

const BUG_ID = '11111111-1111-4111-8111-111111111111';

interface RpcCall { fn: string, args: unknown }

function fakeRpcDb(response: { data: unknown, error: { code?: string, message: string } | null }, calls: RpcCall[] = []): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return response;
    },
  } as unknown as SupabaseClient<Database>;
}

describe('performBugDetailRead', () => {
  it('happy path: calls bunkai_bug_json with the exact args and returns the composed payload unchanged', async () => {
    const calls: RpcCall[] = [];
    const bug = { id: BUG_ID, title: 'Something broke', origin: null };
    const db = fakeRpcDb({ data: bug, error: null }, calls);

    const result = await performBugDetailRead(db, BUG_ID);

    expect(result).toBe(bug);
    expect(calls).toEqual([{ fn: 'bunkai_bug_json', args: { p_bug_id: BUG_ID } }]);
  });

  it('a null composer result (missing OR RLS-hidden bug — Scenario E-1) throws the generic not_found 404', async () => {
    const db = fakeRpcDb({ data: null, error: null });

    try {
      await performBugDetailRead(db, BUG_ID);
      throw new Error('expected an ApiError but none was thrown');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe('not_found');
      expect((err as InstanceType<typeof ApiError>).status).toBe(404);
      expect((err as InstanceType<typeof ApiError>).message).toBe('Bug not found.');
    }
  });

  it('an unexpected RPC error maps to internal_error rather than being swallowed', async () => {
    const db = fakeRpcDb({ data: null, error: { code: '55000', message: 'boom' } });

    try {
      await performBugDetailRead(db, BUG_ID);
      throw new Error('expected an ApiError but none was thrown');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe('internal_error');
    }
  });
});
