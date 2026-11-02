import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { canRemoveRole, roleRank } from '@lib/workspaces/member-ladder';

// BK-572 — dependency-free / DB-parametrized logic for
// `DELETE /api/v1/workspaces/{id}/members/{userId}`, split out of `route.ts`
// so every refusal branch is unit-testable without a live NextRequest (the
// `membership/response.ts` isolation pattern).
//
// The route refuses early, in the SAME order the RPC re-checks
// (`bunkai_remove_workspace_member`, migration 0114, BK-572 Q-D2):
//   visibility 404 -> caller role 403 -> self 409 -> target 404 -> ladder 403.
// The RPC does not trust this layer (ADR-0012): it repeats every check
// itself, under a row lock, and the route maps its codes the same way.

export const REMOVAL_NOT_FOUND_MESSAGE = 'Workspace member not found.';
export const REMOVAL_NOT_ADMIN_MESSAGE = 'You must be an admin or owner of this workspace to remove teammates.';
export const REMOVAL_SELF_MESSAGE = 'You can\'t remove yourself. To leave this workspace, use Leave in Settings > Workspaces.';
export const REMOVAL_OWNER_MESSAGE = 'Only an Owner can remove an Owner.';
export const REMOVAL_SOLE_OWNER_MESSAGE = 'A workspace must keep at least one Owner.';

function notFound(): never {
  throw new ApiError('not_found', REMOVAL_NOT_FOUND_MESSAGE);
}

function selfRefusal(workspaceId: string): never {
  throw new ApiError('conflict', REMOVAL_SELF_MESSAGE, {
    details: { reason: 'cannot_remove_self', leave_endpoint: `/api/v1/workspaces/${workspaceId}/membership` },
  });
}

export interface AssertRemovalAllowedParams {
  workspaceId: string
  callerId: string
  targetId: string
}

// Early refusals through the caller's OWN RLS client. A Member sees only their
// own row (`workspace_members_select_self_or_admin`), which is why the caller
// is checked before the target: checking the target first would let a Member
// probe who belongs to the workspace.
export async function assertRemovalAllowed(
  db: SupabaseClient<Database>,
  params: AssertRemovalAllowedParams,
): Promise<void> {
  const { data: caller, error: callerError } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.callerId)
    .eq('status', 'active')
    .maybeSingle();
  if (callerError) {
    throw new ApiError('internal_error', callerError.message);
  }
  if (!caller) {
    notFound();
  }
  if (roleRank(caller.role) < roleRank('admin')) {
    throw new ApiError('forbidden', REMOVAL_NOT_ADMIN_MESSAGE, { details: { reason: 'not_a_member' } });
  }

  if (params.targetId.toLowerCase() === params.callerId.toLowerCase()) {
    selfRefusal(params.workspaceId);
  }

  const { data: target, error: targetError } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.targetId)
    .eq('status', 'active')
    .maybeSingle();
  if (targetError) {
    throw new ApiError('internal_error', targetError.message);
  }
  if (!target) {
    notFound();
  }
  if (!canRemoveRole(caller.role, target.role)) {
    throw new ApiError('forbidden', REMOVAL_OWNER_MESSAGE, { details: { reason: 'cannot_remove_owner' } });
  }
}

// Maps a `bunkai_remove_workspace_member` error to the house envelope. 42501
// and 45213 are shared codes, so the RPC's message decides.
export function mapRemoveMemberError(error: { code?: string, message: string }, workspaceId: string): never {
  if (error.code === '42501' && error.message === 'not_authenticated') {
    throw new ApiError('unauthorized', 'You must be signed in to remove a teammate.');
  }
  if (error.code === '42501') {
    throw new ApiError('forbidden', REMOVAL_NOT_ADMIN_MESSAGE, { details: { reason: 'not_a_member' } });
  }
  if (error.code === 'P0002') {
    notFound();
  }
  if (error.code === '45220') {
    selfRefusal(workspaceId);
  }
  if (error.code === '45221') {
    throw new ApiError('forbidden', REMOVAL_OWNER_MESSAGE, { details: { reason: 'cannot_remove_owner' } });
  }
  if (error.code === '45213' && error.message === 'sole_owner') {
    throw new ApiError('conflict', REMOVAL_SOLE_OWNER_MESSAGE, { details: { reason: 'sole_owner' } });
  }
  throw new ApiError('internal_error', error.message);
}

export interface RemoveMemberResult {
  removed_user_id: string
  removed_role: string
  revoked_token_count: number
  unassigned_bug_count: number
  revoked_invite_count: number
}
