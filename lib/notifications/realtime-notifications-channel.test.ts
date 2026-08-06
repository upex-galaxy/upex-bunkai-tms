import { buildNotificationsChannelConfig } from '@lib/notifications/realtime-notifications-channel';
import { describe, expect, test } from 'bun:test';

// BK-209 (Slice 3: UI) / ADR-0010 — channel config shape only. The
// refetch-scheduler + reconnect-reconciliation primitives this module reuses
// are already covered by lib/runs/realtime-run-channel.test.ts (same
// exported functions, no notifications-specific behavior to re-test here).

describe('buildNotificationsChannelConfig', () => {
  test('names the channel after the workspace id', () => {
    const config = buildNotificationsChannelConfig('ws-1');
    expect(config.channelName).toBe('notifications-ws-1');
  });

  test('binds INSERT and UPDATE on the notifications table, filtered to the workspace', () => {
    const config = buildNotificationsChannelConfig('ws-1');

    expect(config.bindings).toEqual([
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'workspace_id=eq.ws-1' },
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'workspace_id=eq.ws-1' },
    ]);
  });
});
