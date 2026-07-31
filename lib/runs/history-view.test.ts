import { RUN_HISTORY_OUTCOMES } from '@lib/runs/history-validation';
import {
  capitalizeOutcome,
  resolveRunHistoryViewState,
  RUN_HISTORY_EMPTY_NEVER_RUN,
  runHistoryNoMatchMessage,
} from '@lib/runs/history-view';
import { describe, expect, test } from 'bun:test';

// BK-37 — Run History view-state branch selection + the two empty-state strings
// (AC "A Test that has never been run", AC "Filter matches zero runs").

describe('resolveRunHistoryViewState', () => {
  test('an error takes priority, even with rows already on screen', () => {
    expect(resolveRunHistoryViewState({ error: true, rowCount: 12, outcome: null })).toBe('error');
    expect(resolveRunHistoryViewState({ error: true, rowCount: 0, outcome: 'failed' })).toBe('error');
  });

  test('rows present, no filter -> rows', () => {
    expect(resolveRunHistoryViewState({ error: false, rowCount: 5, outcome: null })).toBe('rows');
  });

  test('rows present with a filter -> rows (the filter is irrelevant once matched)', () => {
    expect(resolveRunHistoryViewState({ error: false, rowCount: 2, outcome: 'failed' })).toBe('rows');
  });

  test('zero rows, no filter -> the never-run empty state', () => {
    expect(resolveRunHistoryViewState({ error: false, rowCount: 0, outcome: null })).toBe('empty-never-run');
  });

  test('zero rows WITH a filter -> the no-match state, not the never-run one', () => {
    expect(resolveRunHistoryViewState({ error: false, rowCount: 0, outcome: 'aborted' })).toBe('empty-no-match');
  });

  test('every outcome resolves the same way at zero rows', () => {
    for (const outcome of RUN_HISTORY_OUTCOMES) {
      expect(resolveRunHistoryViewState({ error: false, rowCount: 0, outcome })).toBe('empty-no-match');
    }
  });
});

describe('capitalizeOutcome', () => {
  test('capitalizes each wire outcome', () => {
    expect(capitalizeOutcome('passed')).toBe('Passed');
    expect(capitalizeOutcome('failed')).toBe('Failed');
    expect(capitalizeOutcome('aborted')).toBe('Aborted');
  });
});

describe('empty-state copy', () => {
  test('never-run copy is the AC string verbatim', () => {
    expect(RUN_HISTORY_EMPTY_NEVER_RUN).toBe('No runs yet for this Test');
  });

  test('0-match copy is the PO contract string, with the outcome capitalized', () => {
    expect(runHistoryNoMatchMessage('aborted')).toBe('No Aborted runs found for this Test');
    expect(runHistoryNoMatchMessage('passed')).toBe('No Passed runs found for this Test');
    expect(runHistoryNoMatchMessage('failed')).toBe('No Failed runs found for this Test');
  });

  test('the two empty states never render the same sentence', () => {
    for (const outcome of RUN_HISTORY_OUTCOMES) {
      expect(runHistoryNoMatchMessage(outcome)).not.toBe(RUN_HISTORY_EMPTY_NEVER_RUN);
    }
  });
});
