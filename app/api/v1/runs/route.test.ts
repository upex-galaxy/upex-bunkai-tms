import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it, mock } from 'bun:test';

// The route imports `@lib/supabase/admin`, which pulls in `server-only`; shim
// it so the module graph loads under Bun, then import the testable function.
// Same convention as lib/jira/import-runner.test.ts / lib/api/auth-coexistence.test.ts.
void mock.module('server-only', () => ({}));
const { resolveRunWorkspaceId } = await import('./route');

// BK-182 — regression test. POST /api/v1/runs resolves the active workspace
// for its Idempotency-Key namespace via `resolveRunWorkspaceId`. The pre-fix
// code only ran the workspace-fallback query `if (!workspaceId &&
// principal.via === 'cookie')`, so a Bearer/PAT caller whose token was not
// bound to a specific workspace (`principal.workspaceId === null`, the normal
// shape for a PAT issued without a workspace scope — see
// `lib/api/principal.ts`'s `resolveIdentity`) had NO fallback path at all:
// `workspaceId` stayed `null` and the route threw
// `validation_failed: "No active workspace could be resolved for this
// request."` even though `/api/v1/me` proved the same caller has an active
// workspace. The fix reuses `resolveActiveWorkspaceId` (the same helper
// `/api/v1/me` already uses successfully for both auth methods) unconditionally,
// passing `null` as the cookie value for bearer callers — which
// `resolveActiveWorkspaceId` already treats as "fall back to the first/oldest
// visible workspace".
//
// No dedicated NextRequest/ctx test harness exists in this repo (see
// workspaces/[id]/membership/route.test.ts), so — same isolation style —
// this exercises the DB-parametrized `resolveRunWorkspaceId` function
// directly with a fake chainable `db`.

const WS_OLDEST = '11111111-1111-1111-1111-111111111111';
const WS_NEWER = '22222222-2222-2222-2222-222222222222';
const WS_BOUND = '33333333-3333-3333-3333-333333333333';

interface WorkspacesResult { data: { id: string }[] | null, error: { message: string } | null }

// Minimal stand-in for `db.from('workspaces').select('id').order(...)`.
function fakeDb(result: WorkspacesResult): SupabaseClient<Database> {
  const chain = {
    select: () => chain,
    order: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient<Database>;
}

// db that throws if it is ever consulted — proves the token-bound-workspace
// short-circuit never touches the database.
const NEVER_DB = {
  from() { throw new Error('db must not be queried on this path'); },
} as unknown as SupabaseClient<Database>;

describe('resolveRunWorkspaceId (BK-182)', () => {
  it('regression: a Bearer caller with no workspace-bound token (workspaceId: null) falls back to the first/oldest membership instead of resolving to null', async () => {
    const db = fakeDb({ data: [{ id: WS_OLDEST }, { id: WS_NEWER }], error: null });

    const result = await resolveRunWorkspaceId(db, { workspaceId: null, via: 'bearer' }, null);

    // Pre-fix, this would have been `null` (the fallback query never ran for a
    // bearer caller), which the route then rejected with `validation_failed`.
    expect(result).toBe(WS_OLDEST);
    expect(result).not.toBeNull();
  });

  it('a Bearer caller with a workspace-bound token resolves to that workspace without querying the db', async () => {
    const result = await resolveRunWorkspaceId(NEVER_DB, { workspaceId: WS_BOUND, via: 'bearer' }, null);

    expect(result).toBe(WS_BOUND);
  });

  it('a cookie caller whose active-workspace cookie matches a visible workspace resolves to that workspace', async () => {
    const db = fakeDb({ data: [{ id: WS_OLDEST }, { id: WS_NEWER }], error: null });

    const result = await resolveRunWorkspaceId(db, { workspaceId: null, via: 'cookie' }, WS_NEWER);

    expect(result).toBe(WS_NEWER);
  });

  it('a cookie caller with no cookie value falls back to the first/oldest membership (unchanged behavior)', async () => {
    const db = fakeDb({ data: [{ id: WS_OLDEST }, { id: WS_NEWER }], error: null });

    const result = await resolveRunWorkspaceId(db, { workspaceId: null, via: 'cookie' }, null);

    expect(result).toBe(WS_OLDEST);
  });

  it('a cookie caller\'s cookie value is ignored for a bearer caller — bearer always falls back to the first membership', async () => {
    const db = fakeDb({ data: [{ id: WS_OLDEST }, { id: WS_NEWER }], error: null });

    // Even if a stray cookie value were somehow passed in for a bearer caller,
    // resolveRunWorkspaceId must not honour it — only cookie principals do.
    const result = await resolveRunWorkspaceId(db, { workspaceId: null, via: 'bearer' }, WS_NEWER);

    expect(result).toBe(WS_OLDEST);
  });

  it('returns null when the caller has no visible workspaces at all', async () => {
    const db = fakeDb({ data: [], error: null });

    const result = await resolveRunWorkspaceId(db, { workspaceId: null, via: 'bearer' }, null);

    expect(result).toBeNull();
  });

  it('throws internal_error when the workspaces query fails', async () => {
    const db = fakeDb({ data: null, error: { message: 'connection reset' } });

    try {
      await resolveRunWorkspaceId(db, { workspaceId: null, via: 'bearer' }, null);
      throw new Error('expected to throw');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('internal_error');
    }
  });
});
