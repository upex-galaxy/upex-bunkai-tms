import type { NextRequest } from 'next/server';
import type { RemoveMemberResult } from './response';
import { ApiError } from '@lib/api/error-envelope';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { assertWorkspaceContext } from '@lib/api/principal';
import { removeWorkspaceMember } from '@lib/supabase/rpc';
import { assertRemovalAllowed, mapRemoveMemberError } from './response';

// DELETE /api/v1/workspaces/{id}/members/{userId} — an Owner or Admin removes
// a teammate (BK-572, ADR-0022). A thin wrapper over the SECURITY DEFINER RPC
// `bunkai_remove_workspace_member` (migration 0114), which ends the
// membership, unassigns the target's Bugs, revokes their workspace-scoped
// PATs and pending invites, and writes `member.removed`, in one transaction.
//
// Posture follows the invites precedent, not Leave's: `workspace:admin` plus
// the ADR-0006 workspace binding, PAT callers allowed. That is safe because
// self-targeting is refused here and in the RPC (self-removal is Leave).

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export const DELETE = withApiHandler(async (request: NextRequest, ctx) => {
  const { workspaceId, userId } = extractIds(request);
  if (!UUID.test(workspaceId)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }
  if (!UUID.test(userId)) {
    throw new ApiError('bad_request', 'User id must be a UUID.');
  }

  const { principal, db } = getAuth(ctx);
  assertWorkspaceContext(principal, workspaceId);

  await assertRemovalAllowed(db, { workspaceId, callerId: principal.userId, targetId: userId });

  const { data, error } = await removeWorkspaceMember(db, { workspaceId, userId });
  if (error) {
    mapRemoveMemberError(error, workspaceId);
  }

  return jsonResponse(data as unknown as RemoveMemberResult);
}, { auth: 'required', requires: ['workspace:admin'] });

// `/api/v1/workspaces/{id}/members/{userId}`: the segments after the literal
// "workspaces" and "members" (the `membership/route.ts` convention).
function extractIds(request: NextRequest): { workspaceId: string, userId: string } {
  const segments = new URL(request.url).pathname.split('/');
  const wsIdx = segments.lastIndexOf('workspaces');
  const membersIdx = segments.lastIndexOf('members');
  return {
    workspaceId: wsIdx >= 0 ? (segments[wsIdx + 1] ?? '') : '',
    userId: membersIdx >= 0 ? (segments[membersIdx + 1] ?? '') : '',
  };
}
