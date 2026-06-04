import { buildModulePath, computeDepth, MAX_MODULE_DEPTH, nextPosition } from '@lib/modules/path';
import { describe, expect, test } from 'bun:test';

describe('buildModulePath', () => {
  test('returns just the segment for a root module (empty parent path)', () => {
    expect(buildModulePath('', 'checkout')).toBe('checkout');
  });

  test('appends the segment under the parent path with no leading slash', () => {
    expect(buildModulePath('checkout', 'payment')).toBe('checkout/payment');
  });

  test('builds a deep breadcrumb path', () => {
    expect(buildModulePath('a/b/c', 'd')).toBe('a/b/c/d');
  });

  test('never produces a leading slash', () => {
    expect(buildModulePath('', 'root').startsWith('/')).toBe(false);
    expect(buildModulePath('a', 'b').startsWith('/')).toBe(false);
  });
});

describe('computeDepth', () => {
  test('empty string is depth 0', () => {
    expect(computeDepth('')).toBe(0);
  });

  test('a root path is depth 1', () => {
    expect(computeDepth('checkout')).toBe(1);
  });

  test('counts slash-separated segments', () => {
    expect(computeDepth('a/b/c')).toBe(3);
  });

  test('depth boundaries: max-allowed parent yields depth 6, one past yields 7', () => {
    // Parent at depth 5 → child resulting depth 6 (allowed, == MAX).
    const parentDepth5 = 'a/b/c/d/e';
    expect(computeDepth(parentDepth5) + 1).toBe(MAX_MODULE_DEPTH);

    // Parent at depth 6 → child resulting depth 7 (rejected, > MAX).
    const parentDepth6 = 'a/b/c/d/e/f';
    expect(computeDepth(parentDepth6) + 1).toBe(MAX_MODULE_DEPTH + 1);
  });

  test('warning threshold: depth 5 is the first deep-nesting level', () => {
    // Parent at depth 4 → child resulting depth 5 (warning fires).
    expect(computeDepth('a/b/c/d') + 1).toBe(5);
  });
});

describe('nextPosition', () => {
  test('empty sibling set yields 0 (matches table default)', () => {
    expect(nextPosition([])).toBe(0);
  });

  test('single sibling at 0 yields 1', () => {
    expect(nextPosition([0])).toBe(1);
  });

  test('returns the max position + 1 regardless of order or gaps', () => {
    expect(nextPosition([0, 1, 2])).toBe(3);
    expect(nextPosition([2, 0, 1])).toBe(3);
    expect(nextPosition([0, 5, 2])).toBe(6);
  });
});
