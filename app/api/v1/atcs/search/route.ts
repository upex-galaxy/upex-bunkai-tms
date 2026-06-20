import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { parseAtcSearchParams } from '@lib/atcs/search-validation';
import { createAdminClient } from '@lib/supabase/admin';
import { searchAtcs } from '@lib/supabase/rpc';

// GET /api/v1/atcs/search — project-scoped full-text search + autocomplete
// over ATCs (BK-20). Auth: Bearer `atc:read` (or a cookie session). The
// SECURITY DEFINER RPC restricts results to the actor's active workspace
// memberships AND to the single project the caller names — any caller-supplied
// workspace scope is ignored, and a project the actor can't reach returns an
// empty set. Ranks by relevance × recency. Zero matches return `{ items: [] }`,
// never a 404.
//
//   ?query=<text>       required, ≥1 char after trim (empty → 422 validation)
//   ?project_id=<uuid>  required — scopes the search to one project
//   ?module_id=<uuid>   optional — narrows to that module's subtree
//   ?layer=UI|API|Unit  optional
//   ?limit=<1..50>      optional, default 20 (out of range → 422 validation)

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);

  const query = parseAtcSearchParams(request.nextUrl.searchParams);

  const supabase = createAdminClient();
  const { data, error } = await searchAtcs(supabase, {
    actorUserId: principal.userId,
    query: query.query,
    projectId: query.project_id,
    moduleId: query.module_id ?? null,
    layer: query.layer ?? null,
    limit: query.limit,
  });
  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  // The RPC returns a jsonb array (already isolated, ranked, and capped).
  return jsonResponse({ items: data ?? [] }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });
