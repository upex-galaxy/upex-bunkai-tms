import type { AccessTokenScope } from '@lib/api/pat';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { assertNoGlobalAdminScope, assertTokenIssuanceAuthorized } from '@lib/api/pat';
import { describe, expect, it } from 'bun:test';

// BK-135 / ADR-0005 — unit guard for the PAT issuance role-gate. Pure-unit: the
// workspace_members lookup is satisfied by a fake chainable client, so no DB is
// required. Asserts the authorization rules that close the privilege-escalation
// hole (member self-issuing workspace:admin, global admin tokens, foreign
// workspace membership) plus the legitimate paths that must still succeed.

interface MembershipResult { data: { role: string } | null, error: { message: string } | null }

// Minimal stand-in for the chain the helper calls:
//   db.from('workspace_members').select('role').eq().eq().eq().maybeSingle()
function fakeDb(result: MembershipResult): SupabaseClient<Database> {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient<Database>;
}

// db that throws if it is ever consulted — proves a code path short-circuits
// before touching the database.
const NEVER_DB = {
  from() { throw new Error('db must not be queried on this path'); },
} as unknown as SupabaseClient<Database>;

async function expectForbidden(promise: Promise<unknown>, match: RegExp): Promise<void> {
  try {
    await promise;
    throw new Error('expected ApiError(forbidden) but none was thrown');
  }
  catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('forbidden');
    expect((err as ApiError).message).toMatch(match);
  }
}

const ADMIN_SCOPES: AccessTokenScope[] = ['atc:read', 'workspace:admin'];
const READ_SCOPES: AccessTokenScope[] = ['atc:read', 'atc:write'];
const WS = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

describe('assertNoGlobalAdminScope', () => {
  it('rejects an explicit workspace:admin scope', () => {
    expect(() => assertNoGlobalAdminScope(ADMIN_SCOPES)).toThrow(ApiError);
  });

  it('allows non-admin scopes', () => {
    expect(() => assertNoGlobalAdminScope(READ_SCOPES)).not.toThrow();
  });
});

describe('assertTokenIssuanceAuthorized', () => {
  it('403s a member self-issuing workspace:admin (workspace-scoped)', async () => {
    await expectForbidden(
      assertTokenIssuanceAuthorized({
        db: fakeDb({ data: { role: 'member' }, error: null }),
        userId: USER,
        scopes: ADMIN_SCOPES,
        workspaceId: WS,
      }),
      /admins or owners/i,
    );
  });

  it('403s workspace:admin requested without a workspace_id (no global admin)', async () => {
    await expectForbidden(
      assertTokenIssuanceAuthorized({
        db: NEVER_DB,
        userId: USER,
        scopes: ADMIN_SCOPES,
        workspaceId: null,
      }),
      /must target a specific workspace/i,
    );
  });

  it('allows an admin to issue workspace:admin in their workspace', async () => {
    await assertTokenIssuanceAuthorized({
      db: fakeDb({ data: { role: 'admin' }, error: null }),
      userId: USER,
      scopes: ADMIN_SCOPES,
      workspaceId: WS,
    });
  });

  it('allows an owner to issue workspace:admin in their workspace', async () => {
    await assertTokenIssuanceAuthorized({
      db: fakeDb({ data: { role: 'owner' }, error: null }),
      userId: USER,
      scopes: ADMIN_SCOPES,
      workspaceId: WS,
    });
  });

  it('403s issuing a workspace-scoped token for a workspace the caller is not a member of', async () => {
    await expectForbidden(
      assertTokenIssuanceAuthorized({
        db: fakeDb({ data: null, error: null }),
        userId: USER,
        scopes: READ_SCOPES,
        workspaceId: WS,
      }),
      /not a member/i,
    );
  });

  it('allows a member to issue non-admin scopes in their own workspace', async () => {
    await assertTokenIssuanceAuthorized({
      db: fakeDb({ data: { role: 'member' }, error: null }),
      userId: USER,
      scopes: READ_SCOPES,
      workspaceId: WS,
    });
  });

  it('allows a global (NULL workspace) token with non-admin scopes only', async () => {
    await assertTokenIssuanceAuthorized({
      db: NEVER_DB,
      userId: USER,
      scopes: READ_SCOPES,
      workspaceId: null,
    });
  });
});
