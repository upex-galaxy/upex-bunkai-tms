import { describe, expect, test } from 'bun:test';
import { resolveSeatQuantityBounds, validateSeatQuantity } from './checkout';

// BK-230 — pure-function coverage for the seat-quantity bounds (Scenario
// 2.4/2.5, the AI Product Owner decision published on the ticket: minimum =
// current active_seats, maximum = the Cloud tier's seatLimit, 25). No
// database — mirrors plan-tiers.test.ts's style.

describe('resolveSeatQuantityBounds', () => {
  test('min is the workspace\'s active_seats count; max is the Cloud seatLimit (25)', () => {
    expect(resolveSeatQuantityBounds(5)).toEqual({ min: 5, max: 25 });
  });

  test('min floors at 1 for a workspace with 0 active seats (should not happen, but never a 0 floor)', () => {
    expect(resolveSeatQuantityBounds(0)).toEqual({ min: 1, max: 25 });
  });

  test('a workspace already exceeding the Cloud cap yields an inverted bound (min > max)', () => {
    expect(resolveSeatQuantityBounds(30)).toEqual({ min: 30, max: 25 });
  });
});

describe('validateSeatQuantity', () => {
  const bounds = { min: 5, max: 25 };

  test('accepts a quantity inside the bounds', () => {
    expect(() => validateSeatQuantity(10, bounds)).not.toThrow();
  });

  test('accepts the exact min and max boundaries', () => {
    expect(() => validateSeatQuantity(5, bounds)).not.toThrow();
    expect(() => validateSeatQuantity(25, bounds)).not.toThrow();
  });

  test('rejects below min (Scenario 2.4 — cannot buy fewer seats than are already active)', () => {
    expect(() => validateSeatQuantity(4, bounds)).toThrow();
  });

  test('rejects 0 (Scenario 2.5)', () => {
    expect(() => validateSeatQuantity(0, { min: 1, max: 25 })).toThrow();
  });

  test('rejects above max', () => {
    expect(() => validateSeatQuantity(26, bounds)).toThrow();
  });

  test('rejects a non-integer', () => {
    expect(() => validateSeatQuantity(5.5, bounds)).toThrow();
  });

  test('an inverted bound (workspace already over the Cloud cap) rejects every quantity with a distinct reason', () => {
    const inverted = { min: 30, max: 25 };
    try {
      validateSeatQuantity(30, inverted);
      throw new Error('expected validateSeatQuantity to throw');
    }
    catch (err) {
      expect((err as { details?: { reason?: string } }).details?.reason).toBe('active_seats_exceed_cloud_cap');
    }
  });
});
