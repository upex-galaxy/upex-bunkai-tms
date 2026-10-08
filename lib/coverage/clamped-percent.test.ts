import { clampedPercent } from '@lib/coverage/clamped-percent';
import { describe, expect, test } from 'bun:test';

describe('clampedPercent', () => {
  test('rounds a mid-range ratio half-up to a whole percent', () => {
    expect(clampedPercent(1, 3)).toBe(33);
    expect(clampedPercent(2, 3)).toBe(67);
    expect(clampedPercent(1, 2)).toBe(50);
  });

  test('never reads 100 while a gap exists (BK-881 / BK-1082)', () => {
    expect(clampedPercent(199, 200)).toBe(99);
    expect(clampedPercent(200, 201)).toBe(99);
    expect(clampedPercent(9999, 10000)).toBe(99);
  });

  test('never reads 0 while coverage exists (BK-881 / BK-1082)', () => {
    expect(clampedPercent(1, 201)).toBe(1);
    expect(clampedPercent(1, 10000)).toBe(1);
  });

  test('reserves 0 and 100 for the exact states', () => {
    expect(clampedPercent(0, 200)).toBe(0);
    expect(clampedPercent(200, 200)).toBe(100);
    expect(clampedPercent(1, 1)).toBe(100);
  });

  test('a zero denominator is null, never 0 or NaN', () => {
    expect(clampedPercent(0, 0)).toBeNull();
  });

  test('a non-finite input is null, so "NaN%" can never render', () => {
    expect(clampedPercent(Number.NaN, 10)).toBeNull();
    expect(clampedPercent(5, Number.NaN)).toBeNull();
    expect(clampedPercent(Number.POSITIVE_INFINITY, 10)).toBeNull();
    expect(clampedPercent(5, Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampedPercent(Number.NEGATIVE_INFINITY, 10)).toBeNull();
  });
});
