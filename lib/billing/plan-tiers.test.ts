import { describe, expect, test } from 'bun:test';
import { formatPrice, meterFillPercent, meterLabel, meterState, PLAN_TIERS } from './plan-tiers';

// BK-229 — pure-function coverage for the tier ladder + meter math. No
// database: this is exactly the layer the AI Tech Lead's TQ1 reversal
// (Jira comment 12417) moved the ladder into so it could be tested this
// way. Maps to ATP outlines 1-6, 8-9, 15-18 (plan/price display, meter
// states at every boundary, retention meters, Free-plan rendering).

describe('PLAN_TIERS — canonical ladder (comment 12415(a) + 12416, ratified)', () => {
  test('community: 5 seats, 3 projects, 30-day retention, $0, unpaid', () => {
    const tier = PLAN_TIERS.community;
    expect(tier.displayName).toBe('Community');
    expect(tier.seatLimit).toBe(5);
    expect(tier.projectLimit).toBe(3);
    expect(tier.retentionDays).toBe(30);
    expect(tier.pricePerSeatCents).toBe(0);
    expect(tier.isPaid).toBe(false);
  });

  test('cloud: 25 seats, 50 projects, 90-day retention, $24/seat, paid', () => {
    const tier = PLAN_TIERS.cloud;
    expect(tier.displayName).toBe('Cloud');
    expect(tier.seatLimit).toBe(25);
    expect(tier.projectLimit).toBe(50);
    expect(tier.retentionDays).toBe(90);
    expect(tier.pricePerSeatCents).toBe(2400);
    expect(tier.isPaid).toBe(true);
  });

  test('enterprise: unlimited seats/projects/retention, Custom price, paid', () => {
    const tier = PLAN_TIERS.enterprise;
    expect(tier.displayName).toBe('Enterprise');
    expect(tier.seatLimit).toBeNull();
    expect(tier.projectLimit).toBeNull();
    expect(tier.retentionDays).toBeNull();
    expect(tier.priceNote).toBe('Custom');
    expect(tier.isPaid).toBe(true);
  });

  // domain-glossary.md §3 anti-glossary — "Free / Team / Enterprise" is
  // banned; the shipped display names are Community / Cloud / Enterprise.
  test('display names never regress to the banned Free/Team vocabulary', () => {
    const names = Object.values(PLAN_TIERS).map(t => t.displayName);
    expect(names).not.toContain('Free');
    expect(names).not.toContain('Team');
    expect(names).toEqual(['Community', 'Cloud', 'Enterprise']);
  });
});

describe('meterState — 80%/100% boundaries (AC2, AC15, AC4, AC5, AC13)', () => {
  test('below 80% is normal', () => {
    expect(meterState(3, 10)).toBe('normal');
    expect(meterState(7, 10)).toBe('normal');
  });

  test('exactly 80% is warning (AC15 — inclusive boundary)', () => {
    expect(meterState(8, 10)).toBe('warning');
  });

  test('80-99% is warning', () => {
    expect(meterState(9, 10)).toBe('warning');
  });

  test('exactly 100% is limit-reached', () => {
    expect(meterState(10, 10)).toBe('limit-reached');
  });

  test('over 100% is still limit-reached, not a distinct state (AC13)', () => {
    expect(meterState(11, 10)).toBe('limit-reached');
  });

  test('zero used against a positive limit is normal', () => {
    expect(meterState(0, 10)).toBe('normal');
  });

  test('a null (unlimited) limit is always normal — AC6, no limit to approach', () => {
    expect(meterState(1_000_000, null)).toBe('normal');
    expect(meterState(0, null)).toBe('normal');
  });
});

describe('meterLabel — "N of limit unit" / unlimited rendering (AC1, AC13, AC6)', () => {
  test('renders "N of limit unit"', () => {
    expect(meterLabel(8, 10, 'seats')).toBe('8 of 10 seats');
  });

  test('renders the true over-limit count, never clamped (AC13 — "11 of 10 seats")', () => {
    expect(meterLabel(11, 10, 'seats')).toBe('11 of 10 seats');
  });

  test('zero active members renders "0 of N seats" (AC12)', () => {
    expect(meterLabel(0, 10, 'seats')).toBe('0 of 10 seats');
  });

  test('a null limit renders "Unlimited" (AC6)', () => {
    expect(meterLabel(15, null, 'seats')).toBe('15 seats · Unlimited');
  });
});

describe('meterFillPercent — bar width, clamped to 100 (AC13)', () => {
  test('proportional fill below the limit', () => {
    expect(meterFillPercent(3, 10)).toBe(30);
    expect(meterFillPercent(8, 10)).toBe(80);
  });

  test('exactly at the limit fills 100%', () => {
    expect(meterFillPercent(10, 10)).toBe(100);
  });

  test('over the limit clamps to 100%, never overflows the bar', () => {
    expect(meterFillPercent(11, 10)).toBe(100);
  });

  test('a null (unlimited) limit has no fill — the caller omits the bar entirely', () => {
    expect(meterFillPercent(5, null)).toBe(0);
  });
});

describe('formatPrice — plan-card price line (AC1, AC3, AC6)', () => {
  test('community renders "$0 / month" — a real price, not absent (AC3)', () => {
    expect(formatPrice(PLAN_TIERS.community)).toBe('$0 / month');
  });

  test('cloud renders "$24 / seat / month"', () => {
    expect(formatPrice(PLAN_TIERS.cloud)).toBe('$24 / seat / month');
  });

  test('enterprise renders "Custom" (AC6), not a fabricated number', () => {
    expect(formatPrice(PLAN_TIERS.enterprise)).toBe('Custom');
  });
});
