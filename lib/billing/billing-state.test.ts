import type { BillingStateRow } from './billing-state';
import { describe, expect, test } from 'bun:test';
import { deriveSubscriptionState, isRetryAvailable } from './billing-state';
import { stateRow } from './test-doubles';

// BK-231 — the pure rules behind the grace window and the retry gate.

const STARTED = '2026-10-01T12:00:00.000Z';
const ENDS = '2026-10-15T12:00:00.000Z';
const grace = { started_at: STARTED, ends_at: ENDS };

describe('deriveSubscriptionState', () => {
  test('no grace window is an active paid subscription', () => {
    expect(deriveSubscriptionState(null, new Date(ENDS))).toBe('active_paid');
  });

  test('the instant before the grace end still keeps the paid limits (Scenario 4.2)', () => {
    expect(deriveSubscriptionState(grace, new Date(Date.parse(ENDS) - 1))).toBe('grace_period');
  });

  test('the exact grace end switches to Free limits (2026-11-01 PO/Dev ruling)', () => {
    expect(deriveSubscriptionState(grace, new Date(ENDS))).toBe('free_after_grace');
  });

  test('after the grace end stays on Free limits (Scenario 4.3)', () => {
    expect(deriveSubscriptionState(grace, new Date(Date.parse(ENDS) + 1))).toBe('free_after_grace');
  });
});

describe('isRetryAvailable', () => {
  const failed = stateRow({
    payment_state: 'payment_failed',
    failed_invoice_id: 'in_failed',
    payment_method_updated_at: '2026-10-02T09:00:00.000Z',
  }) as unknown as BillingStateRow;

  test('is on once a replacement was confirmed after the failure opened the grace window', () => {
    expect(isRetryAvailable(failed, grace)).toBe(true);
  });

  test('is off while the original method is still the only one', () => {
    expect(isRetryAvailable({ ...failed, payment_method_updated_at: null }, grace)).toBe(false);
  });

  test('is off when the only method change predates the failure', () => {
    expect(isRetryAvailable({ ...failed, payment_method_updated_at: '2026-09-01T00:00:00.000Z' }, grace)).toBe(false);
  });

  test('is off with no failed renewal, or after recovery', () => {
    expect(isRetryAvailable({ ...failed, payment_state: 'paid', failed_invoice_id: null }, null)).toBe(false);
    expect(isRetryAvailable({ ...failed, payment_state: 'recovered', failed_invoice_id: null }, null)).toBe(false);
  });

  test('stays on while a retry is pending so a stuck claim can be reclaimed', () => {
    expect(isRetryAvailable({ ...failed, payment_state: 'retry_pending' }, grace)).toBe(true);
  });
});
