import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { decodeBugsCursor } from '@lib/bugs/list-cursor';
import { listWorkspaceBugs } from '@lib/bugs/workspace-bugs';
import { parseWorkspaceBugsParams } from '@lib/bugs/workspace-bugs-validation';

// GET /api/v1/workspaces/{id}/bugs — every defect of the workspace across its
// Projects, most severe first then most recently filed, keyset paginated on
// (severity asc, created_at desc, id desc), with severity and status counts
// over the whole filtered set (BK-555). Defects on archived modules are not
// listed and not counted. Filters AND-compose and travel with the cursor;
// paging never stops before the last defect (no artificial cap).
//
//   ?project_id=<uuid>                     optional, one Project
//   ?status=<open,in_progress,...>         optional comma list, OR within
//   ?severity=<P1,P2,...>                  optional comma list, OR within
//   ?limit=<1..50>                         optional, default 50; out of range -> 422
//   ?cursor=<opaque>                       optional; malformed -> 400, never a
//                                          silent first page
//
// `workspace_bug_count` is the unfiltered count the sidebar badge shows, from
// the same helper, so AC-02 is checkable by API.
//
// Auth: cookie session or Bearer PAT holding `atc:read`, the floor every
// workspace read and the Project defect list use. Every read runs through the
// caller's own RLS-scoped client and the function is SECURITY INVOKER (0132),
// so a foreign, nonexistent or lost-membership workspace id returns the SAME
// empty `200` an empty workspace does, never an existence echo.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const query = parseWorkspaceBugsParams(request.nextUrl.searchParams);

  let cursor = null;
  if (query.cursor !== undefined) {
    const decoded = decodeBugsCursor(query.cursor);
    if (!decoded.ok) {
      throw new ApiError('bad_request', 'The cursor is not a valid page token.');
    }
    cursor = decoded.cursor;
  }

  const { db } = getAuth(ctx);
  const result = await listWorkspaceBugs(db, {
    workspaceId,
    projectId: query.project_id ?? null,
    statuses: query.status ?? null,
    severities: query.severity ?? null,
    limit: query.limit,
    cursor,
  });
  // A failed read never leaves here as an empty list: that is the answer for
  // an empty workspace, and a client could not tell the two apart.
  if (!result.ok) {
    throw new ApiError('internal_error', 'The workspace\'s defects could not be read.');
  }

  return jsonResponse(result.page, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function extractWorkspaceId(request: NextRequest): string {
  // `/api/v1/workspaces/{id}/bugs` -> the segment right after "workspaces".
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
