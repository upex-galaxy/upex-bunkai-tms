import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { assertCanCreateProject, mapCreateProjectError } from './response';

// BK-992 — POST /api/v1/workspaces/{id}/projects returned 422
// project_limit_reached for a non-existent workspace because the 0077
// BEFORE INSERT trigger fires ahead of the RLS WITH CHECK. The route now gates
// on `bunkai_can_write_workspace` first; these tests pin that gate and the
// insert-error mapping with a fake-chainable `db` (house convention, see
// `notifications/route.test.ts`).

const MEMBER_WS = '11111111-1111-1111-1111-111111111111';
const FOREIGN_WS = '99999999-9999-9999-9999-999999999999';
const MISSING_WS = '00000000-0000-0000-0000-000000000000';
const DELETED_WS = '22222222-2222-2222-2222-222222222222';

interface RpcCall { fn: string, args: unknown }

// `bunkai_can_write_workspace` returns false for a workspace the caller is
// not a writer of, for an id that does not exist, and for a soft-deleted
// workspace (0084 `deleted_at is null` guard); the fake mirrors that.
function fakeDb(writable: Set<string>, calls: RpcCall[] = []): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: { ws_id: string }) => {
      calls.push({ fn, args });
      if (fn === 'bunkai_can_write_workspace') {
        return { data: writable.has(args.ws_id), error: null };
      }
      throw new Error(`unexpected rpc: ${fn}`);
    },
  } as unknown as SupabaseClient<Database>;
}

async function captureError(run: () => Promise<unknown> | unknown): Promise<ApiError> {
  try {
    await run();
  }
  catch (err) {
    return err as ApiError;
  }
  throw new Error('expected to throw');
}

function envelope(err: ApiError) {
  return { status: err.status, code: err.code, message: err.message, details: err.details };
}

describe('assertCanCreateProject', () => {
  it('rejects a non-existent workspace with 403 not_a_member', async () => {
    const err = await captureError(async () => assertCanCreateProject(fakeDb(new Set([MEMBER_WS])), MISSING_WS));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.details).toEqual({ reason: 'not_a_member' });
  });

  it('gives a non-existent and a foreign workspace the identical response (non-disclosure)', async () => {
    const db = fakeDb(new Set([MEMBER_WS]));
    const missing = await captureError(async () => assertCanCreateProject(db, MISSING_WS));
    const foreign = await captureError(async () => assertCanCreateProject(db, FOREIGN_WS));
    expect(envelope(missing)).toEqual(envelope(foreign));
  });

  it('gives a soft-deleted workspace the same 403 as a foreign one (BK-991 consistency)', async () => {
    const db = fakeDb(new Set([MEMBER_WS]));
    const deleted = await captureError(async () => assertCanCreateProject(db, DELETED_WS));
    const foreign = await captureError(async () => assertCanCreateProject(db, FOREIGN_WS));
    expect(envelope(deleted)).toEqual(envelope(foreign));
  });

  it('lets a writer through and asks the same predicate as the insert policy', async () => {
    const calls: RpcCall[] = [];
    await assertCanCreateProject(fakeDb(new Set([MEMBER_WS]), calls), MEMBER_WS);
    expect(calls).toEqual([{ fn: 'bunkai_can_write_workspace', args: { ws_id: MEMBER_WS } }]);
  });

  it('maps an RPC failure to 500 internal_error instead of a false 403', async () => {
    const db = {
      rpc: async () => ({ data: null, error: { code: '08006', message: 'connection failure' } }),
    } as unknown as SupabaseClient<Database>;
    const err = await captureError(async () => assertCanCreateProject(db, MEMBER_WS));
    expect(err.status).toBe(500);
    expect(err.code).toBe('internal_error');
  });
});

describe('mapCreateProjectError', () => {
  it('keeps the plan-limit path for members: 45700 -> 422 project_limit_reached', async () => {
    const err = await captureError(() => mapCreateProjectError({ code: '45700', message: 'project_limit_reached' }));
    expect(err.status).toBe(422);
    expect(err.code).toBe('project_limit_reached');
    expect(err.details).toEqual({ reason: 'project_limit_reached' });
  });

  it('maps 42501 to the same 403 not_a_member envelope as the pre-insert gate', async () => {
    const fromInsert = await captureError(() => mapCreateProjectError({ code: '42501', message: 'new row violates row-level security policy' }));
    const fromGate = await captureError(async () => assertCanCreateProject(fakeDb(new Set()), FOREIGN_WS));
    expect(envelope(fromInsert)).toEqual(envelope(fromGate));
  });

  it('maps 23505 to 409 slug_duplicate_in_workspace', async () => {
    const err = await captureError(() => mapCreateProjectError({ code: '23505', message: 'duplicate key' }));
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ reason: 'slug_duplicate_in_workspace' });
  });

  it('maps anything else to 500 internal_error', async () => {
    const err = await captureError(() => mapCreateProjectError({ code: '99999', message: 'boom' }));
    expect(err.status).toBe(500);
  });
});

describe('route wiring', () => {
  it('runs the access gate before the projects insert', () => {
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    const gate = source.indexOf('await assertCanCreateProject(db, workspaceId)');
    const insert = source.indexOf('.from(\'projects\')');
    expect(gate).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(gate);
  });
});
