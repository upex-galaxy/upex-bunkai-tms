import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { assertWorkspaceContext } from '@lib/api/principal';
import { workspaceIdFromRequest } from '@lib/billing/route-helpers';
import { confirmDowngrade, previewDowngrade } from '@lib/billing/subscription';
import { z } from 'zod';

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = workspaceIdFromRequest(request);
  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);
  return jsonResponse(await previewDowngrade(db, workspaceId), { status: 200 });
}, { auth: 'required', requires: ['workspace:admin'] });

const ConfirmBody = z.object({
  target_plan: z.literal('community'),
  expected_read_only_project_ids: z.array(z.string().uuid()).max(500),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = workspaceIdFromRequest(request);
  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);

  const raw = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be JSON.');
  });
  const body = ConfirmBody.parse(raw);

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: 'POST /api/v1/workspaces/:id/billing/downgrade',
    workspaceId,
    requestPayload: { workspace_id: workspaceId, ...body },
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  let result: Awaited<ReturnType<typeof confirmDowngrade>>;
  try {
    result = await confirmDowngrade(db, workspaceId, body.expected_read_only_project_ids);
  }
  catch (error) {
    await discardIdempotencyResult(begin.token);
    throw error;
  }
  try {
    await recordIdempotencyResult(begin.token, result, 200);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for POST /api/v1/workspaces/:id/billing/downgrade', recordError);
  }
  return jsonResponse(result, { status: 200 });
}, { auth: 'required', requires: ['workspace:admin'] });
