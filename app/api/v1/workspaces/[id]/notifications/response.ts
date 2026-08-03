import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { encodeNotificationsCursor } from '@lib/notifications/list-validation';
import { listNotifications } from '@lib/supabase/rpc';

// BK-209 (Slice 2: API) — dependency-free / DB-parametrized logic for
// GET /api/v1/workspaces/{id}/notifications, split out of `route.ts` so the
// RPC-error mapping and the row -> wire-shape mapping are unit-testable
// without mocking `withApiHandler` or a live NextRequest — mirrors
// `app/api/v1/activity/response.ts`'s own isolation pattern (RPC error mapper
// + DB-parametrized business logic, pure enough to test with a fake `db`).

// ---------------------------------------------------------------------------
// RPC error mapping
// ---------------------------------------------------------------------------

// Maps a `bunkai_list_notifications` RPC error (migration
// 0053_notifications.sql) to the house envelope. 45400
// (notification_cursor_invalid) is a backstop this route makes practically
// unreachable: this route always supplies both cursor halves or neither —
// `decodeNotificationsCursor` rejects a malformed token as a 400 BEFORE the
// RPC ever runs (mirrors `mapActivityRpcError`'s own 45214 backstop comment).
// Always throws (`: never`) so `if (error) mapNotificationsRpcError(error)`
// is exhaustive at every call site.
export function mapNotificationsRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '45400':
      throw new ApiError('bad_request', 'The cursor is not a valid page token.', {
        details: { reason: 'notification_cursor_invalid' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// ---------------------------------------------------------------------------
// Row / page shapes (RPC contract, migration 0053_notifications.sql)
// ---------------------------------------------------------------------------

// The `bunkai_list_notifications` RPC's per-row projection (`Returns: Json`,
// so the generated Supabase types carry no row shape — hand-typed contract of
// migration 0053's `jsonb_build_object` call). `payload` passes through
// UNCHANGED — its shape is owned by the future producer stories (BK-211/212/
// 213/214), none of which land in this slice, so it stays a plain record
// here rather than a speculative discriminated union.
export interface NotificationRpcRow {
  id: string
  workspace_id: string
  event_type: string
  entity_type: string
  entity_id: string | null
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
  entity_available: boolean
}

interface NotificationsRpcPayload {
  items: NotificationRpcRow[]
  unread_count: number
  next_cursor: { created_at: string, id: string } | null
}

export interface NotificationsPageResponse {
  items: NotificationRpcRow[]
  unread_count: number
  next_cursor: string | null
}

export interface FetchNotificationsPageParams {
  workspaceId: string
  limit: number
  cursorCreatedAt: string | null
  cursorId: string | null
}

// `db` MUST be the caller's own RLS-scoped client (`getAuth(ctx).db`) — see
// `lib/supabase/rpc.ts`'s `listNotifications` comment for why (Risk R2, same
// shape as `listActivity`/`listBugs`).
export async function fetchNotificationsPage(
  db: SupabaseClient<Database>,
  params: FetchNotificationsPageParams,
): Promise<NotificationsPageResponse> {
  const { data, error } = await listNotifications(db, {
    workspaceId: params.workspaceId,
    limit: params.limit,
    cursorCreatedAt: params.cursorCreatedAt,
    cursorId: params.cursorId,
  });
  if (error) {
    mapNotificationsRpcError(error);
  }

  const payload = data as unknown as NotificationsRpcPayload;

  return {
    items: payload.items ?? [],
    unread_count: payload.unread_count,
    next_cursor: payload.next_cursor === null
      ? null
      : encodeNotificationsCursor({ createdAt: payload.next_cursor.created_at, id: payload.next_cursor.id }),
  };
}
