import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { WORKSPACE_DELETED_MESSAGE, WORKSPACE_DELETED_REASON } from '@lib/workspaces/deleted-notice';

// BK-1129 — BK-512 Scenario N3. Once the Owner soft-deletes a workspace
// (ADR-0015), the Run RPCs refuse its members exactly like non-members: 42501
// on writes (mark/abort/finish), P0002 on the read. That refusal is correct
// but says nothing, so a teammate on an open Runner is left clicking a dead
// view. This tells the two apart AFTER the RPC has already refused.
//
// The discriminator is the caller's own membership row, which the soft-delete
// leaves `active`: the Run's workspace has `deleted_at` set AND the caller still
// holds an active membership in it. Only that caller learns the workspace was
// deleted, which ADR-0015's confirm-time email already told them. Anyone else
// (a stranger, someone who had left, a missing Run) keeps today's refusal byte for
// byte. `db` must be the service-role client: RLS hides a deleted workspace.
//
// Utility contract: any read failure answers false, so the caller falls back to
// the RPC's own refusal instead of failing differently.
export async function isRunInDeletedWorkspaceOf(
  db: SupabaseClient<Database>,
  params: { runId: string, userId: string },
): Promise<boolean> {
  const { data: run } = await db
    .from('runs')
    .select('workspace_id')
    .eq('id', params.runId)
    .maybeSingle();
  if (!run) {
    return false;
  }

  const { data: workspace } = await db
    .from('workspaces')
    .select('deleted_at')
    .eq('id', run.workspace_id)
    .maybeSingle();
  if (!workspace?.deleted_at) {
    return false;
  }

  const { data: membership } = await db
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', run.workspace_id)
    .eq('user_id', params.userId)
    .eq('status', 'active')
    .maybeSingle();
  return membership !== null;
}

// Route-side wrapper, called right before `mapRunRpcError`. Only the two
// non-disclosing refusals can mean "deleted"; every domain error (closed run,
// bad status) skips the lookup entirely.
export async function refuseIfRunWorkspaceDeleted(
  db: SupabaseClient<Database>,
  params: { error: { code?: string }, runId: string, userId: string },
): Promise<void> {
  if (params.error.code !== '42501' && params.error.code !== 'P0002') {
    return;
  }
  if (await isRunInDeletedWorkspaceOf(db, { runId: params.runId, userId: params.userId })) {
    throw new ApiError('not_found', WORKSPACE_DELETED_MESSAGE, {
      details: { reason: WORKSPACE_DELETED_REASON },
    });
  }
}
