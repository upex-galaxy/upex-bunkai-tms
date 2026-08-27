import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, withApiHandler } from '@lib/api/handler';
import { assertWorkspaceContext } from '@lib/api/principal';
import { cancelBillingCheckout } from '@lib/billing/checkout';
import { NextResponse } from 'next/server';

// POST /api/v1/workspaces/{id}/billing/checkout/cancel — the owner returns
// to the upgrade screen from Stripe's cancel_url. Expires the workspace's
// open Stripe Checkout Session (best-effort) and releases the
// one-open-session lock immediately, rather than stranding the owner for
// Stripe's session TTL. A no-op (still 204) if there is no open session —
// the owner may have already completed or the session may have already
// expired on its own.

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const workspaceId = extractWorkspaceId(request);
  if (!isUuid(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);

  await cancelBillingCheckout({ db, workspaceId });

  return new NextResponse(null, { status: 204 });
}, { auth: 'required', requires: ['workspace:admin'] });

function extractWorkspaceId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
