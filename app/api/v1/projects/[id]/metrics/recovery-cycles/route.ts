import type { RecoveryCycleRawPayload } from '@lib/metrics/recovery-cycle';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapRecoveryCycleRpcError } from '@lib/metrics/errors';
import { buildRecoveryCycleReport } from '@lib/metrics/recovery-cycle';
import { createAdminClient } from '@lib/supabase/admin';
import { reportProjectRecoveryCycles } from '@lib/supabase/rpc';

// GET /api/v1/projects/{id}/metrics/recovery-cycles — a Project's per-user-
// story recovery-cycle report: elapsed time from each story's first failing
// terminal run to its first subsequent all-passing terminal run (BK-47).
// Read auth requiring `atc:read` (BK-499) — mirrors the Runs/Coverage report
// routes: any active workspace role, viewers included, passes the SECURITY
// DEFINER RPC's own membership check. Non-disclosure: missing, foreign-
// workspace, and non-member Projects all collapse into the SAME 404
// (`not_found`), never a 403, never an existence echo.
//
// No query params, no pagination — a project's per-story rollup is small and
// bounded, same shape as the Coverage report (0049_recovery_cycle_report.sql).
//
// The RPC returns only raw per-story timestamps + state (Decision 3); THIS
// route computes `median_recovery_seconds`, `resolved_cycle_count`, and each
// row's `cycle_seconds` from that raw payload via lib/metrics/recovery-cycle.ts
// — never passed through blindly. `now` (the render-time clock an
// `in_progress` row's "so far" reading is measured against, Decision 6) is
// captured once per request, not re-read per row.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await reportProjectRecoveryCycles(supabase, {
    actorUserId: principal.userId,
    projectId,
  });
  if (error) {
    mapRecoveryCycleRpcError(error);
  }

  const raw = data as unknown as RecoveryCycleRawPayload;
  const report = buildRecoveryCycleReport(raw, Date.now());

  return jsonResponse(report, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function extractProjectId(request: NextRequest): string {
  // Path ends in `/{id}/metrics/recovery-cycles`, so the id is the
  // third-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-3) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
