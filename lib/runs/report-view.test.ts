import {
  activeReportFilterCount,
  EMPTY_REPORT_FILTERS,
  hasActiveReportFilters,
  REPORT_EMPTY_NO_MATCH_DESCRIPTION,
  REPORT_EMPTY_NO_MATCH_TITLE,
  REPORT_EMPTY_NO_RUNS_DESCRIPTION,
  REPORT_EMPTY_NO_RUNS_TITLE,
  reportScopeLabel,
  reportTableFootText,
  resolveReportEmptyStateCopy,
  resolveReportViewState,
} from '@lib/runs/report-view';
import { describe, expect, test } from 'bun:test';

// BK-38 — Run Report view-state branch selection, the two empty-state
// strings (ATC-06 "no runs yet", ATC-03 "no match"), and the pure summary
// helpers (`activeReportFilterCount`, `reportTableFootText`,
// `reportScopeLabel`). Mirrors `lib/runs/history-view.test.ts`'s structure.

describe('resolveReportViewState', () => {
  test('a FIRST-PAGE error takes priority, even with rows already on screen', () => {
    expect(resolveReportViewState({ error: true, rowCount: 12, hasActiveFilters: false })).toBe('error');
    expect(resolveReportViewState({ error: true, rowCount: 0, hasActiveFilters: true })).toBe('error');
  });

  test('a failed APPEND is not this resolver\'s input — deep lists stay mounted', () => {
    // The caller keeps a failed "load older" in its own state and passes
    // error: false here, so rows already loaded survive one flaky append.
    expect(resolveReportViewState({ error: false, rowCount: 150, hasActiveFilters: false })).toBe('rows');
    expect(resolveReportViewState({ error: false, rowCount: 150, hasActiveFilters: true })).toBe('rows');
  });

  test('rows present, no filters -> rows', () => {
    expect(resolveReportViewState({ error: false, rowCount: 5, hasActiveFilters: false })).toBe('rows');
  });

  test('rows present with a filter -> rows (the filter is irrelevant once matched)', () => {
    expect(resolveReportViewState({ error: false, rowCount: 2, hasActiveFilters: true })).toBe('rows');
  });

  test('zero rows, no filters -> the no-runs empty state (ATC-06)', () => {
    expect(resolveReportViewState({ error: false, rowCount: 0, hasActiveFilters: false })).toBe('empty-no-runs');
  });

  test('zero rows WITH a filter -> the no-match state, not the no-runs one (ATC-03)', () => {
    expect(resolveReportViewState({ error: false, rowCount: 0, hasActiveFilters: true })).toBe('empty-no-match');
  });
});

describe('hasActiveReportFilters', () => {
  test('no axis set -> false', () => {
    expect(hasActiveReportFilters(EMPTY_REPORT_FILTERS)).toBe(false);
  });

  test('any single axis set -> true', () => {
    expect(hasActiveReportFilters({ ...EMPTY_REPORT_FILTERS, dateFrom: '2026-07-01' })).toBe(true);
    expect(hasActiveReportFilters({ ...EMPTY_REPORT_FILTERS, dateTo: '2026-07-02' })).toBe(true);
    expect(hasActiveReportFilters({ ...EMPTY_REPORT_FILTERS, moduleId: 'mod-1' })).toBe(true);
    expect(hasActiveReportFilters({ ...EMPTY_REPORT_FILTERS, status: ['passed'] })).toBe(true);
    expect(hasActiveReportFilters({ ...EMPTY_REPORT_FILTERS, executor: ['ci'] })).toBe(true);
  });

  test('every axis set at once -> true', () => {
    expect(hasActiveReportFilters({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-02',
      moduleId: 'mod-1',
      status: ['passed', 'failed'],
      executor: ['human'],
    })).toBe(true);
  });
});

describe('activeReportFilterCount', () => {
  test('zero when no axis is set', () => {
    expect(activeReportFilterCount(EMPTY_REPORT_FILTERS)).toBe(0);
  });

  test('date_from and date_to count as TWO independent chips, mirroring the mockup', () => {
    expect(activeReportFilterCount({ ...EMPTY_REPORT_FILTERS, dateFrom: '2026-07-01' })).toBe(1);
    expect(activeReportFilterCount({ ...EMPTY_REPORT_FILTERS, dateFrom: '2026-07-01', dateTo: '2026-07-02' })).toBe(2);
  });

  test('a multi-value status/executor selection still counts as ONE chip per axis', () => {
    expect(activeReportFilterCount({ ...EMPTY_REPORT_FILTERS, status: ['passed', 'failed', 'aborted'] })).toBe(1);
    expect(activeReportFilterCount({ ...EMPTY_REPORT_FILTERS, executor: ['human', 'agent', 'ci'] })).toBe(1);
  });

  test('all five chips at once', () => {
    expect(activeReportFilterCount({
      dateFrom: '2026-07-01',
      dateTo: '2026-07-02',
      moduleId: 'mod-1',
      status: ['passed'],
      executor: ['ci'],
    })).toBe(5);
  });
});

describe('reportTableFootText', () => {
  test('no filters -> the "sorted by last activity" suffix', () => {
    expect(reportTableFootText(15, EMPTY_REPORT_FILTERS)).toBe('runs 1–15 · sorted by last activity ↓');
  });

  test('one filter active -> singular "filter"', () => {
    expect(reportTableFootText(3, { ...EMPTY_REPORT_FILTERS, moduleId: 'mod-1' })).toBe('runs 1–3 · 1 filter active');
  });

  test('multiple filters active -> plural "filters"', () => {
    const filters = { ...EMPTY_REPORT_FILTERS, moduleId: 'mod-1', status: ['pass'], executor: ['ci'] };
    expect(reportTableFootText(3, filters)).toBe('runs 1–3 · 3 filters active');
  });

  test('zero rows still renders the "1–0" head, never a negative or NaN range', () => {
    expect(reportTableFootText(0, EMPTY_REPORT_FILTERS)).toBe('runs 1–0 · sorted by last activity ↓');
  });
});

describe('empty-state copy', () => {
  test('no-runs copy is the mockup\'s title, with an authored (non-invented-per-instruction) description', () => {
    expect(REPORT_EMPTY_NO_RUNS_TITLE).toBe('No runs yet for this Project');
    expect(REPORT_EMPTY_NO_RUNS_DESCRIPTION.length).toBeGreaterThan(0);
  });

  test('no-match copy is the mockup\'s live-state (#live-empty) text verbatim', () => {
    expect(REPORT_EMPTY_NO_MATCH_TITLE).toBe('No runs match these filters');
    expect(REPORT_EMPTY_NO_MATCH_DESCRIPTION).toBe(
      'The combination you applied matches nothing in this project. Totals above show zero — that is a valid result, not an error.',
    );
  });

  test('the two empty states never render the same sentence', () => {
    expect(REPORT_EMPTY_NO_RUNS_TITLE).not.toBe(REPORT_EMPTY_NO_MATCH_TITLE);
    expect(REPORT_EMPTY_NO_RUNS_DESCRIPTION).not.toBe(REPORT_EMPTY_NO_MATCH_DESCRIPTION);
  });

  test('resolveReportEmptyStateCopy resolves each state to its own strings', () => {
    expect(resolveReportEmptyStateCopy('empty-no-runs')).toEqual({
      title: REPORT_EMPTY_NO_RUNS_TITLE,
      description: REPORT_EMPTY_NO_RUNS_DESCRIPTION,
    });
    expect(resolveReportEmptyStateCopy('empty-no-match')).toEqual({
      title: REPORT_EMPTY_NO_MATCH_TITLE,
      description: REPORT_EMPTY_NO_MATCH_DESCRIPTION,
    });
  });
});

describe('reportScopeLabel', () => {
  test('singular noun at exactly one loaded row', () => {
    expect(reportScopeLabel(1, false)).toBe('1 run in current scope');
  });

  test('plural noun otherwise, including zero', () => {
    expect(reportScopeLabel(0, false)).toBe('0 runs in current scope');
    expect(reportScopeLabel(42, false)).toBe('42 runs in current scope');
  });

  test('a live cursor appends the "more available" hint instead of a fabricated total', () => {
    expect(reportScopeLabel(50, true)).toBe('50 runs loaded in current scope · more available');
  });
});
