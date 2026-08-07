import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { reportStoryTraceability } from '@lib/supabase/rpc';
import { mapTraceabilityRpcError } from '@lib/traceability/errors';

// GET /api/v1/projects/{id}/traceability?story={userStoryId} — a User
// Story's full AC -> ATC -> Test -> Run -> Defect evidence chain, one round
// trip (BK-45). Read auth only, no scope requirement — mirrors the Coverage
// and Recovery-Cycle report routes: any active workspace role, viewers
// included, passes the SECURITY DEFINER RPC's own membership check (PO
// decision: "Viewer+, any authenticated member... No additional gate").
// Non-disclosure: missing, foreign-workspace, and non-member User Stories
// all collapse into the SAME 404 (`not_found`), never a 403, never an
// existence echo — see `mapTraceabilityRpcError` for why 404 satisfies
// AC-05's "403 or equivalent access-denied" without adding a disclosure
// channel.
//
// The `{id}` path segment is the Project, kept for URL-shape consistency
// with every sibling report route (`/coverage`, `/metrics/recovery-cycles`)
// and validated as a UUID, but is NOT passed to the RPC — the chain's grain
// is the User Story (`?story=`), and the RPC derives its own project scope
// from the story via module_id (AI Tech Lead ruling: never trust a
// caller-supplied project id as a scope parameter). A `story` id that
// belongs to a DIFFERENT project than `{id}` still resolves correctly (the
// RPC's own scoping is authoritative); `{id}` here is routing context, not
// an additional authorization boundary.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const userStoryId = new URL(request.url).searchParams.get('story');
  if (!userStoryId || !isUuid(userStoryId)) {
    throw new ApiError('bad_request', 'Query parameter "story" must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await reportStoryTraceability(supabase, {
    actorUserId: principal.userId,
    userStoryId,
  });
  if (error) {
    mapTraceabilityRpcError(error);
  }

  return jsonResponse(data, { status: 200 });
}, { auth: 'required' });

function extractProjectId(request: NextRequest): string {
  // Path ends in `/{id}/traceability`, so the id is the second-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
