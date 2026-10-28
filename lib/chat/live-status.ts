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
//   A failed subscription ("invalid column for filter workspace_id", a grant
//   or RLS change, a CDC outage) never changes the channel status, so a UI
//   reading `SUBSCRIBED` alone stays "Live" on a dead channel.
// - On a retryable error the server keeps retrying on the same join and
//   sends `ok` once it succeeds; a rejoin (after CLOSED / TIMED_OUT /
//   CHANNEL_ERROR) sends a fresh `ok` or `error`.

export type ChatLiveState = 'connecting' | 'live' | 'offline';

// What the server last said about the channel's `postgres_changes` binding
// on the current join. `pending` until the first `system` frame arrives.
export type ChangesBindingStatus = 'pending' | 'ok' | 'error';

export interface RealtimeSystemPayload {
  extension?: unknown
  status?: unknown
  message?: unknown
}

// The binding status after a `system` frame. Frames for another extension
// (e.g. `system`) and unknown statuses leave it unchanged.
export function bindingStatusFromSystem(
  payload: RealtimeSystemPayload | null | undefined,
  current: ChangesBindingStatus,
): ChangesBindingStatus {
  if (payload?.extension !== 'postgres_changes') { return current; }
  if (payload.status === 'ok') { return 'ok'; }
  if (payload.status === 'error') { return 'error'; }
  return current;
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

// A binding that recovers on the same join (server retry) must run the
// catch-up: changes committed while it was down were never delivered. The
// first `ok` of a join is NOT a recovery (the SUBSCRIBED transition already
// reconciled).
export function isBindingRecovery(params: {
  channel: RealtimeConnectionStatus | null
  previous: ChangesBindingStatus
  next: ChangesBindingStatus
}): boolean {
  return params.channel === 'SUBSCRIBED' && params.previous === 'error' && params.next === 'ok';
}
