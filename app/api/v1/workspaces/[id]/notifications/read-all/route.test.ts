import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { markAllNotificationsRead } from './response';

// BK-209 (Slice 2: API) — POST /api/v1/workspaces/{id}/notifications/read-all.
// The route itself is a thin `withApiHandler` wrapper (no dedicated test
// harness for mocking NextRequest/ctx exists in this repo); the bulk update
// lives in `./response.ts`, tested here with a fake-chainable `db`, mirroring
// `../read/route.test.ts`'s own style.

const WS = '11111111-1111-1111-1111-111111111111';
const OTHER_WS = '99999999-9999-9999-9999-999999999999';
const USER = '22222222-2222-2222-2222-222222222222';
const ROW_1 = '44444444-4444-4444-4444-444444444444';
const ROW_2 = '55555555-5555-5555-5555-555555555555';

interface Calls { eq: [string, string][], is: [string, unknown][] }

// Minimal stand-in for the chain `markAllNotificationsRead` calls:
//   db.from('notifications').update({read_at})
//     .eq('workspace_id', id).eq('recipient_user_id', uid).is('read_at', null)
//     .select('id')
function fakeNotificationsDb(
  result: { data: { id: string }[] | null, error: { message: string } | null },
  calls: Calls = { eq: [], is: [] },
): SupabaseClient<Database> {
  const chain = {
    update: () => chain,
    eq: (column: string, value: string) => { calls.eq.push([column, value]); return chain; },
    is: (column: string, value: unknown) => { calls.is.push([column, value]); return chain; },
    select: async () => result,
  };
  return { from: () => chain } as unknown as SupabaseClient<Database>;
}

describe('markAllNotificationsRead', () => {
  it('scopes the bulk update to the exact (workspace, recipient, unread-only) triple — defense in depth alongside RLS', async () => {
    const calls: Calls = { eq: [], is: [] };
    const db = fakeNotificationsDb({ data: [{ id: ROW_1 }, { id: ROW_2 }], error: null }, calls);

    await markAllNotificationsRead(db, { workspaceId: WS, recipientUserId: USER });

    expect(calls.eq).toEqual([
      ['workspace_id', WS],
      ['recipient_user_id', USER],
    ]);
    expect(calls.is).toEqual([['read_at', null]]);
  });

  it('never touches a different workspace — each call is scoped by its own explicit workspaceId argument', async () => {
    const calls: Calls = { eq: [], is: [] };
    const db = fakeNotificationsDb({ data: [], error: null }, calls);

    await markAllNotificationsRead(db, { workspaceId: OTHER_WS, recipientUserId: USER });

    expect(calls.eq).toContainEqual(['workspace_id', OTHER_WS]);
    expect(calls.eq).not.toContainEqual(['workspace_id', WS]);
  });

  it('returns updated_count matching the number of rows the update actually touched', async () => {
    const db = fakeNotificationsDb({ data: [{ id: ROW_1 }, { id: ROW_2 }], error: null });

    const result = await markAllNotificationsRead(db, { workspaceId: WS, recipientUserId: USER });
    expect(result).toEqual({ updated_count: 2 });
  });

  it('idempotent: zero remaining unread rows -> a successful {updated_count: 0}, never an error (edge case E12)', async () => {
    const db = fakeNotificationsDb({ data: [], error: null });

    const result = await markAllNotificationsRead(db, { workspaceId: WS, recipientUserId: USER });
    expect(result).toEqual({ updated_count: 0 });
  });

  it('a null data array (defensive) still resolves to updated_count 0, never a crash', async () => {
    const db = fakeNotificationsDb({ data: null, error: null });

    const result = await markAllNotificationsRead(db, { workspaceId: WS, recipientUserId: USER });
    expect(result).toEqual({ updated_count: 0 });
  });

  it('propagates a db error as internal_error (500)', async () => {
    const db = fakeNotificationsDb({ data: null, error: { message: 'boom' } });

    let captured: unknown;
    try {
      await markAllNotificationsRead(db, { workspaceId: WS, recipientUserId: USER });
    }
    catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(ApiError);
    expect((captured as ApiError).code).toBe('internal_error');
    expect((captured as ApiError).status).toBe(500);
  });
});

describe('route.ts source guard (Risk R2 — admin-client route regression)', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf-8');

  it('never imports lib/supabase/admin — the caller\'s own principal.db (getAuth) is the ONLY Supabase client this route may construct', () => {
    expect(source).not.toMatch(/@lib\/supabase\/admin/);
  });

  it('obtains its Supabase client from getAuth(ctx), not a fresh client construction', () => {
    expect(source).toMatch(/getAuth\(ctx\)/);
    expect(source).toMatch(/\{\s*principal,\s*db\s*\}\s*=\s*getAuth\(ctx\)/);
  });
});
