import { EMPTY_FILTER_STATE, filterStateToParams, parseFilterStateFromParams } from '@lib/traceability/chain-view';
import { describe, expect, test } from 'bun:test';
import { resolveRestore } from './restore';
import { mergeStateIntoParams, stateFromParams } from './state';

// BK-443 — the mapping each host surface performs, exercised with the SAME
// functions the components call, so a surface cannot drift from the codec
// without a failing test. (The components themselves have no DOM harness.)

const MODULE_ID = '3f2b8c1e-9d4a-4b7e-8a61-2c5d9e0f7a13';

// What TraceabilityChainView does to build `currentState` and to apply a view.
function traceabilityCurrentState(filterState: ReturnType<typeof parseFilterStateFromParams>) {
  return stateFromParams('traceability', filterStateToParams(filterState));
}
function traceabilityApply(saved: Record<string, string>) {
  return parseFilterStateFromParams(mergeStateIntoParams('traceability', new URLSearchParams(), saved));
}

describe('Traceability host', () => {
  test('a saved view restores exactly the filter state it was saved from', () => {
    const filterState = { results: ['fail' as const, 'blocked' as const], moduleId: MODULE_ID, from: '2026-09-01', to: '2026-09-30' };
    const saved = traceabilityCurrentState(filterState);
    expect(traceabilityApply(saved)).toEqual(filterState);
  });

  test('no filters applied means an empty state to save (nothing to save)', () => {
    expect(traceabilityCurrentState(EMPTY_FILTER_STATE)).toEqual({});
  });

  test('opening a view clears the axes it does not hold (replace, not merge)', () => {
    expect(traceabilityApply({ result: 'fail' })).toEqual({ results: ['fail'], moduleId: null, from: null, to: null });
  });

  test('an archived module is dropped and the other filters still apply', () => {
    const saved = traceabilityCurrentState({ results: ['fail'], moduleId: MODULE_ID, from: null, to: null });
    const restored = resolveRestore('traceability', saved, { moduleIds: new Set() });
    expect(restored.dropped.map(d => d.key)).toEqual(['module']);
    expect(traceabilityApply(restored.state)).toEqual({ results: ['fail'], moduleId: null, from: null, to: null });
  });

  test('the address after opening a view carries exactly the saved filters and keeps ?story=', () => {
    const merged = mergeStateIntoParams('traceability', new URLSearchParams('story=abc&result=pass'), { result: 'fail' });
    expect(merged.get('story')).toBe('abc');
    expect(merged.get('result')).toBe('fail');
  });
});

describe('Run history host', () => {
  // `RunHistoryView.applySavedState` keeps an outcome only if it is one of the
  // three it offers; anything else clears the filter.
  const OUTCOMES = ['passed', 'failed', 'aborted'];
  const outcomeOf = (saved: Record<string, string>) => OUTCOMES.find(o => o === saved.outcome) ?? null;

  test('a saved outcome is applied', () => {
    expect(outcomeOf(resolveRestore('run_history', { outcome: 'failed' }).state)).toBe('failed');
  });

  test('an outcome the product no longer offers degrades to no filter and is reported', () => {
    const restored = resolveRestore('run_history', { outcome: 'retired' });
    expect(outcomeOf(restored.state)).toBeNull();
    expect(restored.allDropped).toBe(true);
  });
});
