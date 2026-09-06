import type { AtcClassifiedRow, AtcListFilters } from '@lib/atcs/list-filters';
import {
  ATC_FILTER_UNSPECIFIED,
  ATC_UNSPECIFIED_LABEL,
  atcListFiltersActive,
  EMPTY_ATC_LIST_FILTERS,
  matchesAtcListFilters,
  resolveAtcListViewState,
} from '@lib/atcs/list-filters';
import { describe, expect, it } from 'bun:test';

// BK-399 — the project-workbench ATC filter rulebook. Pure, DOM-free, so the
// semantics AC-04 / AC-05 / AC-06 / AC-09 and edge cases E5 / E6 assert on are
// pinned here and the live-UI pass only has to prove the wiring.

function row(partial: Partial<AtcClassifiedRow>): AtcClassifiedRow {
  return { layer: 'UI', technique: null, priority: null, ...partial };
}

function filters(patch: Partial<AtcListFilters>): AtcListFilters {
  return { ...EMPTY_ATC_LIST_FILTERS, ...patch };
}

describe('aTC list filter copy', () => {
  it('spells the unset state exactly as the product ruling fixes it', () => {
    // Verbatim, everywhere. `—` and `None` are vocabulary drift the
    // anti-glossary exists to prevent.
    expect(ATC_UNSPECIFIED_LABEL).toBe('Not specified');
  });

  it('keeps the unspecified sentinel distinct from the no-filter value', () => {
    // `''` is `All …`; if these ever collide, "show me the unclassified ones"
    // silently becomes "show me everything".
    expect(ATC_FILTER_UNSPECIFIED).not.toBe('');
  });
});

describe('matchesAtcListFilters', () => {
  it('matches every row when no facet is set', () => {
    expect(matchesAtcListFilters(row({ technique: 'Pairwise' }), EMPTY_ATC_LIST_FILTERS)).toBe(true);
    expect(matchesAtcListFilters(row({}), EMPTY_ATC_LIST_FILTERS)).toBe(true);
  });

  // AC-04 — filtering by a technique shows exactly the rows carrying it, and
  // excludes both the other techniques AND the unclassified rows.
  it('narrows to one technique and excludes unclassified rows', () => {
    const f = filters({ technique: 'Pairwise' });
    expect(matchesAtcListFilters(row({ technique: 'Pairwise' }), f)).toBe(true);
    expect(matchesAtcListFilters(row({ technique: 'Decision Table' }), f)).toBe(false);
    expect(matchesAtcListFilters(row({ technique: null }), f)).toBe(false);
  });

  // AC-05 — same contract on priority.
  it('narrows to one priority and excludes unclassified rows', () => {
    const f = filters({ priority: 'Critical' });
    expect(matchesAtcListFilters(row({ priority: 'Critical' }), f)).toBe(true);
    expect(matchesAtcListFilters(row({ priority: 'Low' }), f)).toBe(false);
    expect(matchesAtcListFilters(row({ priority: null }), f)).toBe(false);
  });

  // Q3b — `Not specified` is a real, selectable filter value, matched against
  // SQL NULL client-side. This is the coverage-gap query the story exists for.
  it('matches only NULL rows when the unspecified sentinel is selected', () => {
    const f = filters({ technique: ATC_FILTER_UNSPECIFIED });
    expect(matchesAtcListFilters(row({ technique: null }), f)).toBe(true);
    expect(matchesAtcListFilters(row({ technique: 'Pairwise' }), f)).toBe(false);
    // NULL, and nothing else falsy. The implementation says `value === null`,
    // which is right — but the PROPERTY was unguarded: refactoring the branch to
    // `!value` passed every other case in this file while quietly making `''`
    // "not specified". An empty string is not the unset state; it is an
    // out-of-set value the CHECK constraint would reject on the way in, and a
    // row carrying one must not be dressed up as unclassified in the list.
    expect(matchesAtcListFilters(row({ technique: '' as never }), f)).toBe(false);
  });

  it('matches unspecified priority the same way', () => {
    const f = filters({ priority: ATC_FILTER_UNSPECIFIED });
    expect(matchesAtcListFilters(row({ priority: null }), f)).toBe(true);
    expect(matchesAtcListFilters(row({ priority: 'High' }), f)).toBe(false);
    expect(matchesAtcListFilters(row({ priority: '' as never }), f)).toBe(false);
  });

  // Q9 / E1 — the stored value IS the display label, case-sensitive. A facet
  // must never match a case variant, or the UI would disagree with the API.
  it('is case-sensitive on the enum value', () => {
    const f = filters({ technique: 'Pairwise' as never });
    expect(matchesAtcListFilters(row({ technique: 'pairwise' as never }), f)).toBe(false);
  });

  // AC-09 — technique AND layer.
  it('intersects technique with layer', () => {
    const f = filters({ technique: 'Decision Table', layer: 'API' });
    expect(matchesAtcListFilters(row({ layer: 'API', technique: 'Decision Table' }), f)).toBe(true);
    expect(matchesAtcListFilters(row({ layer: 'UI', technique: 'Decision Table' }), f)).toBe(false);
    expect(matchesAtcListFilters(row({ layer: 'API', technique: 'Pairwise' }), f)).toBe(false);
    expect(matchesAtcListFilters(row({ layer: 'API', technique: null }), f)).toBe(false);
  });

  // E6 — the triple AND. Every facet narrows; none of them widens.
  it('intersects all three facets', () => {
    const f = filters({ layer: 'API', technique: 'Decision Table', priority: 'High' });
    const hit = row({ layer: 'API', technique: 'Decision Table', priority: 'High' });
    expect(matchesAtcListFilters(hit, f)).toBe(true);
    expect(matchesAtcListFilters({ ...hit, priority: 'Critical' }, f)).toBe(false);
    expect(matchesAtcListFilters({ ...hit, layer: 'Unit' }, f)).toBe(false);
    expect(matchesAtcListFilters({ ...hit, technique: 'Pairwise' }, f)).toBe(false);
  });

  it('combines the unspecified sentinel with another facet', () => {
    const f = filters({ layer: 'API', technique: ATC_FILTER_UNSPECIFIED });
    expect(matchesAtcListFilters(row({ layer: 'API', technique: null }), f)).toBe(true);
    expect(matchesAtcListFilters(row({ layer: 'UI', technique: null }), f)).toBe(false);
  });
});

describe('atcListFiltersActive', () => {
  it('is false only when every facet is off', () => {
    expect(atcListFiltersActive(EMPTY_ATC_LIST_FILTERS)).toBe(false);
    expect(atcListFiltersActive(filters({ technique: 'Pairwise' }))).toBe(true);
    expect(atcListFiltersActive(filters({ priority: 'Low' }))).toBe(true);
    expect(atcListFiltersActive(filters({ layer: 'Unit' }))).toBe(true);
    // Selecting "show me the unclassified ones" IS a filter — the reset control
    // and the no-match state both depend on this being true.
    expect(atcListFiltersActive(filters({ technique: ATC_FILTER_UNSPECIFIED }))).toBe(true);
  });
});

describe('resolveAtcListViewState', () => {
  it('renders rows whenever anything survives the predicate', () => {
    expect(resolveAtcListViewState({ totalCount: 6, visibleCount: 2, filtersActive: true })).toBe('rows');
    expect(resolveAtcListViewState({ totalCount: 6, visibleCount: 6, filtersActive: false })).toBe('rows');
  });

  // AC-06 — a filter that matches nothing reads as empty, not broken, and NOT
  // as the never-had-any block.
  it('separates the filtered-empty state from the never-had-any state', () => {
    expect(resolveAtcListViewState({ totalCount: 6, visibleCount: 0, filtersActive: true })).toBe('empty-no-match');
    expect(resolveAtcListViewState({ totalCount: 0, visibleCount: 0, filtersActive: false })).toBe('empty-never');
  });

  // E5 — every ATC unclassified, filtered by a technique: still the
  // filtered-empty state, because the project DOES have ATCs.
  it('keeps the filtered-empty state when every row is unclassified', () => {
    expect(resolveAtcListViewState({ totalCount: 4, visibleCount: 0, filtersActive: true })).toBe('empty-no-match');
  });

  // A brand-new project with a stray facet left on must not be told to "clear
  // the filters to see everything again" — there is nothing to see.
  it('shows the never-had-any state for an empty project even with a facet on', () => {
    expect(resolveAtcListViewState({ totalCount: 0, visibleCount: 0, filtersActive: true })).toBe('empty-never');
  });
});
