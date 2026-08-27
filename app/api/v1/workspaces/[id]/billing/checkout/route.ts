import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { beginIdempotentRequest, discardIdempotencyResult, recordIdempotencyResult } from '@lib/api/idempotency';
import { assertWorkspaceContext } from '@lib/api/principal';
import { beginBillingCheckout } from '@lib/billing/checkout';
import { z } from 'zod';

// POST /api/v1/workspaces/{id}/billing/checkout — start a self-serve
// Community -> Cloud upgrade (BK-230). Owner-only (bunkai_is_workspace_owner,
// enforced in lib/billing/checkout.ts BEFORE any Stripe call — an
// unauthorized caller never causes a Stripe session to be created).
//
// `Idempotency-Key` is REQUIRED (ADR-0002's contract, same wiring as
// POST /api/v1/runs): a client retry with the same key + payload replays the
// stored response instead of starting a second checkout. This is a DIFFERENT
// guard from the one-open-session-per-workspace partial unique index in
// lib/billing/checkout.ts — that one covers two DIFFERENT keys (two tabs,
// two Idempotency-Keys) racing for the same workspace; this one covers a
// single client's own network retry.
//
// Returns the Stripe-hosted Checkout URL for the client to redirect to.
// Plan activation itself happens asynchronously via the webhook
// (app/api/v1/billing/webhook/route.ts) once Stripe confirms payment — this
// route never touches workspaces.plan.

const CheckoutBodySchema = z.object({
  seat_quantity: z.number().int(),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);
  // A workspace-scoped PAT may only act on its own workspace (ADR-0006).
  assertWorkspaceContext(principal, workspaceId);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { seat_quantity: seatQuantity } = CheckoutBodySchema.parse(payload);

  const begin = await beginIdempotentRequest({
    headers: request.headers,
    userId: principal.userId,
    endpoint: 'POST /api/v1/workspaces/:id/billing/checkout',
    workspaceId,
    requestPayload: { workspace_id: workspaceId, seat_quantity: seatQuantity },
  });
  if (begin.isReplay) {
    return jsonResponse(begin.snapshot, { status: begin.status });
  }

  let responseBody: { url: string } | null = null;
  try {
    responseBody = await beginBillingCheckout({
      db,
      workspaceId,
      userId: principal.userId,
      seatQuantity,
      idempotencyKey: begin.token.key,
    });
  }
  catch (raw) {
    await discardIdempotencyResult(begin.token);
    throw raw;
  }

  try {
    await recordIdempotencyResult(begin.token, responseBody, 200);
  }
  catch (recordError) {
    console.error('idempotency snapshot store failed for POST /api/v1/workspaces/:id/billing/checkout', recordError);
  }

  return jsonResponse(responseBody, { status: 200 });
// workspace:admin (ADR-0006): a money-moving, owner-only write, same
// capability class as the invites admin routes. Pairs with
// assertWorkspaceContext above per that ADR's binding invariant. The
// stricter owner-vs-admin distinction is enforced inside
// beginBillingCheckout (bunkai_is_workspace_owner) — workspace:admin is the
// TS-layer scope floor, not the full authorization story.
}, { auth: 'required', requires: ['workspace:admin'] });

function extractWorkspaceId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
