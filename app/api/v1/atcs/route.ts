import type { NextRequest } from 'next/server';
import { requireAuth, requireScopeOrCookie } from '@lib/api/auth';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapAtcRpcError } from '@lib/atcs/errors';
import { sanitizeAtcAssertions, sanitizeAtcSteps } from '@lib/atcs/sanitize';
import { AtcCreateBodySchema, stepPositionsError } from '@lib/atcs/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { createAtc } from '@lib/supabase/rpc';

// POST /api/v1/atcs — create an ATC with its steps and assertions in one
// transactional call (BK-18). Auth: Bearer `atc:write` (or a cookie session).
// The SECURITY DEFINER RPC derives the project from the user story, validates
// the cross-entity rules (AC ∈ US, module ∈ US's project subtree), computes the
// immutable slug, writes atcs + children, and emits atc.created.

export const POST = withApiHandler(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  requireScopeOrCookie(auth, 'atc:write');

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = AtcCreateBodySchema.parse(payload);

  // Step positions: integers, strictly increasing, starting at 1 — list offenders.
  const positionError = stepPositionsError(body.steps);
  if (positionError) {
    throw new ApiError('steps_position_invalid', 'Step positions must be integers, strictly increasing from 1.', {
      details: positionError,
    });
  }

  const supabase = createAdminClient();
  const { data, error } = await createAtc(supabase, {
    actorUserId: auth.userId,
    moduleId: body.module_id,
    userStoryId: body.user_story_id,
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

  return jsonResponse({ atc: data }, { status: 201 });
});
