import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { mapMilestoneRpcError } from '@lib/milestones/errors';
import { assertTargetDateBounds, MilestoneCreateBodySchema } from '@lib/milestones/validation';
import { createMilestone } from '@lib/supabase/rpc';

// GET  /api/v1/projects/{id}/milestones — list a project's milestones,
//      ordered by target date ascending (id tie-break for a stable order).
//      Visible to any workspace member via the SELECT RLS policy (a
//      non-member's cookie-scoped read returns []).
// POST /api/v1/projects/{id}/milestones — create a milestone (member+). The
//      SECURITY DEFINER RPC holds the rulebook (write gate, normalize +
//      length, uniqueness, target-date bounds); this handler does parsing,
//      the edge-side date-bound check, and error mapping.
//
// HYBRID error model (mirrors the environments + bugs routes): a body-rule
// failure keeps the house `code` but carries a granular `details.reason`.

export const GET = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  // RLS scopes the read to milestones the caller can see (workspace
  // members). `target_date asc, id asc` is the deterministic, predictable
  // order the AC requires (also the sole index this story adds — see
  // migration 0064).
  const { data, error } = await db
    .from('milestones')
    .select('id, project_id, name, target_date, description, created_by, created_at')
    .eq('project_id', projectId)
    .order('target_date', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    throw new ApiError('internal_error', error.message);
  }

  return jsonResponse({ milestones: data ?? [] }, { status: 200 });
}, { auth: 'required', requires: ['atc:read'] });

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const projectId = extractProjectId(request);
  if (!isUuid(projectId)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }

  const { db } = getAuth(ctx);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const body = MilestoneCreateBodySchema.parse(payload);
  // Create always bounds the date — there is no "unchanged value" carve-out
  // on a brand-new row.
  assertTargetDateBounds(body.target_date);

  // `bunkai_create_milestone` carries NO p_actor_user_id — auth.uid() is read
  // directly, so this MUST go through the caller's own RLS-scoped client
  // (never `createAdminClient()`; a PAT's user-scoped JWT still carries
  // auth.uid() through this same path — ADR-0001 Path B).
  const { data, error } = await createMilestone(db, {
    projectId,
    name: body.name,
    targetDate: body.target_date,
    description: body.description,
  });
  if (error) {
    mapMilestoneRpcError(error);
  }

  return jsonResponse({ milestone: data }, { status: 201 });
}, { auth: 'required', requires: ['atc:write'] });

function extractProjectId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('projects');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}

function isUuid(value: string): boolean {
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
}
