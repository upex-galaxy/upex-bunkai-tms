import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import {
  assertRemovalAllowed,
  mapRemoveMemberError,
  REMOVAL_NOT_ADMIN_MESSAGE,
  REMOVAL_NOT_FOUND_MESSAGE,
  REMOVAL_OWNER_MESSAGE,
  REMOVAL_SELF_MESSAGE,
  REMOVAL_SOLE_OWNER_MESSAGE,
} from './response';

// BK-572 — DELETE /api/v1/workspaces/{id}/members/{userId}. The route is a
// thin withApiHandler wrapper; its refusal logic lives in `./response.ts` and
// is tested here with a fake RLS client (the `membership/route.test.ts`
// style). The database's own enforcement of the same refusals is proven
// against the real database in `lib/workspaces/member-removal-isolation.test.ts`.

const WS = '11111111-1111-1111-1111-111111111111';
const CALLER = '22222222-2222-2222-2222-222222222222';
const TARGET = '33333333-3333-3333-3333-333333333333';

interface Row { role: string }

// Answers `from('workspace_members').select().eq(...).maybeSingle()` from a
// user_id -> row map, and records every user_id it was asked about.
function fakeDb(rows: Record<string, Row | null>, asked: string[] = []): SupabaseClient<Database> {
  return {
    from: () => {
      let userId = '';
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => {
          if (column === 'user_id') {
            userId = value;
            asked.push(value);
          }
          return chain;
        },
        maybeSingle: async () => ({ data: rows[userId] ?? null, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

async function refusal(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
  throw new Error('expected a refusal');
}

function syncRefusal(fn: () => never): ApiError {
  try {
    fn();
  }
  catch (err) {
    if (err instanceof ApiError) {
      return err;
    }
    throw err;
  }
}

describe('assertRemovalAllowed — early refusals, in the RPC order (BK-572 Q-D2)', () => {
  const params = { workspaceId: WS, callerId: CALLER, targetId: TARGET };

  it('passes for an Admin removing a Member', async () => {
    expect(await assertRemovalAllowed(fakeDb({ [CALLER]: { role: 'admin' }, [TARGET]: { role: 'member' } }), params)).toBeUndefined();
  });

  it('404 when the caller has no active row (invisible, deleted or unknown workspace), before looking at the target', async () => {
    const asked: string[] = [];
    const err = await refusal(assertRemovalAllowed(fakeDb({ [TARGET]: { role: 'member' } }, asked), params));
    expect(err.status).toBe(404);
    expect(err.message).toBe(REMOVAL_NOT_FOUND_MESSAGE);
    expect(asked).toEqual([CALLER]);
  });

  it('403 not_a_member for a Member or Viewer caller, even when they target themselves (AC-03)', async () => {
    for (const role of ['member', 'viewer']) {
      const err = await refusal(assertRemovalAllowed(fakeDb({ [CALLER]: { role } }), { ...params, targetId: CALLER }));
      expect(err.status).toBe(403);
      expect(err.message).toBe(REMOVAL_NOT_ADMIN_MESSAGE);
      expect(err.details).toEqual({ reason: 'not_a_member' });
    }
  });

  it('409 cannot_remove_self for an Owner or Admin, pointing at Leave (AC-11)', async () => {
    for (const role of ['owner', 'admin']) {
      const asked: string[] = [];
      const err = await refusal(assertRemovalAllowed(fakeDb({ [CALLER]: { role } }, asked), { ...params, targetId: CALLER }));
      expect(err.status).toBe(409);
      expect(err.message).toBe(REMOVAL_SELF_MESSAGE);
      expect(err.details).toEqual({ reason: 'cannot_remove_self', leave_endpoint: `/api/v1/workspaces/${WS}/membership` });
      expect(asked).toEqual([CALLER]);
    }
  });

  it('404 with the SAME body when the target is not an active member (AC-17)', async () => {
    const err = await refusal(assertRemovalAllowed(fakeDb({ [CALLER]: { role: 'owner' } }), params));
    expect(err.status).toBe(404);
    expect(err.message).toBe(REMOVAL_NOT_FOUND_MESSAGE);
  });

  it('403 cannot_remove_owner when an Admin targets an Owner (AC-02, AC-17)', async () => {
    const err = await refusal(assertRemovalAllowed(fakeDb({ [CALLER]: { role: 'admin' }, [TARGET]: { role: 'owner' } }), params));
    expect(err.status).toBe(403);
    expect(err.message).toBe(REMOVAL_OWNER_MESSAGE);
    expect(err.details).toEqual({ reason: 'cannot_remove_owner' });
  });

  it('500 when the membership read itself fails', async () => {
    const db = {
      from: () => {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) };
        return chain;
      },
    } as unknown as SupabaseClient<Database>;
    const err = await refusal(assertRemovalAllowed(db, params));
    expect(err.status).toBe(500);
  });
});

describe('mapRemoveMemberError — the RPC backstop maps the same way (AC-19)', () => {
  const cases: Array<[{ code: string, message: string }, number, unknown]> = [
    [{ code: '42501', message: 'not_authenticated' }, 401, undefined],
    [{ code: '42501', message: 'not_a_member' }, 403, { reason: 'not_a_member' }],
    [{ code: 'P0002', message: 'not_found' }, 404, undefined],
    [{ code: '45220', message: 'cannot_remove_self' }, 409, { reason: 'cannot_remove_self', leave_endpoint: `/api/v1/workspaces/${WS}/membership` }],
    [{ code: '45221', message: 'cannot_remove_owner' }, 403, { reason: 'cannot_remove_owner' }],
    [{ code: '45213', message: 'sole_owner' }, 409, { reason: 'sole_owner' }],
  ];
  for (const [error, status, details] of cases) {
    it(`${error.code} ${error.message} -> ${status}`, () => {
      const err = syncRefusal(() => mapRemoveMemberError(error, WS));
      expect(err.status).toBe(status);
      expect(err.details).toEqual(details);
    });
  }

  it('the sole-owner copy is the designed one', () => {
    expect(syncRefusal(() => mapRemoveMemberError({ code: '45213', message: 'sole_owner' }, WS)).message).toBe(REMOVAL_SOLE_OWNER_MESSAGE);
  });

  it('45213 with another message (0042 step_status_invalid) and the AC-14 failpoint are a 500, never a refusal', () => {
    expect(syncRefusal(() => mapRemoveMemberError({ code: '45213', message: 'step_status_invalid' }, WS)).status).toBe(500);
    expect(syncRefusal(() => mapRemoveMemberError({ code: 'P0001', message: 'test_failpoint' }, WS)).status).toBe(500);
  });
});
