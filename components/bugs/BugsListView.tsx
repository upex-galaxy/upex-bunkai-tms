'use client';

import type { BugsListPageResponse, BugsListRpcRow } from '@app/api/v1/bugs/list-response';
import type { BugRecord } from '@components/bugs/BugFormDialog';
import type { BugSeverity, BugStatus } from '@lib/bugs/constants';
import type { BugAggregates } from '@lib/bugs/list-view';
import type { ReactNode } from 'react';
import { BugFormDialog } from '@components/bugs/BugFormDialog';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import {
  BUG_SEVERITY_LABEL,
  BUG_SEVERITY_VALUES,
  BUG_STATUS_VALUES,
  BUGS_LIST_PAGE_SIZE,
} from '@lib/bugs/constants';
import {
  BUG_LIST_EMPTY_DESCRIPTION,
  BUG_LIST_EMPTY_TITLE,
  formatBugListRow,
} from '@lib/bugs/list-view';
import { cn } from '@lib/utils';
import { ArrowDown, Bug, Inbox, ListX, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

// BK-41 Slice 3 — the List view of `bug-reports-index.html` on the existing
// `/projects/[projectSlug]/bugs` route (BK-40's bare list gets its own
// module/status/severity filter strip, a live severity/status counts panel,
// keyset "load more" pagination, and a second, distinct empty state — see
// business-rules.md ("counts always reflect the currently applied filters"
// / "an explicit empty state is shown") and AC-7. The Heatmap view toggle
// (same screen, BK-42) is out of scope here (implementation-plan.md
// Decision 13) — this component renders ONLY the List half.
//
// Structural precedent: `RunHistoryView.tsx`'s filter+load-older+two-empty-
// states shape, generalized from RunHistoryView's single-select `outcome`
// to two independently multi-select fields (status, severity) plus a
// module scope — Decision 6's OR-within-field/AND-across-fields contract.
// Unlike RunHistoryView, filters are NOT synced to the URL (no deep-link
// requirement in this story's scope) — a filter change re-queries directly
// from its own click handler instead of through a `router.replace` + effect
// round trip, which is simpler here since there is no URL state to react to.

export interface BugsModuleOption {
  id: string
  name: string
  path: string
}

interface BugsListViewProps {
  projectId: string
  modules: BugsModuleOption[]
  // Same member+ (not-viewer) gate as ProjectLayout's own `canCreate` and
  // RunnerView's `canReportBug` — a viewer sees the list read-only, no "New
  // bug" button at all (structurally absent, not merely hidden).
  canCreateBug: boolean
  initialPage: BugsListPageResponse
  // Set when the SERVER-side first-page read failed; the client renders the
  // error block with a Retry that re-queries through the API route.
  initialError?: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

const FALLBACK_ERROR_MESSAGE = 'Could not load this Project\'s bugs.';

// AC-7 / business-rules.md's second, distinct empty state: filters are
// active and matched zero defects — NOT the same as "this project has never
// had a defect filed" (`BUG_LIST_EMPTY_TITLE`, reused unchanged from BK-40
// below). Copy adapted from the mockup's own `#empty-state`
// (`bug-reports-index.html`), minus its "0 of 22" figure — that number is
// the UNFILTERED project total, which this page never fetches (Decision 6's
// aggregates are always over the FILTERED set only); asserting a number we
// do not have would be worse than omitting it.
const BUGS_LIST_NO_MATCH_TITLE = 'No defects match the current filters';
const BUGS_LIST_NO_MATCH_DESCRIPTION
  = 'The combination of module, status and severity filters excludes every defect in this project. This is a valid result, not an error — clear the filters to see everything again.';

interface FetchBugsParams {
  moduleId: string | null
  statuses: Set<BugStatus>
  severities: Set<BugSeverity>
  cursor: string | null
}

async function fetchBugsPage(
  projectId: string,
  params: FetchBugsParams,
  signal: AbortSignal,
): Promise<{ ok: true, page: BugsListPageResponse } | { ok: false, message: string }> {
  const query = new URLSearchParams({ project_id: projectId, limit: String(BUGS_LIST_PAGE_SIZE) });
  if (params.moduleId !== null) { query.set('module_id', params.moduleId); }
  if (params.statuses.size > 0) { query.set('status', Array.from(params.statuses).join(',')); }
  if (params.severities.size > 0) { query.set('severity', Array.from(params.severities).join(',')); }
  if (params.cursor !== null) { query.set('cursor', params.cursor); }

  const response = await fetch(`/api/v1/bugs?${query}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    // Server copy is rendered VERBATIM — never rephrased client-side.
    return { ok: false, message: body.error?.message ?? FALLBACK_ERROR_MESSAGE };
  }
  return { ok: true, page: (await response.json()) as BugsListPageResponse };
}

// Status/severity -> the live `.status-chip`/`.dot` `data-status` family
// (`app/globals.css`). Matches the mockup's own `data-tone` values on its
// filter chip-toggles (`bug-reports-index.html`) verbatim, and
// `lib/bugs/list-view.ts`'s internal (non-exported) `BUG_STATUS_TOKEN`/
// `BUG_SEVERITY_TOKEN` maps this file cannot import without widening that
// module's exports beyond this story's own file scope — kept as a local
// duplicate here, same pattern `RunHistoryView.tsx`'s own local
// `STATUS_TOKEN`/`OUTCOME_DOT_CLASS` maps already establish for a sibling
// list view.
const STATUS_FILTER_TONE: Record<BugStatus, string> = {
  open: 'fail',
  in_progress: 'running',
  resolved: 'pass',
  closed: 'skipped',
};
const STATUS_FILTER_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};
const SEVERITY_FILTER_TONE: Record<BugSeverity, string> = {
  P1: 'fail',
  P2: 'blocked',
  P3: 'running',
  P4: 'skipped',
};

interface ToneClasses { text: string, bg: string, border: string, dot: string }
const TONE_CLASSES: Record<string, ToneClasses> = {
  fail: { text: 'text-signal-fail', bg: 'bg-signal-fail-bg', border: 'border-signal-fail', dot: 'bg-signal-fail' },
  blocked: { text: 'text-signal-blocked', bg: 'bg-signal-blocked-bg', border: 'border-signal-blocked', dot: 'bg-signal-blocked' },
  running: { text: 'text-signal-running', bg: 'bg-signal-running-bg', border: 'border-signal-running', dot: 'bg-signal-running' },
  pass: { text: 'text-signal-pass', bg: 'bg-signal-pass-bg', border: 'border-signal-pass', dot: 'bg-signal-pass' },
  skipped: { text: 'text-signal-skipped', bg: 'bg-signal-skipped-bg', border: 'border-signal-skipped', dot: 'bg-signal-skipped' },
};

// One multi-select filter toggle chip — mirrors the mockup's `.chip-toggle`
// (neutral outline idle, tone-colored fill+border when `aria-pressed`).
function FilterChip({ pressed, tone, label, onClick, testId }: {
  pressed: boolean
  tone: string
  label: ReactNode
  onClick: () => void
  testId: string
}) {
  const toneClasses = TONE_CLASSES[tone];
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-1 border px-2 text-sm font-medium tracking-[0.02em] transition-colors duration-token ease-token',
        pressed
          ? `${toneClasses.border} ${toneClasses.bg} ${toneClasses.text}`
          : 'border-stroke-2 bg-surface-2 text-fg-2 hover:border-stroke-3 hover:bg-surface-4',
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', pressed ? toneClasses.dot : 'bg-fg-3 opacity-60')} />
      {label}
    </button>
  );
}

// One severity/status count pill in the aggregates panel — mirrors the
// mockup's `.count-chip` (dimmed at `count === 0`, same tone family as the
// matching filter chip / table row badge).
function CountChip({ tone, label, count, testId }: { tone: string, label: ReactNode, count: number, testId: string }) {
  const toneClasses = TONE_CLASSES[tone];
  return (
    <span
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm font-medium tracking-[0.02em]',
        toneClasses.border,
        toneClasses.bg,
        toneClasses.text,
        count === 0 && 'opacity-60',
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', toneClasses.dot)} />
      {label}
      <span className="font-mono font-semibold">{count}</span>
    </span>
  );
}

type BugsListViewState = 'error' | 'empty-never' | 'empty-no-match' | 'rows';

// Branch selection for the four mutually exclusive blocks, mirroring
// `resolveRunHistoryViewState`'s shape: a first-page error wins over
// everything; with rows the filter state is irrelevant; without rows,
// whether ANY filter (module/status/severity) is active is what separates
// "this project has no defects at all" from "this combination excludes
// everything" (AC-7 / business-rules.md).
function resolveBugsListViewState(params: { error: boolean, rowCount: number, filtersActive: boolean }): BugsListViewState {
  if (params.error) { return 'error'; }
  if (params.rowCount > 0) { return 'rows'; }
  return params.filtersActive ? 'empty-no-match' : 'empty-never';
}

export function BugsListView({ projectId, modules, canCreateBug, initialPage, initialError = null }: BugsListViewProps) {
  const [items, setItems] = useState<BugsListRpcRow[]>(initialPage.data);
  const [aggregates, setAggregates] = useState<BugAggregates>(initialPage.aggregates);
  const [cursor, setCursor] = useState<string | null>(initialPage.next_cursor);

  const [moduleId, setModuleId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Set<BugStatus>>(new Set());
  const [severities, setSeverities] = useState<Set<BugSeverity>>(new Set());

  // First-page error (whole-panel block) vs. append error (inline, load-more
  // control only) — same split as RunHistoryView/ActivityView: an append
  // failure must never unmount rows already loaded and paid for.
  const [error, setError] = useState<string | null>(initialError);
  const [appendError, setAppendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // At most one request is ever useful: a newer one always supersedes
  // whatever is in flight.
  const inFlight = useRef<AbortController | null>(null);
  const startRequest = () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    return controller;
  };
  useEffect(() => () => inFlight.current?.abort(), []);

  // The foot line doubles as the focus target when the load-more button
  // unmounts under the pointer/keyboard that just activated it, and as the
  // polite live region that narrates the row count (mirrors RunHistoryView).
  const footRef = useRef<HTMLDivElement | null>(null);
  const focusFootAfterAppend = useRef(false);
  useEffect(() => {
    if (focusFootAfterAppend.current && cursor === null) {
      focusFootAfterAppend.current = false;
      footRef.current?.focus();
    }
  }, [cursor]);

  // Replace the whole list with page 1 under the given filters — used by
  // every filter toggle, Reset filters, Retry, and a successful create.
  const runQuery = async (
    params: { moduleId: string | null, statuses: Set<BugStatus>, severities: Set<BugSeverity> },
    controller: AbortController,
  ) => {
    const { signal } = controller;
    setLoading(true);
    setError(null);
    setLoadingOlder(false);
    setAppendError(null);
    try {
      const result = await fetchBugsPage(projectId, { ...params, cursor: null }, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.page.data);
      setAggregates(result.page.aggregates);
      setCursor(result.page.next_cursor);
    }
    catch (err) {
      if (signal.aborted) { return; }
      setError(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
    }
    finally {
      if (inFlight.current === controller) {
        setLoading(false);
      }
    }
  };

  const applyFilters = (nextModuleId: string | null, nextStatuses: Set<BugStatus>, nextSeverities: Set<BugSeverity>) => {
    setModuleId(nextModuleId);
    setStatuses(nextStatuses);
    setSeverities(nextSeverities);
    void runQuery({ moduleId: nextModuleId, statuses: nextStatuses, severities: nextSeverities }, startRequest());
  };

  const toggleStatus = (value: BugStatus) => {
    const next = new Set(statuses);
    next.has(value) ? next.delete(value) : next.add(value);
    applyFilters(moduleId, next, severities);
  };

  const toggleSeverity = (value: BugSeverity) => {
    const next = new Set(severities);
    next.has(value) ? next.delete(value) : next.add(value);
    applyFilters(moduleId, statuses, next);
  };

  const onModuleChange = (value: string) => {
    applyFilters(value === '' ? null : value, statuses, severities);
  };

  const filtersActive = moduleId !== null || statuses.size > 0 || severities.size > 0;

  const resetFilters = () => applyFilters(null, new Set(), new Set());

  const retry = () => {
    void runQuery({ moduleId, statuses, severities }, startRequest());
  };

  // Append the next keyset page BELOW the current rows — the active filters
  // travel with the cursor, which is what makes "filters stay applied across
  // load more" true rather than a client-side illusion (mirrors
  // RunHistoryView's `loadOlder`).
  const loadMore = async () => {
    if (cursor === null || loading || loadingOlder) { return; }
    const controller = startRequest();
    const { signal } = controller;
    setLoadingOlder(true);
    setAppendError(null);
    try {
      const result = await fetchBugsPage(projectId, { moduleId, statuses, severities, cursor }, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setAppendError(result.message);
        return;
      }
      if (result.page.next_cursor === null) {
        focusFootAfterAppend.current = true;
      }
      setItems(current => [...current, ...result.page.data]);
      setAggregates(result.page.aggregates);
      setCursor(result.page.next_cursor);
    }
    catch (err) {
      if (signal.aborted) { return; }
      setAppendError(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
    }
    finally {
      if (inFlight.current === controller) {
        setLoadingOlder(false);
      }
    }
  };

  // A successful create is proof the read path works, so it clears any
  // stale first-page error — but unlike BK-40's bare list, the new bug is
  // NOT prepended locally: it may not match the active filters, and the
  // aggregates panel (AC-6) would otherwise silently drift out of sync with
  // the server's own count. Re-querying page 1 under the CURRENT filters is
  // the simple, correct fix — one extra round trip, paid once per create.
  const handleCreated = (_bug: BugRecord) => {
    toast.success('Bug filed');
    void runQuery({ moduleId, statuses, severities }, startRequest());
  };

  const rows = items.map(formatBugListRow);
  const state = resolveBugsListViewState({ error: error !== null, rowCount: rows.length, filtersActive });

  const filteredTotal = Object.values(aggregates.by_status).reduce((sum, n) => sum + n, 0);
  const footText = cursor === null
    ? `${items.length} ${items.length === 1 ? 'defect' : 'defects'} loaded · end of list`
    : `${items.length} of ${filteredTotal} defects loaded`;

  const moreIdleLabel = appendError === null ? 'Load more defects' : 'Try again';
  const moreLabel = loadingOlder ? 'Loading…' : moreIdleLabel;

  return (
    <div data-testid="bugs-list-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[1000px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-fg-0">Bug Reports</h1>
            {canCreateBug && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                data-testid="bugs-list-new-button"
                onClick={() => setCreateOpen(true)}
              >
                <Bug size={11} />
                New bug
              </Button>
            )}
          </div>

          {/* Filter toolbar — module (subtree rollup, server-side), status and
              severity (both multi-select, OR-within-field / AND-across-fields
              per Decision 6). Mirrors the mockup's `.toolbar` grouping. */}
          <div
            data-testid="bugs-list-toolbar"
            className="flex flex-wrap items-end gap-4 rounded-3 border border-stroke-2 bg-surface-2 p-3 shadow-card"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Module</span>
              <select
                data-testid="bugs-list-module-filter"
                value={moduleId ?? ''}
                onChange={e => onModuleChange(e.target.value)}
                className="h-8 min-w-[220px] rounded-2 border border-stroke-2 bg-surface-2 px-2.5 font-mono text-sm text-fg-1 hover:border-stroke-3 focus:border-accent focus:outline-none"
              >
                <option value="">All modules</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.path}</option>
                ))}
              </select>
              <span className="text-2xs text-fg-3">Includes all nested sub-modules</span>
            </label>

            <div className="flex flex-col gap-1.5">
              <span id="bugs-status-filter-label" className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Status</span>
              <div role="group" aria-labelledby="bugs-status-filter-label" className="flex flex-wrap gap-1.5">
                {BUG_STATUS_VALUES.map(value => (
                  <FilterChip
                    key={value}
                    pressed={statuses.has(value)}
                    tone={STATUS_FILTER_TONE[value]}
                    label={STATUS_FILTER_LABEL[value]}
                    onClick={() => toggleStatus(value)}
                    testId={`bugs-list-filter-status-${value}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span id="bugs-severity-filter-label" className="text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2">Severity</span>
              <div role="group" aria-labelledby="bugs-severity-filter-label" className="flex flex-wrap gap-1.5">
                {BUG_SEVERITY_VALUES.map(value => (
                  <FilterChip
                    key={value}
                    pressed={severities.has(value)}
                    tone={SEVERITY_FILTER_TONE[value]}
                    label={(
                      <>
                        <span className="font-mono">{value}</span>
                        {' '}
                        {BUG_SEVERITY_LABEL[value]}
                      </>
                    )}
                    onClick={() => toggleSeverity(value)}
                    testId={`bugs-list-filter-severity-${value}`}
                  />
                ))}
              </div>
            </div>

            {filtersActive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="bugs-list-reset-filters"
                className="ml-auto"
                onClick={resetFilters}
              >
                <X size={12} />
                Reset filters
              </Button>
            )}
          </div>

          {/* Counts panel — severity/status breakdown over the FULL filtered
              set (AC-6), not just the page currently loaded. Shown for every
              non-error state so a genuine "everything is zero" reads exactly
              as informative as a populated one. */}
          {state !== 'error' && (
            <div
              data-testid="bugs-list-counts"
              aria-live="polite"
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <span className="font-mono text-fg-0">{filteredTotal}</span>
              <span className="text-fg-2">{filteredTotal === 1 ? 'defect in view' : 'defects in view'}</span>
              <span className="mx-1 h-3.5 w-px bg-stroke-2" aria-hidden="true" />
              <span className="text-fg-2">Severity</span>
              {BUG_SEVERITY_VALUES.map(value => (
                <CountChip
                  key={value}
                  tone={SEVERITY_FILTER_TONE[value]}
                  label={value}
                  count={aggregates.by_severity[value]}
                  testId={`bugs-list-count-severity-${value}`}
                />
              ))}
              <span className="mx-1 h-3.5 w-px bg-stroke-2" aria-hidden="true" />
              <span className="text-fg-2">Status</span>
              {BUG_STATUS_VALUES.map(value => (
                <CountChip
                  key={value}
                  tone={STATUS_FILTER_TONE[value]}
                  label={STATUS_FILTER_LABEL[value]}
                  count={aggregates.by_status[value]}
                  testId={`bugs-list-count-status-${value}`}
                />
              ))}
            </div>
          )}

          <Card className="overflow-hidden">
            {state === 'error' && (
              <div data-testid="bugs-list-error" className="flex flex-col items-start gap-3 p-4">
                <p className="text-sm text-fg-2">{error}</p>
                <Button
                  type="button"
                  size="sm"
                  data-testid="bugs-list-retry"
                  disabled={loading}
                  onClick={retry}
                >
                  <RefreshCw size={13} />
                  {loading ? 'Retrying…' : 'Retry'}
                </Button>
              </div>
            )}

            {state === 'empty-never' && (
              <div
                data-testid="bugs-list-empty"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <ListX size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{BUG_LIST_EMPTY_TITLE}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">{BUG_LIST_EMPTY_DESCRIPTION}</span>
              </div>
            )}

            {state === 'empty-no-match' && (
              <div
                data-testid="bugs-list-no-match"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <Inbox size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{BUGS_LIST_NO_MATCH_TITLE}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">{BUGS_LIST_NO_MATCH_DESCRIPTION}</span>
                <Button
                  type="button"
                  size="sm"
                  data-testid="bugs-list-no-match-clear"
                  className="mt-1"
                  onClick={resetFilters}
                >
                  <X size={12} />
                  Clear filters
                </Button>
              </div>
            )}

            {state === 'rows' && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Bug', 'Title', 'Module', 'Severity', 'Status', 'Run'].map(column => (
                          <th
                            key={column}
                            scope="col"
                            className="whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody
                      data-testid="bugs-list-rows"
                      aria-busy={loading}
                      className={cn('transition-opacity duration-token ease-token', loading && 'opacity-40')}
                    >
                      {rows.map(row => (
                        <tr
                          key={row.id}
                          data-testid={`bugs-list-row-${row.id}`}
                          className="transition-colors duration-token ease-token hover:bg-surface-3"
                        >
                          <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                            <span className="font-mono text-xs font-medium text-fg-0" title={row.id}>
                              {row.id.slice(0, 8)}
                            </span>
                          </td>
                          <td className="max-w-[280px] truncate border-t border-stroke-1 px-3 py-1.5 text-sm text-fg-1">
                            {row.title}
                          </td>
                          <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                            <span className="font-mono text-xs text-fg-2">{row.modulePath}</span>
                          </td>
                          <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                            <span className="status-chip" data-status={row.severityToken}>
                              <span className="dot" data-status={row.severityToken} />
                              {row.severity}
                              {' · '}
                              {row.severityLabel}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                            <span className="status-chip" data-status={row.statusToken}>
                              <span className="dot" data-status={row.statusToken} />
                              {row.statusLabel}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
                            <span className="font-mono text-xs text-fg-2">{row.runLinkLabel}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(cursor !== null || appendError !== null) && (
                  <div className="flex flex-col items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2">
                    {appendError !== null && (
                      <p data-testid="bugs-list-append-error" className="text-center text-sm text-fg-2">
                        {appendError}
                      </p>
                    )}
                    {cursor !== null && (
                      <Button
                        type="button"
                        size="sm"
                        data-testid="bugs-list-load-more"
                        disabled={loading || loadingOlder}
                        onClick={() => { void loadMore(); }}
                      >
                        {appendError === null ? <ArrowDown size={12} /> : <RefreshCw size={13} />}
                        {moreLabel}
                      </Button>
                    )}
                  </div>
                )}

                <div
                  ref={footRef}
                  tabIndex={-1}
                  aria-live="polite"
                  data-testid="bugs-list-foot"
                  className="flex items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2 font-mono text-xs text-fg-3 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {footText}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {createOpen && (
        <BugFormDialog
          open
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          context={{ mode: 'standalone', projectId, modules }}
          initialTitle=""
          initialSeverity="P3"
          initialStepsToReproduce=""
          initialEvidenceUrls={[]}
        />
      )}
    </div>
  );
}

// Suspense fallback for `bugs/page.tsx`'s async section, following the
// `RunHistorySkeleton` precedent: a static skeleton not gated by the same
// async read as the real table, so it paints immediately.
export function BugsListSkeleton() {
  return (
    <div data-testid="bugs-list-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[1000px] flex-col gap-3" aria-hidden="true">
          <div className="h-7 w-40 animate-status-pulse rounded-2 bg-surface-3" />
          <div className="h-16 w-full animate-status-pulse rounded-3 bg-surface-3" />
          <Card className="flex flex-col gap-2 p-4">
            <div className="h-3 w-full animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-5/6 animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-4/6 animate-status-pulse rounded-1 bg-surface-3" />
          </Card>
        </div>
      </div>
    </div>
  );
}
