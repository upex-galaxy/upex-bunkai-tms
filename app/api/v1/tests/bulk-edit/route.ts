import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { ACTIVE_WORKSPACE_COOKIE } from '@lib/api/workspace-cookie';
import { createAdminClient } from '@lib/supabase/admin';
import { bulkEditTestTags } from '@lib/supabase/rpc';
import { hasNonUuidId, pickBulkEditWorkspace, TestBulkEditBodySchema } from '@lib/tests/bulk-edit';
import { mapTestBulkEditError } from '@lib/tests/errors';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';
import { cookies } from 'next/headers';

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal, db } = getAuth(ctx);

  let parsed: unknown;
  try {
    parsed = await request.json();
  }
  catch {
    throw new ApiError('bad_request', 'Request body must be valid JSON.');
  }
  if (hasNonUuidId(parsed)) {
    throw new ApiError('bad_request', 'Every Test id must be a UUID.');
  }
  const body = TestBulkEditBodySchema.parse(parsed);

  const choice = pickBulkEditWorkspace(body.workspace_id, principal);
  let workspaceId: string | null = null;
  if (choice.kind === 'token_workspace_mismatch') {
    throw new ApiError('forbidden', 'This token is scoped to a different workspace.', {
      details: { reason: 'token_workspace_mismatch' },
    });
  }
  if (choice.kind === 'workspace') {
    workspaceId = choice.workspaceId;
  }
  if (choice.kind === 'active_cookie') {
    const cookieStore = await cookies();
    const { data: workspaces, error: workspacesError } = await db
      .from('workspaces')
      .select('id')
      .order('created_at', { ascending: true });
    if (workspacesError) {
      throw new ApiError('internal_error', 'Failed to resolve the active workspace.');
    }
    workspaceId = resolveActiveWorkspaceId(
      cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null,
      (workspaces ?? []).map(w => w.id),
    );
  }
  if (!workspaceId) {
    throw new ApiError('validation_failed', 'workspace_id is required when the caller has no workspace context.', {
      details: { reason: 'workspace_required' },
    });
  }

  const { data, error } = await bulkEditTestTags(createAdminClient(), {
    actorUserId: principal.userId,
    workspaceId,
    testIds: body.test_ids,
    mode: body.mode,
    tags: body.tags,
    dryRun: body.dry_run,
  });
  if (error) {
    mapTestBulkEditError(error);
  }
  return jsonResponse(data, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });
}, { auth: 'required', requires: ['atc:write'] });
