// BK-1279 — join every browser Realtime channel as the signed-in user, never
// as `anon`.
//
// Why this exists (verified against the installed @supabase/supabase-js
// 2.106.x / auth-js / realtime-js / phoenix code):
// - On a page load that RESTORES a session (every reload, every new tab), the
//   user JWT reaches the Realtime client only once auth initialisation
//   finishes (cookie read, auth lock, possibly a refresh), via the
//   SIGNED_IN it emits or the `accessToken` callback awaiting
//   `auth.getSession()`. Both are asynchronous.
// - `RealtimeChannel.subscribe()` reads `socket.accessTokenValue`
//   synchronously, and phoenix's `Push.send()` freezes the join payload into
//   the send buffer right then. A component effect that subscribes at
//   hydration, before auth init completes, therefore sends `phx_join` with no
//   `access_token`, and the server evaluates the `postgres_changes` filters
//   for the `anon` role ("invalid column for filter workspace_id" on chat,
//   silent RLS denial on notifications and runs).
// - If the token then arrives before the join reply, realtime-js only updates
//   the (already sent) join payload and never pushes an `access_token` event,
//   so the channel stays anon for its whole life. Fast production hydration
//   lands in exactly that window; a first load right after sign-in does not,
//   because the sign-in itself already set the token.
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
