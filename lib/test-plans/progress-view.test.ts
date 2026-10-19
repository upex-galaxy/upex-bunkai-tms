import type { PlanProgressSummary } from '@lib/test-plans/progress-view';
import {
  buildProgressView,
  chipToken,
  formatLastRun,
  miniBarLabel,
  outcomeLabel,
  parsePlanProgress,
  parsePlansProgress,
  PLAN_OUTCOMES,
  planProgressByTest,
} from '@lib/test-plans/progress-view';
import { describe, expect, test } from 'bun:test';

// BK-204 — plan progress view model. Pure unit tests: `bunkai_plan_progress`
// (0094_plan_progress.sql) owns the RULES (latest run, floor percentage) and is
// proven against the real database in `plan-progress-isolation.test.ts`; this
// file owns the words and the bar geometry.

const PLAN_ID = '00000000-0000-0000-0000-0000000000a1';

function summary(counts: Partial<PlanProgressSummary['counts']>, pct: number | null): PlanProgressSummary {
  const full = { passed: 0, failed: 0, aborted: 0, in_progress: 0, not_run: 0, ...counts };
  const total = Object.values(full).reduce((a, b) => a + b, 0);
  return { plan_id: PLAN_ID, member_count: total, passed_pct: pct, counts: full };
}

describe('outcomeLabel / chipToken', () => {
  test('uses the run vocabulary already shipped plus the two derived states', () => {
    expect(PLAN_OUTCOMES.map(outcomeLabel)).toEqual(['Passed', 'Failed', 'Aborted', 'In progress', 'Not run']);
  });

  test('maps each outcome to the live status-chip token', () => {
    expect(PLAN_OUTCOMES.map(chipToken)).toEqual(['pass', 'fail', 'aborted', 'running', 'skipped']);
  });
});

describe('formatLastRun', () => {
  test('renders the start time in UTC like the run history views', () => {
    expect(formatLastRun('2026-07-29T11:52:00+00:00')).toBe('2026-07-29 11:52');
  });

  test('a never-run row shows a dash', () => {
    expect(formatLastRun(null)).toBe('—');
  });
});

describe('buildProgressView', () => {
  test('a plan with no member tests is the empty state: no percentage, no segments', () => {
    const view = buildProgressView(summary({}, null));
    expect(view.state).toBe('empty');
    expect(view.percentLabel).toBe('—');
    expect(view.segments).toEqual([]);
  });

  test('members with no runs is 0%, not empty', () => {
    const view = buildProgressView(summary({ not_run: 4 }, 0));
    expect(view.state).toBe('progress');
    expect(view.percentLabel).toBe('0%');
    expect(view.passedLabel).toBe('passed · 0 of 4');
    expect(view.segments.map(s => [s.outcome, s.count])).toEqual([['not_run', 4]]);
  });

  test('shows the percentage the database computed, never recomputes it (2 of 3 stays 66%)', () => {
    const view = buildProgressView(summary({ passed: 2, failed: 1 }, 66));
    expect(view.percentLabel).toBe('66%');
    expect(view.passedLabel).toBe('passed · 2 of 3');
  });

  test('segments follow the fixed outcome order and widths add up to 100', () => {
    const view = buildProgressView(summary({ not_run: 1, passed: 1, failed: 1, in_progress: 1 }, 25));
    expect(view.segments.map(s => s.outcome)).toEqual(['passed', 'failed', 'in_progress', 'not_run']);
    expect(view.segments.map(s => s.widthPct)).toEqual([25, 25, 25, 25]);
    expect(view.segments.reduce((a, s) => a + s.widthPct, 0)).toBeCloseTo(100, 6);
  });

  test('the legend always lists all five outcomes, zero counts included', () => {
    const view = buildProgressView(summary({ passed: 3 }, 100));
    expect(view.legend.map(l => [l.outcome, l.count])).toEqual([
      ['passed', 3],
      ['failed', 0],
      ['aborted', 0],
      ['in_progress', 0],
      ['not_run', 0],
    ]);
  });

  test('the bar description names every non-zero outcome for assistive tech', () => {
    const view = buildProgressView(summary({ passed: 2, failed: 1, not_run: 1 }, 50));
    expect(view.ariaLabel).toBe('Plan progress: 2 passed, 1 failed, 0 aborted, 0 in progress, 1 not run');
  });

  test('one member that passed reads 1 of 1 at 100%', () => {
    const view = buildProgressView(summary({ passed: 1 }, 100));
    expect(view.passedLabel).toBe('passed · 1 of 1');
    expect(view.percentLabel).toBe('100%');
  });
});

describe('miniBarLabel', () => {
  test('is the percentage, or a dash for an empty plan', () => {
    expect(miniBarLabel(summary({ passed: 1, failed: 2 }, 33))).toBe('33%');
    expect(miniBarLabel(summary({}, null))).toBe('—');
  });
});

describe('parsePlanProgress', () => {
  const valid = {
    plan_id: PLAN_ID,
    member_count: 2,
    passed_pct: 50,
    counts: { passed: 1, failed: 0, aborted: 0, in_progress: 0, not_run: 1 },
    tests: [
      { test_id: 't1', outcome: 'passed', run_id: 'r1', started_at: '2026-07-29T11:52:00+00:00' },
      { test_id: 't2', outcome: 'not_run', run_id: null, started_at: null },
    ],
  };

  test('accepts the RPC shape', () => {
    expect(parsePlanProgress(valid)?.tests).toHaveLength(2);
  });

  test('rejects anything that is not the shape, so the page can degrade instead of crash', () => {
    expect(parsePlanProgress(null)).toBeNull();
    expect(parsePlanProgress({ ...valid, tests: 'nope' })).toBeNull();
    expect(parsePlanProgress({ ...valid, counts: { passed: 1 } })).toBeNull();
    expect(parsePlanProgress({ ...valid, tests: [{ ...valid.tests[0], outcome: 'weird' }] })).toBeNull();
  });

  test('indexes the per-test entries by test id', () => {
    const progress = parsePlanProgress(valid)!;
    const byTest = planProgressByTest(progress);
    expect(byTest.get('t2')?.outcome).toBe('not_run');
    expect(byTest.get('missing')).toBeUndefined();
  });
});

describe('parsePlansProgress', () => {
  test('indexes the batch answer by plan id and ignores malformed entries', () => {
    const map = parsePlansProgress([
      { plan_id: 'a', member_count: 0, passed_pct: null, counts: { passed: 0, failed: 0, aborted: 0, in_progress: 0, not_run: 0 } },
      { plan_id: 'b', member_count: 'x' },
    ]);
    expect([...map.keys()]).toEqual(['a']);
    expect(map.get('a')?.passed_pct).toBeNull();
  });

  test('a non-array answer is an empty map', () => {
    expect(parsePlansProgress(null).size).toBe(0);
    expect(parsePlansProgress({}).size).toBe(0);
  });
});
