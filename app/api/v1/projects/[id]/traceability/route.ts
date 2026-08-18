import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { reportStoryTraceability } from '@lib/supabase/rpc';
import { mapTraceabilityRpcError, throwStoryNotFound } from '@lib/traceability/errors';

// GET /api/v1/projects/{id}/traceability?story={userStoryId} — a User
// Story's full AC -> ATC -> Test -> Run -> Defect evidence chain, one round
// trip (BK-45). Read auth only, no scope requirement — mirrors the Coverage
// and Recovery-Cycle report routes: any active workspace role, viewers
// included, passes the SECURITY DEFINER RPC's own membership check (PO
// decision: "Viewer+, any authenticated member... No additional gate").
// Non-disclosure: missing, foreign-workspace, non-member, AND
// wrong-project User Stories all collapse into the SAME 404 (`not_found`),
// never a 403, never an existence echo — see `throwStoryNotFound` for why
// 404 satisfies AC-05's "403 or equivalent access-denied" without adding a
// disclosure channel.
//
// The `{id}` path segment is the Project, kept for URL-shape consistency
// with every sibling report route (`/coverage`, `/metrics/recovery-cycles`).
// It is validated as a UUID AND, below, cross-checked against the Story's
// REAL project (resolved via module_id -> modules.project_id, NEVER the
// nullable `user_stories.project_id` — BK-45 fact 1) before the RPC ever
// runs (BK-329, AI Tech Lead ruling). This is a consistency assertion on
// the URL's own truthfulness, not an additional authorization boundary: it
// is evaluated under the caller's OWN RLS-scoped client, it can only ever
// NARROW the answer (never widen it), and it is never forwarded to the RPC
// — the chain's grain stays the User Story (`?story=`), and the RPC keeps
// deriving its own project scope from the story via module_id exactly as
// BK-45 ratified. `{id}` remains routing context for authorization
// purposes; what changed is that an INCONSISTENT `{id}` / `?story=` pair is
// now refused instead of silently ignored.
export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const userStoryId = new URL(request.url).searchParams.get('story');
  if (!userStoryId || !isUuid(userStoryId)) {
    throw new ApiError('bad_request', 'Query parameter "story" must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);

  // The URL asserts this Story belongs to `{id}`. Verify it under the
  // caller's OWN RLS (never the admin client below): a Story outside the
  // caller's workspaces, a nonexistent Story, and a Story in a DIFFERENT
  // project all read as "no row" here and collapse into the same
  // non-disclosing 404 the RPC itself raises for P0002.
  const { data: story, error: storyLookupError } = await db
    .from('user_stories')
    .select('id, modules!user_stories_module_id_fkey(project_id)')
    .eq('id', userStoryId)
    .maybeSingle();
  if (storyLookupError) {
    throw new ApiError('internal_error', storyLookupError.message);
  }
  if (!story || story.modules?.project_id !== projectId) {
    throwStoryNotFound();
  }

  const supabase = createAdminClient();
  const { data, error } = await reportStoryTraceability(supabase, {
    actorUserId: principal.userId,
    userStoryId,
  });
  if (error) {
    mapTraceabilityRpcError(error);
  }

  return jsonResponse(data, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'BK-499 pending — reporting reads.',
});

function extractProjectId(request: NextRequest): string {
  // Path ends in `/{id}/traceability`, so the id is the second-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
