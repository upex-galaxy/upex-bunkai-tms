import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { closeTestPlan } from '@lib/supabase/rpc';
import { TestPlanCloseBodySchema } from '@lib/test-plans/close-validation';
import { mapTestPlanCloseRpcError } from '@lib/test-plans/errors';

// POST /api/v1/test-plans/{id}/close — close an Open plan with a required verdict
//      (passed | failed) and an optional outcome summary (BK-207). The SECURITY DEFINER
//      RPC holds the whole rulebook: creator-or-admin gate, state check, verdict and
//      summary rules, the progress snapshot and the history entry, all in one atomic
//      write. This handler does parsing and error mapping only.
//
//      No actor or scope parameter exists: `bunkai_close_test_plan` reads auth.uid(), so
//      it MUST run through the caller's own RLS-scoped client (never
//      `createAdminClient()`, whose auth.uid() is null and is refused with 404).
//      `atc:write` is the coarse capability gate; the finer creator-or-admin check is
//      the RPC's, re-derived live on every call.

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const testPlanId = extractTestPlanId(request);
  if (!isUuid(testPlanId)) {
    throw new ApiError('bad_request', 'Test plan id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = TestPlanCloseBodySchema.parse(payload);

  const { data, error } = await closeTestPlan(db, {
    testPlanId,
    verdict: body.verdict,
    summary: body.summary,
  });
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
