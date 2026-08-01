import type { RecoveryCycleRawItem } from '@lib/metrics/recovery-cycle';
import {
  buildRecoveryCycleReport,
  computeElapsedSoFarSeconds,
  computeMedianRecoverySeconds,
  formatCycleDuration,

} from '@lib/metrics/recovery-cycle';
import { describe, expect, test } from 'bun:test';

// BK-47 — pure TS layer for the recovery-cycle report (0049_recovery_cycle_report.sql,
// Decision 3). Covers: duration formatting per band + boundaries, median for
// zero/one/even/odd populations, elapsed-so-far against an injected clock
// (never Date.now() internally — Decision 6), timezone-safe ISO parsing (the
// Postgres `+00:00` offset form, not just `Z`), and report assembly for all
// 3 states.

const BASE = Date.parse('2026-06-01T12:00:00.000Z');
function at(offsetMinutes: number): string {
  return new Date(BASE + offsetMinutes * 60_000).toISOString();
}

function item(overrides: Partial<RecoveryCycleRawItem>): RecoveryCycleRawItem {
  return {
    user_story_id: 'story-1',
    title: 'A story',
    external_id: null,
    module_id: 'module-1',
    module_path: '/a',
    first_fail_at: null,
    first_green_at: null,
    state: 'no_cycle',
    ...overrides,
  };
}

describe('formatCycleDuration', () => {
  test('returns null for a null input', () => {
    expect(formatCycleDuration(null)).toBeNull();
  });

  test('formats a sub-minute duration as seconds', () => {
    expect(formatCycleDuration(12)).toBe('12s');
  });

  test('formats 59s (upper boundary of the seconds band)', () => {
    expect(formatCycleDuration(59)).toBe('59s');
  });

  test('formats 60s as 1m, no seconds shown (lower boundary of the minutes band)', () => {
    expect(formatCycleDuration(60)).toBe('1m');
  });

  test('formats a mid-range minutes duration', () => {
    expect(formatCycleDuration(45 * 60)).toBe('45m');
  });

  test('formats 59m (upper boundary of the minutes band)', () => {
    expect(formatCycleDuration(59 * 60 + 30)).toBe('59m');
  });

  test('formats exactly one hour as 1h 0m', () => {
    expect(formatCycleDuration(3600)).toBe('1h 0m');
  });

  test('formats hours + minutes, not zero-padded (matches the mockup grammar)', () => {
    expect(formatCycleDuration(15 * 3600 + 35 * 60)).toBe('15h 35m');
  });

  test('formats 23h 59m (upper boundary of the hours band)', () => {
    expect(formatCycleDuration(23 * 3600 + 59 * 60)).toBe('23h 59m');
  });

  test('formats exactly one day as 1d 0h 0m', () => {
    expect(formatCycleDuration(24 * 3600)).toBe('1d 0h 0m');
  });

  test('formats days + hours + minutes (mockup literal example)', () => {
    expect(formatCycleDuration(3 * 86_400 + 4 * 3600 + 51 * 60)).toBe('3d 4h 51m');
  });

  test('formats a very large duration (> 365 days) without overflowing (TTC19)', () => {
    expect(formatCycleDuration(400 * 86_400 + 2 * 3600 + 5 * 60)).toBe('400d 2h 5m');
  });

  test('floors a negative input at zero', () => {
    expect(formatCycleDuration(-30)).toBe('0s');
  });

  test('truncates sub-second remainders rather than rounding up', () => {
    expect(formatCycleDuration(12.9)).toBe('12s');
  });
});

describe('computeElapsedSoFarSeconds', () => {
  test('computes elapsed seconds against an injected clock', () => {
    expect(computeElapsedSoFarSeconds(at(0), BASE + 45 * 60_000)).toBe(45 * 60);
  });

  test('accepts the Postgres offset serialization (+00:00, not Z)', () => {
    expect(computeElapsedSoFarSeconds('2026-06-01T12:00:00+00:00', BASE + 60_000)).toBe(60);
  });

  test('returns null for an unparseable timestamp', () => {
    expect(computeElapsedSoFarSeconds('not-a-date', BASE)).toBeNull();
  });

  test('floors a negative delta (now before first_fail_at) at zero', () => {
    expect(computeElapsedSoFarSeconds(at(10), BASE)).toBe(0);
  });

  test('returns zero when now equals first_fail_at', () => {
    expect(computeElapsedSoFarSeconds(at(0), BASE)).toBe(0);
  });
});

describe('computeMedianRecoverySeconds', () => {
  test('returns null for an empty population', () => {
    expect(computeMedianRecoverySeconds([])).toBeNull();
  });

  test('returns the single value for a population of one', () => {
    expect(computeMedianRecoverySeconds([120])).toBe(120);
  });

  test('returns the middle value for an odd-sized population', () => {
    expect(computeMedianRecoverySeconds([300, 100, 200])).toBe(200);
  });

  test('averages the two middle values for an even-sized population', () => {
    expect(computeMedianRecoverySeconds([100, 200, 300, 400])).toBe(250);
  });

  test('rounds a non-integer average to the nearest second', () => {
    expect(computeMedianRecoverySeconds([100, 201])).toBe(151);
  });

  test('is unaffected by input order', () => {
    expect(computeMedianRecoverySeconds([500, 100, 300, 200, 400])).toBe(300);
  });
});

describe('buildRecoveryCycleReport', () => {
  test('computes cycle_seconds as the fail-to-green delta for a recovered story', () => {
    const report = buildRecoveryCycleReport(
      { items: [item({ state: 'recovered', first_fail_at: at(0), first_green_at: at(90) })] },
      BASE + 999 * 60_000, // far in the future — must not affect a resolved cycle
    );
    expect(report.items[0].cycle_seconds).toBe(90 * 60);
    expect(report.resolved_cycle_count).toBe(1);
    expect(report.median_recovery_seconds).toBe(90 * 60);
  });

  test('computes cycle_seconds as elapsed-so-far for an in_progress story', () => {
    const report = buildRecoveryCycleReport(
      { items: [item({ state: 'in_progress', first_fail_at: at(0) })] },
      BASE + 30 * 60_000,
    );
    expect(report.items[0].cycle_seconds).toBe(30 * 60);
    // in_progress never counts toward resolved cycles or the median.
    expect(report.resolved_cycle_count).toBe(0);
    expect(report.median_recovery_seconds).toBeNull();
  });

  test('leaves cycle_seconds null for a no_cycle story', () => {
    const report = buildRecoveryCycleReport({ items: [item({ state: 'no_cycle' })] }, BASE);
    expect(report.items[0].cycle_seconds).toBeNull();
    expect(report.resolved_cycle_count).toBe(0);
  });

  test('median and resolved_cycle_count only ever consider recovered items, mixed with the other two states', () => {
    const report = buildRecoveryCycleReport(
      {
        items: [
          item({ user_story_id: 'a', state: 'recovered', first_fail_at: at(0), first_green_at: at(60) }),
          item({ user_story_id: 'b', state: 'recovered', first_fail_at: at(0), first_green_at: at(180) }),
          item({ user_story_id: 'c', state: 'in_progress', first_fail_at: at(0) }),
          item({ user_story_id: 'd', state: 'no_cycle' }),
        ],
      },
      BASE + 500 * 60_000,
    );
    expect(report.story_count).toBe(4);
    expect(report.resolved_cycle_count).toBe(2);
    expect(report.median_recovery_seconds).toBe((60 * 60 + 180 * 60) / 2);
  });

  test('an empty items array reports zeroed counts and a null median, never a 404-shaped gap', () => {
    const report = buildRecoveryCycleReport({ items: [] }, BASE);
    expect(report.items).toEqual([]);
    expect(report.story_count).toBe(0);
    expect(report.resolved_cycle_count).toBe(0);
    expect(report.median_recovery_seconds).toBeNull();
  });

  test('preserves every raw field on each item (title, external_id, module_path) alongside the computed cycle_seconds', () => {
    const report = buildRecoveryCycleReport(
      {
        items: [
          item({
            user_story_id: 'story-42',
            title: 'Checkout flow',
            external_id: 'BK-42',
            module_path: '/checkout',
            state: 'no_cycle',
          }),
        ],
      },
      BASE,
    );
    expect(report.items[0]).toMatchObject({
      user_story_id: 'story-42',
      title: 'Checkout flow',
      external_id: 'BK-42',
      module_path: '/checkout',
      cycle_seconds: null,
    });
  });
});
