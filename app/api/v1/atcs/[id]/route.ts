import type { NextRequest } from 'next/server';
import { requireAuth, requireScopeOrCookie } from '@lib/api/auth';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapAtcRpcError } from '@lib/atcs/errors';
import { sanitizeAtcAssertions, sanitizeAtcSteps } from '@lib/atcs/sanitize';
import { AtcUpdateBodySchema, stepPositionsError } from '@lib/atcs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { getAtc, updateAtc } from '@lib/supabase/rpc';

// PATCH /api/v1/atcs/{id} — edit an ATC (BK-18). PUT-style full replace: omitted
// children are cleared, not merged. An empty body is a 200 no-op (no version
// bump, no event). Optimistic locking via `If-Match: <version>` (409 on
// mismatch). user_story_id / module_id / slug are immutable. Auth: Bearer
// `atc:write` (or cookie).

export const PATCH = withApiHandler(async (request: NextRequest) => {
  const atcId = extractAtcId(request);
  if (!isUuid(atcId)) {
    throw new ApiError('bad_request', 'ATC id must be a UUID.');
  }

  const auth = await requireAuth(request);
  requireScopeOrCookie(auth, 'atc:write');

  const raw = (await request.text()).trim();
  const supabase = createAdminClient();

  // Empty body = no-op: return the current ATC (membership-gated), no bump, no event.
  if (raw === '' || raw === '{}') {
    const { data, error } = await getAtc(supabase, { actorUserId: auth.userId, atcId });
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
    const { data, error } = await getAtc(supabase, { actorUserId: auth.userId, atcId });
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

  // Optimistic lock (RFC 7232). If-Match value is the current version integer.
  const ifMatch = parseIfMatch(request.headers.get('if-match'));

  const { data, error } = await updateAtc(supabase, {
    actorUserId: auth.userId,
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
});

function parseIfMatch(header: string | null): number | null {
  // Absent header → skip the optimistic-lock check. A present header must be a
  // plain decimal version (strip the RFC 7232 weak prefix + quotes first):
  // empty, hex/octal/exponential, etc. are rejected with 400 rather than
  // silently coerced (`Number('')` is 0, `Number('0x1F')` is 31).
  if (header === null) {
    return null;
  }
  const cleaned = header.trim().replace(/^W\//, '').replace(/^"|"$/g, '').trim();
  if (!/^\d+$/.test(cleaned)) {
    throw new ApiError('bad_request', 'If-Match must be a decimal integer version.');
  }
  return Number(cleaned);
}

function extractAtcId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
