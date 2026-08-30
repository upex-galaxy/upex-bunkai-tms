import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';

// BK-508 — Owner-only role gate for the data export feature. Mirrors
// assertTokenIssuanceAuthorized's shape (lib/api/pat.ts:51-87), per the Dev
// answer confirmed on the ticket: an explicit inline role check, not the
// `workspace:admin` capability decorator — every role holds every capability
// for a cookie session, so the decorator alone would let Admin/Member/Viewer
// through (AC-02 regression). RLS (bunkai_is_workspace_owner-backed policies,
// 0083) is the backstop, not the enforcement point.

export interface AssertExportAuthorizedArgs {
  db: SupabaseClient<Database>
  userId: string
  workspaceId: string
}

export async function assertExportAuthorized(args: AssertExportAuthorizedArgs): Promise<void> {
  const { data: membership, error } = await args.db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', args.workspaceId)
    .eq('user_id', args.userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!membership || membership.role !== 'owner') {
    throw new ApiError('forbidden', 'Only the workspace Owner can request or download a data export.');
  }
}
