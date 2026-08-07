import type {
  StoryTraceabilityPayload,
  TraceabilityAtc,
  TraceabilityCriterion,
  TraceabilityLatestRun,
} from '@lib/traceability/chain-view';
import {
  CHAIN_PLACEHOLDER_COPY,
  defectCellPlaceholder,
  isAcUncovered,
  resolveAtcRowState,
  resolveStoryChainViewState,
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
