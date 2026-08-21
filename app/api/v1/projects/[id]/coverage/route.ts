import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapCoverageRpcError } from '@lib/coverage/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { reportProjectCoverage } from '@lib/supabase/rpc';

// GET /api/v1/projects/{id}/coverage — a Project's coverage rollup: modules
// with untested/uncovered acceptance criteria and a "not run" indicator
// (BK-46). Read auth requiring `atc:read` (BK-499) — mirrors the Runs report
// route (`/api/v1/projects/{id}/runs/report`): any active workspace role,
// viewers included, passes the SECURITY DEFINER RPC's own membership check
// (PO decision Q5, this is not a privileged QA-only screen). Non-disclosure:
// missing, foreign-workspace, and non-member Projects all collapse into the
// SAME 404 (`not_found`), never a 403, never an existence echo.
//
// No query params, no pagination — a project's module/AC coverage rollup is
// small and bounded (unlike the Runs report), and the UI filters the whole
// payload client-side (Technical Decision, 0048_project_coverage_report.sql).

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await reportProjectCoverage(supabase, {
    actorUserId: principal.userId,
    projectId,
  });
  if (error) {
    mapCoverageRpcError(error);
  }

  return jsonResponse(data, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function extractProjectId(request: NextRequest): string {
  // Path ends in `/{id}/coverage`, so the id is the second-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
