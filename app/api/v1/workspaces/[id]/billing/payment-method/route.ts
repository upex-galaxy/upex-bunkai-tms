import type { NextRequest } from 'next/server';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { assertWorkspaceContext } from '@lib/api/principal';
import { assertBillingOwner } from '@lib/billing/billing-state';
import { beginPaymentMethodUpdate } from '@lib/billing/payment-method';
import { workspaceIdFromRequest } from '@lib/billing/route-helpers';

// POST /api/v1/workspaces/{id}/billing/payment-method — the owner starts the
// replacement of the workspace's payment method (BK-231, AC2). Returns the URL
// of Stripe's HOSTED setup page; the card is typed there, never here, and the
// webhook records the outcome. `Idempotency-Key` is required (ADR-0002) and the
// owner gate runs before the idempotency row is written (BK-829 order).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = workspaceIdFromRequest(request);
  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);
  await assertBillingOwner(db, workspaceId, 'replace the payment method');

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: 'POST /api/v1/workspaces/:id/billing/payment-method',
    workspaceId,
    requestPayload: { workspace_id: workspaceId },
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  let responseBody: { url: string };
  try {
    responseBody = await beginPaymentMethodUpdate({ db, workspaceId, userId: principal.userId, idempotencyKey: begin.token.key });
  }
  catch (raw) {
    await discardIdempotencyResult(begin.token);
    throw raw;
  }

  try {
    await recordIdempotencyResult(begin.token, responseBody, 200);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for POST /api/v1/workspaces/:id/billing/payment-method', recordError);
  }
  return jsonResponse(responseBody, { status: 200 });
}, { auth: 'required', requires: ['workspace:admin'] });
