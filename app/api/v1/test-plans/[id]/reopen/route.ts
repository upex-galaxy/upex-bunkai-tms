import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { reopenTestPlan } from '@lib/supabase/rpc';
import { mapTestPlanCloseRpcError } from '@lib/test-plans/errors';

// POST /api/v1/test-plans/{id}/reopen — return a Closed plan to Open (BK-207). Same gate
//      as close (the plan's creator or an admin and above). Verdict, summary and the
//      progress snapshot are cleared; the close and reopen entries stay in the plan's
//      history. Same posture as close: the RPC reads auth.uid(), so it runs through the
//      caller's own client only.

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const testPlanId = extractTestPlanId(request);
  if (!isUuid(testPlanId)) {
    throw new ApiError('bad_request', 'Test plan id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const { data, error } = await reopenTestPlan(db, { testPlanId });
  if (error) {
    mapTestPlanCloseRpcError(error);
  }

  return jsonResponse({ test_plan: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

function extractTestPlanId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
