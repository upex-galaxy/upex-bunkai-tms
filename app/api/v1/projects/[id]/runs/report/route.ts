import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapRunRpcError } from '@lib/runs/errors';
import { decodeRunCursor, encodeRunCursor } from '@lib/runs/history-validation';
import { parseReportParams } from '@lib/runs/report-validation';
import { createAdminClient } from '@lib/supabase/admin';
import { reportProjectRuns } from '@lib/supabase/rpc';

// GET /api/v1/projects/{id}/runs/report — a Project's Runs, filtered by date
// range / module / status / executor (AND-composed), with pass/fail totals
// recomputed from the SAME filtered set (BK-38, Business Rule #3 — the
// OPPOSITE convention from GET /api/v1/tests/{id}/runs's all-time totals, see
// Technical Decision D2). Read auth only, and NO scope requirement yet —
// mirrors the run-history route (the PAT catalog has no run-read scope) per
// the story's own Key Contract Decision ("Future PAT/API access requires
// `run:read` or equivalent — not this story"). The read-level membership
// re-check is enforced inside the SECURITY DEFINER RPC
// (`bunkai_report_project_runs`), where any active role — viewers included —
// passes. Non-disclosure: missing, not-visible, and foreign-workspace
// Projects all collapse into one identical 404 (`not_found`) — never 403,
// never an existence echo.
//
//   ?date_from=<YYYY-MM-DD>          optional, inclusive lower bound on
//                                    started_at (UTC calendar day, D3)
//   ?date_to=<YYYY-MM-DD>            optional, inclusive upper bound;
//                                    rejected (422) when earlier than
//                                    date_from
//   ?module_id=<uuid>                optional, narrows to one Project module
//   ?status=<passed|failed|aborted>  optional, repeatable. `running` is NOT
//                                    an option (D4) — a running Run still
//                                    appears unfiltered, it just isn't a
//                                    selectable filter target
//   ?executor=<human|agent|ci>       optional, repeatable
//   ?limit=<1..50>                   optional, default 50 (out of range ->
//                                    422)
//   ?cursor=<opaque>                 optional page token from a previous
//                                    `next_cursor`; malformed -> 400, never a
//                                    silent full list
//
// Pagination is keyset on (started_at desc, id desc), so every filter
// composes with paging server-side. `totals` is recomputed over the WHOLE
// filtered set (not just the returned page) and changes as filters narrow —
// it answers "how do these filtered Runs stack up", not an all-time count.

interface RunReportPayload {
  items: unknown[]
  totals: { passed: number, failed: number }
  next_cursor: { started_at: string, id: string } | null
}

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const query = parseReportParams(request.nextUrl.searchParams);

  // An unreadable cursor is a client bug, not "start over": answering with the
  // first page would silently re-serve rows the caller already has.
  let cursorStartedAt: string | null = null;
  let cursorId: string | null = null;
  if (query.cursor !== undefined) {
    const decoded = decodeRunCursor(query.cursor);
    if (!decoded.ok) {
      throw new ApiError('bad_request', 'The cursor is not a valid page token.');
    }
    cursorStartedAt = decoded.cursor.startedAt;
    cursorId = decoded.cursor.id;
  }

  const supabase = createAdminClient();
  const { data, error } = await reportProjectRuns(supabase, {
    actorUserId: principal.userId,
    projectId,
    dateFrom: query.date_from ?? null,
    dateTo: query.date_to ?? null,
    moduleId: query.module_id ?? null,
    status: query.status ?? null,
    executorMode: query.executor ?? null,
    limit: query.limit,
    cursorStartedAt,
    cursorId,
  });
  if (error) {
    if (error.code === 'P0002') {
      // The subject here is the Project, not a Run — the shared runs mapper
      // would answer "Run not found." Same status, same non-disclosure,
      // correct noun.
      throw new ApiError('not_found', 'Project not found.', { details: { reason: 'not_found' } });
    }
    mapRunRpcError(error);
  }

  const payload = data as unknown as RunReportPayload;

  return jsonResponse({
    items: payload.items,
    totals: payload.totals,
    // The RPC returns the raw keyset position; the wire token is opaque.
    next_cursor: payload.next_cursor === null
      ? null
      : encodeRunCursor({ startedAt: payload.next_cursor.started_at, id: payload.next_cursor.id }),
  }, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'BK-499 pending — reporting reads.',
});

function extractProjectId(request: NextRequest): string {
  // Path ends in `/{id}/runs/report`, so the id is the third-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-3) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
