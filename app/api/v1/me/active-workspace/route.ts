import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_DEFAULTS,
} from '@lib/api/workspace-cookie';
import { z } from 'zod';
import { assertSessionOnly, buildActiveWorkspaceResponse } from './response';

// POST /api/v1/me/active-workspace — rotate the caller's active workspace.
// We DO NOT touch the Supabase JWT; we set an httpOnly cookie `bk_active_ws`
// that the server-side queries (and the next /api/v1/me probe) consult.
//
// Membership is enforced by checking the workspace appears in the caller's
// workspaces list (RLS-filtered select). Non-members get 403.

const BodySchema = z.object({
  workspace_id: z.string().uuid(),
});

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);
  assertSessionOnly(principal);

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { workspace_id } = BodySchema.parse(payload);

  // RLS filters the select to workspaces the caller belongs to.
  const { data: workspace, error } = await db
    .from('workspaces')
    .select('id, slug, name')
    .eq('id', workspace_id)
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!workspace) {
    throw new ApiError('forbidden', 'You are not a member of that workspace.');
  }

  const { data: membership, error: membershipError } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', principal.userId)
    .maybeSingle();

  if (membershipError) {
    throw new ApiError('internal_error', membershipError.message);
  }

  const response = jsonResponse(buildActiveWorkspaceResponse({
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    role: membership?.role ?? null,
  }));
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace_id, ACTIVE_WORKSPACE_COOKIE_DEFAULTS);
  return response;
}, { auth: 'required' });
