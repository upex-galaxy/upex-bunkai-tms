import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapAtcRpcError } from '@lib/atcs/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { restoreAtc } from '@lib/supabase/rpc';

// POST /api/v1/atcs/{id}/restore — restore an ATC archived on its own (BK-571).
// Idempotent: restoring a live ATC is a 200 with `changed: false`, no write and
// no event. Under an archived Module or User Story the ATC stays out of
// circulation with that parent: `held_by_parent` names it and `archived_at`
// carries the parent's timestamp, so the ATC returns when the parent does. Auth:
// Bearer `atc:write` (or cookie).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const atcId = extractAtcId(request);
  if (!isUuid(atcId)) {
    throw new ApiError('bad_request', 'ATC id must be a UUID.');
  }
  const { principal } = getAuth(ctx);
  const { data, error } = await restoreAtc(createAdminClient(), { actorUserId: principal.userId, atcId });
  if (error) {
    mapAtcRpcError(error);
  }
  return jsonResponse({ atc: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// The id is the second-to-last segment: /api/v1/atcs/{id}/restore.
function extractAtcId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
