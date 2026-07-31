import { RUN_HISTORY_OUTCOMES, RUN_HISTORY_PAGE_SIZE } from '@lib/runs/history-constants';
import { z } from 'zod';

// BK-37 — query-string validation + cursor codec for
// GET /api/v1/tests/{id}/runs (a Test's past Runs). Search params arrive as
// strings, so `limit` is coerced. A failed parse surfaces as a ZodError, which
// the API handler maps to a `validation_failed` envelope.
//
//   outcome  optional terminal outcome (passed | failed | aborted). `running` is
//            NOT an option — an in-progress Run is not an outcome and never
//            appears in history (PO decision, BK-37 business rules).
//   limit    1..50, default 50; >50 / <1 / non-int rejected (mirrors
//            parseAtcSearchParams — the RPC additionally clamps for direct callers).
//   cursor   optional opaque page token from a previous response's `next_cursor`.
//            Decoded + validated server-side; a malformed cursor is a 400, never
//            a silent full-list.

// The page size and the outcome enum live in `history-constants.ts` — a
// zod-free module the `'use client'` screen can import without dragging Zod and
// this file's schema graph into the browser bundle. Re-exported here so every
// server-side import of this module keeps resolving them unchanged.
export { RUN_HISTORY_OUTCOMES, RUN_HISTORY_PAGE_SIZE } from '@lib/runs/history-constants';
export type { RunHistoryOutcome } from '@lib/runs/history-constants';

export const RunHistoryQuerySchema = z.object({
  outcome: z.enum(RUN_HISTORY_OUTCOMES).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(RUN_HISTORY_PAGE_SIZE)
    .default(RUN_HISTORY_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

export type RunHistoryQuery = z.infer<typeof RunHistoryQuerySchema>;

// Parse a URLSearchParams into the validated query shape. Absent optional keys
// are dropped before parsing so `.optional()` (not `.nullable()`) applies and a
// missing `limit` takes the default (mirrors parseAtcSearchParams).
export function parseRunHistoryParams(params: URLSearchParams): RunHistoryQuery {
  const raw: Record<string, string> = {};
  for (const key of ['outcome', 'limit', 'cursor'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return RunHistoryQuerySchema.parse(raw);
}

// The keyset position: the (started_at, id) of the last row of the previous
// page. Both halves are required — the RPC's tuple predicate is exact only with
// the pair, which is what makes identical `started_at` values page correctly.
export interface RunCursor {
  startedAt: string
  id: string
}

// `ok: false` → the token was present but is not a decodable cursor. Mirrors the
// readVersionPrecondition idiom so the route answers 400 instead of silently
// falling back to the first page.
export type RunCursorDecode = { ok: true, cursor: RunCursor } | { ok: false };

const CURSOR_SEPARATOR = '|';

// Postgres serializes a timestamptz into jsonb as ISO 8601 with an offset
// (e.g. `2026-07-29T11:52:00+00:00`); accept that plus the `Z` / no-offset and
// fractional-second variants, and require the value to be a real instant.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// Opaque wire token: base64 of `${startedAt}|${id}`. Opaque by contract — clients
// must echo it back verbatim and never construct or interpret one. base64 (not
// JSON, not raw values) keeps the pagination shape a server-owned implementation
// detail we can change without breaking callers. `btoa`/`atob` (not Buffer) keep
// this module usable from a client component: the payload is pure ASCII.
export function encodeRunCursor(cursor: RunCursor): string {
  return btoa(`${cursor.startedAt}${CURSOR_SEPARATOR}${cursor.id}`);
}

// Decode + fully validate a wire cursor. Every failure mode — non-base64, wrong
// field count, unparseable timestamp, non-uuid id — collapses into `ok: false`.
export function decodeRunCursor(raw: string): RunCursorDecode {
  let decoded: string;
  try {
    decoded = atob(raw);
  }
  catch {
    return { ok: false };
  }

  const parts = decoded.split(CURSOR_SEPARATOR);
  if (parts.length !== 2) {
    return { ok: false };
  }

  const [startedAt, id] = parts;
  if (!ISO_TIMESTAMP_RE.test(startedAt) || Number.isNaN(Date.parse(startedAt))) {
    return { ok: false };
  }
  if (!UUID_RE.test(id)) {
    return { ok: false };
  }

  return { ok: true, cursor: { startedAt, id } };
}
