import type { Database } from '@lib/types/supabase';
import type { AssignableRole } from '@lib/workspaces/member-ladder';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { canChangeRole, canRemoveRole, isAssignableRole, roleRank } from '@lib/workspaces/member-ladder';

// BK-572 — dependency-free / DB-parametrized logic for
// `DELETE /api/v1/workspaces/{id}/members/{userId}`, split out of `route.ts`
// so every refusal branch is unit-testable without a live NextRequest (the
// `membership/response.ts` isolation pattern).
//
// The route refuses early, in the SAME order the RPC re-checks
// (`bunkai_remove_workspace_member`, migration 0114, BK-572 Q-D2):
//   visibility 404 -> caller role 403 -> self 409 -> target 404 (caller
//   re-checked on an empty target read) -> ladder 403.
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

function removalNotAdmin(): never {
  throw new ApiError('forbidden', REMOVAL_NOT_ADMIN_MESSAGE, { details: { reason: 'not_a_member' } });
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
  const callerRole = await activeRole(db, { workspaceId: params.workspaceId, userId: params.callerId });
  if (!callerRole) {
    notFound();
  }
  if (roleRank(callerRole) < roleRank('admin')) {
    removalNotAdmin();
  }

  if (params.targetId.toLowerCase() === params.callerId.toLowerCase()) {
    selfRefusal(params.workspaceId);
  }

  const targetRole = await activeRole(db, { workspaceId: params.workspaceId, userId: params.targetId });
  if (!targetRole) {
    // A Member sees only their own row, so a caller lowered after the first read must get 403, not 404 (BK-2704).
    const recheckedRole = await activeRole(db, { workspaceId: params.workspaceId, userId: params.callerId });
    if (recheckedRole && roleRank(recheckedRole) < roleRank('admin')) {
      removalNotAdmin();
    }
    notFound();
  }
  if (!canRemoveRole(callerRole, targetRole)) {
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
    removalNotAdmin();
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

// BK-2542 — `PATCH /api/v1/workspaces/{id}/members/{userId}`. Same split and
// the same early refusals as removal, in the order the RPC re-checks
// (`bunkai_change_workspace_member_role`, migration 0144):
//   role 422 -> visibility 404 -> caller role 403 -> self 409 -> target 404
//   (caller re-checked on an empty target read) -> Owner target 403.

export const ROLE_CHANGE_INVALID_ROLE_MESSAGE = 'Role must be one of viewer, member or admin.';
export const ROLE_CHANGE_NOT_ADMIN_MESSAGE = 'You must be an admin or owner of this workspace to change a teammate\'s role.';
export const ROLE_CHANGE_SELF_MESSAGE = 'You can\'t change your own role.';
export const ROLE_CHANGE_OWNER_MESSAGE = 'The Owner role can\'t be changed.';

function invalidRole(): never {
  throw new ApiError('validation_failed', ROLE_CHANGE_INVALID_ROLE_MESSAGE, { details: { reason: 'invalid_member_role' } });
}

function notAnAdmin(): never {
  throw new ApiError('forbidden', ROLE_CHANGE_NOT_ADMIN_MESSAGE, { details: { reason: 'not_an_admin' } });
}

function ownRoleRefusal(): never {
  throw new ApiError('conflict', ROLE_CHANGE_SELF_MESSAGE, { details: { reason: 'cannot_change_own_role' } });
}

function ownerRoleRefusal(): never {
  throw new ApiError('forbidden', ROLE_CHANGE_OWNER_MESSAGE, { details: { reason: 'cannot_change_owner_role' } });
}

export function parseRoleChangeBody(body: unknown): AssignableRole {
  const role = body !== null && typeof body === 'object' ? (body as { role?: unknown }).role : undefined;
  if (!isAssignableRole(role)) {
    invalidRole();
  }
  return role;
}

async function activeRole(db: SupabaseClient<Database>, member: { workspaceId: string, userId: string }): Promise<string | null> {
  const { data, error } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', member.workspaceId)
    .eq('user_id', member.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  return data?.role ?? null;
}

export async function assertRoleChangeAllowed(
  db: SupabaseClient<Database>,
  params: AssertRemovalAllowedParams,
): Promise<void> {
  const callerRole = await activeRole(db, { workspaceId: params.workspaceId, userId: params.callerId });
  if (!callerRole) {
    notFound();
  }
  if (roleRank(callerRole) < roleRank('admin')) {
    notAnAdmin();
  }

  if (params.targetId.toLowerCase() === params.callerId.toLowerCase()) {
    ownRoleRefusal();
  }

  const targetRole = await activeRole(db, { workspaceId: params.workspaceId, userId: params.targetId });
  if (!targetRole) {
    // A Member sees only their own row, so a caller lowered after the first read must get 403, not 404 (BK-2703).
    const recheckedRole = await activeRole(db, { workspaceId: params.workspaceId, userId: params.callerId });
    if (recheckedRole && roleRank(recheckedRole) < roleRank('admin')) {
      notAnAdmin();
    }
    notFound();
  }
  if (!canChangeRole(callerRole, targetRole)) {
    ownerRoleRefusal();
  }
}

export function mapChangeRoleError(error: { code?: string, message: string }): never {
  if (error.code === '42501' && error.message === 'not_authenticated') {
    throw new ApiError('unauthorized', 'You must be signed in to change a teammate\'s role.');
  }
  if (error.code === '42501') {
    notAnAdmin();
  }
  if (error.code === 'P0002') {
    notFound();
  }
  if (error.code === '45225') {
    ownRoleRefusal();
  }
  if (error.code === '45226') {
    ownerRoleRefusal();
  }
  if (error.code === '45227') {
    invalidRole();
  }
  throw new ApiError('internal_error', error.message);
}

export interface ChangeMemberRoleResult {
  user_id: string
  previous_role: AssignableRole
  role: AssignableRole
  changed: boolean
  unassigned_bug_count: number
}
