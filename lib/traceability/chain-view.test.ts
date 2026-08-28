import type {
  StoryTraceabilityPayload,
  TraceabilityAtc,
  TraceabilityCriterion,
  TraceabilityFilterState,
  TraceabilityLatestRun,
} from '@lib/traceability/chain-view';
import {
  acNoteLabel,
  activeFilterChips,
  atcMatchesFilters,
  CHAIN_PLACEHOLDER_COPY,
  DATE_RANGE_ERROR_MESSAGE,
  defectCellPlaceholder,
  distinctModules,
  EMPTY_FILTER_STATE,
  filterCriteria,
  FILTERED_EMPTY_TITLE,
  filteredEmptyBody,
  filterStateToParams,
  filterTotals,
  isAcCardHidden,
  isAcUncovered,
  isDateRangeInverted,
  isFilteredEmpty,
  isFilteringActive,
  mergeFilterParamsIntoUrl,
  parseFilterStateFromParams,
  resolveAtcRowState,
  resolveKnownModuleId,
  resolveStoryChainViewState,
  RESULT_FILTER_VALUES,
  rowCountLabel,
  rowFilterDate,
  rowFilterStatus,
  runCellPlaceholder,
  runChipLabel,
  runChipTone,
  storyRollupCounts,
  testCellCopy,
  UNCOVERED_WHY,
  zeroCoverageBody,
} from '@lib/traceability/chain-view';
import { describe, expect, test } from 'bun:test';

function atc(overrides: Partial<TraceabilityAtc> = {}): TraceabilityAtc {
  return {
    id: 'atc-1',
    slug: 'mod/atc-1',
    title: 'An ATC',
    layer: 'UI',
    module: { id: 'mod-1', name: 'Module One' },
    test: null,
    latest_run: null,
    defects: [],
    ...overrides,
  };
}

function criterion(overrides: Partial<TraceabilityCriterion> = {}): TraceabilityCriterion {
  return { id: 'ac-1', title: 'An AC', atcs: [], ...overrides };
}

function payload(criteria: TraceabilityCriterion[]): StoryTraceabilityPayload {
  return {
    story: { id: 'us-1', title: 'A story', status: 'draft', archived_at: null },
    criteria,
  };
}

function run(overrides: Partial<TraceabilityLatestRun> = {}): TraceabilityLatestRun {
  return {
    run_id: 'run-1',
    run_status: 'passed',
    atc_status: 'passed',
    started_at: '2026-08-01T00:00:00Z',
    finished_at: '2026-08-01T00:05:00Z',
    state: 'passed',
    ...overrides,
  };
}

describe('resolveStoryChainViewState', () => {
  test('zero criteria -> zero-ac (AC-07)', () => {
    expect(resolveStoryChainViewState(payload([]))).toBe('zero-ac');
  });

  test('criteria exist, every one has zero ATCs -> zero-coverage (AC-03)', () => {
    const p = payload([criterion({ atcs: [] }), criterion({ id: 'ac-2', atcs: [] })]);
    expect(resolveStoryChainViewState(p)).toBe('zero-coverage');
  });

  test('at least one AC has an ATC -> has-chain, even when a sibling AC is uncovered (AC-04 mixed case)', () => {
    const p = payload([
      criterion({ id: 'ac-covered', atcs: [atc()] }),
      criterion({ id: 'ac-uncovered', atcs: [] }),
    ]);
    expect(resolveStoryChainViewState(p)).toBe('has-chain');
  });
});

describe('isAcUncovered', () => {
  test('zero ATCs -> uncovered', () => {
    expect(isAcUncovered(criterion({ atcs: [] }))).toBe(true);
  });

  test('at least one ATC -> not uncovered', () => {
    expect(isAcUncovered(criterion({ atcs: [atc()] }))).toBe(false);
  });
});

describe('UNCOVERED_WHY', () => {
  test('ships the PO-ratified verbatim strip copy (comment 12171)', () => {
    expect(UNCOVERED_WHY).toBe('· 0 ATCs bound: no verification exists for this criterion. Bind an ATC in the Test Cases screen to start a chain.');
  });
});

describe('zeroCoverageBody', () => {
  test('interpolates the AC count into the ratified AC-03 body', () => {
    expect(zeroCoverageBody(3)).toBe('3 acceptance criteria exist, but none of them has an ATC bound. There is no chain to trace yet: every criterion below is an open verification gap.');
  });
});

describe('resolveAtcRowState', () => {
  test('no test -> no-test', () => {
    expect(resolveAtcRowState(atc({ test: null, latest_run: null }))).toBe('no-test');
  });

  test('test exists, no run -> no-run', () => {
    expect(resolveAtcRowState(atc({ test: { id: 't-1', title: 'A Test' }, latest_run: null }))).toBe('no-run');
  });

  test('test + run both exist -> has-run', () => {
    expect(resolveAtcRowState(atc({ test: { id: 't-1', title: 'A Test' }, latest_run: run() }))).toBe('has-run');
  });
});

describe('layer-specific chain placeholder copy (AC-02, ratified verbatim)', () => {
  test('no-test row: Test column shows "No test written yet"; Run/Defect columns show "Awaiting test"', () => {
    expect(testCellCopy('no-test')).toBe(CHAIN_PLACEHOLDER_COPY.noTestWrittenYet);
    expect(runCellPlaceholder('no-test')).toBe(CHAIN_PLACEHOLDER_COPY.awaitingTest);
    expect(defectCellPlaceholder('no-test', 0)).toBe(CHAIN_PLACEHOLDER_COPY.awaitingTest);
  });

  test('no-run row: Test column renders normally (null placeholder); Run shows "No run recorded yet"; Defect shows "Awaiting first run"', () => {
    expect(testCellCopy('no-run')).toBeNull();
    expect(runCellPlaceholder('no-run')).toBe(CHAIN_PLACEHOLDER_COPY.noRunRecordedYet);
    expect(defectCellPlaceholder('no-run', 0)).toBe(CHAIN_PLACEHOLDER_COPY.awaitingFirstRun);
  });

  test('has-run row with zero defects: Run/Test render normally; Defect shows "None linked"', () => {
    expect(testCellCopy('has-run')).toBeNull();
    expect(runCellPlaceholder('has-run')).toBeNull();
    expect(defectCellPlaceholder('has-run', 0)).toBe(CHAIN_PLACEHOLDER_COPY.noneLinked);
  });

  test('has-run row with defects: Defect placeholder is null (a real list renders)', () => {
    expect(defectCellPlaceholder('has-run', 2)).toBeNull();
  });
});

describe('run chip tone/label — in-flight never collapses into skipped', () => {
  test('in_flight -> running tone, "Running" label (never the --skipped dotted pill)', () => {
    const r = run({ state: 'in_flight', run_status: 'running', atc_status: 'pending' });
    expect(runChipTone(r)).toBe('running');
    expect(runChipLabel(r)).toBe('Running');
  });

  test('aborted -> aborted tone', () => {
    const r = run({ state: 'aborted', run_status: 'aborted' });
    expect(runChipTone(r)).toBe('aborted');
  });

  test('passed/failed/blocked/skipped map through 1:1', () => {
    expect(runChipTone(run({ state: 'passed' }))).toBe('pass');
    expect(runChipTone(run({ state: 'failed' }))).toBe('fail');
    expect(runChipTone(run({ state: 'blocked' }))).toBe('blocked');
    expect(runChipTone(run({ state: 'skipped' }))).toBe('skipped');
  });
});

describe('storyRollupCounts', () => {
  test('counts distinct Tests/Runs/Defects, and ATCs bound to 2 ACs count once for the rollup but repeat in criteria', () => {
    const sharedAtc = atc({
      id: 'atc-shared',
      test: { id: 't-1', title: 'Shared test' },
      latest_run: run({ run_id: 'run-shared' }),
      defects: [{ id: 'bug-1', title: 'Bug', severity: 'P2', status: 'open', created_at: '2026-08-01T00:00:00Z', run_id: 'run-shared', run_step_id: null }],
    });
    const p = payload([
      criterion({ id: 'ac-a', atcs: [sharedAtc] }),
      criterion({ id: 'ac-b', atcs: [sharedAtc] }),
    ]);
    const counts = storyRollupCounts(p);
    // acCount counts CRITERIA (2), atcCount counts ROW occurrences (2, one
    // per AC — the PO's no-dedupe ruling), test/run/defect counts dedupe by
    // id since the SAME Test/Run/Defect is referenced from both rows.
    expect(counts.acCount).toBe(2);
    expect(counts.atcCount).toBe(2);
    expect(counts.testCount).toBe(1);
    expect(counts.runCount).toBe(1);
    expect(counts.defectCount).toBe(1);
  });

  test('an all-empty story rolls up to zero everywhere', () => {
    const counts = storyRollupCounts(payload([]));
    expect(counts).toEqual({ acCount: 0, atcCount: 0, testCount: 0, runCount: 0, defectCount: 0 });
  });
});

// ---------------------------------------------------------------------------
// BK-48 — chain filters (AC1-AC6).

function filterState(overrides: Partial<TraceabilityFilterState> = {}): TraceabilityFilterState {
  return { ...EMPTY_FILTER_STATE, ...overrides };
}

describe('rowFilterStatus / rowFilterDate — the row attribute source', () => {
  test('no latest run -> both null (AC1.4/AC2.7/AC6.1 "missing or empty")', () => {
    const a = atc({ latest_run: null });
    expect(rowFilterStatus(a)).toBeNull();
    expect(rowFilterDate(a)).toBeNull();
  });

  test('a run present -> status is the run chip tone, date is the YYYY-MM-DD slice of started_at', () => {
    const a = atc({ latest_run: run({ state: 'failed', started_at: '2026-07-21T14:03:00Z' }) });
    expect(rowFilterStatus(a)).toBe('fail');
    expect(rowFilterDate(a)).toBe('2026-07-21');
  });
});

describe('isDateRangeInverted (AC2.5)', () => {
  test('from after to -> inverted', () => {
    expect(isDateRangeInverted('2026-07-25', '2026-07-20')).toBe(true);
  });

  test('from before or equal to -> not inverted', () => {
    expect(isDateRangeInverted('2026-07-20', '2026-07-25')).toBe(false);
    expect(isDateRangeInverted('2026-07-21', '2026-07-21')).toBe(false);
  });

  test('either side missing -> never inverted (AC5.6 open-ended ranges)', () => {
    expect(isDateRangeInverted(null, '2026-07-20')).toBe(false);
    expect(isDateRangeInverted('2026-07-20', null)).toBe(false);
    expect(isDateRangeInverted(null, null)).toBe(false);
  });
});

describe('isFilteringActive', () => {
  test('no axis set -> false', () => {
    expect(isFilteringActive(EMPTY_FILTER_STATE)).toBe(false);
  });

  test('any single axis -> true', () => {
    expect(isFilteringActive(filterState({ results: ['fail'] }))).toBe(true);
    expect(isFilteringActive(filterState({ moduleId: 'mod-1' }))).toBe(true);
    expect(isFilteringActive(filterState({ from: '2026-07-20' }))).toBe(true);
    expect(isFilteringActive(filterState({ to: '2026-07-25' }))).toBe(true);
  });

  test('an inverted date range with nothing else set -> false (the invalid range is IGNORED, not "active")', () => {
    expect(isFilteringActive(filterState({ from: '2026-07-25', to: '2026-07-20' }))).toBe(false);
  });

  test('an inverted date range alongside a result filter -> still true (the result filter carries it)', () => {
    expect(isFilteringActive(filterState({ results: ['fail'], from: '2026-07-25', to: '2026-07-20' }))).toBe(true);
  });
});

describe('atcMatchesFilters (AC1.1/1.2/1.4, AC2.1/2.3/2.4/2.5/2.7/2.10, AC6.1)', () => {
  test('Scenario 1.1 — single result value matches only that status', () => {
    const state = filterState({ results: ['fail'] });
    expect(atcMatchesFilters(atc({ latest_run: run({ state: 'failed' }) }), state)).toBe(true);
    expect(atcMatchesFilters(atc({ latest_run: run({ state: 'passed' }) }), state)).toBe(false);
  });

  test('Scenario 1.2 — multiple result values are OR-ed together', () => {
    const state = filterState({ results: ['fail', 'blocked'] });
    expect(atcMatchesFilters(atc({ latest_run: run({ state: 'failed' }) }), state)).toBe(true);
    expect(atcMatchesFilters(atc({ latest_run: run({ state: 'blocked' }) }), state)).toBe(true);
    expect(atcMatchesFilters(atc({ latest_run: run({ state: 'passed' }) }), state)).toBe(false);
  });

  test('Scenario 1.4/6.1 — a row with no run is EXCLUDED while a result or date filter is active', () => {
    const noRun = atc({ latest_run: null });
    expect(atcMatchesFilters(noRun, filterState({ results: ['fail'] }))).toBe(false);
    expect(atcMatchesFilters(noRun, filterState({ from: '2026-07-01' }))).toBe(false);
    // ...but visible when NO filter is active at all.
    expect(atcMatchesFilters(noRun, EMPTY_FILTER_STATE)).toBe(true);
  });

  test('Scenario 2.1/2.7 — exact-match module id; a row with a different (or the same) module', () => {
    const state = filterState({ moduleId: 'mod-1' });
    expect(atcMatchesFilters(atc({ module: { id: 'mod-1', name: 'One' } }), state)).toBe(true);
    expect(atcMatchesFilters(atc({ module: { id: 'mod-2', name: 'Two' } }), state)).toBe(false);
  });

  test('Scenario 2.3/2.10 — inclusive date range, including the From === To single-day case', () => {
    const state = filterState({ from: '2026-07-20', to: '2026-07-25' });
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-20T00:00:00Z' }) }), state)).toBe(true);
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-25T23:59:00Z' }) }), state)).toBe(true);
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-19T00:00:00Z' }) }), state)).toBe(false);
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-26T00:00:00Z' }) }), state)).toBe(false);

    const singleDay = filterState({ from: '2026-07-21', to: '2026-07-21' });
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-21T09:00:00Z' }) }), singleDay)).toBe(true);
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-20T09:00:00Z' }) }), singleDay)).toBe(false);
  });

  test('Scenario 5.6 — an open-ended range (solo From, or solo To)', () => {
    const soloFrom = filterState({ from: '2026-07-20' });
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-25T00:00:00Z' }) }), soloFrom)).toBe(true);
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-01T00:00:00Z' }) }), soloFrom)).toBe(false);

    const soloTo = filterState({ to: '2026-07-25' });
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-01T00:00:00Z' }) }), soloTo)).toBe(true);
    expect(atcMatchesFilters(atc({ latest_run: run({ started_at: '2026-07-30T00:00:00Z' }) }), soloTo)).toBe(false);
  });

  test('Scenario 2.4 — AND across result + module + date: must match ALL three', () => {
    const state = filterState({ results: ['fail'], moduleId: 'mod-1', from: '2026-07-20', to: '2026-07-25' });
    const matching = atc({ module: { id: 'mod-1', name: 'One' }, latest_run: run({ state: 'failed', started_at: '2026-07-21T00:00:00Z' }) });
    expect(atcMatchesFilters(matching, state)).toBe(true);

    const wrongModule = atc({ module: { id: 'mod-2', name: 'Two' }, latest_run: run({ state: 'failed', started_at: '2026-07-21T00:00:00Z' }) });
    expect(atcMatchesFilters(wrongModule, state)).toBe(false);

    const wrongResult = atc({ module: { id: 'mod-1', name: 'One' }, latest_run: run({ state: 'passed', started_at: '2026-07-21T00:00:00Z' }) });
    expect(atcMatchesFilters(wrongResult, state)).toBe(false);

    const outsideDate = atc({ module: { id: 'mod-1', name: 'One' }, latest_run: run({ state: 'failed', started_at: '2026-08-01T00:00:00Z' }) });
    expect(atcMatchesFilters(outsideDate, state)).toBe(false);
  });

  test('Scenario 2.5 — an inverted date range is IGNORED; other filters keep working', () => {
    const state = filterState({ results: ['fail'], from: '2026-07-25', to: '2026-07-20' });
    // A row from ANY date still matches as long as it's a fail — the invalid
    // range contributes nothing.
    const failRow = atc({ latest_run: run({ state: 'failed', started_at: '2026-01-01T00:00:00Z' }) });
    expect(atcMatchesFilters(failRow, state)).toBe(true);
    const passRow = atc({ latest_run: run({ state: 'passed', started_at: '2026-01-01T00:00:00Z' }) });
    expect(atcMatchesFilters(passRow, state)).toBe(false);
  });
});

describe('DATE_RANGE_ERROR_MESSAGE (AC2.5, ratified verbatim)', () => {
  test('ships the exact copy', () => {
    expect(DATE_RANGE_ERROR_MESSAGE).toBe('From date is after to date. Date filter ignored until fixed.');
  });
});

describe('distinctModules (AC2.1/2.2)', () => {
  test('dedupes by id across ACs, sorted by name — archived modules are excluded for free (they never reach the payload)', () => {
    const p = payload([
      criterion({ id: 'ac-1', atcs: [atc({ id: 'a1', module: { id: 'mod-2', name: 'Zeta' } })] }),
      criterion({ id: 'ac-2', atcs: [
        atc({ id: 'a2', module: { id: 'mod-1', name: 'Alpha' } }),
        atc({ id: 'a3', module: { id: 'mod-2', name: 'Zeta' } }),
      ] }),
    ]);
    expect(distinctModules(p)).toEqual([
      { id: 'mod-1', name: 'Alpha' },
      { id: 'mod-2', name: 'Zeta' },
    ]);
  });

  test('an all-uncovered story has no modules to offer', () => {
    expect(distinctModules(payload([criterion({ atcs: [] })]))).toEqual([]);
  });
});

describe('filterCriteria / isAcCardHidden / acNoteLabel (AC1.1/AC2.6)', () => {
  test('Scenario 2.6 — an AC with 2 rows (one pass, one fail), filtered by "fail": 1 of 2 shown, card stays visible', () => {
    const p = payload([criterion({
      id: 'ac-1',
      atcs: [
        atc({ id: 'a-pass', latest_run: run({ state: 'passed' }) }),
        atc({ id: 'a-fail', latest_run: run({ state: 'failed' }) }),
      ],
    })]);
    const state = filterState({ results: ['fail'] });
    const [filtered] = filterCriteria(p, state);
    expect(filtered.shownCount).toBe(1);
    expect(filtered.totalCount).toBe(2);
    expect(filtered.visibleAtcIds.has('a-fail')).toBe(true);
    expect(filtered.visibleAtcIds.has('a-pass')).toBe(false);
    expect(isAcCardHidden(filtered, true)).toBe(false);
    expect(acNoteLabel(filtered, true)).toBe('1 of 2 shown ·');
  });

  test('Scenario 1.1 — an AC whose every row is filtered out is hidden while filtering is active', () => {
    const p = payload([criterion({ id: 'ac-1', atcs: [atc({ id: 'a-pass', latest_run: run({ state: 'passed' }) })] })]);
    const [filtered] = filterCriteria(p, filterState({ results: ['fail'] }));
    expect(filtered.shownCount).toBe(0);
    expect(isAcCardHidden(filtered, true)).toBe(true);
    // ...but the SAME zero-shown AC is never hidden while no filter is active.
    expect(isAcCardHidden(filtered, false)).toBe(false);
  });

  test('a naturally-uncovered AC (0 ATCs) is NEVER hidden by filtering — a coverage gap must stay visible regardless of the active filter (review correction, matches the mockup and BK-45\'s baseline)', () => {
    const p = payload([criterion({ id: 'ac-uncovered', atcs: [] })]);
    const [filtered] = filterCriteria(p, filterState({ results: ['fail'] }));
    expect(filtered.totalCount).toBe(0);
    expect(isAcCardHidden(filtered, true)).toBe(false);
    expect(isAcCardHidden(filtered, false)).toBe(false);
  });

  test('acNoteLabel is empty when not filtering', () => {
    const p = payload([criterion({ id: 'ac-1', atcs: [atc({ id: 'a-1' })] })]);
    const [filtered] = filterCriteria(p, EMPTY_FILTER_STATE);
    expect(acNoteLabel(filtered, false)).toBe('');
  });
});

describe('filterTotals / isFilteredEmpty / filteredEmptyBody (AC3.1)', () => {
  test('Scenario 3.1 — chain rows exist, filter combination matches none -> filtered-empty', () => {
    const p = payload([criterion({ id: 'ac-1', atcs: [atc({ id: 'a-pass', latest_run: run({ state: 'passed' }) })] })]);
    const filtered = filterCriteria(p, filterState({ results: ['fail'] }));
    const totals = filterTotals(filtered);
    expect(totals).toEqual({ totalRows: 1, visibleRows: 0 });
    expect(isFilteredEmpty(totals, true)).toBe(true);
  });

  test('zero-coverage (totalRows 0) is never "filtered empty" — that is a data gap, not a filter result', () => {
    const totals = { totalRows: 0, visibleRows: 0 };
    expect(isFilteredEmpty(totals, true)).toBe(false);
  });

  test('not filtering -> never filtered-empty even with zero visible rows', () => {
    expect(isFilteredEmpty({ totalRows: 3, visibleRows: 0 }, false)).toBe(false);
  });

  test('filteredEmptyBody composes the count + story title (mirrors the mockup fe-count/fe-story sentence)', () => {
    expect(filteredEmptyBody(4, 'Password reset flow')).toBe(
      '4 chain entries exist for Password reset flow, and the active filters match none of them. '
      + 'The data is still there: this is a filter result, not a coverage gap.',
    );
    expect(filteredEmptyBody(1, 'One-row story')).toContain('1 chain entry exists for');
  });

  test('FILTERED_EMPTY_TITLE matches AC3.1\'s exact panel title', () => {
    expect(FILTERED_EMPTY_TITLE).toBe('Filters excluded everything');
  });
});

describe('rowCountLabel (AC4.1/AC4.4)', () => {
  test('no chain rows at all -> empty string', () => {
    expect(rowCountLabel({ totalRows: 0, visibleRows: 0 }, false)).toBe('');
  });

  test('not filtering -> "N chain entries"', () => {
    expect(rowCountLabel({ totalRows: 5, visibleRows: 5 }, false)).toBe('5 chain entries');
  });

  test('filtering -> "N of M chain entries shown"', () => {
    expect(rowCountLabel({ totalRows: 20, visibleRows: 5 }, true)).toBe('5 of 20 chain entries shown');
  });
});

describe('activeFilterChips (AC4.1)', () => {
  const modules = [{ id: 'mod-1', name: 'Authentication' }];

  test('one chip per active axis, in result/module/from/to order', () => {
    const state = filterState({ results: ['fail', 'blocked'], moduleId: 'mod-1', from: '2026-07-20', to: '2026-07-25' });
    expect(activeFilterChips(state, modules)).toEqual([
      { key: 'result', label: 'Result: Fail, Blocked' },
      { key: 'module', label: 'Module: Authentication' },
      { key: 'from', label: 'From 2026-07-20' },
      { key: 'to', label: 'To 2026-07-25' },
    ]);
  });

  test('an invalid (inverted) date range contributes no From/To chip', () => {
    const state = filterState({ from: '2026-07-25', to: '2026-07-20' });
    expect(activeFilterChips(state, modules)).toEqual([]);
  });

  test('no active filters -> no chips', () => {
    expect(activeFilterChips(EMPTY_FILTER_STATE, modules)).toEqual([]);
  });
});

describe('resolveKnownModuleId (AC5.4 — module URL param validated against the real chain)', () => {
  const modules = [{ id: 'mod-1', name: 'Authentication' }, { id: 'mod-2', name: 'Checkout' }];

  test('a module id present in the chain resolves through unchanged', () => {
    expect(resolveKnownModuleId('mod-1', modules)).toBe('mod-1');
  });

  test('a stale/unknown module id (e.g. a shared link to a since-archived module) drops to null, not a false zero-match', () => {
    expect(resolveKnownModuleId('mod-does-not-exist', modules)).toBeNull();
  });

  test('null passes through as null', () => {
    expect(resolveKnownModuleId(null, modules)).toBeNull();
  });

  test('an empty module set (e.g. payload still loading) rejects every id', () => {
    expect(resolveKnownModuleId('mod-1', [])).toBeNull();
  });
});

describe('URL query params <-> filter state (AC5)', () => {
  test('Scenario 5.1 — a fully-specified state round-trips through the URL', () => {
    const state = filterState({ results: ['fail'], moduleId: 'mod-1', from: '2026-07-20', to: '2026-07-25' });
    const params = filterStateToParams(state);
    expect(params.toString()).toBe('result=fail&module=mod-1&from=2026-07-20&to=2026-07-25');
    expect(parseFilterStateFromParams(params)).toEqual(state);
  });

  test('Scenario 1.2\'s multi-value result state also round-trips', () => {
    const state = filterState({ results: ['fail', 'blocked'] });
    expect(parseFilterStateFromParams(filterStateToParams(state))).toEqual(state);
  });

  test('Scenario 5.4 — an invalid result value is silently dropped, not applied', () => {
    const parsed = parseFilterStateFromParams(new URLSearchParams('result=invalid_value'));
    expect(parsed.results).toEqual([]);
  });

  test('Scenario 5.4 — a malformed date is silently dropped', () => {
    const parsed = parseFilterStateFromParams(new URLSearchParams('from=not-a-date&to=2026-13-45'));
    expect(parsed.from).toBeNull();
    expect(parsed.to).toBeNull();
  });

  test('Scenario 5.5 — partial params leave the other axes at default', () => {
    expect(parseFilterStateFromParams(new URLSearchParams('result=fail'))).toEqual(filterState({ results: ['fail'] }));
    expect(parseFilterStateFromParams(new URLSearchParams('module=mod-1'))).toEqual(filterState({ moduleId: 'mod-1' }));
    expect(parseFilterStateFromParams(new URLSearchParams('from=2026-07-20'))).toEqual(filterState({ from: '2026-07-20' }));
    expect(parseFilterStateFromParams(new URLSearchParams('to=2026-07-25'))).toEqual(filterState({ to: '2026-07-25' }));
  });

  test('no params at all -> the empty state', () => {
    expect(parseFilterStateFromParams(new URLSearchParams(''))).toEqual(EMPTY_FILTER_STATE);
  });

  test('an empty state serializes to an empty query string (Clear-all -> clean URL, AC4.2)', () => {
    expect(filterStateToParams(EMPTY_FILTER_STATE).toString()).toBe('');
  });

  test('RESULT_FILTER_VALUES matches AC1.3\'s mandated six-value set, in order', () => {
    expect(RESULT_FILTER_VALUES).toEqual(['pass', 'fail', 'blocked', 'skipped', 'aborted', 'running']);
  });
});

describe('mergeFilterParamsIntoUrl (BK-717 — a filter change must not drop unrelated URL params)', () => {
  test('reproduces the reported defect: `story` survives a Fail-filter click instead of vanishing', () => {
    // Repro as filed: land on `?story=<id>`, press "Fail". Before the fix,
    // `syncFilterUrl` rebuilt the URL from `filterStateToParams(next)`
    // alone — which has no notion of `story` — so the deep-link id was
    // silently dropped and a reload fell back to "Select a user story".
    const current = new URLSearchParams('story=us-42');
    const merged = mergeFilterParamsIntoUrl(current, filterState({ results: ['fail'] }));
    expect(merged.toString()).toBe('story=us-42&result=fail');
  });

  test('preserves `story` whichever position it was in, alongside every filter axis', () => {
    const current = new URLSearchParams('story=us-1');
    const state = filterState({ results: ['fail'], moduleId: 'mod-1', from: '2026-07-20', to: '2026-07-25' });
    const merged = mergeFilterParamsIntoUrl(current, state);
    expect(merged.get('story')).toBe('us-1');
    expect(merged.toString()).toBe('story=us-1&result=fail&module=mod-1&from=2026-07-20&to=2026-07-25');
  });

  test('replaces a stale filter value rather than appending a duplicate', () => {
    const current = new URLSearchParams('story=us-1&result=pass');
    const merged = mergeFilterParamsIntoUrl(current, filterState({ results: ['fail'] }));
    expect(merged.getAll('result')).toEqual(['fail']);
  });

  test('Clear-all (EMPTY_FILTER_STATE) drops every filter key but keeps `story`', () => {
    const current = new URLSearchParams('story=us-1&result=fail&module=mod-1');
    const merged = mergeFilterParamsIntoUrl(current, EMPTY_FILTER_STATE);
    expect(merged.toString()).toBe('story=us-1');
  });
});
