import type { AtcLayer, AtcPriority, AtcTechnique } from '@lib/types';

// BK-399 — the project-workbench ATC list filter rulebook, extracted from the
// view so the semantics (AND across facets, `Not specified` === SQL NULL, the
// two-empty-state split) are unit-testable without a DOM.
//
// The predicate runs CLIENT-SIDE over the rows the workbench already loaded —
// the AI Tech Lead's T3 ruling, ratified in master-design-plan §5 D41. That is
// what lets `Not specified` be a first-class filter value here while the API
// gains no null-sentinel query parameter: matching it is one `=== null` branch
// that never leaves the browser.

// Presentation copy for the unset state. Verbatim and identical everywhere
// (editor control, preview card, filter option) per the AI Product Owner
// ruling Q2 — never `—`, never `None`, never an empty cell.
export const ATC_UNSPECIFIED_LABEL = 'Not specified';

// The `<select>` value that stands for "match the rows whose field is NULL".
// It is an INTERNAL sentinel: it is never stored, never sent to the API, and
// never displayed. `''` cannot serve here because it already means "no filter"
// (the `All …` option).
export const ATC_FILTER_UNSPECIFIED = '__unspecified__';

// A facet selection: `null` = the facet is off (`All …`), the sentinel = match
// NULL, anything else = match that exact value byte-for-byte.
export type AtcFacetValue<T extends string> = T | typeof ATC_FILTER_UNSPECIFIED | null;

export interface AtcListFilters {
  technique: AtcFacetValue<AtcTechnique>
  priority: AtcFacetValue<AtcPriority>
  // Layer is `NOT NULL` in the schema, so it has no unspecified state — the
  // chip group is a plain single-select whose active chip clears on re-click.
  layer: AtcLayer | null
}

export const EMPTY_ATC_LIST_FILTERS: AtcListFilters = {
  technique: null,
  priority: null,
  layer: null,
};

// The classification-carrying shape the predicate needs. Deliberately narrower
// than `Atc` so the rulebook does not depend on the full row.
export interface AtcClassifiedRow {
  layer: AtcLayer
  technique: AtcTechnique | null
  priority: AtcPriority | null
}

function facetMatches<T extends string>(selected: AtcFacetValue<T>, value: T | null): boolean {
  if (selected === null) { return true; }
  if (selected === ATC_FILTER_UNSPECIFIED) { return value === null; }
  return value === selected;
}

// AND across the three facets (AC-09 / edge case E6's triple intersection).
// Each facet narrows; none of them widens.
export function matchesAtcListFilters(row: AtcClassifiedRow, filters: AtcListFilters): boolean {
  return facetMatches(filters.technique, row.technique)
    && facetMatches(filters.priority, row.priority)
    && (filters.layer === null || row.layer === filters.layer);
}

export function atcListFiltersActive(filters: AtcListFilters): boolean {
  return filters.technique !== null || filters.priority !== null || filters.layer !== null;
}

export type AtcListViewState = 'empty-never' | 'empty-no-match' | 'rows';

// Branch selection for the three mutually exclusive blocks, mirroring
// `resolveBugsListViewState` in BugsListView.tsx: with rows the filter state is
// irrelevant; without rows, whether ANY facet is active is what separates "this
// project has never had an ATC" from "this combination excludes everything"
// (AC-06). The row count is the FILTERED one — an unfiltered project with rows
// can never reach an empty state.
export function resolveAtcListViewState(params: {
  totalCount: number
  visibleCount: number
  filtersActive: boolean
}): AtcListViewState {
  if (params.visibleCount > 0) { return 'rows'; }
  return params.filtersActive && params.totalCount > 0 ? 'empty-no-match' : 'empty-never';
}
