import { z } from 'zod';

// BK-398 — query-string validation for GET /api/v1/search, mirroring
// `lib/atcs/search-validation.ts`'s shape.
//
//   q      required, trimmed, >= 2 chars after trim (AC-06 6.2/6.3 — the
//          2-char threshold is inclusive and counted AFTER trimming,
//          matching `atc-search-filter.tsx`'s live precedent). A shorter
//          query fails validation; the CLIENT is responsible for never
//          sending one in the first place (AC-06 6.2 — no request at all
//          below the threshold), so this is a defensive backstop, not the
//          primary gate.
//   limit  1..20, default 20 — the per-request ceiling passed through to
//          the RPC's own p_limit. The RPC independently clamps its
//          PER-GROUP cap to 5 regardless of what this allows through
//          (comment 12407 correction (c) — no total cap, 5-per-group only).

export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_LIMIT_DEFAULT = 20;
export const SEARCH_LIMIT_MAX = 20;

export const SearchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_QUERY_MIN_LENGTH),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_LIMIT_MAX)
    .default(SEARCH_LIMIT_DEFAULT),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

// Parse a URLSearchParams into the validated query shape. Absent optional
// keys are dropped before parsing so `.default()` applies (mirrors
// `parseAtcSearchParams`).
export function parseSearchParams(params: URLSearchParams): SearchQuery {
  const raw: Record<string, string> = {};
  for (const key of ['q', 'limit'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return SearchQuerySchema.parse(raw);
}
