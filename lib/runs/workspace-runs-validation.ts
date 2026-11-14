import {
  WORKSPACE_RUN_ENVIRONMENT_MAX_LENGTH,
  WORKSPACE_RUN_MODE_VALUES,
  WORKSPACE_RUN_OUTCOME_VALUES,
  WORKSPACE_RUNS_PAGE_SIZE,
} from '@lib/runs/workspace-runs-constants';
import { z } from 'zod';

// BK-513 — query-string validation for GET /api/v1/workspaces/{id}/runs.
// A failed parse is a ZodError, which the API handler maps to 422
// `validation_failed`. The cursor stays a plain string here and is decoded by
// the route, so a malformed cursor answers 400, the same split as BK-37/BK-38.
//
//   project_id   optional uuid, one Project
//   status       optional, repeatable: passed | failed (no running, no aborted)
//   environment  optional environment NAME, matched case-insensitively across
//                Projects; trimmed, 1..100 characters
//   mode         optional: manual | automated
//   limit        1..50, default 50; out of range is refused, never clamped
//   cursor       optional opaque page token from a previous `next_cursor`

export const WorkspaceRunsQuerySchema = z.object({
  project_id: z.string().uuid().optional(),
  status: z.array(z.enum(WORKSPACE_RUN_OUTCOME_VALUES)).optional(),
  environment: z.string().trim().min(1).max(WORKSPACE_RUN_ENVIRONMENT_MAX_LENGTH).optional(),
  mode: z.enum(WORKSPACE_RUN_MODE_VALUES).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(WORKSPACE_RUNS_PAGE_SIZE)
    .default(WORKSPACE_RUNS_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

export type WorkspaceRunsQuery = z.infer<typeof WorkspaceRunsQuerySchema>;

// Absent keys are dropped before parsing so `.optional()` applies and a missing
// `limit` takes the default. `status` is repeatable and omitted when the caller
// sent none: an empty array would mean "no outcome", which is zero rows, not
// "no filter".
export function parseWorkspaceRunsParams(params: URLSearchParams): WorkspaceRunsQuery {
  const raw: Record<string, unknown> = {};
  for (const key of ['project_id', 'environment', 'mode', 'limit', 'cursor'] as const) {
    const value = params.get(key);
    if (value !== null) {
      raw[key] = value;
    }
  }

  const status = params.getAll('status');
  if (status.length > 0) {
    raw.status = status;
  }

  return WorkspaceRunsQuerySchema.parse(raw);
}
