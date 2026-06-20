import { atcUsageLabel, formatPositions } from '@lib/atcs/usage';
import { describe, expect, it } from 'bun:test';

// BK-22 — unit coverage for the "used in N tests" presentation helpers. Pure,
// no DB; mirrors the singular/plural + multi-position rendering the AtcPreview
// "Used by" section depends on.

describe('bK-22 — atcUsageLabel (singular/plural grammar, E1)', () => {
  it('renders "Not used yet" for zero usage (AC3.1 empty-state)', () => {
    expect(atcUsageLabel(0)).toBe('Not used yet');
  });

  it('renders the singular "Used in 1 test" for exactly one Test (E1)', () => {
    expect(atcUsageLabel(1)).toBe('Used in 1 test');
  });

  it('renders the plural "Used in N tests" for N > 1', () => {
    expect(atcUsageLabel(4)).toBe('Used in 4 tests');
    expect(atcUsageLabel(9)).toBe('Used in 9 tests');
  });

  it('treats negative/garbage counts as zero (defensive)', () => {
    expect(atcUsageLabel(-1)).toBe('Not used yet');
  });
});

describe('bK-22 — formatPositions (multi-position rendering, AC2.2)', () => {
  it('renders a single position as "#N"', () => {
    expect(formatPositions([1])).toBe('#1');
  });

  it('joins multiple positions ascending as "#1, #3" (same ATC twice in one Test)', () => {
    expect(formatPositions([1, 3])).toBe('#1, #3');
  });

  it('renders an empty list as an empty string', () => {
    expect(formatPositions([])).toBe('');
  });
});
