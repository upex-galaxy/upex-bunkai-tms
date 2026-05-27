import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { jsonResponse, withApiHandler } from '@lib/api/handler';
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_DEFAULTS,
} from '@lib/api/workspace-cookie';
import { createClient } from '@lib/supabase/server';
import { z } from 'zod';

// POST /api/v1/me/active-workspace — rotate the caller's active workspace.
// We DO NOT touch the Supabase JWT; we set an httpOnly cookie `bk_active_ws`
// that the server-side queries (and the next /api/v1/me probe) consult.
//
// Membership is enforced by checking the workspace appears in the caller's
// workspaces list (RLS-filtered select). Non-members get 403.

const BodySchema = z.object({
  workspace_id: z.string().uuid(),
});

export const POST = withApiHandler(async (request: NextRequest) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'You must be signed in.');
  }

  const payload: unknown = await request.json().catch(() => {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  });
  const { workspace_id } = BodySchema.parse(payload);

  // RLS filters the select to workspaces the caller belongs to.
  const { data: workspace, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspace_id)
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!workspace) {
    throw new ApiError('forbidden', 'You are not a member of that workspace.');
  }

  const response = jsonResponse({ ok: true, active_workspace_id: workspace_id });
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace_id, ACTIVE_WORKSPACE_COOKIE_DEFAULTS);
  return response;
});
