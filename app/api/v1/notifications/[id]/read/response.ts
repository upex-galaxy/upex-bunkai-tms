import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';

// BK-209 (Slice 2: API) — dependency-free / DB-parametrized logic for
// POST /api/v1/notifications/{id}/read, split out of `route.ts` so the
// update + not-found mapping is unit-testable with a fake `db` — mirrors
// `workspaces/[id]/membership/response.ts`'s isolation pattern. NO RPC here
// (migration 0053_notifications.sql's own header: "Mutations (mark-one-read,
// mark-all-read) ... are plain RLS-scoped PostgREST updates through ctx.db,
// no RPC"): the caller's own RLS-scoped client is the entire authorization
// surface, via `notifications_update_recipient_member` (migration 0053).

export interface MarkNotificationReadResult {
  id: string
  read_at: string | null
}

// Unconditional update (no `.is('read_at', null)` gate): re-marking an
// ALREADY-read notification must succeed as a no-op, not 404 — edge cases E6
// ("read -> mark as read again: no double decrement; state remains read")
// and E12 ("double-click mark-one ... idempotent update") from the story's
// Shift-Left refinement. RLS (`notifications_update_recipient_member`) is the
// ONLY authorization check: a foreign id, another recipient's row, or a
// workspace the caller lost membership of all collapse into zero matched
// rows -> the SAME not_found this function raises for a truly nonexistent id
// — never distinguish "not yours" from "doesn't exist" (mirrors
// `DELETE /api/v1/tokens/[id]`'s own non-disclosure convention).
export async function markNotificationRead(
  db: SupabaseClient<Database>,
  notificationId: string,
): Promise<MarkNotificationReadResult> {
  const { data, error } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .select('id, read_at')
    .maybeSingle();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  if (!data) {
    throw new ApiError('not_found', 'Notification not found.');
  }
  return data;
}
