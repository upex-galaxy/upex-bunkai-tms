import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapEnvironmentRpcError } from '@lib/environments/errors';
import { EnvironmentCreateBodySchema } from '@lib/environments/validation';
import { createAdminClient } from '@lib/supabase/admin';
import { createEnvironment } from '@lib/supabase/rpc';

// GET  /api/v1/projects/{id}/environments — list a project's environments,
//      ordered by name (ascending, stable). Visible to any workspace member via
//      the SELECT RLS policy (a non-member's cookie-scoped read returns []).
// POST /api/v1/projects/{id}/environments — add an environment (member+). The
//      SECURITY DEFINER RPC holds the rulebook (write gate, trim, length 1..50,
//      case-insensitive uniqueness); this handler does parsing + error mapping.
//
// HYBRID error model (mirrors the module + runs routes): a body-rule failure
// keeps the house `code` but carries a granular `details.reason`.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  // RLS scopes the read to environments the caller can see (workspace members).
  // `name asc` is the deterministic, predictable order the AC requires.
  const { data, error } = await db
    .from('project_environments')
    .select('id, project_id, name, created_at')
    .eq('project_id', projectId)
    .order('name', { ascending: true });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ environments: data ?? [] }, { status: 200 });
}, {
  auth: 'authenticated',
  why: 'BK-498 pending — authoring domain (project sub-resources).',
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { principal } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = EnvironmentCreateBodySchema.parse(payload);

  // The RPC takes the resolved actor id explicitly and gates member+ write
  // access; the admin client lets a PAT (no auth.uid()) write through the same
  // DEFINER path the cookie session uses (mirrors POST /api/v1/runs).
  const supabase = createAdminClient();
  const { data, error } = await createEnvironment(supabase, {
    actorUserId: principal.userId,
    projectId,
    name: body.name,
  });
  if (error) {
    mapEnvironmentRpcError(error);
  }

  return jsonResponse({ environment: data }, { status: 201 });
}, {
  auth: 'authenticated',
  why: 'BK-498 pending — authoring domain (project sub-resources).',
});

function extractProjectId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('projects');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
