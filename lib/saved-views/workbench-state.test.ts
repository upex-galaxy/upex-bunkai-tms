import type { WorkbenchFilters } from './workbench-state';
import { ATC_FILTER_UNSPECIFIED } from '@lib/atcs/list-filters';
import { describe, expect, test } from 'bun:test';
import { mergeStateIntoParams, stateFromParams } from './state';
import { EMPTY_WORKBENCH_FILTERS, workbenchFiltersFromState, workbenchStateFromFilters } from './workbench-state';

// BK-443 — the project workbench's filters as a saved-view state.

describe('workbenchStateFromFilters', () => {
  test('no filters is an empty state (nothing to save)', () => {
    expect(workbenchStateFromFilters(EMPTY_WORKBENCH_FILTERS)).toEqual({});
  });

  test('blank text counts as no filter', () => {
    expect(workbenchStateFromFilters({ ...EMPTY_WORKBENCH_FILTERS, atcQuery: '   ', tagInput: '' })).toEqual({});
  });

  test('writes the search text, the tag and the three facets', () => {
    const state = workbenchStateFromFilters({
      atcQuery: ' login ',
      tagInput: 'smoke',
      atcFilters: { technique: 'Pairwise', priority: 'High', layer: 'API' },
    });
    expect(state).toEqual({ atc_q: 'login', tag: 'smoke', technique: 'Pairwise', priority: 'High', layer: 'API' });
  });

  test('the "Not specified" sentinel is written as the plain word unspecified', () => {
    const state = workbenchStateFromFilters({
      ...EMPTY_WORKBENCH_FILTERS,
      atcFilters: { technique: ATC_FILTER_UNSPECIFIED, priority: ATC_FILTER_UNSPECIFIED, layer: null },
    });
    expect(state).toEqual({ technique: 'unspecified', priority: 'unspecified' });
  });
});

describe('workbenchFiltersFromState', () => {
  test('an empty state clears everything', () => {
    expect(workbenchFiltersFromState({})).toEqual(EMPTY_WORKBENCH_FILTERS);
  });

  test('maps unspecified back to the sentinel the ATC table understands', () => {
    expect(workbenchFiltersFromState({ technique: 'unspecified', priority: 'Low' }).atcFilters).toEqual({
      technique: ATC_FILTER_UNSPECIFIED,
      priority: 'Low',
      layer: null,
    });
  });

  test('round-trips every axis', () => {
    const filters: WorkbenchFilters = {
      atcQuery: 'login',
      tagInput: 'smoke',
      atcFilters: { technique: 'Decision Table', priority: ATC_FILTER_UNSPECIFIED, layer: 'UI' },
    };
    expect(workbenchFiltersFromState(workbenchStateFromFilters(filters))).toEqual(filters);
  });

  test('opening a view replaces rather than merges: axes the view lacks are cleared', () => {
    const next = workbenchFiltersFromState({ tag: 'regression' });
    expect(next).toEqual({ ...EMPTY_WORKBENCH_FILTERS, tagInput: 'regression' });
  });
});

describe('the workbench address', () => {
  test('keeps the Command Palette\'s ?module= untouched', () => {
    const merged = mergeStateIntoParams('workbench', new URLSearchParams('module=abc&layer=UI'), { tag: 'smoke' });
    expect(merged.get('module')).toBe('abc');
    expect(merged.has('layer')).toBe(false);
    expect(merged.get('tag')).toBe('smoke');
  });

  test('a hand-edited address with junk is read leniently', () => {
    expect(stateFromParams('workbench', new URLSearchParams('layer=Mobile&priority=High'))).toEqual({ priority: 'High' });
  });
});
