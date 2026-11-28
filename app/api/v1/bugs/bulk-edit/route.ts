import type { Principal } from '@lib/api/principal';
import type { BugBulkEditBody } from '@lib/bugs/bulk-edit-validation';
import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { BugBulkEditBodySchema } from '@lib/bugs/bulk-edit-validation';
import { mapBugBulkEditError } from '@lib/bugs/errors';
import { createAdminClient } from '@lib/supabase/admin';
import { bulkEditBugs } from '@lib/supabase/rpc';

// POST /api/v1/bugs/bulk-edit — status (one stage forward) or severity on up to
// 200 Bugs of one Project (BK-2098, ADR-0029). Gate order (AI Tech Lead T4):
// body, Project visible to the caller (404), token workspace (403), write role
// (403), read-only Project (422), then one outcome per Bug.
export async function performBugBulkEdit(
  principal: Pick<Principal, 'userId' | 'workspaceId' | 'via' | 'db'>,
  body: BugBulkEditBody,
  admin: Parameters<typeof bulkEditBugs>[0],
) {
  const { data: project, error: projectError } = await principal.db
    .from('projects')
    .select('id, workspace_id')
    .eq('id', body.project_id)
    .maybeSingle();
  if (projectError) {
    throw new ApiError('internal_error', 'Failed to resolve the Project.');
  }
  if (!project) {
    throw new ApiError('not_found', 'Project not found.', { details: { reason: 'not_found' } });
  }
  if (principal.via === 'bearer' && principal.workspaceId !== null
    && principal.workspaceId.toLowerCase() !== project.workspace_id.toLowerCase()) {
    throw new ApiError('forbidden', 'This token is scoped to a different workspace.', {
      details: { reason: 'token_workspace_mismatch' },
    });
  }

  const { data, error } = await bulkEditBugs(admin, {
    actorUserId: principal.userId,
    projectId: body.project_id,
    items: body.items,
    field: body.field,
    change: body.change,
    dryRun: body.dry_run,
  });
  if (error) {
    mapBugBulkEditError(error);
  }
  return data;
}

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);

  let parsed: unknown;
  try {
    parsed = await request.json();
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  const body = BugBulkEditBodySchema.parse(parsed);

  const report = await performBugBulkEdit(principal, body, createAdminClient());
  return jsonResponse(report, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
}, { auth: 'required', requires: ['atc:write'] });
