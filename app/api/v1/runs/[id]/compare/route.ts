import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { extractCompareRunId, fetchRunComparison, isUuid } from './response';

// GET /api/v1/runs/{id}/compare — the comparison of a Run against the Previous run
// of the same Test and Environment (BK-442), the API twin of the page
// `/projects/{slug}/runs/{runId}/compare`. Both read the SAME database function
// (`bunkai_compare_run`, 0092_run_compare.sql), so they cannot disagree.
//
// Auth: cookie session or Bearer PAT with `atc:read` (the scope every Run read
// uses). Any active workspace member, viewer included, may read it. A missing Run,
// a Run in another workspace and a non-member all collapse into one identical 404
// (`not_found`), exactly like `GET /api/v1/runs/{id}`; 400 for a malformed id, 401
// without credentials, 403 without `atc:read`.
//
// The four outcomes are ALL HTTP 200 and are branched on `state`: `compared`,
// `no_previous`, `in_progress`, `unreliable`. Only `compared` carries a verdict. A
// non-compared 200 means "no verdict", never "no new failures": a pipeline must not
// read `counts.new_failure === 0` out of a response that has no `counts`.
//
// SECURITY: the function is SECURITY INVOKER with no identity parameter, so row-level
// security on the CALLER's own client is the only authorization. This route therefore
// uses `db` from `getAuth(ctx)` and must NEVER use `createAdminClient()` (the
// service role bypasses RLS; the function refuses a caller with no `auth.uid()`, but
// the route must not depend on that backstop).
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { pathname } = new URL(request.url);
  const runId = extractCompareRunId(pathname);
  if (!isUuid(runId)) {
    throw new ApiError('bad_request', 'Run id must be a UUID.');
  }

  const { db } = getAuth(ctx);
  const comparison = await fetchRunComparison(db, runId, {
    requestId: ctx.requestId,
    method: request.method,
    path: pathname,
  });

  return jsonResponse(comparison, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });
