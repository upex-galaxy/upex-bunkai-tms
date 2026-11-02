import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { INVOICE_PAGE_DEFAULT, INVOICE_PAGE_MAX, listWorkspaceInvoices } from '@lib/billing/invoices';
import { workspaceIdFromRequest } from '@lib/billing/route-helpers';

// GET /api/v1/workspaces/{id}/billing/invoices — the workspace's issued invoices,
// newest first (BK-231, AC3). Owner and admin only: the authorization is the
// caller's own RLS read of the workspace -> Stripe customer mapping, so a member,
// a Community workspace and another workspace all answer the same 404. The
// Stripe customer is never taken from the request.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = workspaceIdFromRequest(request);
  const { db } = getAuth(ctx);

  const params = new URL(request.url).searchParams;
  const rawLimit = params.get('limit');
  let limit = INVOICE_PAGE_DEFAULT;
  if (rawLimit !== null) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > INVOICE_PAGE_MAX) {
      throw new ApiError('bad_request', `limit must be a whole number between 1 and ${INVOICE_PAGE_MAX}.`);
    }
  }
  const startingAfter = params.get('starting_after') ?? undefined;
  if (startingAfter !== undefined && !/^in_\w{4,64}$/.test(startingAfter)) {
    throw new ApiError('bad_request', 'starting_after must be an invoice id.');
  }

  const result = await listWorkspaceInvoices({ db, workspaceId, limit, startingAfter });
  return jsonResponse(result, { status: 200 });
// Same scope floor as the sibling billing read (GET /billing).
}, { auth: 'required', requires: ['atc:read'] });
