import { BUG_SEVERITY_VALUES, BUG_STATUS_VALUES, BUGS_LIST_MAX_PAGE_SIZE, BUGS_LIST_PAGE_SIZE } from '@lib/bugs/constants';
import { z } from 'zod';

// BK-41 — query-string validation for GET /api/v1/bugs (Slice 2). Mirrors
// `lib/activity/history-validation.ts`'s `ActivityQuerySchema` shape: search
// params arrive as strings, so `limit` is coerced and a failed parse
// surfaces as a ZodError, which `lib/api/handler.ts` maps to a
// `validation_failed` (422) envelope — this codebase's actual convention for
// every malformed-query-param case (see e.g. `/activity`'s own out-of-range
// `limit`), even though the ATP outline's own wording for ATP-11/12/13 says
// "400 validation_failed" — that phrasing names the CODE, not the status;
// this route follows the shipped `validation_failed` -> 422 mapping
// (`lib/api/error-envelope.ts`'s `DEFAULT_STATUS`) rather than the ATP's
// literal number, per this run's "follow the actual codebase precedent"
// rule. A malformed `cursor` token is the one case that IS a genuine 400
// (`bad_request`) — decoded and rejected in the route BEFORE the RPC ever
// runs (Decision 4), mirroring `decodeActivityCursor`'s own route-level gate.
//
//   project_id  required UUID (ATP-13: missing -> 422 validation_failed).
//   module_id   optional UUID.
//   status      optional comma-list, OR-within-field (Decision 6). Each
//               value must be one of BUG_STATUS_VALUES — the wire value is
//               the underscored form (`in_progress`), so `in-progress`
//               (ATP-12) is rejected.
//   severity    optional comma-list, OR-within-field. Each value must be one
//               of BUG_SEVERITY_VALUES — `P9` (ATP-11) is rejected.
//   cursor      optional opaque page token from a previous response's
//               `next_cursor`. Decoded by the route via `lib/bugs/list-cursor.ts`.
//   limit       1..50, default BUGS_LIST_PAGE_SIZE (30); out of range is
//               rejected (422) — the RPC additionally clamps for direct callers.

function commaSeparatedEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .transform(value => value.split(',').map(v => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));
}

const StatusListSchema = commaSeparatedEnum(BUG_STATUS_VALUES);
const SeverityListSchema = commaSeparatedEnum(BUG_SEVERITY_VALUES);

export const BugsListQuerySchema = z.object({
  project_id: z.string().uuid(),
  module_id: z.string().uuid().optional(),
  status: StatusListSchema.optional(),
  severity: SeverityListSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(BUGS_LIST_MAX_PAGE_SIZE)
    .default(BUGS_LIST_PAGE_SIZE),
});

export type BugsListQuery = z.infer<typeof BugsListQuerySchema>;

// Parse a URLSearchParams into the validated query shape. Absent optional
// keys are dropped before parsing so `.optional()` (not `.nullable()`)
// applies and a missing `limit` takes the default (mirrors `parseActivityParams`).
export function parseBugsListParams(params: URLSearchParams): BugsListQuery {
  const raw: Record<string, string> = {};
  for (const key of ['project_id', 'module_id', 'status', 'severity', 'cursor', 'limit'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return BugsListQuerySchema.parse(raw);
}
