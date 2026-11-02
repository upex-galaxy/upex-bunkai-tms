import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { assertWorkspaceContext } from '@lib/api/principal';
import { BillingDetailsSchema, saveBillingDetails } from '@lib/billing/billing-details';
import { assertBillingOwner } from '@lib/billing/billing-state';
import { workspaceIdFromRequest } from '@lib/billing/route-helpers';

// PATCH /api/v1/workspaces/{id}/billing/details — the owner updates the company
// name, billing email and billing address (BK-231, AC1). Owner-only: the owner
// gate runs BEFORE the body is read, so a non-owner (or a caller probing an
// unknown workspace id) gets the identical 403 whatever they send, and a
// rejected body can never have changed anything. The save is a full replace of
// the profile (every field is sent), hence naturally idempotent: no
// Idempotency-Key. Stripe learns the new details first (see
// lib/billing/billing-details.ts), which is what makes LATER invoices carry them
// while issued invoices stay untouched.
export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = workspaceIdFromRequest(request);
  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);
  await assertBillingOwner(db, workspaceId, 'edit billing details');

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const input = BillingDetailsSchema.parse(payload);

  const profile = await saveBillingDetails({ db, workspaceId, userId: principal.userId, input });
  return jsonResponse(profile, { status: 200 });
// workspace:admin (ADR-0006): a billing write, same capability class as checkout.
// The owner-vs-admin distinction is assertBillingOwner (bunkai_is_workspace_owner).
}, { auth: 'required', requires: ['workspace:admin'] });
