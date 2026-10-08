import { coveragePercent } from '@lib/home/coverage';
import { describe, expect, test } from 'bun:test';

// BK-881 — the Home Coverage card and GET /api/v1/workspaces/{id}/coverage
// both publish through `coveragePercent`, so these cases pin both surfaces.
describe('coveragePercent', () => {
  test('199 of 200 bound reads 99, not a false 100', () => {
    expect(coveragePercent(199, 200)).toBe(99);
  });

  test('1 of 201 bound reads 1, not a false 0', () => {
    expect(coveragePercent(1, 201)).toBe(1);
  });

  test('0 and 100 only for the exact states', () => {
    expect(coveragePercent(0, 57)).toBe(0);
    expect(coveragePercent(57, 57)).toBe(100);
  });

  test('keeps half-up rounding in the middle of the range', () => {
    expect(coveragePercent(78, 100)).toBe(78);
    expect(coveragePercent(2, 3)).toBe(67);
  });

  test('an empty workspace is null, never 0', () => {
    expect(coveragePercent(0, 0)).toBeNull();
  });

  test('a non-finite input is null, never NaN', () => {
    expect(coveragePercent(Number.NaN, 200)).toBeNull();
    expect(coveragePercent(199, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
