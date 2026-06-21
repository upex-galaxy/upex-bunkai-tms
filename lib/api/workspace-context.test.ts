import type { Principal } from '@lib/api/principal';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it, mock } from 'bun:test';

// BK-167 / ADR-0006 — unit guard for the workspace context match. A bearer PAT
// may only act on the workspace it is scoped to; a null-scoped token cannot
// perform workspace-admin operations; cookie sessions (trusted UI) pass through.
//
// principal.ts imports `server-only` (via the impersonation client); shim it so
// the module graph loads under Bun, then import the testable helper.
void mock.module('server-only', () => ({}));
const { assertWorkspaceContext } = await import('@lib/api/principal');

const WS_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WS_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER = '11111111-1111-1111-1111-111111111111';
const DB = {} as unknown as SupabaseClient<Database>;

function principal(over: Partial<Principal>): Principal {
  return {
    userId: USER,
    workspaceId: null,
    capabilities: ['workspace:admin'],
    via: 'bearer',
    tokenId: 'tok',
    db: DB,
    ...over,
  };
}

describe('assertWorkspaceContext', () => {
  it('passes a cookie session regardless of workspace (trusted UI)', () => {
    expect(() => assertWorkspaceContext(
      principal({ via: 'cookie', workspaceId: null }),
      WS_A,
    )).not.toThrow();
  });

  it('passes a bearer token scoped to the target workspace', () => {
    expect(() => assertWorkspaceContext(
      principal({ via: 'bearer', workspaceId: WS_A }),
      WS_A,
    )).not.toThrow();
  });

  it('rejects a bearer token scoped to a different workspace', () => {
    expect(() => assertWorkspaceContext(
      principal({ via: 'bearer', workspaceId: WS_A }),
      WS_B,
    )).toThrow(ApiError);
  });

  it('rejects a bearer token with no workspace binding (no global admin)', () => {
    let thrown: unknown;
    try {
      assertWorkspaceContext(principal({ via: 'bearer', workspaceId: null }), WS_A);
    }
    catch (err) { thrown = err; }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).code).toBe('forbidden');
  });
});
