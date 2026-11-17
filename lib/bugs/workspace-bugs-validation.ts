import { BUG_SEVERITY_VALUES, BUG_STATUS_VALUES } from '@lib/bugs/constants';
import { WORKSPACE_BUGS_PAGE_SIZE } from '@lib/bugs/workspace-bugs-constants';
import { z } from 'zod';

// BK-555 — query-string validation for GET /api/v1/workspaces/{id}/bugs. The
// wire shape of `status` and `severity` is the Project list's (BK-41): a comma
// list, OR within the field. A failed parse is a ZodError, which the API
// handler maps to 422 `validation_failed`. The cursor stays a plain string here
// and is decoded by the route, so a malformed cursor answers 400.
//
//   project_id  optional uuid, one Project
//   status      optional comma list of open | in_progress | resolved | closed
//   severity    optional comma list of P1 | P2 | P3 | P4
//   limit       1..50, default 50; out of range is refused, never clamped
//   cursor      optional opaque page token from a previous `next_cursor`

function commaSeparatedEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .transform(value => value.split(',').map(v => v.trim()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));
}

export const WorkspaceBugsQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  status: commaSeparatedEnum(BUG_STATUS_VALUES).optional(),
  severity: commaSeparatedEnum(BUG_SEVERITY_VALUES).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(WORKSPACE_BUGS_PAGE_SIZE)
    .default(WORKSPACE_BUGS_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

export type WorkspaceBugsQuery = z.infer<typeof WorkspaceBugsQuerySchema>;

// Absent keys are dropped before parsing so `.optional()` applies and a missing
// `limit` takes the default.
export function parseWorkspaceBugsParams(params: URLSearchParams): WorkspaceBugsQuery {
  const raw: Record<string, string> = {};
  for (const key of ['project_id', 'status', 'severity', 'limit', 'cursor'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }
  return WorkspaceBugsQuerySchema.parse(raw);
}
