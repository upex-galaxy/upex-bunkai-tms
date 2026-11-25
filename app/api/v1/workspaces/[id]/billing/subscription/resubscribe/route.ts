import type { NextRequest } from 'next/server';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { assertWorkspaceContext } from '@lib/api/principal';
import { workspaceIdFromRequest } from '@lib/billing/route-helpers';
import { resubscribe } from '@lib/billing/subscription';

// The client Idempotency-Key also namespaces the Stripe key, so a replay never reaches Stripe twice.
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = workspaceIdFromRequest(request);
  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: 'POST /api/v1/workspaces/:id/billing/subscription/resubscribe',
    workspaceId,
    requestPayload: { workspace_id: workspaceId },
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  let result: Awaited<ReturnType<typeof resubscribe>>;
  try {
    result = await resubscribe(db, workspaceId, request.headers.get('idempotency-key') as string);
  }
  catch (error) {
    await discardIdempotencyResult(begin.token);
    throw error;
  }
  try {
    await recordIdempotencyResult(begin.token, result, 200);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for POST /api/v1/workspaces/:id/billing/subscription/resubscribe', recordError);
  }
  return jsonResponse(result, { status: 200 });
}, { auth: 'required', requires: ['workspace:admin'] });
