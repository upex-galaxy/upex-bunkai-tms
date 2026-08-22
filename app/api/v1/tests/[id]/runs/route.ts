import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapRunRpcError } from '@lib/runs/errors';
import { decodeRunCursor, encodeRunCursor, parseRunHistoryParams } from '@lib/runs/history-validation';
import { createAdminClient } from '@lib/supabase/admin';
import { listTestRuns } from '@lib/supabase/rpc';

// GET /api/v1/tests/{id}/runs — a Test's past Runs, newest first (BK-37).
// Returns ONLY terminal Runs (passed | failed | aborted): an in-progress Run is
// never history and is never counted. Requires `atc:read` (BK-499) —
// mirrors GET /api/v1/runs/{id}: the PAT catalog has no run-read scope, so run
// history reuses the read scope rather than minting a fifth one; the
// read-level membership re-check is enforced inside the SECURITY DEFINER RPC
// (`bunkai_list_test_runs`), where any active role — viewers included — passes.
// Non-disclosure (INV-3): missing, not-visible, and foreign-workspace Tests all
// collapse into one identical 404 (`not_found`) — never 403, never an existence
// echo.
//
//   ?outcome=passed|failed|aborted  optional; `running` is rejected (422)
//   ?limit=<1..50>                  optional, default 50 (out of range → 422)
//   ?cursor=<opaque>                optional page token from a previous
//                                   `next_cursor`; malformed → 400, never a
//                                   silent full list
//
// Pagination is keyset on (started_at desc, id desc), so the filter composes
// with paging server-side: page 2 of a filtered history returns only that
// outcome. `totals` is all-time and filter-invariant — it answers "how has this
// Test fared overall", not "what is on screen".

interface RunHistoryPayload {
  items: unknown[]
  totals: { passed: number, failed: number, aborted: number }
  next_cursor: { started_at: string, id: string } | null
}

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const testId = extractTestId(request);
  if (!isUuid(testId)) {
    throw new ApiError('bad_request', 'Test id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const query = parseRunHistoryParams(request.nextUrl.searchParams);

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
  const { data, error } = await listTestRuns(supabase, {
    actorUserId: principal.userId,
    testId,
    outcome: query.outcome ?? null,
    limit: query.limit,
    cursorStartedAt,
    cursorId,
  });
  if (error) {
    if (error.code === 'P0002') {
      // The subject here is the Test, not a Run — the shared runs mapper would
      // answer "Run not found." Same status, same non-disclosure, correct noun.
      throw new ApiError('not_found', 'Test not found.', { details: { reason: 'not_found' } });
    }
    mapRunRpcError(error);
  }

  const payload = data as unknown as RunHistoryPayload;

  return jsonResponse({
    items: payload.items,
    totals: payload.totals,
    // The RPC returns the raw keyset position; the wire token is opaque.
    next_cursor: payload.next_cursor === null
      ? null
      : encodeRunCursor({ startedAt: payload.next_cursor.started_at, id: payload.next_cursor.id }),
  }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

function extractTestId(request: NextRequest): string {
  // Path ends in `/{id}/runs`, so the id is the second-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
