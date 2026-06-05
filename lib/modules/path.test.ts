import { buildModulePath, computeDepth, isDescendantPath, MAX_MODULE_DEPTH, moduleNameError, movedSubtreeMaxDepth, nextPosition, rebuildModulePath } from '@lib/modules/path';
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

describe('moduleNameError', () => {
  test('accepts a normal name (returns null)', () => {
    expect(moduleNameError('Payments & Billing')).toBeNull();
  });

  test('empty or whitespace-only is name_required (server trims)', () => {
    expect(moduleNameError('')).toBe('name_required');
    expect(moduleNameError('   ')).toBe('name_required');
  });

  test('one character is name_too_short; two characters is accepted (min boundary)', () => {
    expect(moduleNameError('P')).toBe('name_too_short');
    expect(moduleNameError('Pa')).toBeNull();
  });

  test('80 characters accepted, 81 rejected (max boundary)', () => {
    expect(moduleNameError('a'.repeat(80))).toBeNull();
    expect(moduleNameError('a'.repeat(81))).toBe('name_too_long');
  });

  test('a name with no alphanumeric is name_no_alphanumeric', () => {
    expect(moduleNameError('---')).toBe('name_no_alphanumeric');
  });
});

describe('rebuildModulePath', () => {
  test('the renamed module itself takes the new prefix', () => {
    expect(rebuildModulePath('payment', 'payments-billing', 'payment')).toBe('payments-billing');
  });

  test('a direct child is re-based onto the new prefix', () => {
    expect(rebuildModulePath('payment', 'payments-billing', 'payment/refunds')).toBe('payments-billing/refunds');
  });

  test('a deep descendant keeps its tail under the new prefix', () => {
    expect(rebuildModulePath('a/b', 'a/z', 'a/b/c/d')).toBe('a/z/c/d');
  });

  test('a sibling sharing a string prefix but not the path is untouched', () => {
    // 'payments' must NOT match the 'payment' prefix (the slash guards it).
    expect(rebuildModulePath('payment', 'pay', 'payments')).toBe('payments');
  });

  test('an unrelated path passes through unchanged', () => {
    expect(rebuildModulePath('payment', 'pay', 'checkout/cart')).toBe('checkout/cart');
  });
});

describe('isDescendantPath', () => {
  test('the node itself counts (cannot move under itself)', () => {
    expect(isDescendantPath('payment', 'payment')).toBe(true);
  });

  test('a direct or deep descendant is detected', () => {
    expect(isDescendantPath('payment', 'payment/refunds')).toBe(true);
    expect(isDescendantPath('payment', 'payment/refunds/partial')).toBe(true);
  });

  test('a string-prefix sibling is NOT a descendant (slash guards it)', () => {
    expect(isDescendantPath('payment', 'payments')).toBe(false);
  });

  test('an unrelated path is not a descendant', () => {
    expect(isDescendantPath('payment', 'checkout/cart')).toBe(false);
  });
});

describe('movedSubtreeMaxDepth', () => {
  test('moving a depth-1 leaf under a depth-2 parent → depth 3', () => {
    // source 'payment' (depth 1), subtree max 1, new parent 'a/b' (depth 2).
    expect(movedSubtreeMaxDepth('payment', 1, 'a/b')).toBe(3);
  });

  test('moving a branch keeps relative height (deepest stays within budget)', () => {
    // source 'payment' depth 1 with a child → subtree max 2; under 'a/b/c/d' (depth 4)
    // → new source depth 5, deepest 6 (== MAX, allowed).
    expect(movedSubtreeMaxDepth('payment', 2, 'a/b/c/d')).toBe(MAX_MODULE_DEPTH);
  });

  test('one level too deep is detectable (> MAX)', () => {
    expect(movedSubtreeMaxDepth('payment', 2, 'a/b/c/d/e')).toBe(MAX_MODULE_DEPTH + 1);
  });

  test('moving to the project root lands the source at depth 1', () => {
    // nested source 'a/b/payment' (depth 3) with subtree max 4 → to root: shift -2 → max 2.
    expect(movedSubtreeMaxDepth('a/b/payment', 4, null)).toBe(2);
  });
});
