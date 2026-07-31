import { ACTIVITY_PAGE_SIZE } from '@lib/activity/constants';
import { decodeKeysetCursor, encodeKeysetCursor } from '@lib/pagination/keyset-cursor';
import { z } from 'zod';

// BK-49 — query-string validation + cursor codec for GET /api/v1/activity.
// Search params arrive as strings, so `limit` is coerced. A failed parse
// surfaces as a ZodError, which the API handler (`lib/api/handler.ts`) maps
// to a `validation_failed` (422) envelope. Mirrors
// `lib/runs/history-validation.ts`'s shape.
//
//   workspace_id  optional UUID. Explicit wins over the cookie-active-
//                 workspace fallback (see `app/api/v1/activity/response.ts`).
//   limit         1..50, default ACTIVITY_PAGE_SIZE (30); out of range is
//                 rejected (422) — the RPC additionally clamps for direct
//                 callers.
//   cursor        optional opaque page token from a previous response's
//                 `next_cursor`. Decoded + validated server-side; a
//                 malformed cursor is a 400, never a silent full list.

export { ACTIVITY_ALLOWED_ACTIONS, ACTIVITY_PAGE_SIZE } from '@lib/activity/constants';
export type { ActivityAction } from '@lib/activity/constants';

// Matches the RPC's own clamp (migration 0045_activity_stream.sql: `least(
// greatest(coalesce(p_limit, 30), 1), 50)`) — the route enforces the SAME
// upper bound the RPC would otherwise silently clamp to, so an out-of-range
// caller gets an explicit 422 instead of a quietly-truncated page.
const ACTIVITY_MAX_PAGE_SIZE = 50;

export const ActivityQuerySchema = z.object({
  workspace_id: z.string().uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ACTIVITY_MAX_PAGE_SIZE)
    .default(ACTIVITY_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;

// Parse a URLSearchParams into the validated query shape. Absent optional
// keys are dropped before parsing so `.optional()` (not `.nullable()`)
// applies and a missing `limit` takes the default (mirrors
// `parseRunHistoryParams`).
export function parseActivityParams(params: URLSearchParams): ActivityQuery {
  const raw: Record<string, string> = {};
  for (const key of ['workspace_id', 'limit', 'cursor'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return ActivityQuerySchema.parse(raw);
}

// The keyset position: the (created_at, id) of the last row of the previous
// page. Both halves are required — the RPC's tuple predicate is exact only
// with the pair. Domain-named wrapper around the generic
// `lib/pagination/keyset-cursor.ts` codec (Decision 4) — activity code
// reads/writes `createdAt`, never the codec's field-neutral `timestamp`.

export interface ActivityCursor {
  createdAt: string
  id: string
}

export type ActivityCursorDecode = { ok: true, cursor: ActivityCursor } | { ok: false };

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return encodeKeysetCursor({ timestamp: cursor.createdAt, id: cursor.id });
}

export function decodeActivityCursor(raw: string): ActivityCursorDecode {
  const decoded = decodeKeysetCursor(raw);
  if (!decoded.ok) {
    return { ok: false };
  }
  return { ok: true, cursor: { createdAt: decoded.cursor.timestamp, id: decoded.cursor.id } };
}
