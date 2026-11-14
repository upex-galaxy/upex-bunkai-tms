import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { decodeRunCursor } from '@lib/runs/history-validation';
import { listWorkspaceRuns } from '@lib/runs/workspace-runs';
import { parseWorkspaceRunsParams } from '@lib/runs/workspace-runs-validation';

// GET /api/v1/workspaces/{id}/runs — every Run of the workspace, newest first,
// keyset paginated on (started_at desc, id desc), with each Run's passed /
// failed / blocked step counts (BK-513). Filters AND-compose and travel with
// the cursor; paging never stops before the last Run (no artificial cap).
//
//   ?project_id=<uuid>             optional, one Project
//   ?status=<passed|failed>        optional, repeatable. `running` and
//                                  `aborted` are not filter options (AC-08,
//                                  AC-09); such Runs still list unfiltered
//   ?environment=<name>            optional, environment name across Projects,
//                                  case-insensitive
//   ?mode=<manual|automated>       optional
//   ?limit=<1..50>                 optional, default 50; out of range -> 422
//   ?cursor=<opaque>               optional; malformed -> 400, never a silent
//                                  first page
//
// `workspace_run_count` is the unfiltered count the sidebar badge shows, from
// the same helper, so AC-02 is checkable by API.
//
// Auth: cookie session or Bearer PAT holding `atc:read`, the floor the sibling
// `/active-runs` read uses (the catalog has no run-read scope, and
// `run:execute` is a write capability). Every read runs through the caller's
// own RLS-scoped client and the RPC is SECURITY INVOKER (0127), so a foreign,
// nonexistent or lost-membership workspace id returns the SAME empty `200` an
// empty workspace does, never an existence echo.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const query = parseWorkspaceRunsParams(request.nextUrl.searchParams);

  let cursor: { startedAt: string, id: string } | null = null;
  if (query.cursor !== undefined) {
    const decoded = decodeRunCursor(query.cursor);
    if (!decoded.ok) {
      throw new ApiError('bad_request', 'The cursor is not a valid page token.');
    }
    cursor = decoded.cursor;
  }

  const { db } = getAuth(ctx);
  const result = await listWorkspaceRuns(db, {
    workspaceId,
    projectId: query.project_id ?? null,
    status: query.status ?? null,
    environment: query.environment ?? null,
    mode: query.mode ?? null,
    limit: query.limit,
    cursor,
  });
  // A failed read never leaves here as an empty list: that is the answer for
  // an empty workspace, and a client could not tell the two apart.
  if (!result.ok) {
    throw new ApiError('internal_error', 'The workspace\'s runs could not be read.');
  }

  return jsonResponse(result.page, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function extractWorkspaceId(request: NextRequest): string {
  // `/api/v1/workspaces/{id}/runs` -> the segment right after "workspaces".
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
