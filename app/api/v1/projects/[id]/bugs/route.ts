import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapBugRpcError } from '@lib/bugs/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { listProjectBugs } from '@lib/supabase/rpc';

// GET /api/v1/projects/{id}/bugs — a project's bugs, newest first (BK-40).
// Bare-bones list scope (Technical Decision 2): unfiltered, single page — no
// query params. Read auth only, NO `requires` (Technical Decision 13 —
// mirrors the sibling GET .../runs/report route's own no-scope precedent).
// The read-level membership re-check (any active role — viewers included)
// lives inside the SECURITY DEFINER RPC (`bunkai_list_project_bugs`).
// Non-disclosure: a missing, non-visible, or foreign-workspace Project all
// collapse into the same 404 (`not_found`).
//
// SUPERSEDED by BK-41 (Decision 14): `GET /api/v1/bugs?project_id=...` now
// owns filtering (module subtree, status, severity), real keyset pagination,
// and aggregates — this route stays bare-bones and unfiltered. Left in place,
// functionally untouched, rather than deleted: it is a shipped, potentially
// externally-called endpoint and removing it is out of BK-41's surgical-
// change scope. A follow-up tech-story can retire it once nothing depends on
// it any longer.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const supabase = createAdminClient();
  const { data, error } = await listProjectBugs(supabase, {
    actorUserId: principal.userId,
    projectId,
  });
  if (error) {
    if (error.code === 'P0002') {
      throw new ApiError('not_found', 'Project not found.', { details: { reason: 'not_found' } });
    }
    mapBugRpcError(error);
  }

  const payload = data as unknown as { items: unknown[] };
  return jsonResponse({ items: payload.items }, { status: 200 });
}, { auth: 'required' });

function extractProjectId(request: NextRequest): string {
  // Path ends in `/{id}/bugs`, so the id is the second-to-last segment.
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
