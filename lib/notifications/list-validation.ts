import { decodeKeysetCursor, encodeKeysetCursor } from '@lib/pagination/keyset-cursor';
import { z } from 'zod';

// BK-209 (Slice 2: API) — query-string validation + cursor codec for
// GET /api/v1/workspaces/{id}/notifications. Mirrors
// `lib/activity/history-validation.ts`'s shape, minus `workspace_id`: that
// field is a PATH segment on this route (`/workspaces/{id}/notifications`),
// never a query param, so there is nothing to resolve/fall back on here.
//
//   limit   1..50, default NOTIFICATIONS_PAGE_SIZE (30); out of range is
//           rejected (422) — the RPC additionally clamps for direct callers
//           (migration 0053_notifications.sql: `least(greatest(coalesce(
//           p_limit, 30), 1), 50)`).
//   cursor  optional opaque page token from a previous response's
//           `next_cursor`. Decoded + validated server-side; a malformed
//           cursor is a 400, never a silent first page.

export const NOTIFICATIONS_PAGE_SIZE = 30;
const NOTIFICATIONS_MAX_PAGE_SIZE = 50;

export const NotificationsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(NOTIFICATIONS_MAX_PAGE_SIZE)
    .default(NOTIFICATIONS_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

export type NotificationsQuery = z.infer<typeof NotificationsQuerySchema>;

// Parse a URLSearchParams into the validated query shape. Absent optional
// keys are dropped before parsing so `.optional()` (not `.nullable()`)
// applies and a missing `limit` takes the default (mirrors
// `parseActivityParams`).
export function parseNotificationsListParams(params: URLSearchParams): NotificationsQuery {
  const raw: Record<string, string> = {};
  for (const key of ['limit', 'cursor'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return NotificationsQuerySchema.parse(raw);
}

// The keyset position: the (created_at, id) of the last row of the previous
// page. Domain-named wrapper around the generic
// `lib/pagination/keyset-cursor.ts` codec (same DRY rationale as
// `lib/activity/history-validation.ts`'s own `ActivityCursor` wrapper) —
// notifications code reads/writes `createdAt`, never the codec's
// field-neutral `timestamp`.

export interface NotificationsCursor {
  createdAt: string
  id: string
}

export type NotificationsCursorDecode = { ok: true, cursor: NotificationsCursor } | { ok: false };

export function encodeNotificationsCursor(cursor: NotificationsCursor): string {
  return encodeKeysetCursor({ timestamp: cursor.createdAt, id: cursor.id });
}

export function decodeNotificationsCursor(raw: string): NotificationsCursorDecode {
  const decoded = decodeKeysetCursor(raw);
  if (!decoded.ok) {
    return { ok: false };
  }
  return { ok: true, cursor: { createdAt: decoded.cursor.timestamp, id: decoded.cursor.id } };
}
