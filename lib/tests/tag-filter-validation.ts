import { decodeKeysetCursor, encodeKeysetCursor } from '@lib/pagination/keyset-cursor';
import { z } from 'zod';

// BK-742 — query validation + cursor wrapper for GET /api/v1/tests?tag=.
//
//   tag     required, trimmed, non-empty (the lookup is never a list-all).
//   limit   1..50, default 20; out of range is refused (422), never clamped.
//   cursor  optional opaque token from a previous `next_cursor`; an
//           undecodable one is a 400, never a silent restart at page one.

export const TEST_TAG_FILTER_LIMIT_DEFAULT = 20;
export const TEST_TAG_FILTER_LIMIT_MAX = 50;

export const TestTagFilterQuerySchema = z.object({
  tag: z.string().trim().min(1, 'A `tag` query parameter is required.'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(TEST_TAG_FILTER_LIMIT_MAX)
    .default(TEST_TAG_FILTER_LIMIT_DEFAULT),
  cursor: z.string().optional(),
});

export type TestTagFilterQuery = z.infer<typeof TestTagFilterQuerySchema>;

export function parseTestTagFilterParams(params: URLSearchParams): TestTagFilterQuery {
  const raw: Record<string, string> = {};
  for (const key of ['tag', 'limit', 'cursor'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return TestTagFilterQuerySchema.parse(raw);
}

export interface TestTagFilterCursor {
  createdAt: string
  id: string
}

export function encodeTestTagFilterCursor(cursor: TestTagFilterCursor): string {
  return encodeKeysetCursor({ timestamp: cursor.createdAt, id: cursor.id });
}

export function decodeTestTagFilterCursor(raw: string): { ok: true, cursor: TestTagFilterCursor } | { ok: false } {
  const decoded = decodeKeysetCursor(raw);
  if (!decoded.ok) {
    return { ok: false };
  }
  return { ok: true, cursor: { createdAt: decoded.cursor.timestamp, id: decoded.cursor.id } };
}
