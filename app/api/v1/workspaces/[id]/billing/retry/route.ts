import type { NextRequest } from 'next/server';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { assertWorkspaceContext } from '@lib/api/principal';
import { assertBillingOwner } from '@lib/billing/billing-state';
import { retryFailedRenewal } from '@lib/billing/retry';
import { workspaceIdFromRequest } from '@lib/billing/route-helpers';

// POST /api/v1/workspaces/{id}/billing/retry — the owner retries the failed
// renewal after replacing the payment method (BK-231, AC4). `Idempotency-Key` is
// required (ADR-0002): a client replay returns the stored answer and never
// charges twice; two tabs racing with different keys are stopped by the atomic
// claim in lib/billing/retry.ts. A failure is NOT stored, so the owner can retry
// with a fresh key.
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = workspaceIdFromRequest(request);
  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);
  await assertBillingOwner(db, workspaceId, 'retry a failed renewal');

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: 'POST /api/v1/workspaces/:id/billing/retry',
    workspaceId,
    requestPayload: { workspace_id: workspaceId },
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  let responseBody: { status: 'recovered' };
  try {
    responseBody = await retryFailedRenewal({ db, workspaceId });
  }
  catch (raw) {
    await discardIdempotencyResult(begin.token);
    throw raw;
  }

  try {
    await recordIdempotencyResult(begin.token, responseBody, 200);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for POST /api/v1/workspaces/:id/billing/retry', recordError);
  }
  return jsonResponse(responseBody, { status: 200 });
}, { auth: 'required', requires: ['workspace:admin'] });
