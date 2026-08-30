import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { assertExportAuthorized } from '@lib/workspace-export/authorize';
import { describe, expect, it } from 'bun:test';

// BK-508 — unit guard for the export Owner-only role gate. Mirrors
// lib/api/pat.test.ts's fake-chainable-client shape.

interface MembershipResult { data: { role: string } | null, error: { message: string } | null }

function fakeDb(result: MembershipResult): SupabaseClient<Database> {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient<Database>;
}

const WS = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

async function expectForbidden(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
    throw new Error('expected ApiError(forbidden) but none was thrown');
  }
  catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('forbidden');
  }
}

describe('assertExportAuthorized', () => {
  it('allows the workspace Owner', async () => {
    const db = fakeDb({ data: { role: 'owner' }, error: null });
    await assertExportAuthorized({ db, userId: USER, workspaceId: WS });
  });

  it('rejects an Admin', async () => {
    const db = fakeDb({ data: { role: 'admin' }, error: null });
    await expectForbidden(assertExportAuthorized({ db, userId: USER, workspaceId: WS }));
  });

  it('rejects a Member', async () => {
    const db = fakeDb({ data: { role: 'member' }, error: null });
    await expectForbidden(assertExportAuthorized({ db, userId: USER, workspaceId: WS }));
  });

  it('rejects a non-member (no membership row)', async () => {
    const db = fakeDb({ data: null, error: null });
    await expectForbidden(assertExportAuthorized({ db, userId: USER, workspaceId: WS }));
  });
});
