import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapMilestoneRpcError } from '@lib/milestones/errors';
import { assertTargetDateBounds, MilestoneUpdateBodySchema } from '@lib/milestones/validation';
import { updateMilestone } from '@lib/supabase/rpc';

// PATCH /api/v1/milestones/{id} — edit a milestone's name, target date and
//       description (member+). Same normalize/length rules as create. The
//       target-date bounds are evaluated at this edge ONLY when the
//       submitted date differs from the milestone's CURRENT stored value —
//       mirroring `bunkai_update_milestone`'s own `p_target_date is distinct
//       from` guard (Tech Lead decision). Without this, resubmitting an
//       unchanged past target date (e.g. a description-only edit of a
//       past-dated milestone, reusing the create-dialog "edit mode") would
//       fail at the edge with a 422 before ever reaching the RPC — the exact
//       scenario business-rules.md requires to stay editable.
//
// No DELETE — deletion is out of scope for this story (out-of-scope.md).

export const PATCH = withApiHandler(async (request: NextRequest, ctx) => {
  const milestoneId = extractMilestoneId(request);
  if (!isUuid(milestoneId)) {
    throw new ApiError('bad_request', 'Milestone id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = MilestoneUpdateBodySchema.parse(payload);

  // Read-before-write, through the caller's OWN RLS-scoped client (RLS
  // hides a foreign/non-member milestone exactly as the RPC's own
  // non-disclosure split does — a hidden row and a missing row look
  // identical here, which is the point). When the current value cannot be
  // determined (not found, or not visible), bounds are NOT skipped: the
  // request falls through to the RPC's own authoritative not-found /
  // forbidden / date-bound handling.
  const { data: current } = await db
    .from('milestones')
    .select('target_date')
    .eq('id', milestoneId)
    .maybeSingle();
  if (!current || current.target_date !== body.target_date) {
    assertTargetDateBounds(body.target_date);
  }

  // `bunkai_update_milestone` carries NO p_actor_user_id — auth.uid() is read
  // directly, so this MUST go through the caller's own RLS-scoped client
  // (never `createAdminClient()`).
  const { data, error } = await updateMilestone(db, {
    milestoneId,
    name: body.name,
    targetDate: body.target_date,
    description: body.description,
  });
  if (error) {
    mapMilestoneRpcError(error);
  }

  return jsonResponse({ milestone: data }, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'BK-498 pending — authoring domain (project sub-resources).',
});

function extractMilestoneId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
