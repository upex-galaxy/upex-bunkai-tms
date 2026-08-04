import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { listNotificationPreferences, upsertNotificationPreference } from './response';

// BK-213 — GET/PATCH /api/v1/notification-preferences. The route itself is a
// thin `withApiHandler` wrapper (no dedicated NextRequest/ctx mocking
// harness in this repo — same convention noted in
// `notifications/[id]/read/route.test.ts`); the DB-shaping logic lives in
// `./response.ts`, tested here with a fake-chainable `db`.

const USER_ID = '55555555-5555-5555-5555-555555555555';

interface SelectCall { table: string, filters: Record<string, unknown> }

function fakeSelectDb(
  result: { data: { event_type: string, channel: string, enabled: boolean }[] | null, error: { message: string } | null },
  calls: SelectCall[] = [],
): SupabaseClient<Database> {
  return {
    from: (table: string) => {
      const call: SelectCall = { table, filters: {} };
      calls.push(call);
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => { call.filters[column] = value; return chain; },
        then: (resolve: (r: typeof result) => unknown) => resolve(result),
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

interface UpsertCall { table: string, payload: unknown, onConflict: string | undefined }

function fakeUpsertDb(
  result: { data: { event_type: string, channel: string, enabled: boolean, updated_at: string } | null, error: { message: string } | null },
  calls: UpsertCall[] = [],
): SupabaseClient<Database> {
  return {
    from: (table: string) => {
      const call: UpsertCall = { table, payload: undefined, onConflict: undefined };
      calls.push(call);
      const chain = {
        upsert: (payload: unknown, opts?: { onConflict?: string }) => { call.payload = payload; call.onConflict = opts?.onConflict; return chain; },
        select: () => chain,
        single: async () => result,
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

describe('listNotificationPreferences', () => {
  it('filters by the given user_id and merges rows into the full default+override grid', async () => {
    const calls: SelectCall[] = [];
    const db = fakeSelectDb({ data: [{ event_type: 'run_lifecycle', channel: 'in_app', enabled: false }], error: null }, calls);

    const grid = await listNotificationPreferences(db, USER_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('notification_preferences');
    expect(calls[0].filters.user_id).toBe(USER_ID);
    expect(grid.find(c => c.event_type === 'run_lifecycle' && c.channel === 'in_app')?.enabled).toBe(false);
    expect(grid.find(c => c.event_type === 'bug_lifecycle' && c.channel === 'in_app')?.enabled).toBe(true);
    expect(grid.find(c => c.event_type === 'mentions' && c.channel === 'in_app')?.locked).toBe(true);
  });

  it('a null data result (no rows yet) resolves to the all-default grid, never an error', async () => {
    const db = fakeSelectDb({ data: null, error: null });
    const grid = await listNotificationPreferences(db, USER_ID);
    expect(grid.every(c => c.locked || c.enabled)).toBe(true);
  });

  it('propagates a db error as internal_error (500)', async () => {
    const db = fakeSelectDb({ data: null, error: { message: 'boom' } });
    let captured: unknown;
    try {
      await listNotificationPreferences(db, USER_ID);
    }
    catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(ApiError);
    expect((captured as ApiError).code).toBe('internal_error');
  });
});

describe('upsertNotificationPreference', () => {
  it('upserts with the SERVER-supplied user_id (never trusts a client-supplied one) and the composite conflict target', async () => {
    const calls: UpsertCall[] = [];
    const db = fakeUpsertDb({ data: { event_type: 'bug_lifecycle', channel: 'email', enabled: false, updated_at: '2026-08-04T00:00:00+00:00' }, error: null }, calls);

    const result = await upsertNotificationPreference(db, USER_ID, { event_type: 'bug_lifecycle', channel: 'email', enabled: false });

    expect(result.enabled).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toMatchObject({ user_id: USER_ID, event_type: 'bug_lifecycle', channel: 'email', enabled: false });
    expect(calls[0].onConflict).toBe('user_id,event_type,channel');
  });

  it('propagates a db error (e.g. the DB-level mentions lock firing) as internal_error', async () => {
    const db = fakeUpsertDb({ data: null, error: { message: 'new row violates row-level security policy' } });
    let captured: unknown;
    try {
      await upsertNotificationPreference(db, USER_ID, { event_type: 'run_lifecycle', channel: 'in_app', enabled: true });
    }
    catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(ApiError);
    expect((captured as ApiError).code).toBe('internal_error');
  });
});

describe('route.ts source guard (mirrors notifications/[id]/read\'s own Risk R2 convention)', () => {
  const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf-8');

  it('never imports lib/supabase/admin — getAuth(ctx)\'s own RLS-scoped client is the ONLY client this route may construct', () => {
    expect(source).not.toMatch(/@lib\/supabase\/admin/);
  });

  it('the PATCH schema excludes "mentions" from event_type — the locked event type can never reach the upsert layer', () => {
    expect(source).toMatch(/EDITABLE_EVENT_TYPES/);
    expect(source).not.toMatch(/'mentions'/);
  });
});
