import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapAtcRpcError } from '@lib/atcs/errors';
import { AtcDuplicateBodySchema } from '@lib/atcs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { duplicateAtc } from '@lib/supabase/rpc';

// POST /api/v1/atcs/{id}/duplicate — deep-copy an ATC into a new one (BK-23).
// Auth: Bearer `atc:write` (or a cookie session). The SECURITY DEFINER RPC
// reads the source header + ordered steps/assertions + AC bindings and inserts
// an independent ATC graph in ONE transaction: fresh slug, version = 1, and a
// title defaulting to `<source> (copy)` (or the optional body `new_title` —
// BK-184: the request field name matches FR-014's documented contract).
// Emits an `atc.created` event — the copy is a normal create downstream.

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const sourceAtcId = extractAtcId(request);
  if (!isUuid(sourceAtcId)) {
    throw new ApiError('bad_request', 'ATC id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  // Body is optional: an empty body duplicates with the default `(copy)` title.
  const raw = (await request.text()).trim();
  let title: string | undefined;
  if (raw !== '' && raw !== '{}') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    }
    catch {
      throw new ApiError('bad_request', 'Request body must be valid JSON.');
    }
    title = AtcDuplicateBodySchema.parse(parsed).new_title;
  }

  const supabase = createAdminClient();
  const { data, error } = await duplicateAtc(supabase, {
    actorUserId: principal.userId,
    sourceAtcId,
    title: title?.trim(),
  });
  if (error) {
    mapAtcRpcError(error);
  }

  return jsonResponse({ atc: data }, { status: 201 });
}, { auth: 'required', requires: ['atc:write'] });

// The id is the second-to-last segment: /api/v1/atcs/{id}/duplicate.
function extractAtcId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
