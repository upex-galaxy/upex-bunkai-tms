import { ApiError } from '@lib/api/error-envelope';

// BK-512 — maps `bunkai_request_workspace_deletion` / `bunkai_restore_
// workspace_deletion` RPC errors (migration 0084) to the house envelope.
// `not_a_member` reuses the established not-found/non-disclosure P0002
// convention (see `membership/response.ts`'s `mapLeaveWorkspaceError`);
// `owner_only`/`already_deleted`/`not_deleted` are this story's three new
// `459xx` codes.
//
// Scenario N5 (double-submit) — Option B, chosen 25/25 on the ticket over a
// 409 Conflict (17/25): the shipped `DELETE /api/v1/tokens/[id]` precedent
// (`.is('revoked_at', null)`, 404 "already revoked" on zero rows matched) is
// an exact structural match, so the losing submission maps to `not_found`,
// not `conflict` — the database decided the winner, and a 409 would invent a
// third refusal vocabulary for a case this codebase already answers with
// 404.
export function mapDeleteWorkspaceError(error: { code?: string, message: string }): never {
  if (error.code === '42501') {
    throw new ApiError('unauthorized', 'You must be signed in to delete a workspace.');
  }
  if (error.code === 'P0002') {
    throw new ApiError('not_found', 'Workspace not found or you are not an active member.');
  }
  if (error.code === '45900') {
    throw new ApiError('forbidden', 'Only the workspace Owner can delete or restore this workspace.');
  }
  if (error.code === '45901') {
    throw new ApiError('not_found', 'Workspace not found or already deleted.');
  }
  if (error.code === '45902') {
    throw new ApiError('conflict', 'This workspace is not currently deleted.', {
      details: { reason: 'not_deleted' },
    });
  }
  throw new ApiError('internal_error', error.message);
}

export interface WorkspaceDeletionRecipient {
  email: string
}

export interface WorkspaceDeletionResult {
  workspace_id: string
  workspace_name: string
  workspace_slug: string
  deleted_at: string
  purge_deadline: string
  other_member_count: number
  recipients: WorkspaceDeletionRecipient[]
}
