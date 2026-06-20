import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapAtcUsageRpcError } from '@lib/atcs/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { atcUsage } from '@lib/supabase/rpc';

// GET /api/v1/atcs/{id}/usage — read-only "used in N tests" report for an ATC
// (BK-22). Auth: Bearer `atc:read` (or a cookie session). The SECURITY DEFINER
// RPC resolves the ATC's workspace, gates the actor's active membership of it,
// then returns the distinct Tests that chain the ATC (id + title + the
// positions it occupies, ordered by Test title). A reachable ATC with no
// chaining Tests returns 200 { count: 0, used_in: [] } — NOT a 404. A
// nonexistent, archived, or cross-workspace ATC raises a uniform not_found
// (404), never leaking which case it was.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const atcId = extractAtcId(request);
  if (!isUuid(atcId)) {
    throw new ApiError('bad_request', 'ATC id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await atcUsage(supabase, {
    actorUserId: principal.userId,
    atcId,
  });
  if (error) {
    mapAtcUsageRpcError(error);
  }

  // The RPC returns { count, used_in } already isolated + ordered.
  return jsonResponse(data, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

// The id is the second-to-last segment: /api/v1/atcs/{id}/usage.
function extractAtcId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
