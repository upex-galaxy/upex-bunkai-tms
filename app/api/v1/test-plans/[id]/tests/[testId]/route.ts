import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { removeTestFromPlan } from '@lib/supabase/rpc';
import { mapTestPlanTestsRpcError } from '@lib/test-plans/errors';

// DELETE /api/v1/test-plans/{id}/tests/{testId} — remove one test from a plan
//        (member+, plan must be Open). Removing a membership never touches
//        the Test itself (business-rules.md) — this route and its RPC only
//        ever reach `test_plan_tests`. Per-row action, matching the mockup's
//        per-row remove control; no bulk remove.

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { testPlanId, testId } = extractIds(request);
  if (!isUuid(testPlanId) || !isUuid(testId)) {
    throw new ApiError('bad_request', 'Test plan id and test id must both be UUIDs.');
  }

  const { db } = getAuth(ctx);

  // `bunkai_remove_test_from_plan` carries NO p_actor_user_id — same
  // no-actor, session-client-only contract as the add path.
  const { data, error } = await removeTestFromPlan(db, { testPlanId, testId });
  if (error) {
    mapTestPlanTestsRpcError(error);
  }

  return jsonResponse(data, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

function extractIds(request: NextRequest): { testPlanId: string, testId: string } {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const idx = segments.lastIndexOf('test-plans');
  return {
    testPlanId: idx >= 0 ? (segments[idx + 1] ?? '') : '',
    testId: segments.at(-1) ?? '',
  };
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
