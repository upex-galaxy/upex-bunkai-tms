import { describe, expect, it } from 'bun:test';
import { bindingStatusFromSystem, chatLiveState, isBindingRecovery } from './live-status';

// BK-1281 — the chat header must not say Live while the message binding failed.

describe('bindingStatusFromSystem', () => {
  it('reads ok and error from a postgres_changes system frame', () => {
    expect(bindingStatusFromSystem({ extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL' }, 'pending')).toBe('ok');
    expect(bindingStatusFromSystem({ extension: 'postgres_changes', status: 'error', message: 'invalid column for filter workspace_id' }, 'ok')).toBe('error');
    expect(bindingStatusFromSystem({ extension: 'postgres_changes', status: 'ok' }, 'error')).toBe('ok');
  });

  it('ignores frames for another extension, unknown statuses and empty payloads', () => {
    expect(bindingStatusFromSystem({ extension: 'system', status: 'error', message: 'x' }, 'ok')).toBe('ok');
    expect(bindingStatusFromSystem({ extension: 'system', status: 'ok' }, 'pending')).toBe('pending');
    expect(bindingStatusFromSystem({ extension: 'postgres_changes', status: 'weird' }, 'pending')).toBe('pending');
    expect(bindingStatusFromSystem(null, 'error')).toBe('error');
    expect(bindingStatusFromSystem(undefined, 'ok')).toBe('ok');
  });
});

describe('chatLiveState', () => {
  it('is connecting before the channel reports anything', () => {
    expect(chatLiveState(null, 'pending')).toBe('connecting');
  });

  it('is live only when SUBSCRIBED and the binding was accepted', () => {
    expect(chatLiveState('SUBSCRIBED', 'ok')).toBe('live');
    expect(chatLiveState('SUBSCRIBED', 'pending')).toBe('connecting');
    expect(chatLiveState('SUBSCRIBED', 'error')).toBe('offline');
  });

  it('is offline for every non-SUBSCRIBED channel status, whatever the binding says', () => {
    for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const) {
      expect(chatLiveState(status, 'ok')).toBe('offline');
      expect(chatLiveState(status, 'pending')).toBe('offline');
    }
  });
});

describe('isBindingRecovery', () => {
  it('is true only for error -> ok on a joined channel', () => {
    expect(isBindingRecovery({ channel: 'SUBSCRIBED', previous: 'error', next: 'ok' })).toBe(true);
    expect(isBindingRecovery({ channel: 'SUBSCRIBED', previous: 'pending', next: 'ok' })).toBe(false);
    expect(isBindingRecovery({ channel: 'CLOSED', previous: 'error', next: 'ok' })).toBe(false);
    expect(isBindingRecovery({ channel: 'SUBSCRIBED', previous: 'ok', next: 'error' })).toBe(false);
  });
});
