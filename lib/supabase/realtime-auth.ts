// BK-1279 — join every browser Realtime channel as the signed-in user, never
// as `anon`.
//
// Why this exists (verified against the installed @supabase/supabase-js
// 2.106.x / realtime-js / phoenix code):
// - `SupabaseClient` only forwards the session token to Realtime on
//   `SIGNED_IN` and `TOKEN_REFRESHED`. A page load that RESTORES a session
//   (every reload, every new tab) emits `INITIAL_SESSION` instead, so nothing
//   pushes the user JWT into the Realtime client up front.
// - `RealtimeChannel.subscribe()` reads `socket.accessTokenValue`
//   synchronously. The auth it kicks off on connect is still awaiting
//   `auth.getSession()` at that moment, so the value is null.
// - phoenix's `Push.send()` evaluates the join payload right then and buffers
//   the computed frame, so a later token update cannot repair a join that is
//   already queued. The server evaluates the `postgres_changes` filters for
//   the `anon` role ("invalid column for filter ..." on chat, silent RLS
//   denial on notifications and runs) and no change is ever delivered.
//
// The fix: resolve the Realtime token from the current session BEFORE the
// channel joins. `setAuth()` is called with NO argument on purpose — it reads
// the token through the client's `accessToken` callback (the session), keeps
// the client in callback mode, and so the heartbeat keeps refreshing it.
// Passing a token string would pin a manual token instead.

import type { RealtimeChannel, RealtimeClient } from '@supabase/supabase-js';

export type RealtimeSubscribeCallback = Parameters<RealtimeChannel['subscribe']>[0];

export interface SubscribeWithUserAuthParams {
  realtime: Pick<RealtimeClient, 'setAuth'>
  channel: RealtimeChannel
  callback?: RealtimeSubscribeCallback
}

// Returns a cancel function for the caller's effect cleanup. Call it BEFORE
// `supabase.removeChannel(channel)`: a channel torn down while its token was
// still resolving must never join afterwards.
export function subscribeWithUserAuth({ realtime, channel, callback }: SubscribeWithUserAuthParams): () => void {
  let cancelled = false;

  void realtime.setAuth()
    // A failed token lookup must not leave the channel silently unsubscribed:
    // fall through and subscribe anyway, so the status callback still reports
    // what the server says (the pre-BK-1279 behaviour, never worse).
    .catch(() => undefined)
    .then(() => {
      if (cancelled) {
        return;
      }
      channel.subscribe(callback);
    });

  return () => {
    cancelled = true;
  };
}
