import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapMilestoneRpcError } from '@lib/milestones/errors';
import { archiveMilestone } from '@lib/supabase/rpc';

// POST /api/v1/milestones/{id}/archive — archive a Milestone (BK-1899).
// Archiving hides it from the default list and makes it read-only; it never
// touches its Test Plans, their Tests or Runs. Idempotent: archiving an
// archived Milestone is a 200 with `changed: false`, no write and no event.
// Auth: Bearer `atc:write` (or cookie), member+ of the Milestone's workspace.
//
// `bunkai_archive_milestone` carries NO p_actor_user_id: auth.uid() is read
// inside, so this MUST go through the caller's own RLS-scoped client, never
// `createAdminClient()` (EXECUTE is revoked from service_role anyway).
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const milestoneId = extractMilestoneId(request);
  if (!isUuid(milestoneId)) {
    throw new ApiError('bad_request', 'Milestone id must be a UUID.');
  }
  const { db } = getAuth(ctx);
  const { data, error } = await archiveMilestone(db, { milestoneId });
  if (error) {
    mapMilestoneRpcError(error);
  }
  return jsonResponse({ milestone: data }, { status: 200 });
}, { auth: 'required', requires: ['atc:write'] });

// The id is the second-to-last segment: /api/v1/milestones/{id}/archive.
function extractMilestoneId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
