import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { mapLeaveWorkspaceError, resolveNewActiveWorkspace } from './response';

// BK-90 (Slice A) — DELETE /api/v1/workspaces/{id}/membership. The route
// itself is a thin `withApiHandler` wrapper (no dedicated test harness for
// mocking NextRequest/ctx exists in this repo); every branch that needs
// coverage lives in the pure/DB-parametrized functions in `./response.ts`,
// tested directly — same isolation style as `workspaces/route.test.ts` /
// `me/active-workspace/route.test.ts` for pure transforms, and the same
// fake-chainable-`db` + throwing-`NEVER_DB` style `lib/api/pat.test.ts` uses
// for DB-parametrized business logic.

const USER = '22222222-2222-2222-2222-222222222222';
const LEFT_WS = '11111111-1111-1111-1111-111111111111';
const OTHER_WS = '33333333-3333-3333-3333-333333333333';

// db that throws if it is ever consulted — proves the "not the active
// workspace" branch short-circuits before touching the database (mirrors
// `lib/api/pat.test.ts`'s NEVER_DB).
const NEVER_DB = {
  from() { throw new Error('db must not be queried on this path'); },
} as unknown as SupabaseClient<Database>;

interface MembershipsResult { data: { workspace_id: string }[] | null, error: { message: string } | null }
interface WorkspaceNameResult { data: { name: string } | null, error: { message: string } | null }

// Minimal stand-in for the two chains resolveNewActiveWorkspace calls:
//   db.from('workspace_members').select().eq().eq().order()
//   db.from('workspaces').select().eq().maybeSingle()
function fakeDb(memberships: MembershipsResult, workspaceName?: WorkspaceNameResult): SupabaseClient<Database> {
  const membershipsChain = {
    select: () => membershipsChain,
    eq: () => membershipsChain,
    order: async () => memberships,
  };
  const workspaceChain = {
    select: () => workspaceChain,
    eq: () => workspaceChain,
    maybeSingle: async () => workspaceName,
  };
  return {
    from: (table: string) => (table === 'workspace_members' ? membershipsChain : workspaceChain),
  } as unknown as SupabaseClient<Database>;
}

// BK-90's bearer-rejection guard used to be unit-tested here against the
// `assertSessionOnly` helper. BK-499 lifted it into the route's
// `auth: 'cookie-only'` posture, so it is covered where it is now enforced:
// the exact 403 message is pinned per handler in
// `lib/api/route-capability-coverage.test.ts`, and the rejection is driven
// through the real exported DELETE with a real minted PAT in
// `lib/api/capability-enforcement.test.ts`.

describe('mapLeaveWorkspaceError (BK-90)', () => {
  it('maps not_authenticated (42501) to 401 unauthorized', () => {
    try {
      mapLeaveWorkspaceError({ code: '42501', message: 'not_authenticated' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('unauthorized');
      expect((err as ApiError).status).toBe(401);
    }
  });

  it('maps not_a_member (P0002) to 404 not_found', () => {
    try {
      mapLeaveWorkspaceError({ code: 'P0002', message: 'not_a_member' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('not_found');
      expect((err as ApiError).status).toBe(404);
    }
  });

  it('maps last_membership (45212) to 409 conflict with a reason detail', () => {
    try {
      mapLeaveWorkspaceError({ code: '45212', message: 'last_membership' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('conflict');
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).details).toEqual({ reason: 'last_membership' });
    }
  });

  it('maps sole_owner (45213) to 409 conflict with a reason detail', () => {
    try {
      mapLeaveWorkspaceError({ code: '45213', message: 'sole_owner' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('conflict');
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).details).toEqual({ reason: 'sole_owner' });
    }
  });

  it('maps an unrecognized error code to 500 internal_error', () => {
    try {
      mapLeaveWorkspaceError({ code: '99999', message: 'boom' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('internal_error');
      expect((err as ApiError).status).toBe(500);
    }
  });
});

describe('resolveNewActiveWorkspace (BK-90 — Integration/BR-1)', () => {
  it('happy path: leaving a NON-active workspace short-circuits with nulls and never queries the db', async () => {
    const result = await resolveNewActiveWorkspace(NEVER_DB, {
      userId: USER,
      leftWorkspaceId: LEFT_WS,
      currentActiveId: OTHER_WS,
    });

    expect(result).toEqual({ newActiveWorkspaceId: null, newActiveWorkspaceName: null });
  });

  it('happy path: leaving the ACTIVE workspace re-resolves against the remaining memberships and returns the new id + name', async () => {
    const db = fakeDb(
      { data: [{ workspace_id: OTHER_WS }], error: null },
      { data: { name: 'Beta Co' }, error: null },
    );

    const result = await resolveNewActiveWorkspace(db, {
      userId: USER,
      leftWorkspaceId: LEFT_WS,
      currentActiveId: LEFT_WS,
    });

    expect(result).toEqual({ newActiveWorkspaceId: OTHER_WS, newActiveWorkspaceName: 'Beta Co' });
  });

  it('orders the re-resolution oldest-membership-first, matching resolveActiveWorkspaceId (BR-1)', async () => {
    const OLDEST_WS = '44444444-4444-4444-4444-444444444444';
    // The fake `order()` already returns rows in the order the "query" would
    // (oldest first) — this asserts resolveNewActiveWorkspace picks element
    // [0], not last, when the underlying query is BR-1-ordered.
    const db = fakeDb(
      { data: [{ workspace_id: OLDEST_WS }, { workspace_id: OTHER_WS }], error: null },
      { data: { name: 'Oldest Co' }, error: null },
    );

    const result = await resolveNewActiveWorkspace(db, {
      userId: USER,
      leftWorkspaceId: LEFT_WS,
      currentActiveId: LEFT_WS,
    });

    expect(result.newActiveWorkspaceId).toBe(OLDEST_WS);
  });

  it('defensive backstop: returns nulls when no active memberships remain (should not occur — the RPC blocks a last_membership leave)', async () => {
    const db = fakeDb({ data: [], error: null });

    const result = await resolveNewActiveWorkspace(db, {
      userId: USER,
      leftWorkspaceId: LEFT_WS,
      currentActiveId: LEFT_WS,
    });

    expect(result).toEqual({ newActiveWorkspaceId: null, newActiveWorkspaceName: null });
  });

  it('throws internal_error when the memberships query fails', async () => {
    const db = fakeDb({ data: null, error: { message: 'connection reset' } });

    try {
      await resolveNewActiveWorkspace(db, {
        userId: USER,
        leftWorkspaceId: LEFT_WS,
        currentActiveId: LEFT_WS,
      });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('internal_error');
    }
  });
});
