import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapMilestoneLifecycleRpcError } from '@lib/milestones/errors';
import { restoreMilestone } from '@lib/supabase/rpc';

// POST /api/v1/milestones/{id}/restore — restore an archived Milestone
// (BK-1899). It returns exactly as it was: name, target date, description and
// Test Plans. Idempotent: restoring an active Milestone is a 200 with `changed:
// false`, no write and no event.
// Auth: Bearer `atc:write` (or cookie), member+ of the Milestone's workspace.
//
// `bunkai_restore_milestone` carries NO p_actor_user_id: auth.uid() is read
// inside, so this MUST go through the caller's own RLS-scoped client, never
// `createAdminClient()` (EXECUTE is revoked from service_role anyway).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const milestoneId = extractMilestoneId(request);
  if (!isUuid(milestoneId)) {
    throw new ApiError('bad_request', 'Milestone id must be a UUID.');
  }
  const { db } = getAuth(ctx);
  const { data, error } = await restoreMilestone(db, { milestoneId });
  if (error) {
    mapMilestoneLifecycleRpcError(error);
  }
  return jsonResponse({ milestone: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// The id is the second-to-last segment: /api/v1/milestones/{id}/restore.
function extractMilestoneId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
