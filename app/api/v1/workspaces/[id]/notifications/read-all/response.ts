import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';

// BK-209 (Slice 2: API) — dependency-free / DB-parametrized logic for
// POST /api/v1/workspaces/{id}/notifications/read-all, split out of
// `route.ts` so the bulk update is unit-testable with a fake `db` — mirrors
// `../read/response.ts`'s isolation pattern. NO RPC here (migration
// 0053_notifications.sql's own header): a plain RLS-scoped bulk UPDATE
// through the caller's own client (`notifications_update_recipient_member`).

export interface MarkAllNotificationsReadParams {
  workspaceId: string
  recipientUserId: string
}

export interface MarkAllNotificationsReadResult {
  updated_count: number
}

// Explicit `recipient_user_id` + `workspace_id` filters are DEFENSE IN DEPTH
// alongside RLS: `notifications_update_recipient_member`'s own USING clause
// already confines matched rows to the caller's own recipient copies +
// workspace membership, but PostgREST cannot reference `auth.uid()` from the
// client, so the caller's already-resolved user id is passed explicitly
// instead. Scoping to exactly ONE workspace is also the PO-ratified business
// rule (comments.md 2026-07-16: "Mark-all affects only visible notifications
// in the active workspace... Hidden or inaccessible notifications must not
// be mutated"). `.is('read_at', null)` limits the write to rows that
// actually need it, which also makes a repeat call naturally idempotent
// (edge case E12): zero remaining unread rows -> zero rows updated -> a
// successful `{updated_count: 0}`, never an error.
export async function markAllNotificationsRead(
  db: SupabaseClient<Database>,
  params: MarkAllNotificationsReadParams,
): Promise<MarkAllNotificationsReadResult> {
  const { data, error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('workspace_id', params.workspaceId)
    .eq('recipient_user_id', params.recipientUserId)
    .is('read_at', null)
    .select('id');

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  return { updated_count: (data ?? []).length };
}
