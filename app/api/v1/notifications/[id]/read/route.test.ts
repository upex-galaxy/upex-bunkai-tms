import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { markNotificationRead } from './response';

// BK-209 (Slice 2: API) — POST /api/v1/notifications/{id}/read. The route
// itself is a thin `withApiHandler` wrapper (no dedicated test harness for
// mocking NextRequest/ctx exists in this repo — same convention noted in
// `app/api/v1/activity/route.test.ts`); the update + not-found mapping lives
// in `./response.ts`, tested here with a fake-chainable `db`, mirroring
// `workspaces/[id]/membership/route.test.ts`'s own style.

const NOTIFICATION_ID = '44444444-4444-4444-4444-444444444444';

interface UpdateCall { table: string, payload: unknown, id: string | null }

// Minimal stand-in for the chain `markNotificationRead` calls:
//   db.from('notifications').update({read_at}).eq('id', id).select(...).maybeSingle()
function fakeNotificationsDb(
  result: { data: { id: string, read_at: string | null } | null, error: { message: string } | null },
  calls: UpdateCall[] = [],
): SupabaseClient<Database> {
  return {
    from: (table: string) => {
      const call: UpdateCall = { table, payload: undefined, id: null };
      calls.push(call);
      const chain = {
        update: (payload: unknown) => { call.payload = payload; return chain; },
        eq: (column: string, value: string) => { if (column === 'id') { call.id = value; } return chain; },
        select: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

describe('markNotificationRead', () => {
  it('updates read_at and returns the row on a match', async () => {
    const calls: UpdateCall[] = [];
    const db = fakeNotificationsDb({ data: { id: NOTIFICATION_ID, read_at: '2026-08-03T10:00:00+00:00' }, error: null }, calls);

    const result = await markNotificationRead(db, NOTIFICATION_ID);

    expect(result).toEqual({ id: NOTIFICATION_ID, read_at: '2026-08-03T10:00:00+00:00' });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('notifications');
    expect(calls[0].id).toBe(NOTIFICATION_ID);
    expect(calls[0].payload).toHaveProperty('read_at');
  });

  it('does NOT gate on read_at already being null — idempotent re-mark succeeds (edge cases E6/E12), never a 404', async () => {
    const calls: UpdateCall[] = [];
    // A row that was already read simply comes back again on the second call
    // — the fake always answers with a row, proving the function never adds
    // an `.is('read_at', null)` filter that would exclude it.
    const db = fakeNotificationsDb({ data: { id: NOTIFICATION_ID, read_at: '2026-08-03T09:00:00+00:00' }, error: null }, calls);

    const result = await markNotificationRead(db, NOTIFICATION_ID);
    expect(result.id).toBe(NOTIFICATION_ID);
  });

  it('a zero-row match (foreign id, another recipient\'s row, or lost membership) throws not_found — never distinguishes the cause', async () => {
    const db = fakeNotificationsDb({ data: null, error: null });

    let captured: unknown;
    try {
      await markNotificationRead(db, NOTIFICATION_ID);
    }
    catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(ApiError);
    expect((captured as ApiError).code).toBe('not_found');
    expect((captured as ApiError).status).toBe(404);
  });

  it('propagates a db error as internal_error (500)', async () => {
    const db = fakeNotificationsDb({ data: null, error: { message: 'boom' } });

    let captured: unknown;
    try {
      await markNotificationRead(db, NOTIFICATION_ID);
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
    expect(source).toMatch(/\{\s*db\s*\}\s*=\s*getAuth\(ctx\)/);
  });
});
