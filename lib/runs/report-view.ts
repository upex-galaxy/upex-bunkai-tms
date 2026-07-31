// BK-38 — Project Run Report view-state logic: framework-agnostic, pure
// functions only. All I/O stays in `runs/page.tsx` (server) and
// `ProjectRunsReportView` (client); this file is what makes the branch
// selection, the empty-state copy, and the filter-summary text unit-testable
// without a browser or a live DB. Mirrors `lib/runs/history-view.ts`'s
// `resolveRunHistoryViewState` pattern (BK-37, the same pattern one story
// earlier), but branches on FOUR independent filter axes instead of BK-37's
// single `outcome !== null` check — see `hasActiveReportFilters` below.

export type ReportViewState = 'error' | 'empty-no-runs' | 'empty-no-match' | 'rows';

interface ResolveReportViewStateParams {
  // FIRST-PAGE failure only. A failed "load older" is NOT an input here, same
  // split as `resolveRunHistoryViewState`: it must leave the rows mounted and
  // report inline at the load-older control, so the caller keeps it in its
  // own state and never routes it through this resolver.
  error: boolean
  rowCount: number
  // True when ANY of date/module/status/executor is set. Unlike BK-37 (a
  // single `outcome` value), BK-38 has four independent filter axes, so the
  // "is a filter active at all" question needs its own boolean rather than a
  // single nullable value.
  hasActiveFilters: boolean
}

// Branch selection for the four mutually exclusive blocks. A first-page error
// wins over everything (a failed first query also resolves to zero rows, and
// rendering "no runs" on a broken request would be a lie). With rows, the
// filters are irrelevant. Without rows, ACTIVE FILTERS are what separates
// ATC-06 ("no runs yet for this Project") from ATC-03 ("no match for the
// current filter combination").
export function resolveReportViewState({ error, rowCount, hasActiveFilters }: ResolveReportViewStateParams): ReportViewState {
  if (error) {
    return 'error';
  }
  if (rowCount > 0) {
    return 'rows';
  }
  return hasActiveFilters ? 'empty-no-match' : 'empty-no-runs';
}

// The filter shape both the empty-state resolver and the summary helpers
// below read from. `status`/`executor` are arrays (multi-select, unlike
// BK-37's single-select `outcome`) — a non-empty array counts as "this axis
// is active" the same way a non-null date or module id does.
export interface ReportFilterState {
  dateFrom: string | null
  dateTo: string | null
  moduleId: string | null
  status: readonly string[]
  executor: readonly string[]
}

export const EMPTY_REPORT_FILTERS: ReportFilterState = {
  dateFrom: null,
  dateTo: null,
  moduleId: null,
  status: [],
  executor: [],
};

// The four INDEPENDENT axes named in the implementation plan's UI-1 task: the
// whole date range counts as ONE axis (either bound being set means "the date
// axis is active"), not two. This is the boolean `resolveReportViewState`
// consumes — see `activeReportFilterCount` below for the mockup's own
// five-chip tally, which is a DIFFERENT count used only for display copy.
export function hasActiveReportFilters(filters: ReportFilterState): boolean {
  return (
    filters.dateFrom !== null
    || filters.dateTo !== null
    || filters.moduleId !== null
    || filters.status.length > 0
    || filters.executor.length > 0
  );
}

// Mirrors the mockup's own `active` counter verbatim (test-runs-index.html's
// `render()`): `date_from` and `date_to` count as two INDEPENDENT chips, so a
// caller with both bounds set sees "2 filters active" for the date range
// alone. Feeds the table-foot copy ("runs 1-N * N filters active"), not the
// view-state branch above.
export function activeReportFilterCount(filters: ReportFilterState): number {
  return (
    (filters.dateFrom !== null ? 1 : 0)
    + (filters.dateTo !== null ? 1 : 0)
    + (filters.moduleId !== null ? 1 : 0)
    + (filters.status.length > 0 ? 1 : 0)
    + (filters.executor.length > 0 ? 1 : 0)
  );
}

// The table-foot line (mirrors the mockup's `#table-foot` / BK-37's `footText`
// convention): "runs 1-N * N filters active" when at least one axis is set,
// "runs 1-N * sorted by last activity" otherwise.
export function reportTableFootText(rowCount: number, filters: ReportFilterState): string {
  const activeCount = activeReportFilterCount(filters);
  const suffix = activeCount > 0
    ? `${activeCount} filter${activeCount > 1 ? 's' : ''} active`
    : 'sorted by last activity ↓';
  return `runs 1–${rowCount} · ${suffix}`;
}

// Two PO-contracted, DISTINCT empty states (Key Contract Decision's "No Runs
// and no matching filters use distinct empty states"). Both title strings are
// the mockup's own `.state-empty .t` text verbatim (`test-runs-index.html`).
// The no-match description is the mockup's generic, non-interpolated variant
// (`#live-empty .d`) — the one bound to the live/interactive state, not the
// states-strip's illustrative "Nothing in MOD-021..." variant, which requires
// per-filter interpolation the component does not attempt. The no-runs
// description has no literal string anywhere in the mockup or the story (the
// mockup's states strip never draws this state) — authored here, once, so the
// component and its tests share a single source, the same way
// `RUN_HISTORY_EMPTY_NEVER_RUN` is BK-37's single source for its own copy.
export const REPORT_EMPTY_NO_RUNS_TITLE = 'No runs yet for this Project';
export const REPORT_EMPTY_NO_RUNS_DESCRIPTION
  = 'This Project has no recorded runs yet. Once the first run starts, it will appear here.';

export const REPORT_EMPTY_NO_MATCH_TITLE = 'No runs match these filters';
export const REPORT_EMPTY_NO_MATCH_DESCRIPTION
  = 'The combination you applied matches nothing in this project. Totals above show zero — that is a valid result, not an error.';

export interface ReportEmptyStateCopy {
  title: string
  description: string
}

// One lookup so the component and its tests never risk the two states
// silently converging on the same sentence (mirrors BK-37's
// `runHistoryNoMatchMessage`, minus the outcome interpolation this feature
// doesn't need).
export function resolveReportEmptyStateCopy(state: 'empty-no-runs' | 'empty-no-match'): ReportEmptyStateCopy {
  return state === 'empty-no-runs'
    ? { title: REPORT_EMPTY_NO_RUNS_TITLE, description: REPORT_EMPTY_NO_RUNS_DESCRIPTION }
    : { title: REPORT_EMPTY_NO_MATCH_TITLE, description: REPORT_EMPTY_NO_MATCH_DESCRIPTION };
}

// The totals-strip scope line. The mockup's own version reads "N of M runs in
// current scope", where M is the SIZE OF ITS STATIC DEMO DATASET (15 rows) --
// a number the real API never returns: `GET .../runs/report` responds with
// `{ items, totals: { passed, failed }, next_cursor }` and no total-row-count
// field (confirmed against the committed route + RPC, not assumed). Rendering
// a fabricated "of M" would mean inventing a number the server never sent, so
// this adapts the same INFORMATION the mockup's line carries (how much of the
// current scope is on screen) using only what is actually known: how many
// rows are loaded, and whether the keyset cursor says more exist.
export function reportScopeLabel(loadedCount: number, hasMore: boolean): string {
  const noun = loadedCount === 1 ? 'run' : 'runs';
  return hasMore
    ? `${loadedCount} ${noun} loaded in current scope · more available`
    : `${loadedCount} ${noun} in current scope`;
}
