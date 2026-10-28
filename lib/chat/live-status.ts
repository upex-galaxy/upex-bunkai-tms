import type { RealtimeConnectionStatus } from '@lib/runs/realtime-run-channel';

// BK-1281 — the Team Chat header said "Live" while the message subscription
// had failed.
//
// A channel join (`SUBSCRIBED`) and its `postgres_changes` binding are two
// separate outcomes (verified against the installed @supabase/realtime-js
// 2.106.x and the Realtime server's `realtime_channel.ex`):
// - the join reply carries the binding ids, and realtime-js reports
//   `SUBSCRIBED` as soon as they match the client's bindings;
// - the server subscribes the binding to the database AFTER that reply and
//   reports the result as a `system` frame on the same channel:
//   `{ extension: 'postgres_changes', status: 'ok' | 'error', message }`.
//   A rejected subscription ("invalid column for filter workspace_id", a
//   grant or RLS change) never changes the channel status, so a UI reading
//   `SUBSCRIBED` alone stays "Live" on a dead channel.
// - A CDC outage on the server is NOT reported as an error: the server
//   re-subscribes silently and sends `ok` again. Every `ok` therefore runs the
//   catch-up, which is what recovers the changes committed during the outage.
// - A retryable error is retried on the same join and ends in `ok`. A fatal
//   error is not retried on that join; the next `access_token` push (the
//   hourly token refresh) or a rejoin re-subscribes and sends a fresh verdict.

export type ChatLiveState = 'connecting' | 'live' | 'offline';

// What the server last said about the channel's `postgres_changes` binding
// on the current join. `pending` until the first `system` verdict arrives.
export type ChangesBindingStatus = 'pending' | 'ok' | 'error';

export interface RealtimeSystemPayload {
  extension?: unknown
  status?: unknown
  message?: unknown
}

// The binding verdict a `system` frame carries, or null when it carries none
// (another extension such as `system`, an unknown status, an empty payload).
export function bindingVerdictFromSystem(payload: RealtimeSystemPayload | null | undefined): 'ok' | 'error' | null {
  if (payload?.extension !== 'postgres_changes') { return null; }
  if (payload.status === 'ok') { return 'ok'; }
  if (payload.status === 'error') { return 'error'; }
  return null;
}

// Live only when the channel is joined AND its message binding was accepted.
// Not joined yet: connecting. Any non-SUBSCRIBED status or a rejected
// binding: offline. Joined, binding not confirmed yet: still connecting.
export function chatLiveState(
  channel: RealtimeConnectionStatus | null,
  binding: ChangesBindingStatus,
): ChatLiveState {
  if (channel === null) { return 'connecting'; }
  if (channel !== 'SUBSCRIBED') { return 'offline'; }
  if (binding === 'error') { return 'offline'; }
  return binding === 'ok' ? 'live' : 'connecting';
}

// Offline because the server rejected the binding on a joined channel, as
// opposed to a transport drop that realtime-js reconnects by itself. The
// member is told live updates are unavailable instead of "reconnecting".
export function isBindingUnavailable(
  channel: RealtimeConnectionStatus | null,
  binding: ChangesBindingStatus,
): boolean {
  return channel === 'SUBSCRIBED' && binding === 'error';
}

// Every `ok` verdict on a joined channel runs the catch-up: the first one
// (changes committed between SUBSCRIBED and the binding going active), a
// recovery after an error, and a repeated one (a silent CDC re-subscribe).
export function shouldReconcileOnBindingVerdict(
  channel: RealtimeConnectionStatus | null,
  verdict: 'ok' | 'error',
): boolean {
  return channel === 'SUBSCRIBED' && verdict === 'ok';
}
