import type { ApiErrorCode } from '@lib/api/error-envelope';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ApiError } from '@lib/api/error-envelope';
import { decodeNotificationsCursor } from '@lib/notifications/list-validation';
import { describe, expect, it } from 'bun:test';
import { fetchNotificationsPage, mapNotificationsRpcError } from './response';

// BK-209 (Slice 2: API) — GET /api/v1/workspaces/{id}/notifications. The
// route itself is a thin `withApiHandler` wrapper (no dedicated test harness
// for mocking NextRequest/ctx exists in this repo — same convention noted in
// `app/api/v1/activity/route.test.ts`); every branch that needs coverage
// lives in the pure/DB-parametrized functions in `./response.ts`, tested
// directly with a fake-chainable-`db`, mirroring `activity/route.test.ts`'s
// own `fakeRpcDb` style. The one exception is Risk R2 (mirrors
// `bunkai_list_activity`'s own comment): "route uses `getAuth(ctx).db`, never
// `createAdminClient()`" is checked with a static source-text assertion
// below, since that risk is specifically about what `route.ts` imports and
// calls, not about `response.ts`'s testable functions.

const WS = '11111111-1111-1111-1111-111111111111';
const FOREIGN_WS = '99999999-9999-9999-9999-999999999999';
const ROW_1 = '44444444-4444-4444-4444-444444444444';
const ROW_2 = '55555555-5555-5555-5555-555555555555';

interface RpcResult { data: unknown, error: { code?: string, message: string } | null }
interface RpcCall { fn: string, args: unknown }

// Records every `db.rpc(fn, args)` call and answers with the configured
// fixture — the seam `fetchNotificationsPage` calls through.
function fakeRpcDb(response: RpcResult, calls: RpcCall[] = []): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === 'bunkai_list_notifications') {
        return response;
      }
      throw new Error(`unexpected rpc: ${fn}`);
    },
  } as unknown as SupabaseClient<Database>;
}

describe('mapNotificationsRpcError', () => {
  it('maps notification_cursor_invalid (45400) to 400 bad_request', () => {
    try {
      mapNotificationsRpcError({ code: '45400', message: 'notification_cursor_invalid' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('bad_request');
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).details).toEqual({ reason: 'notification_cursor_invalid' });
    }
  });

  it('maps an unrecognized error code to 500 internal_error', () => {
    try {
      mapNotificationsRpcError({ code: '99999', message: 'boom' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect((err as ApiError).code).toBe('internal_error');
      expect((err as ApiError).status).toBe(500);
    }
  });
});

describe('fetchNotificationsPage', () => {
  it('cross-workspace / lost-access isolation: an RLS-emptied result stays an empty 200', async () => {
    const calls: RpcCall[] = [];
    const db = fakeRpcDb({ data: { items: [], unread_count: 0, next_cursor: null }, error: null }, calls);

    const page = await fetchNotificationsPage(db, {
      workspaceId: FOREIGN_WS,
      limit: 30,
      cursorCreatedAt: null,
      cursorId: null,
    });

    expect(page).toEqual({ items: [], unread_count: 0, next_cursor: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].fn).toBe('bunkai_list_notifications');
  });

  it('forwards workspaceId, limit and cursor to the RPC call args unchanged', async () => {
    const calls: RpcCall[] = [];
    const db = fakeRpcDb({ data: { items: [], unread_count: 0, next_cursor: null }, error: null }, calls);

    await fetchNotificationsPage(db, {
      workspaceId: WS,
      limit: 17,
      cursorCreatedAt: '2026-07-29T11:52:00+00:00',
      cursorId: ROW_1,
    });

    const args = calls[0].args as { p_workspace_id: string, p_limit: number, p_cursor_created_at: string, p_cursor_id: string };
    expect(args.p_workspace_id).toBe(WS);
    expect(args.p_limit).toBe(17);
    expect(args.p_cursor_created_at).toBe('2026-07-29T11:52:00+00:00');
    expect(args.p_cursor_id).toBe(ROW_1);
  });

  it('passes items and unread_count through unchanged', async () => {
    const db = fakeRpcDb({
      data: {
        items: [
          {
            id: ROW_1,
            workspace_id: WS,
            event_type: 'run.finished',
            entity_type: 'run',
            entity_id: 'aa000000-0000-0000-0000-000000000000',
            payload: { verdict: 'passed' },
            read_at: null,
            created_at: '2026-07-29T11:52:01+00:00',
            entity_available: true,
          },
        ],
        unread_count: 3,
        next_cursor: null,
      },
      error: null,
    });

    const page = await fetchNotificationsPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });

    expect(page.unread_count).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({
      id: ROW_1,
      workspace_id: WS,
      event_type: 'run.finished',
      entity_type: 'run',
      entity_id: 'aa000000-0000-0000-0000-000000000000',
      payload: { verdict: 'passed' },
      read_at: null,
      created_at: '2026-07-29T11:52:01+00:00',
      entity_available: true,
    });
  });

  it('pagination boundary: a non-null next_cursor from the RPC round-trips through the opaque wire token', async () => {
    const db = fakeRpcDb({
      data: { items: [], unread_count: 0, next_cursor: { created_at: '2026-07-29T11:52:00+00:00', id: ROW_2 } },
      error: null,
    });

    const page = await fetchNotificationsPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });

    expect(page.next_cursor).not.toBeNull();
    const decoded = decodeNotificationsCursor(page.next_cursor!);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.createdAt).toBe('2026-07-29T11:52:00+00:00');
      expect(decoded.cursor.id).toBe(ROW_2);
    }
  });

  it('pagination boundary: a null next_cursor (last page) stays null on the wire', async () => {
    const db = fakeRpcDb({ data: { items: [], unread_count: 0, next_cursor: null }, error: null });
    const page = await fetchNotificationsPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null });
    expect(page.next_cursor).toBeNull();
  });

  it('propagates a bunkai_list_notifications RPC error through mapNotificationsRpcError', async () => {
    const db = fakeRpcDb({ data: null, error: { code: '45400', message: 'notification_cursor_invalid' } });
    await expectApiError(
      fetchNotificationsPage(db, { workspaceId: WS, limit: 30, cursorCreatedAt: null, cursorId: null }),
      'bad_request',
      400,
    );
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

async function expectApiError(promise: Promise<unknown>, code: ApiErrorCode, status: number): Promise<void> {
  try {
    await promise;
    throw new Error('expected an ApiError but none was thrown');
  }
  catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(code);
    expect((err as ApiError).status).toBe(status);
  }
}
