import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { restoreWorkspaceDeletion } from '@lib/supabase/rpc';
import { z } from 'zod';
import { mapDeleteWorkspaceError } from '../deletion-response';

const ParamsSchema = z.object({ id: z.string().uuid() });

// POST /api/v1/workspaces/{id}/restore — restore a workspace during its
// 30-day grace period (BK-512, ADR-0015 point 10: "deleted_at = null -- no
// data movement"). Owner-only, cookie-session-only, same posture as DELETE
// on the parent resource. Reachable from the confirm-time email's restore
// link even though the workspace is invisible via RLS while deleted: the
// underlying RPC is SECURITY DEFINER and resolves the caller's ownership
// directly against `workspace_members`, bypassing RLS internally.
export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { db } = getAuth(ctx);
  const id = extractId(request);
  const parsed = ParamsSchema.safeParse({ id });
  if (!parsed.success) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }

  const { data, error } = await restoreWorkspaceDeletion(db, { workspaceId: parsed.data.id });
  if (error) {
    mapDeleteWorkspaceError(error);
  }
  const result = data as unknown as { workspace_id: string, workspace_name: string };

  return jsonResponse({ workspaceId: result.workspace_id, workspaceName: result.workspace_name });
}, { auth: 'cookie-only', why: 'Workspace restore is available to the Owner via a browser session only.' });

function extractId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/').filter(Boolean);
  const idx = segments.indexOf('workspaces');
  return idx >= 0 ? (segments[idx + 1] ?? '') : '';
}
