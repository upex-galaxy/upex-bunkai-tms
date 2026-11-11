import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { AtcBulkEditBodySchema } from '@lib/atcs/bulk-edit-validation';
import { mapAtcRpcError } from '@lib/atcs/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { bulkEditAtcs } from '@lib/supabase/rpc';

// POST /api/v1/atcs/bulk-edit — change tags (add | remove), Module, layer or
// priority on up to 200 ATCs of one Project in one request (BK-507, ADR-0027).
//
// ONE field per request. Partial success is the normal shape: the 200 body lists
// one outcome per ATC (`changed`, `unchanged` or `refused` with a reason from a
// fixed vocabulary) and the changes that succeeded are kept. A request-level
// failure (malformed body, empty or oversized selection, unusable destination,
// no write access) answers an error envelope with nothing written. `dry_run:
// true` runs the same evaluation without writing, for the confirmation step.
// A no-op is a success: no version bump, no event. Each changed ATC emits its own
// `atc.updated` event with the distinct chaining Test ids, exactly like a single
// edit. Auth: Bearer `atc:write` (or cookie).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);

  let parsed: unknown;
  try {
    parsed = await request.json();
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  const body = AtcBulkEditBodySchema.parse(parsed);

  const { data, error } = await bulkEditAtcs(createAdminClient(), {
    actorUserId: principal.userId,
    projectId: body.project_id,
    items: body.items,
    field: body.field,
    change: body.change,
    dryRun: body.dry_run,
  });
  if (error) {
    mapAtcRpcError(error);
  }
  return jsonResponse(data, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
}, { auth: 'required', requires: ['atc:write'] });
