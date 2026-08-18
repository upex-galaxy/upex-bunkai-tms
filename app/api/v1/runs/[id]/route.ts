import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapRunRpcError } from '@lib/runs/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { getRunExpanded } from '@lib/supabase/rpc';

// GET /api/v1/runs/{id} — read-only expanded Run view (BK-34). Returns the Run
// header (status, executor, environment, snapshot test_title) + the ordered
// run_atcs, each with its ordered run_steps (the snapshot taken at start). Read
// auth only: viewer role suffices and the read-level membership re-check is
// enforced inside the SECURITY DEFINER RPC (`bunkai_get_run_expanded`).
// Non-disclosure (INV-3): missing, not-visible, and foreign-workspace Runs all
// collapse into one identical 404 (`not_found`) — never 403, never an existence
// echo.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const runId = extractRunId(request);
  if (!isUuid(runId)) {
    throw new ApiError('bad_request', 'Run id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await getRunExpanded(supabase, { actorUserId: principal.userId, runId });
  if (error) {
    mapRunRpcError(error);
  }

  return jsonResponse({ run: data }, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'BK-499 pending — runs and tests reads.',
});

function extractRunId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
