import type { EditableEventType, NotificationChannel } from '@lib/notification-preferences/constants';
import type { PreferenceCell } from '@lib/notification-preferences/grid';
import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@lib/api/error-envelope';
import { buildPreferenceGrid } from '@lib/notification-preferences/grid';

// BK-213 — dependency-free / DB-parametrized logic for
// GET + PATCH /api/v1/notification-preferences, split out of `route.ts` so
// it is unit-testable with a fake `db`, mirroring
// `notifications/[id]/read/response.ts`'s isolation pattern. No RPC anywhere
// (migration 0062's own header): the caller's own RLS-scoped client
// (`getAuth(ctx).db`) is the ONLY client either function touches --
// `notification_preferences_select_own` / `..._insert_own` / `..._update_own`
// are the entire authorization surface.

export async function listNotificationPreferences(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<PreferenceCell[]> {
  const { data, error } = await db
    .from('notification_preferences')
    .select('event_type, channel, enabled')
    .eq('user_id', userId);

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  return buildPreferenceGrid(data ?? []);
}

export interface UpsertPreferenceInput {
  event_type: EditableEventType
  channel: NotificationChannel
  enabled: boolean
}

export interface UpsertPreferenceResult {
  event_type: string
  channel: string
  enabled: boolean
  updated_at: string
}

// One (event_type, channel) cell, instant-save (business-rules.md /
// QA Refinement Decision 2, comments.md 2026-07-18: "last-write-wins, no
// lock" -- a plain upsert is exactly that, no extra concurrency handling
// needed). `user_id` is always the CALLER's own id -- never accepted from
// `input`, so there is nothing for a caller to spoof (see migration 0062's
// header on why ADR-0012's actor-bind question is vacuous here).
export async function upsertNotificationPreference(
  db: SupabaseClient<Database>,
  userId: string,
  input: UpsertPreferenceInput,
): Promise<UpsertPreferenceResult> {
  const { data, error } = await db
    .from('notification_preferences')
    .upsert(
      { user_id: userId, event_type: input.event_type, channel: input.channel, enabled: input.enabled },
      { onConflict: 'user_id,event_type,channel' },
    )
    .select('event_type, channel, enabled, updated_at')
    .single();

  if (error) {
    throw new ApiError('internal_error', error.message);
  }
  return data;
}
