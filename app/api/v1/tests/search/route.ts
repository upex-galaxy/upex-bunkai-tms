import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { createAdminClient } from '@lib/supabase/admin';
import { searchTests } from '@lib/supabase/rpc';
import { parseTestSearchParams } from '@lib/tests/search-validation';

// GET /api/v1/tests/search — project-scoped substring search over Tests
// (title + tags), backing the BK-203 add-tests picker. New endpoint — the
// Tests domain previously exposed only single-tag exact filtering
// (GET /api/v1/tests?tag=). Auth: Bearer `atc:read` (or a cookie session).
// The SECURITY DEFINER RPC restricts results to the actor's active workspace
// memberships AND to the required `project_id`, deriving "this Test's
// project" via its chained ATCs (mirrors bunkai_start_run's own derivation —
// Tests carry no project_id column). Zero matches return `{ items: [] }`,
// never a 404.
//
//   ?query=<text>       required, ≥1 char after trim
//   ?project_id=<uuid>  required — scopes the search to one project
//   ?limit=<1..50>      optional, default 20

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);

  const query = parseTestSearchParams(request.nextUrl.searchParams);

  const supabase = createAdminClient();
  const { data, error } = await searchTests(supabase, {
    actorUserId: principal.userId,
    query: query.query,
    projectId: query.project_id,
    limit: query.limit,
  });
  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ items: data ?? [] }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });
