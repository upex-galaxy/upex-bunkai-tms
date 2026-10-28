import { describe, expect, it } from 'bun:test';
import { bindingVerdictFromSystem, chatLiveState, isBindingUnavailable, shouldReconcileOnBindingVerdict } from './live-status';

// BK-1281 — the chat header must not say Live while the message binding failed.

describe('bindingVerdictFromSystem', () => {
  it('reads ok and error from a postgres_changes system frame', () => {
    expect(bindingVerdictFromSystem({ extension: 'postgres_changes', status: 'ok', message: 'Subscribed to PostgreSQL' })).toBe('ok');
    expect(bindingVerdictFromSystem({ extension: 'postgres_changes', status: 'error', message: 'invalid column for filter workspace_id' })).toBe('error');
  });

  it('carries no verdict for another extension, an unknown status or an empty payload', () => {
    expect(bindingVerdictFromSystem({ extension: 'system', status: 'error', message: 'x' })).toBeNull();
    expect(bindingVerdictFromSystem({ extension: 'system', status: 'ok' })).toBeNull();
    expect(bindingVerdictFromSystem({ extension: 'postgres_changes', status: 'weird' })).toBeNull();
    expect(bindingVerdictFromSystem(null)).toBeNull();
    expect(bindingVerdictFromSystem(undefined)).toBeNull();
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

describe('isBindingUnavailable', () => {
  it('is true only for a rejected binding on a joined channel, never for a transport drop', () => {
    expect(isBindingUnavailable('SUBSCRIBED', 'error')).toBe(true);
    expect(isBindingUnavailable('SUBSCRIBED', 'ok')).toBe(false);
    expect(isBindingUnavailable('SUBSCRIBED', 'pending')).toBe(false);
    for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const) {
      expect(isBindingUnavailable(status, 'error')).toBe(false);
    }
    expect(isBindingUnavailable(null, 'error')).toBe(false);
  });
});

describe('shouldReconcileOnBindingVerdict', () => {
  it('is true for every ok verdict on a joined channel, and never for an error or an unjoined channel', () => {
    expect(shouldReconcileOnBindingVerdict('SUBSCRIBED', 'ok')).toBe(true);
    expect(shouldReconcileOnBindingVerdict('SUBSCRIBED', 'error')).toBe(false);
    expect(shouldReconcileOnBindingVerdict('CLOSED', 'ok')).toBe(false);
    expect(shouldReconcileOnBindingVerdict(null, 'ok')).toBe(false);
  });
});
