import {
  canClosePlan,
  closedByLine,
  notRunWarning,
  parseStatusFilter,
  parseVerdict,
  verdictChipToken,
  verdictLabel,
} from '@lib/test-plans/close-view';
import { describe, expect, test } from 'bun:test';

describe('canClosePlan (presentation of the creator-or-admin rule)', () => {
  test.each([
    ['owner', false, true],
    ['admin', false, true],
    ['member', true, true],
    ['member', false, false],
    ['viewer', true, false],
    ['viewer', false, false],
    [null, true, false],
    [undefined, false, false],
  ] as const)('role %p, creator %p -> %p', (role, isCreator, expected) => {
    expect(canClosePlan({ role, isCreator })).toBe(expected);
  });
});

describe('notRunWarning', () => {
  test('shows the full count and says it never blocks', () => {
    expect(notRunWarning(2)).toBe('2 tests in this plan have never been run. You can still close it.');
    expect(notRunWarning(12)).toBe('12 tests in this plan have never been run. You can still close it.');
  });

  test('uses the singular for one test', () => {
    expect(notRunWarning(1)).toBe('1 test in this plan has never been run. You can still close it.');
  });

  test('shows nothing for a plan with no never-run tests or no tests at all', () => {
    expect(notRunWarning(0)).toBeNull();
    expect(notRunWarning(Number.NaN)).toBeNull();
    expect(notRunWarning(-1)).toBeNull();
  });
});

describe('verdict presentation', () => {
  test('labels and chip tokens', () => {
    expect(verdictLabel('passed')).toBe('Passed');
    expect(verdictLabel('failed')).toBe('Failed');
    expect(verdictChipToken('passed')).toBe('pass');
    expect(verdictChipToken('failed')).toBe('fail');
  });

  test('an unexpected stored verdict renders no chip', () => {
    expect(parseVerdict('passed')).toBe('passed');
    expect(parseVerdict(null)).toBeNull();
    expect(parseVerdict('flaky')).toBeNull();
  });
});

describe('closedByLine', () => {
  test('prints the closer and the UTC close time', () => {
    expect(closedByLine({ closedByLabel: 'mateo@acme.test', closedAtIso: '2026-10-19T18:14:07+00:00' })).toBe('Closed by mateo@acme.test · 2026-10-19 18:14');
  });

  test('normalises any offset to UTC', () => {
    expect(closedByLine({ closedByLabel: 'a@b.test', closedAtIso: '2026-10-19T20:14:00+02:00' })).toBe('Closed by a@b.test · 2026-10-19 18:14');
  });

  test('falls back for an unresolved closer and a missing time', () => {
    expect(closedByLine({ closedByLabel: '', closedAtIso: null })).toBe('Closed by a workspace member');
  });
});

describe('parseStatusFilter', () => {
  test('absent means All', () => {
    expect(parseStatusFilter(undefined)).toBeNull();
    expect(parseStatusFilter(null)).toBeNull();
  });

  test('accepts open and closed, first value of a repeated param', () => {
    expect(parseStatusFilter('open')).toBe('open');
    expect(parseStatusFilter('closed')).toBe('closed');
    expect(parseStatusFilter(['closed', 'open'])).toBe('closed');
  });

  test('an unknown value falls back to All', () => {
    expect(parseStatusFilter('archived')).toBeNull();
    expect(parseStatusFilter('')).toBeNull();
  });
});
