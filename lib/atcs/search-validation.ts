import { z } from 'zod';
import { ATC_LAYERS, ATC_PRIORITIES, ATC_TECHNIQUES } from './validation';

// BK-20 — query-string validation for GET /api/v1/atcs/search. Search params
// arrive as strings, so `limit` is coerced. A failed parse surfaces as a
// ZodError, which the API handler maps to a `validation_failed` envelope.
//
//   query      required, trimmed, ≥1 char after trim (empty / whitespace-only
//              input performs NO search — BK-20 AC5).
//   project_id required UUID — the search is scoped to a SINGLE project (product
//              decision). The RPC additionally enforces the actor's workspace
//              membership, so a project the caller can't reach returns 0 rows.
//   module_id  optional UUID — narrows to that module's subtree.
//   layer      optional ATC layer enum (UI | API | Unit) — BK-20 SG4.
//   technique  optional ATC technique enum — BK-399. Exact display label,
//              case-sensitive, no trimming (identical strictness to `layer`).
//   priority   optional ATC priority enum — BK-399, same strictness.
//   limit      1..50, default 20; >50 / <1 / non-int rejected — BK-20 SG2/SG3.
//
// BK-399 carries NO null-sentinel: `?technique=` (empty) is an invalid enum
// member, not "unspecified". Filtering for `technique is null` is a UI-only,
// client-side capability in this story.

export const ATC_SEARCH_LIMIT_DEFAULT = 20;
export const ATC_SEARCH_LIMIT_MAX = 50;

export const AtcSearchQuerySchema = z.object({
  query: z.string().trim().min(1),
  project_id: z.string().uuid(),
  module_id: z.string().uuid().optional(),
  layer: z.enum(ATC_LAYERS).optional(),
  technique: z.enum(ATC_TECHNIQUES).optional(),
  priority: z.enum(ATC_PRIORITIES).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ATC_SEARCH_LIMIT_MAX)
    .default(ATC_SEARCH_LIMIT_DEFAULT),
});

export type AtcSearchQuery = z.infer<typeof AtcSearchQuerySchema>;

// Parse a URLSearchParams into the validated query shape. Absent optional keys
// are dropped before parsing so `.optional()` (not `.nullable()`) applies and a
// missing `limit` takes the default.
export function parseAtcSearchParams(params: URLSearchParams): AtcSearchQuery {
  const raw: Record<string, string> = {};
  for (const key of ['query', 'project_id', 'module_id', 'layer', 'technique', 'priority', 'limit'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return AtcSearchQuerySchema.parse(raw);
}
