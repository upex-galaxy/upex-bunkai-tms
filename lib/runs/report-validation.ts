import { REPORT_EXECUTOR_VALUES, REPORT_PAGE_SIZE, REPORT_STATUS_VALUES } from '@lib/runs/report-constants';
import { z } from 'zod';

// BK-38 — query-string validation for
// GET /api/v1/projects/{id}/runs/report (a Project's filtered Run report).
// Search params arrive as strings (and, for `status`/`executor`, as repeated
// keys), so `limit` is coerced and the two enum filters are read via
// `URLSearchParams.getAll`. A failed parse surfaces as a ZodError, which the
// API handler maps to a `validation_failed` envelope.
//
//   date_from  optional YYYY-MM-DD, matched against started_at::date (UTC
//              calendar day — Technical Decision D3, no projects.timezone
//              column exists). Inclusive lower bound.
//   date_to    optional YYYY-MM-DD, inclusive upper bound. Rejected (422)
//              when earlier than date_from — a range that can never match is a
//              caller bug, not a valid "zero rows" query.
//   module_id  optional Project module to narrow to.
//   status     optional, repeatable (?status=passed&status=failed). Each
//              value must be one of REPORT_STATUS_VALUES — `running` is NOT
//              an option (Technical Decision D4): an in-progress Run is still
//              a row in the report, it just isn't a selectable filter target.
//   executor   optional, repeatable (?executor=human&executor=agent). Each
//              value must be one of REPORT_EXECUTOR_VALUES.
//   limit      1..50, default 50; >50 / <1 / non-int rejected (mirrors
//              history-validation's RunHistoryQuerySchema — the RPC
//              additionally clamps for direct callers).
//   cursor     optional opaque page token from a previous response's
//              `next_cursor`. Left as a plain string here and decoded by the
//              route via the imported `decodeRunCursor` — a malformed cursor
//              is a 400 (`bad_request`), never folded into this schema's 422s,
//              same split the sibling run-history route uses.

// The opaque keyset cursor is BK-37's codec, reused UNCHANGED (same shape,
// same wire format) — no second cursor codec for this feature. Re-exported so
// this module is the one stop for the report query layer, the same way
// `history-validation.ts` bundles its own schema and cursor codec together.
export { decodeRunCursor, encodeRunCursor } from '@lib/runs/history-validation';
export type { RunCursor, RunCursorDecode } from '@lib/runs/history-validation';

// The page size and the two filter enums live in `report-constants.ts` — a
// zod-free module the `'use client'` screen (UI slice) can import without
// dragging Zod and this file's schema graph into the browser bundle.
// Re-exported here so a server-side import of this module keeps resolving
// them without a second import line, mirroring `history-validation.ts`'s own
// re-export of `history-constants.ts`.
export { REPORT_EXECUTOR_VALUES, REPORT_PAGE_SIZE, REPORT_STATUS_VALUES } from '@lib/runs/report-constants';
export type { ReportExecutor, ReportStatus } from '@lib/runs/report-constants';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ReportQuerySchema = z
  .object({
    date_from: z.string().regex(DATE_ONLY_RE, 'date_from must be in YYYY-MM-DD format.').optional(),
    date_to: z.string().regex(DATE_ONLY_RE, 'date_to must be in YYYY-MM-DD format.').optional(),
    module_id: z.string().uuid().optional(),
    status: z.array(z.enum(REPORT_STATUS_VALUES)).optional(),
    executor: z.array(z.enum(REPORT_EXECUTOR_VALUES)).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(REPORT_PAGE_SIZE)
      .default(REPORT_PAGE_SIZE),
    cursor: z.string().min(1).optional(),
  })
  // YYYY-MM-DD sorts lexicographically the same as chronologically, so a
  // plain string comparison is a correct chronological comparison here.
  .refine(
    query => query.date_from === undefined || query.date_to === undefined || query.date_to >= query.date_from,
    { message: 'date_to must not be before date_from.', path: ['date_to'] },
  );

export type ReportQuery = z.infer<typeof ReportQuerySchema>;

// Parse a URLSearchParams into the validated query shape. Absent optional
// single-value keys are dropped before parsing so `.optional()` (not
// `.nullable()`) applies and a missing `limit` takes the default (mirrors
// parseRunHistoryParams). `status`/`executor` are repeatable — collected via
// `getAll` — and omitted entirely when the caller sent none, rather than an
// empty array (an empty array would filter to "no status", i.e. zero rows,
// which is not what an absent filter means).
export function parseReportParams(params: URLSearchParams): ReportQuery {
  const raw: Record<string, unknown> = {};
  for (const key of ['date_from', 'date_to', 'module_id', 'limit', 'cursor'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }

  const status = params.getAll('status');
  if (status.length > 0) {
    raw.status = status;
  }

  const executor = params.getAll('executor');
  if (executor.length > 0) {
    raw.executor = executor;
  }

  return ReportQuerySchema.parse(raw);
}
