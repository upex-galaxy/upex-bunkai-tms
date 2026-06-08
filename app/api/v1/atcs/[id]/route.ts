import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapAtcRpcError } from '@lib/atcs/errors';
import { readVersionPrecondition } from '@lib/atcs/optimistic-lock';
import { sanitizeAtcAssertions, sanitizeAtcSteps } from '@lib/atcs/sanitize';
import { AtcUpdateBodySchema, stepPositionsError } from '@lib/atcs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { getAtc, updateAtc } from '@lib/supabase/rpc';

// PATCH /api/v1/atcs/{id} — edit an ATC (BK-18). PUT-style full replace: omitted
// children are cleared, not merged. An empty body is a 200 no-op (no version
// bump, no event). Optimistic locking via `X-If-Match: <version>` (409 on
// mismatch); the reserved `If-Match` header cannot be used on Vercel (the edge
// rewrites it to 412 — BK-96) but is read as an off-Vercel fallback.
// user_story_id / module_id / slug are immutable. Auth: Bearer `atc:write`
// (or cookie).

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const atcId = extractAtcId(request);
  if (!isUuid(atcId)) {
    throw new ApiError('bad_request', 'ATC id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const raw = (await request.text()).trim();
  const supabase = createAdminClient();

  // Empty body = no-op: return the current ATC (membership-gated), no bump, no event.
  if (raw === '' || raw === '{}') {
    const { data, error } = await getAtc(supabase, { actorUserId: principal.userId, atcId });
    if (error) {
      mapAtcRpcError(error);
    }
    return jsonResponse({ atc: data }, { status: 200 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  if (parsed !== null && typeof parsed === 'object' && Object.keys(parsed).length === 0) {
    const { data, error } = await getAtc(supabase, { actorUserId: principal.userId, atcId });
    if (error) {
      mapAtcRpcError(error);
    }
    return jsonResponse({ atc: data }, { status: 200 });
  }

  const body = AtcUpdateBodySchema.parse(parsed);

  const positionError = stepPositionsError(body.steps);
  if (positionError) {
    throw new ApiError('steps_position_invalid', 'Step positions must be integers, strictly increasing from 1.', {
      details: positionError,
    });
  }

  // Optimistic lock. The version token rides `X-If-Match` (custom header) so the
  // Vercel edge does not intercept it as an RFC 7232 precondition (BK-96).
  const precondition = readVersionPrecondition(request.headers);
  if (!precondition.ok) {
    throw new ApiError('bad_request', 'X-If-Match must be a decimal integer version.');
  }
  const ifMatch = precondition.version;

  const { data, error } = await updateAtc(supabase, {
    actorUserId: principal.userId,
    atcId,
    ifMatch,
    title: body.title.trim(),
    layer: body.layer,
    tags: body.tags,
    steps: sanitizeAtcSteps(body.steps),
    assertions: sanitizeAtcAssertions(body.assertions),
    acIds: body.acceptance_criterion_ids,
  });
  if (error) {
    mapAtcRpcError(error);
  }

  return jsonResponse({ atc: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

function extractAtcId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
