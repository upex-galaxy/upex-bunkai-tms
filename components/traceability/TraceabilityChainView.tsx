'use client';

import type {
  ActiveFilterChip,
  FilteredCriterion,
  StoryTraceabilityPayload,
  TraceabilityAtc,
  TraceabilityCriterion,
  TraceabilityFilterState,
  TraceabilityModule,
} from '@lib/traceability/chain-view';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import {
  acNoteLabel,
  activeFilterChips,
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
  parseFilterStateFromParams,
  resolveAtcRowState,
  resolveKnownModuleId,
  resolveStoryChainViewState,
  RESULT_FILTER_LABELS,
  RESULT_FILTER_VALUES,
  rowCountLabel,
  rowFilterDate,
  rowFilterStatus,
  runCellPlaceholder,
  runChipLabel,
  runChipTone,
  storyRollupCounts,
  testCellCopy,
  UNCOVERED_LABEL,
  UNCOVERED_WHY,
  ZERO_AC_BODY,
  ZERO_AC_TITLE,
  ZERO_COVERAGE_HEADING,
  zeroCoverageBody,
} from '@lib/traceability/chain-view';
import {
  buildSnapshotFilename,
  formatSnapshotTimestamp,
  renderTraceabilitySnapshotHtml,
} from '@lib/traceability/export-snapshot';
import { AlertTriangle, Clock, Download, FileText, Filter, SearchX, X } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// BK-45 — the US -> AC -> ATC -> Test -> Run -> Defect evidence chain view.
// Renders the mockup (`bk-44-metrics-coverage/traceability-chain.html`) with
// the LIVE design system's tokens and atoms (Critical Rule #14) —
// `.status-chip[data-status]`, `Card`, the skeleton/error grammar
// `ProjectRunsReportView`/`ProjectCoverageView` already established.
//
// Scope trim vs. the mockup (Critical Rule #15 — logged, not silent): omits
// the mockup's hardcoded 4-story segmented picker — no AC in this story
// describes browsing/switching stories from inside the view (every AC
// scenario begins "navigates to the traceability view for THAT user story"
// — arrival is via deep link). See the Stage 1 plan for the full rationale.
// Renders the 6 in-scope states: full chain, partial/mixed, zero-coverage
// banner, zero-AC, loading skeleton, error+retry — plus the archived-story
// banner (AC-06, PO-ratified, part of "full chain" rendering, not a
// separate top-level state), the Export snapshot button (BK-50 —
// client-initiated download of a self-contained HTML document, see
// `lib/traceability/export-snapshot.ts`), and the BK-48 filter bar
// (result/module/date-range + active-filter summary + zero-match panel,
// `FilterBar` below).

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

const FALLBACK_ERROR_MESSAGE = 'Could not load the evidence chain.';

// BK-50 — client-side file download, no server route involved: a Blob +
// object URL + a transient, never-mounted anchor (Tech Lead ruling's
// "equivalent client-side Blob + object URL" clause). The object URL is
// revoked synchronously after the click dispatch, so nothing lingers.
function triggerHtmlDownload(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function fetchChain(
  projectId: string,
  userStoryId: string,
  signal: AbortSignal,
): Promise<{ ok: true, payload: StoryTraceabilityPayload } | { ok: false, message: string }> {
  const response = await fetch(`/api/v1/projects/${projectId}/traceability?story=${userStoryId}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    // Server copy is rendered VERBATIM — never rephrased client-side.
    return { ok: false, message: body.error?.message ?? FALLBACK_ERROR_MESSAGE };
  }
  return { ok: true, payload: (await response.json()) as StoryTraceabilityPayload };
}

// BK-48 — the filter bar (AC1/AC2/AC4). Reuses the LIVE result-toggle /
// module-select pattern already shipped in `ProjectRunsReportView.tsx`
// (BK-38) — same `aria-pressed` group + `bg-surface-5` active state, same
// `<select>` styling — per Rule #14 (live UI is the fidelity source). The
// six-value dot uses the SAME `.dot[data-status]` tokens the run chips
// already use (`app/globals.css`), so no new color is introduced. Defined
// ABOVE `TraceabilityChainView` (not below, like the other sub-components)
// because it is a `forwardRef` `const`, which is not hoisted.
const FilterBar = forwardRef<HTMLDivElement, {
  state: TraceabilityFilterState
  modules: TraceabilityModule[]
  totals: { totalRows: number, visibleRows: number }
  filtering: boolean
  onToggleResult: (value: (typeof RESULT_FILTER_VALUES)[number]) => void
  onModuleChange: (value: string) => void
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  onClear: () => void
}>(({ state, modules, totals, filtering, onToggleResult, onModuleChange, onFromChange, onToChange, onClear }, ref) => {
  const dateInvalid = isDateRangeInverted(state.from, state.to);
  const chips: ActiveFilterChip[] = activeFilterChips(state, modules);
  const rowCount = rowCountLabel(totals, filtering);

  return (
    <Card ref={ref} data-testid="traceability-filter-bar">
      <div className="flex flex-wrap items-end gap-4 p-3">
        <div className="flex flex-col gap-1">
          <span id="traceability-filter-result-label" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">
            Result
          </span>
          <div
            role="group"
            tabIndex={-1}
            aria-labelledby="traceability-filter-result-label"
            data-testid="traceability-filter-result"
            className="inline-flex overflow-hidden rounded-2 border border-stroke-2 bg-surface-2"
            onKeyDown={(e) => {
              // AC1.5 — Escape exits the group. Focus moves to the group
              // CONTAINER (not a bare `.blur()`, which drops focus to
              // `<body>` and restarts Tab order from the top of the
              // document — an accessibility regression, review correction).
              // `tabIndex={-1}` makes the container programmatically
              // focusable without adding it to the normal Tab order, so the
              // next Tab press continues naturally past the group.
              if (e.key === 'Escape') { e.currentTarget.focus(); }
            }}
          >
            {RESULT_FILTER_VALUES.map(value => (
              <button
                key={value}
                type="button"
                data-testid={`traceability-filter-result-${value}`}
                aria-pressed={state.results.includes(value)}
                onClick={() => onToggleResult(value)}
                className={`inline-flex h-6.5 items-center gap-1.5 border-r border-stroke-1 px-2.5 text-xs font-medium tracking-[0.02em] transition-colors duration-token ease-token last:border-r-0 ${
                  state.results.includes(value)
                    ? 'bg-surface-5 text-fg-0'
                    : 'text-fg-2 hover:bg-surface-4 hover:text-fg-1'
                }`}
              >
                <span aria-hidden="true" className="dot" data-status={value} />
                {RESULT_FILTER_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="traceability-filter-module" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">
            Module
          </label>
          <select
            id="traceability-filter-module"
            data-testid="traceability-filter-module"
            value={state.moduleId ?? ''}
            onChange={e => onModuleChange(e.target.value)}
            className="flex h-8 w-[192px] rounded-2 border border-stroke-2 bg-surface-2 px-2.5 text-sm text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3 focus-visible:border-accent focus-visible:bg-surface-3 focus-visible:outline-none"
          >
            <option value="">All modules</option>
            {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span id="traceability-filter-dates-label" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">
            Latest run between
          </span>
          <div role="group" aria-labelledby="traceability-filter-dates-label" className="flex items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              aria-invalid={dateInvalid}
              data-testid="traceability-filter-from"
              value={state.from ?? ''}
              onChange={e => onFromChange(e.target.value)}
              className="flex h-8 w-[142px] rounded-2 border border-stroke-2 bg-surface-2 px-2.5 font-mono text-xs text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3 focus-visible:border-accent focus-visible:bg-surface-3 focus-visible:outline-none"
            />
            <span className="text-xs text-fg-4">to</span>
            <input
              type="date"
              aria-label="To date"
              aria-invalid={dateInvalid}
              data-testid="traceability-filter-to"
              value={state.to ?? ''}
              onChange={e => onToChange(e.target.value)}
              className="flex h-8 w-[142px] rounded-2 border border-stroke-2 bg-surface-2 px-2.5 font-mono text-xs text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3 focus-visible:border-accent focus-visible:bg-surface-3 focus-visible:outline-none"
            />
          </div>
          {dateInvalid && (
            <div data-testid="traceability-filter-date-error" role="alert" className="flex items-center gap-1.5 text-xs text-signal-fail">
              <AlertTriangle size={12} />
              {DATE_RANGE_ERROR_MESSAGE}
            </div>
          )}
        </div>

        <span data-testid="traceability-row-count" aria-live="polite" className="ml-auto text-xs text-fg-3">
          {rowCount}
        </span>
      </div>

      {filtering && (
        <div data-testid="traceability-active-summary" className="flex flex-wrap items-center gap-2 border-t border-stroke-2 px-3 py-2 text-xs text-fg-2">
          <Filter size={12} className="shrink-0 text-fg-3" />
          <span>Active filters:</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {chips.map(chip => (
              <span
                key={chip.key}
                data-testid={`traceability-filter-chip-${chip.key}`}
                className="inline-flex items-center rounded-full border border-stroke-2 bg-surface-2 px-2 py-0.5 font-mono text-2xs text-fg-1"
              >
                {chip.label}
              </span>
            ))}
          </span>
          <Button type="button" variant="ghost" size="sm" data-testid="traceability-clear-filters" className="ml-auto" onClick={onClear}>
            <X size={12} />
            Clear all
          </Button>
        </div>
      )}
    </Card>
  );
});
FilterBar.displayName = 'FilterBar';

export interface TraceabilityChainViewProps {
  projectId: string
  userStoryId: string | null
  initialPayload: StoryTraceabilityPayload | null
  initialError?: string | null
  // BK-50 — carried down for the exported document's "workspace / project /
  // story identity" line (PO ruling, comment 12239 §4). Resolved server-side
  // by the page the same way it already resolves `projectId`.
  projectName: string
  workspaceName: string
}

export function TraceabilityChainView({ projectId, userStoryId, initialPayload, initialError = null, projectName, workspaceName }: TraceabilityChainViewProps) {
  const [payload, setPayload] = useState<StoryTraceabilityPayload | null>(initialPayload);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const inFlight = useRef<AbortController | null>(null);
  // BK-50 — a SEPARATE ref from `inFlight`: Export is a background side-fetch
  // for the download, distinct from Retry's visible re-population of
  // `payload`. Sharing one ref would let an Export click abort an in-flight
  // Retry (or vice versa). Both are aborted on unmount so a navigate-away
  // mid-export never resolves into a `setExporting`/toast call on an
  // unmounted component.
  const exportInFlight = useRef<AbortController | null>(null);
  useEffect(() => () => {
    inFlight.current?.abort();
    exportInFlight.current?.abort();
  }, []);

  // BK-48 — filter state (result / module / date range, AC1-AC6). Starts
  // EMPTY on first render (SSR-safe — `window` is unavailable during the
  // server render pass) and is hydrated from the URL's query params in a
  // mount-only effect (AC5.2 "restore from URL on load"). Every filter
  // change re-serializes the FULL state back into the URL via
  // `history.replaceState` — deliberately NOT `next/navigation`'s router,
  // which would re-invoke this route's Server Component (a live DB
  // re-fetch) on every toggle click and contradict "filtering is
  // client-side over the already-fetched chain". `replaceState` (never
  // `pushState`) keeps one history entry per PAGE VISIT rather than one per
  // filter click; AC5.3's "navigate away, then Back" is satisfied by the
  // real navigation's own history entry, not by filter-click entries.
  const [filterState, setFilterState] = useState<TraceabilityFilterState>(EMPTY_FILTER_STATE);
  const filterBarRef = useRef<HTMLDivElement | null>(null);

  const syncFilterUrl = useCallback((next: TraceabilityFilterState) => {
    if (typeof window === 'undefined') { return; }
    const params = filterStateToParams(next);
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  }, []);

  const applyFilterState = useCallback((next: TraceabilityFilterState) => {
    setFilterState(next);
    syncFilterUrl(next);
  }, [syncFilterUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') { return; }
    const hydrate = () => {
      const parsed = parseFilterStateFromParams(new URLSearchParams(window.location.search));
      // `resolveKnownModuleId` (AC5.4) needs the real module set, which only
      // exists once a payload has loaded. `payload` here is the mount-time
      // value (this effect is intentionally mount-only, per the comment
      // below) — sufficient since the module set for one userStoryId never
      // changes across a `retry()`.
      const moduleId = resolveKnownModuleId(parsed.moduleId, payload ? distinctModules(payload) : []);
      setFilterState({ ...parsed, moduleId });
    };
    hydrate();
    // AC5.3 — a real page navigation away and back re-mounts this component
    // (this effect re-runs), but a `popstate` WITHIN the mounted lifetime
    // (e.g. the story-switch links this screen already renders elsewhere)
    // should re-sync too.
    window.addEventListener('popstate', hydrate);
    return () => window.removeEventListener('popstate', hydrate);
    // Mount-only hydration by design — a `userStoryId` change remounts via
    // the `key` the page assigns, so this effect intentionally never
    // re-runs on prop changes.
  }, []);

  const toggleResult = useCallback((value: TraceabilityFilterState['results'][number]) => {
    applyFilterState({
      ...filterState,
      results: filterState.results.includes(value)
        ? filterState.results.filter(v => v !== value)
        : [...filterState.results, value],
    });
  }, [applyFilterState, filterState]);

  const setModuleId = useCallback((value: string) => {
    applyFilterState({ ...filterState, moduleId: value === '' ? null : value });
  }, [applyFilterState, filterState]);

  const setFrom = useCallback((value: string) => {
    applyFilterState({ ...filterState, from: value === '' ? null : value });
  }, [applyFilterState, filterState]);

  const setTo = useCallback((value: string) => {
    applyFilterState({ ...filterState, to: value === '' ? null : value });
  }, [applyFilterState, filterState]);

  // AC4.3 — focus returns to the first result toggle after Clear-all (the
  // six toggles are always rendered, never conditionally hidden, so the
  // "or module dropdown" fallback in the AC text never triggers here — kept
  // anyway as a defensive fallback).
  const clearFilters = useCallback(() => {
    applyFilterState(EMPTY_FILTER_STATE);
    const firstToggle = filterBarRef.current?.querySelector<HTMLElement>('[data-testid="traceability-filter-result-pass"]');
    const moduleSelect = filterBarRef.current?.querySelector<HTMLElement>('[data-testid="traceability-filter-module"]');
    (firstToggle ?? moduleSelect)?.focus();
  }, [applyFilterState]);

  const retry = useCallback(async () => {
    if (!userStoryId) { return; }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchChain(projectId, userStoryId, controller.signal);
      if (controller.signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPayload(result.payload);
    }
    catch (err) {
      if (controller.signal.aborted) { return; }
      setError(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
    }
    finally {
      if (inFlight.current === controller) {
        setLoading(false);
      }
    }
  }, [projectId, userStoryId]);

  // BK-50 — a FRESH fetch at click time (never a re-use of the already
  // rendered `payload` state): this is what makes AC2.1 (the snapshot
  // freezes the chain AS OF THE EXPORT MOMENT, not as of whenever the page
  // last loaded) and E3 (a chain-assembly failure surfaces as a clear error,
  // never a corrupted download) correct. Goes through the SAME authenticated
  // route the screen already uses — no new API surface, no widened exposure
  // (AC1.2/E2 are the existing route's already-shipped 401/404 behavior).
  const handleExport = useCallback(async () => {
    if (!userStoryId || exporting) { return; }
    const controller = new AbortController();
    exportInFlight.current = controller;
    setExporting(true);
    try {
      const result = await fetchChain(projectId, userStoryId, controller.signal);
      if (controller.signal.aborted) { return; }
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const exportedAt = new Date();
      const html = renderTraceabilitySnapshotHtml(result.payload, {
        exportedAt,
        identity: { workspaceName, projectName },
      });
      const filename = buildSnapshotFilename(result.payload.story.title, exportedAt);
      triggerHtmlDownload(html, filename);
      toast.success('Snapshot exported', {
        description: `Read-only capture of the ${result.payload.story.title} chain as of ${formatSnapshotTimestamp(exportedAt)}. Later changes to the live chain will not appear in this snapshot. Saved as ${filename}.`,
      });
    }
    catch (err) {
      if (controller.signal.aborted) { return; }
      toast.error(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
    }
    finally {
      if (exportInFlight.current === controller) {
        setExporting(false);
      }
    }
  }, [projectId, userStoryId, workspaceName, projectName, exporting]);

  if (!userStoryId) {
    return (
      <div data-testid="traceability-no-story-selected" className="flex flex-1 flex-col items-center gap-2 p-8 text-center">
        <FileText size={18} className="text-fg-3" />
        <span className="text-md font-semibold text-fg-1">Select a user story</span>
        <span className="max-w-[46ch] text-sm text-fg-3">Open the evidence chain from a user story's link, or from the Metrics dashboard's coverage and recovery-cycle tables.</span>
      </div>
    );
  }

  if (loading) {
    return <TraceabilityChainSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <Card>
          <div data-testid="traceability-error" role="alert" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <AlertTriangle size={18} className="text-signal-fail" />
            <span className="text-md font-semibold text-fg-1">Couldn&apos;t load the evidence chain</span>
            <span className="max-w-[46ch] text-sm text-fg-3">{error}</span>
            <button
              type="button"
              data-testid="traceability-retry"
              onClick={() => { void retry(); }}
              className="mt-2 inline-flex h-7 items-center rounded-2 border border-stroke-2 bg-surface-2 px-3 text-xs font-medium text-fg-1 transition-colors duration-token ease-token hover:bg-surface-3"
            >
              Retry
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (!payload) {
    return <TraceabilityChainSkeleton />;
  }

  const viewState = resolveStoryChainViewState(payload);
  const counts = storyRollupCounts(payload);

  // BK-48 — derived filter view. Cheap to compute unconditionally (bounded
  // by one story's own chain size, same reasoning as BK-45's no-pagination
  // decision); only rendered when `viewState === 'has-chain'` (the
  // zero-ac/zero-coverage states have nothing to filter — see `AcCard`
  // calls below, which pass `filtering={false}` on the zero-coverage branch
  // to keep that state's existing rendering exactly unchanged).
  const modules = distinctModules(payload);
  const filteredCriteria = filterCriteria(payload, filterState);
  const filtering = isFilteringActive(filterState);
  const totals = filterTotals(filteredCriteria);
  const zeroMatch = isFilteredEmpty(totals, filtering);
  const filteredById = new Map(filteredCriteria.map(f => [f.criterion.id, f]));

  return (
    <div data-testid="traceability-chain-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-4">
          <StoryHead payload={payload} counts={counts} onExport={() => { void handleExport(); }} exporting={exporting} />

          {viewState === 'zero-ac' && (
            <Card>
              <div data-testid="traceability-empty-zero-ac" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <FileText size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{ZERO_AC_TITLE}</span>
                <span className="max-w-[52ch] text-sm text-fg-3">{ZERO_AC_BODY}</span>
              </div>
            </Card>
          )}

          {viewState === 'zero-coverage' && (
            <>
              <div
                data-testid="traceability-zero-coverage-banner"
                className="flex items-start gap-3 rounded-2 border border-stroke-2 bg-signal-fail-bg px-4 py-3 text-sm text-fg-1"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-signal-fail" />
                <div>
                  <strong className="font-semibold">{ZERO_COVERAGE_HEADING}</strong>
                  {' '}
                  {zeroCoverageBody(payload.criteria.length)}
                </div>
              </div>
              {payload.criteria.map(ac => (
                <AcCard key={ac.id} ac={ac} filtered={filteredById.get(ac.id)!} filtering={false} />
              ))}
            </>
          )}

          {viewState === 'has-chain' && (
            <>
              <FilterBar
                ref={filterBarRef}
                state={filterState}
                modules={modules}
                totals={totals}
                filtering={filtering}
                onToggleResult={toggleResult}
                onModuleChange={setModuleId}
                onFromChange={setFrom}
                onToChange={setTo}
                onClear={clearFilters}
              />

              {zeroMatch
                ? (
                    <Card>
                      <div data-testid="traceability-filtered-empty" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <SearchX size={18} className="text-fg-3" />
                        <span className="text-md font-semibold text-fg-1">{FILTERED_EMPTY_TITLE}</span>
                        <span className="max-w-[52ch] text-sm text-fg-3">{filteredEmptyBody(totals.totalRows, payload.story.title)}</span>
                        <Button type="button" variant="ghost" size="sm" data-testid="traceability-filtered-empty-clear" onClick={clearFilters}>
                          <X size={12} />
                          Clear all filters
                        </Button>
                      </div>
                    </Card>
                  )
                : payload.criteria.map(ac => (
                    <AcCard key={ac.id} ac={ac} filtered={filteredById.get(ac.id)!} filtering={filtering} />
                  ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StoryHead({ payload, counts, onExport, exporting }: {
  payload: StoryTraceabilityPayload
  counts: ReturnType<typeof storyRollupCounts>
  onExport: () => void
  exporting: boolean
}) {
  return (
    <Card>
      <div data-testid="traceability-story-head" className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-sm font-semibold text-fg-0">{payload.story.title}</span>
        <span className="text-xs text-fg-3">
          {counts.acCount}
          {' '}
          ACs ·
          {' '}
          {counts.atcCount}
          {' '}
          ATCs ·
          {' '}
          {counts.testCount}
          {' '}
          tests ·
          {' '}
          {counts.runCount}
          {' '}
          runs ·
          {' '}
          {counts.defectCount}
          {' '}
          defects
        </span>
        <Button
          type="button"
          variant="primary"
          size="sm"
          data-testid="traceability-export-button"
          onClick={onExport}
          disabled={exporting}
          aria-busy={exporting}
          className="ml-auto"
        >
          <Download size={14} />
          {exporting ? 'Exporting…' : 'Export snapshot'}
        </Button>
      </div>
      {payload.story.archived_at !== null && (
        <div
          data-testid="traceability-archived-banner"
          className="flex items-center gap-2 border-t border-stroke-2 bg-surface-3 px-4 py-2 text-xs text-fg-2"
        >
          <AlertTriangle size={14} className="text-fg-3" />
          This story is archived. The chain below reflects its coverage as of archiving.
        </div>
      )}
    </Card>
  );
}

// BK-48 — `filtered`/`filtering` drive the "n of m shown" note and the
// AC-card hide rule (AC1.1/AC2.6). `filtering={false}` (the zero-coverage
// caller) keeps this identical to BK-45's pre-filter rendering.
function AcCard({ ac, filtered, filtering }: { ac: TraceabilityCriterion, filtered: FilteredCriterion, filtering: boolean }) {
  if (isAcCardHidden(filtered, filtering)) { return null; }

  if (isAcUncovered(ac)) {
    return (
      <Card data-testid={`traceability-ac-${ac.id}`}>
        <div className="flex items-center justify-between gap-3 border-b border-stroke-2 px-4 py-2.5">
          <span className="text-sm font-medium text-fg-1">{ac.title}</span>
          <span className="text-xs text-fg-3">
            0 ATCs
          </span>
        </div>
        <div
          data-testid="uncovered-strip"
          className="flex items-center gap-2 px-4 py-3 text-sm text-signal-fail"
        >
          <AlertTriangle size={14} />
          <span className="font-medium">{UNCOVERED_LABEL}</span>
          <span className="text-fg-2">{UNCOVERED_WHY}</span>
        </div>
      </Card>
    );
  }

  const note = acNoteLabel(filtered, filtering);

  return (
    <Card data-testid={`traceability-ac-${ac.id}`} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-stroke-2 px-4 py-2.5">
        <span className="text-sm font-medium text-fg-1">{ac.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-fg-3">
          {note && <span data-testid={`traceability-ac-note-${ac.id}`}>{note}</span>}
          <span>
            {ac.atcs.length}
            {' '}
            {ac.atcs.length === 1 ? 'ATC' : 'ATCs'}
          </span>
        </span>
      </div>
      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-stroke-2 bg-surface-1 px-4 py-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-fg-3 md:grid">
        <span>ATC · layer</span>
        <span>Test</span>
        <span>Latest run</span>
        <span>Defects</span>
      </div>
      <div className="divide-y divide-stroke-1">
        {ac.atcs.map(row => <AtcRow key={row.id} atc={row} visible={filtered.visibleAtcIds.has(row.id)} />)}
      </div>
    </Card>
  );
}

function AtcRow({ atc, visible }: { atc: TraceabilityAtc, visible: boolean }) {
  const rowState = resolveAtcRowState(atc);
  const testCopy = testCellCopy(rowState);
  const runPlaceholder = runCellPlaceholder(rowState);
  const defectPlaceholder = defectCellPlaceholder(rowState, atc.defects.length);
  // BK-48 — the filter targets, mirroring the mockup's `.chain-row`
  // attributes verbatim. Omitted (not empty-string) when absent, so
  // `data-status`/`data-date` are genuinely MISSING for a no-run row
  // (AC1.4/AC2.7/AC6.1), not present-but-blank.
  const statusAttr = rowFilterStatus(atc);
  const dateAttr = rowFilterDate(atc);

  return (
    <div
      data-testid={`traceability-atc-row-${atc.id}`}
      data-status={statusAttr ?? undefined}
      data-module={atc.module.id}
      data-date={dateAttr ?? undefined}
      aria-hidden={!visible}
      className={`grid grid-cols-1 gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-3${visible ? '' : ' hidden'}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-fg-3">{atc.slug}</span>
          <span className="status-chip" data-status="skipped">{atc.layer}</span>
        </div>
        <div className="truncate text-fg-1">{atc.title}</div>
      </div>

      <div className="min-w-0">
        {testCopy
          ? <PlaceholderPill text={testCopy} />
          : <span className="truncate text-fg-2">{atc.test?.title}</span>}
      </div>

      <div className="min-w-0">
        {runPlaceholder
          ? <PlaceholderPill text={runPlaceholder} />
          : atc.latest_run && (
            <span className="status-chip" data-status={runChipTone(atc.latest_run)}>
              {runChipLabel(atc.latest_run)}
            </span>
          )}
      </div>

      <div className="min-w-0">
        {defectPlaceholder
          ? (
              <span className="text-xs text-fg-3">{defectPlaceholder}</span>
            )
          : (
              <div className="flex flex-col gap-1">
                {atc.defects.map(d => (
                  <div key={d.id} className="flex items-center gap-1.5 text-xs">
                    <span className="truncate text-fg-2">{d.title}</span>
                    <span className="status-chip shrink-0" data-status={d.status === 'resolved' || d.status === 'closed' ? 'pass' : 'fail'}>
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}

function PlaceholderPill({ text }: { text: string }) {
  return (
    <span
      data-testid="chain-placeholder-pill"
      className="inline-flex items-center gap-1 rounded-full border border-dashed border-stroke-2 px-2 py-0.5 text-2xs text-fg-3"
    >
      <Clock size={11} />
      {text}
    </span>
  );
}

export function TraceabilityChainSkeleton() {
  return (
    <div data-testid="traceability-loading" className="flex flex-1 flex-col overflow-hidden p-4" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <Card className="flex flex-col gap-2 p-4">
          <span className="h-4 w-64 animate-status-pulse rounded-1 bg-surface-3" />
          <span className="h-3 w-96 animate-status-pulse rounded-1 bg-surface-3" />
        </Card>
        {[0, 1, 2].map(i => (
          <Card key={i} className="flex flex-col gap-2 p-4">
            <span className="h-3.5 w-56 animate-status-pulse rounded-1 bg-surface-3" />
            <span className="h-3 w-full animate-status-pulse rounded-1 bg-surface-3" />
            <span className="h-3 w-4/5 animate-status-pulse rounded-1 bg-surface-3" />
          </Card>
        ))}
      </div>
    </div>
  );
}

export { CHAIN_PLACEHOLDER_COPY };
