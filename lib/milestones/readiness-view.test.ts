import { MilestoneAttachPlansBodySchema } from '@lib/milestones/plans-validation';
import {
  asProgressSummary,
  isOverdue,
  overdueInfo,
  overdueNoteText,
  parseMilestonesReadiness,
  planCountLabel,
  readinessNote,
  readinessState,
} from '@lib/milestones/readiness-view';
import { describe, expect, test } from 'bun:test';

// BK-206 — the overdue predicate, its copy and the parse of the readiness answer.
// A fixed `today` keeps the suite independent of the real date.

const TODAY = '2026-08-16';
const ZERO = { passed: 0, failed: 0, aborted: 0, in_progress: 0, not_run: 0 };

describe('isOverdue (target date before today AND readiness not 100)', () => {
  test('flags a past date with readiness below 100 (scenario 4.1)', () => {
    expect(isOverdue({ targetDate: '2026-08-15', readinessPct: 60 }, TODAY)).toBe(true);
  });

  test('is not overdue on the target date itself (scenario 4.2)', () => {
    expect(isOverdue({ targetDate: '2026-08-16', readinessPct: 60 }, TODAY)).toBe(false);
  });

  test('is not overdue with a future date (cleared by replanning, scenario 4.4)', () => {
    expect(isOverdue({ targetDate: '2026-09-01', readinessPct: 80 }, TODAY)).toBe(false);
  });

  test('is cleared by 100 percent, even with the date past (scenarios 2.6, 4.5, 4.7)', () => {
    expect(isOverdue({ targetDate: '2026-08-15', readinessPct: 100 }, TODAY)).toBe(false);
  });

  test('comes back when readiness drops below 100 again', () => {
    expect(isOverdue({ targetDate: '2026-08-15', readinessPct: 99 }, TODAY)).toBe(true);
  });

  test('counts no readiness (no plans, or plans with no tests) as not 100 (scenario 4.6)', () => {
    expect(isOverdue({ targetDate: '2026-08-15', readinessPct: null }, TODAY)).toBe(true);
    expect(isOverdue({ targetDate: '2026-08-16', readinessPct: null }, TODAY)).toBe(false);
  });

  test('0 percent is overdue like any other value below 100', () => {
    expect(isOverdue({ targetDate: '2026-01-01', readinessPct: 0 }, TODAY)).toBe(true);
  });
});

describe('overdueInfo and the copy (Q5: "Overdue by 1 day" / "Overdue by N days")', () => {
  test('one day past target reads singular (scenario 4.3)', () => {
    expect(overdueInfo({ targetDate: '2026-08-15', readinessPct: 60 }, TODAY)).toEqual({ days: 1, label: 'Overdue by 1 day' });
  });

  test('five days past target reads plural (scenario E3)', () => {
    expect(overdueInfo({ targetDate: '2026-08-11', readinessPct: 60 }, TODAY)).toEqual({ days: 5, label: 'Overdue by 5 days' });
  });

  test('crosses a month boundary by calendar days', () => {
    expect(overdueInfo({ targetDate: '2026-07-31', readinessPct: 10 }, TODAY)?.days).toBe(16);
  });

  test('answers null when the milestone is not overdue', () => {
    expect(overdueInfo({ targetDate: '2026-08-16', readinessPct: 0 }, TODAY)).toBeNull();
    expect(overdueInfo({ targetDate: '2026-08-01', readinessPct: 100 }, TODAY)).toBeNull();
  });

  test('the detail note states the days and the readiness once, never a zero for no readiness', () => {
    expect(overdueNoteText({ days: 1, readinessPct: 60 })).toEqual({ passed: 'passed 1 day ago', readiness: 'readiness is at 60%' });
    expect(overdueNoteText({ days: 3, readinessPct: 0 })).toEqual({ passed: 'passed 3 days ago', readiness: 'readiness is at 0%' });
    expect(overdueNoteText({ days: 2, readinessPct: null }).readiness).toBe('no readiness has been recorded yet');
  });
});

describe('readinessState keeps the three readiness states apart (AC 2.7, 5.1, 5.2)', () => {
  test('no plan attached', () => {
    expect(readinessState({ plan_count: 0, member_count: 0, passed_pct: null })).toBe('no-plans');
  });

  test('plans attached, no tests in them', () => {
    expect(readinessState({ plan_count: 2, member_count: 0, passed_pct: null })).toBe('no-tests');
  });

  test('0 of 15 is a percentage, not the empty state', () => {
    expect(readinessState({ plan_count: 2, member_count: 15, passed_pct: 0 })).toBe('progress');
  });
});

describe('labels', () => {
  test('readiness note, singular and plural plans', () => {
    expect(readinessNote({ passed: 12, total: 20, planCount: 2 })).toBe('12 of 20 tests passed across 2 plans · refreshed on view.');
    expect(readinessNote({ passed: 3, total: 5, planCount: 1 })).toBe('3 of 5 tests passed across 1 plan · refreshed on view.');
  });

  test('plan count', () => {
    expect(planCountLabel(1)).toBe('1 plan');
    expect(planCountLabel(3)).toBe('3 plans');
  });

  test('asProgressSummary keeps the database numbers as they are', () => {
    const counts = { ...ZERO, passed: 12, failed: 8 };
    expect(asProgressSummary({ id: 'm1', member_count: 20, passed_pct: 60, counts })).toEqual({ plan_id: 'm1', member_count: 20, passed_pct: 60, counts });
  });
});

describe('parseMilestonesReadiness', () => {
  const good = {
    milestone_id: 'm1',
    plan_count: 1,
    member_count: 10,
    passed_pct: 80,
    counts: { ...ZERO, passed: 8, failed: 2 },
    plans: [{ plan_id: 'p1', name: 'Regression', status: 'open', frozen: false, member_count: 10, passed_pct: 80, counts: { ...ZERO, passed: 8, failed: 2 } }],
  };

  test('indexes valid elements by milestone id', () => {
    const parsed = parseMilestonesReadiness([good, { ...good, milestone_id: 'm2', plan_count: 0, member_count: 0, passed_pct: null, counts: ZERO, plans: [] }]);
    expect(parsed.size).toBe(2);
    expect(parsed.get('m1')?.plans[0].name).toBe('Regression');
    expect(parsed.get('m2')?.passed_pct).toBeNull();
  });

  test('drops an element that breaks the contract and survives a non-array answer', () => {
    expect(parseMilestonesReadiness([{ ...good, passed_pct: 101 }]).size).toBe(0);
    expect(parseMilestonesReadiness([{ ...good, plans: [{ ...good.plans[0], status: 'archived' }] }]).size).toBe(0);
    expect(parseMilestonesReadiness(null).size).toBe(0);
    expect(parseMilestonesReadiness({}).size).toBe(0);
  });
});

describe('MilestoneAttachPlansBodySchema', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  test('accepts one or more plan uuids, repeats included', () => {
    expect(MilestoneAttachPlansBodySchema.safeParse({ test_plan_ids: [ID] }).success).toBe(true);
    expect(MilestoneAttachPlansBodySchema.safeParse({ test_plan_ids: [ID, ID] }).success).toBe(true);
  });

  test('rejects an empty selection, a non-uuid and a missing field', () => {
    expect(MilestoneAttachPlansBodySchema.safeParse({ test_plan_ids: [] }).success).toBe(false);
    expect(MilestoneAttachPlansBodySchema.safeParse({ test_plan_ids: ['nope'] }).success).toBe(false);
    expect(MilestoneAttachPlansBodySchema.safeParse({}).success).toBe(false);
  });
});
