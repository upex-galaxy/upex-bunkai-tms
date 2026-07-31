import type { Principal } from '@lib/api/principal';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { resolveActiveWorkspaceId } from '@lib/workspaces/active';

// BK-90 (Slice A) — dependency-free logic for `DELETE
// /api/v1/workspaces/{id}/membership`, split out of `route.ts` so the
// auth-gate, RPC error-mapping, and active-workspace re-resolution branches
// are unit-testable without mocking `withApiHandler` or a live NextRequest —
// mirrors the isolation pattern already used by `workspaces/response.ts` and
// `me/active-workspace/response.ts`, and the fake-chainable-`db` testing
// style already used by `lib/api/pat.ts`'s `assertTokenIssuanceAuthorized`.

// A PAT must not leave a workspace on the caller's behalf — mirrors
// `DELETE /api/v1/tokens/[id]`'s exact bearer-rejection precedent.
export function assertSessionOnly(principal: Pick<Principal, 'via'>): void {
  if (principal.via === 'bearer') {
    throw new ApiError('forbidden', 'Personal access tokens cannot leave a workspace. Use a browser session.');
  }
}

// Maps a `bunkai_leave_workspace` RPC error (migration 0044) to the house
// envelope. `not_a_member` reuses this repo's established not-found/
// non-disclosure P0002 convention (see `modules/[id]/route.ts`'s
// `mapRpcError`); `last_membership`/`sole_owner` are this story's two new
// `45xxx` codes (Decision 5).
export function mapLeaveWorkspaceError(error: { code?: string, message: string }): never {
  if (error.code === '42501') {
    throw new ApiError('unauthorized', 'You must be signed in to leave a workspace.');
  }
  if (error.code === 'P0002') {
    throw new ApiError('not_found', 'Workspace not found or you are not an active member.');
  }
  if (error.code === '45212') {
    throw new ApiError('conflict', 'You cannot leave your only workspace.', {
      details: { reason: 'last_membership' },
    });
  }
  if (error.code === '45213') {
    throw new ApiError('conflict', 'You are the only owner of this workspace. Transfer ownership before leaving.', {
      details: { reason: 'sole_owner' },
    });
  }
  throw new ApiError('internal_error', error.message);
}

export interface ResolveNewActiveWorkspaceParams {
  userId: string
  leftWorkspaceId: string
  currentActiveId: string | null
}

export interface ResolveNewActiveWorkspaceResult {
  newActiveWorkspaceId: string | null
  newActiveWorkspaceName: string | null
}

// Integration — active-ws re-resolution (BR-1): only touches the database
// when the workspace the caller just left was their active one. Otherwise
// short-circuits with both fields null and never queries `db` (asserted in
// tests via a throwing fake client). The RPC's own last_membership guard
// already guarantees at least one active membership survives a successful
// leave, so `newActiveWorkspaceId` should never resolve to null when
// `currentActiveId === leftWorkspaceId` in practice — the null branch here is
// a defensive backstop, not a normally-reachable path.
export async function resolveNewActiveWorkspace(
  db: SupabaseClient<Database>,
  params: ResolveNewActiveWorkspaceParams,
): Promise<ResolveNewActiveWorkspaceResult> {
  if (params.currentActiveId !== params.leftWorkspaceId) {
    return { newActiveWorkspaceId: null, newActiveWorkspaceName: null };
  }

  // Fresh query against the caller's REMAINING active memberships, oldest
  // first (BR-1) — the just-deleted row is already gone, so the left
  // workspace cannot reappear here. Mirrors the query shape already used by
  // `settings/account/page.tsx`'s `WorkspacesSection`.
  const { data: memberships, error: membershipsError } = await db
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', params.userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });
  if (membershipsError) {
    throw new ApiError('internal_error', membershipsError.message);
  }

  const remainingIds = (memberships ?? []).map(m => m.workspace_id);
  const newActiveWorkspaceId = resolveActiveWorkspaceId(null, remainingIds);
  if (!newActiveWorkspaceId) {
    return { newActiveWorkspaceId: null, newActiveWorkspaceName: null };
  }

  const { data: workspace, error: workspaceError } = await db
    .from('workspaces')
    .select('name')
    .eq('id', newActiveWorkspaceId)
    .maybeSingle();
  if (workspaceError) {
    throw new ApiError('internal_error', workspaceError.message);
  }

  return { newActiveWorkspaceId, newActiveWorkspaceName: workspace?.name ?? null };
}
