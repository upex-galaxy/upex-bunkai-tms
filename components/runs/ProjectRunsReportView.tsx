'use client';

import type { ReportExecutor, ReportStatus } from '@lib/runs/report-constants';
import type { ReportFilterState } from '@lib/runs/report-view';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { Input } from '@components/ui/input';
// Constants come from the zod-free module, NOT `report-validation`: that file
// evaluates `z.object(...)` at its top level, so importing two literals from
// it would drag Zod and the whole query-schema graph into this client bundle
// (same reasoning as `RunHistoryView`'s own import of `history-constants`).
import { REPORT_EXECUTOR_VALUES, REPORT_PAGE_SIZE, REPORT_STATUS_VALUES } from '@lib/runs/report-constants';
import {
  EMPTY_REPORT_FILTERS,
  hasActiveReportFilters,
  reportScopeLabel,
  reportTableFootText,
  resolveReportEmptyStateCopy,
  resolveReportViewState,
} from '@lib/runs/report-view';
import { ArrowDown, Bot, Check, Inbox, RefreshCw, SearchX, Server, User, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

// BK-38 — the project-wide Run Report: renders the mockup
// (`bk-30-test-runs-index/test-runs-index.html`) with the LIVE design
// system's tokens and atoms (Critical Rule #14) — the `.status-chip[data-status]`
// / `.dot[data-status]` classes in `app/globals.css`, the same substitution
// `RunHistoryView` (BK-37) already made for its own mockup.
//
// Filtering is server-side end-to-end: every control change re-queries
// `GET /api/v1/projects/{id}/runs/report` through the API route. A
// client-side filter over an already-fetched page cannot satisfy "totals
// reflect the WHOLE filtered set" (Business Rule #3, Technical Decision D2),
// which may span many pages.
//
// The first page is fetched SERVER-side by `runs/page.tsx` and handed down as
// `initialPage`, so the screen paints complete with no client waterfall.
// After mount this component owns the list.

export interface RunReportItem {
  id: string
  test_id: string
  test_title: string
  module_id: string | null
  module_name: string | null
  environment_id: string
  environment_name: string | null
  executor_mode: string
  // `running` is a legitimate row (a currently-in-progress Run) even though
  // it is not a selectable status FILTER value (Technical Decision D4) — see
  // `report-constants.ts`.
  status: 'running' | 'passed' | 'failed' | 'aborted'
  started_at: string
  finished_at: string | null
}

// Passed/failed ONLY, never `aborted` — Business Rule #3 ("Pass/fail totals
// count only final passed and failed Runs... aborted Runs may appear in rows
// but are excluded from pass/fail totals") and confirmed against the
// committed RPC (0041_run_project_report.sql `v_totals` build) and the API
// route's `RunReportPayload` type: the wire response never carries an
// `aborted` total. The mockup draws a third "Aborted" totals chip that this
// component deliberately does NOT reproduce — showing one would mean either
// inventing a number the server never sends, or wiring it to something that
// silently stops matching "aborted" the moment BK-225 or a future slice
// changes row shape. Flagged in the Stage 2 report as a divergence beyond the
// plan's own D-1/D-2/D-3, not a silent omission.
export interface RunReportTotals {
  passed: number
  failed: number
}

export interface RunReportPage {
  items: RunReportItem[]
  totals: RunReportTotals
  // Opaque page token (base64url of the keyset position), or null on the last page.
  next_cursor: string | null
}

export interface ProjectRunsReportModule {
  id: string
  name: string
}

interface ProjectRunsReportViewProps {
  projectId: string
  modules: ProjectRunsReportModule[]
  initialPage: RunReportPage
  // Set when the SERVER-side first-page read failed; the client renders the
  // error block with a Retry that re-queries through the API route.
  initialError?: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

const FALLBACK_ERROR_MESSAGE = 'Could not load the Run report.';

// The API's row statuses -> the live `.status-chip` / `.dot` data-status
// tokens. `aborted` maps to the BLOCKED family (an anomalous termination, not
// a failed assertion) per master-design-plan §4.8, same mapping BK-37 uses
// for its own aborted outcome.
const STATUS_TOKEN: Record<RunReportItem['status'], string> = {
  passed: 'pass',
  failed: 'fail',
  aborted: 'aborted',
  running: 'running',
};

const STATUS_LABEL: Record<RunReportItem['status'], string> = {
  passed: 'Passed',
  failed: 'Failed',
  aborted: 'Aborted',
  running: 'Running',
};

// Status filter chip dot colors — mirrors the mockup's inline
// `style="background:var(--pass)"` per chip, expressed as the live Tailwind
// signal-color utilities instead.
const STATUS_DOT_CLASS: Record<ReportStatus, string> = {
  passed: 'bg-signal-pass',
  failed: 'bg-signal-fail',
  aborted: 'bg-signal-blocked',
};

const STATUS_FILTER_LABEL: Record<ReportStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
  aborted: 'Aborted',
};

const EXECUTOR_LABEL: Record<string, string> = { human: 'Human', agent: 'Agent', ci: 'CI' };
const EXECUTOR_ICON: Record<string, LucideIcon> = { human: User, agent: Bot, ci: Server };

// Deterministic UTC rendering, same reasoning as `RunHistoryView`'s
// `formatRanAt`: this is a CLIENT component that still server-renders its
// first paint, so `toLocale*` would drift between server and browser
// timezone and trip a hydration mismatch.
function formatRanAt(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function buildReportParams(filters: ReportFilterState, cursor: string | null): URLSearchParams {
  const params = new URLSearchParams({ limit: String(REPORT_PAGE_SIZE) });
  if (filters.dateFrom !== null) { params.set('date_from', filters.dateFrom); }
  if (filters.dateTo !== null) { params.set('date_to', filters.dateTo); }
  if (filters.moduleId !== null) { params.set('module_id', filters.moduleId); }
  for (const status of filters.status) { params.append('status', status); }
  for (const executor of filters.executor) { params.append('executor', executor); }
  if (cursor !== null) { params.set('cursor', cursor); }
  return params;
}

async function fetchReport(
  projectId: string,
  filters: ReportFilterState,
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ ok: true, page: RunReportPage } | { ok: false, message: string }> {
  const params = buildReportParams(filters, cursor);
  const response = await fetch(`/api/v1/projects/${projectId}/runs/report?${params}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    // Server copy is rendered VERBATIM — never rephrased client-side.
    return { ok: false, message: body.error?.message ?? FALLBACK_ERROR_MESSAGE };
  }
  return { ok: true, page: (await response.json()) as RunReportPage };
}

export function ProjectRunsReportView({ projectId, modules, initialPage, initialError = null }: ProjectRunsReportViewProps) {
  const [filters, setFilters] = useState<ReportFilterState>(EMPTY_REPORT_FILTERS);
  const [items, setItems] = useState<RunReportItem[]>(initialPage.items);
  const [totals, setTotals] = useState<RunReportTotals>(initialPage.totals);
  const [cursor, setCursor] = useState<string | null>(initialPage.next_cursor);
  const [error, setError] = useState<string | null>(initialError);
  // A failed APPEND is tracked apart from `error` deliberately — same split as
  // `RunHistoryView`: `error` drives the whole-view error block, which
  // REPLACES the table; using it for a failed "load older" would throw away
  // rows already loaded and paid for.
  const [appendError, setAppendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // At most one report request is ever useful: a newer one always supersedes
  // whatever is in flight.
  const inFlight = useRef<AbortController | null>(null);
  const startRequest = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    return controller;
  }, []);
  useEffect(() => () => inFlight.current?.abort(), []);

  const footRef = useRef<HTMLDivElement | null>(null);
  const focusFootAfterAppend = useRef(false);

  // Replace the whole list with page 1 of `nextFilters` — a filter changed, or
  // the user retried after an error.
  const loadFirstPage = useCallback(async (nextFilters: ReportFilterState, controller: AbortController) => {
    const { signal } = controller;
    setLoading(true);
    setError(null);
    setLoadingOlder(false);
    setAppendError(null);
    try {
      const result = await fetchReport(projectId, nextFilters, null, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.page.items);
      setTotals(result.page.totals);
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
  }, [projectId]);

  // Re-query page 1 whenever ANY filter axis changes. The FIRST run is
  // skipped: the server already delivered the unfiltered page 1, and
  // re-fetching it on mount would be a pointless round-trip. `filters` is
  // replaced wholesale (never mutated) by every handler below, so a plain
  // reference-identity dependency fires exactly once per user action.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const controller = startRequest();
    void loadFirstPage(filters, controller);
    return () => controller.abort();
  }, [filters, loadFirstPage, startRequest]);

  // Move focus off the load-older button when the FINAL append unmounts it —
  // same reasoning as `RunHistoryView`.
  useEffect(() => {
    if (focusFootAfterAppend.current && cursor === null) {
      focusFootAfterAppend.current = false;
      footRef.current?.focus();
    }
  }, [cursor]);

  const setDateFrom = (value: string) => setFilters(prev => ({ ...prev, dateFrom: value === '' ? null : value }));
  const setDateTo = (value: string) => setFilters(prev => ({ ...prev, dateTo: value === '' ? null : value }));
  const setModuleId = (value: string) => setFilters(prev => ({ ...prev, moduleId: value === '' ? null : value }));

  const toggleStatus = (value: ReportStatus) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status.includes(value) ? prev.status.filter(v => v !== value) : [...prev.status, value],
    }));
  };

  const toggleExecutor = (value: ReportExecutor) => {
    setFilters(prev => ({
      ...prev,
      executor: prev.executor.includes(value) ? prev.executor.filter(v => v !== value) : [...prev.executor, value],
    }));
  };

  const clearFilters = () => {
    setCursor(null);
    setFilters(EMPTY_REPORT_FILTERS);
  };

  // Append the next keyset page BELOW the current rows, so the list stays
  // newest-first overall. The active filters travel with the cursor.
  const loadOlder = async () => {
    if (cursor === null || loading || loadingOlder) { return; }
    const controller = startRequest();
    const { signal } = controller;
    setLoadingOlder(true);
    setAppendError(null);
    try {
      const result = await fetchReport(projectId, filters, cursor, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setAppendError(result.message);
        return;
      }
      if (result.page.next_cursor === null) {
        focusFootAfterAppend.current = true;
      }
      setItems(current => [...current, ...result.page.items]);
      setTotals(result.page.totals);
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

  const retry = () => {
    void loadFirstPage(filters, startRequest());
  };

  const hasActiveFilters = hasActiveReportFilters(filters);
  // `error` is the FIRST-PAGE error only. An append failure is `appendError`
  // and is deliberately invisible to the resolver — it must not collapse the
  // view. `loading` is checked separately below: the plan requires a DISTINCT
  // skeleton state (totals show "—", not stale numbers) rather than dimming
  // the previous filter's rows the way `RunHistoryView` does, because BK-38's
  // totals are filter-reactive (D2) and showing the OLD filter's numbers under
  // a freshly pressed chip would be a plain untruth.
  const viewState = resolveReportViewState({ error: error !== null, rowCount: items.length, hasActiveFilters });

  const olderIdleLabel = appendError === null ? 'Load older runs' : 'Try again';
  const olderLabel = loadingOlder ? 'Loading…' : olderIdleLabel;

  return (
    <div data-testid="project-runs-report-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">

          {/* Filters — date range, module, status (multi), executor (multi).
              Deliberately NEVER disabled, including while a filter change is
              in flight: `startRequest()` already supersedes the in-flight
              query, so a rapid second change is safe. */}
          <div
            role="group"
            aria-label="Run filters"
            data-testid="report-filters"
            className="flex flex-wrap items-end gap-4"
          >
            <div className="flex flex-col gap-1">
              <label htmlFor="report-date-from" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">
                Date range
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="report-date-from"
                  type="date"
                  aria-label="From date"
                  data-testid="report-filter-date-from"
                  value={filters.dateFrom ?? ''}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-[138px] font-mono text-xs"
                />
                <span className="text-xs text-fg-4">→</span>
                <Input
                  id="report-date-to"
                  type="date"
                  aria-label="To date"
                  data-testid="report-filter-date-to"
                  value={filters.dateTo ?? ''}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-[138px] font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="report-filter-module" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">
                Module
              </label>
              <select
                id="report-filter-module"
                data-testid="report-filter-module"
                value={filters.moduleId ?? ''}
                onChange={e => setModuleId(e.target.value)}
                className="flex h-8 w-[172px] rounded-2 border border-stroke-2 bg-surface-2 px-2.5 text-sm text-fg-1 transition-colors duration-token ease-token hover:border-stroke-3 focus-visible:border-accent focus-visible:bg-surface-3 focus-visible:outline-none"
              >
                <option value="">All modules</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span id="report-status-label" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">
                Status
              </span>
              <div
                role="group"
                aria-labelledby="report-status-label"
                data-testid="report-filter-status"
                className="inline-flex overflow-hidden rounded-2 border border-stroke-2 bg-surface-2"
              >
                {REPORT_STATUS_VALUES.map(status => (
                  <button
                    key={status}
                    type="button"
                    data-testid={`report-status-${status}`}
                    aria-pressed={filters.status.includes(status)}
                    onClick={() => toggleStatus(status)}
                    className={`inline-flex h-6.5 items-center gap-1.5 border-r border-stroke-1 px-2.5 text-xs font-medium tracking-[0.02em] transition-colors duration-token ease-token last:border-r-0 ${
                      filters.status.includes(status)
                        ? 'bg-surface-5 text-fg-0'
                        : 'text-fg-2 hover:bg-surface-4 hover:text-fg-1'
                    }`}
                  >
                    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`} />
                    {STATUS_FILTER_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span id="report-executor-label" className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3">
                Executor
              </span>
              <div
                role="group"
                aria-labelledby="report-executor-label"
                data-testid="report-filter-executor"
                className="inline-flex overflow-hidden rounded-2 border border-stroke-2 bg-surface-2"
              >
                {REPORT_EXECUTOR_VALUES.map(executor => (
                  <button
                    key={executor}
                    type="button"
                    data-testid={`report-executor-${executor}`}
                    aria-pressed={filters.executor.includes(executor)}
                    onClick={() => toggleExecutor(executor)}
                    className={`inline-flex h-6.5 items-center border-r border-stroke-1 px-2.5 text-xs font-medium tracking-[0.02em] transition-colors duration-token ease-token last:border-r-0 ${
                      filters.executor.includes(executor)
                        ? 'bg-surface-5 text-fg-0'
                        : 'text-fg-2 hover:bg-surface-4 hover:text-fg-1'
                    }`}
                  >
                    {EXECUTOR_LABEL[executor]}
                  </button>
                ))}
              </div>
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="report-clear-filters"
                className="ml-auto"
                onClick={clearFilters}
              >
                <X size={12} />
                Clear filters
              </Button>
            )}
          </div>

          {/* Totals — Passed/Failed straight from the API's `totals` object,
              NEVER computed client-side (Technical Decision D2). No Aborted
              chip: see the `RunReportTotals` doc comment above for why. */}
          <div
            data-testid="report-totals"
            aria-live="polite"
            aria-busy={loading}
            className="flex flex-wrap items-center gap-3"
          >
            <TotalChip label="Passed" count={loading ? null : totals.passed} icon={Check} tone="pass" testId="report-total-passed" />
            <TotalChip label="Failed" count={loading ? null : totals.failed} icon={X} tone="fail" testId="report-total-failed" />
            <span className="text-xs text-fg-3" data-testid="report-scope-label">
              {loading
                ? (
                    <>
                      Fetching runs
                      <span aria-hidden="true" className="ml-1 inline-block h-3.5 w-[7px] animate-caret-blink bg-fg-3 align-text-bottom" />
                    </>
                  )
                : reportScopeLabel(items.length, cursor !== null)}
            </span>
          </div>

          <Card className="overflow-hidden">
            {loading && <ReportSkeletonRows />}

            {!loading && viewState === 'error' && (
              <div data-testid="report-error" className="flex flex-col items-start gap-3 p-4">
                <p className="text-sm text-fg-2">{error}</p>
                <Button
                  type="button"
                  size="sm"
                  data-testid="report-retry"
                  disabled={loading}
                  onClick={retry}
                >
                  <RefreshCw size={13} />
                  Retry
                </Button>
              </div>
            )}

            {!loading && viewState === 'empty-no-runs' && (() => {
              const copy = resolveReportEmptyStateCopy('empty-no-runs');
              return (
                <div data-testid="report-empty-no-runs" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <Inbox size={18} className="text-fg-3" />
                  <span className="text-md font-semibold text-fg-1">{copy.title}</span>
                  <span className="max-w-[46ch] text-sm text-fg-3">{copy.description}</span>
                </div>
              );
            })()}

            {!loading && viewState === 'empty-no-match' && (() => {
              const copy = resolveReportEmptyStateCopy('empty-no-match');
              return (
                <div data-testid="report-empty-no-match" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <SearchX size={18} className="text-fg-3" />
                  <span className="text-md font-semibold text-fg-1">{copy.title}</span>
                  <span className="max-w-[46ch] text-sm text-fg-3">{copy.description}</span>
                  <Button type="button" size="sm" data-testid="report-empty-no-match-clear" onClick={clearFilters}>
                    <X size={12} />
                    Clear all filters
                  </Button>
                </div>
              );
            })()}

            {!loading && viewState === 'rows' && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Run', 'Test', 'Module', 'Environment', 'Executor', 'Outcome', 'Ran'].map(column => (
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
                    <tbody data-testid="report-rows">
                      {items.map(run => <ReportRow key={run.id} run={run} />)}
                    </tbody>
                  </table>
                </div>

                {(cursor !== null || appendError !== null) && (
                  <div className="flex flex-col items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2">
                    {appendError !== null && (
                      <p data-testid="report-append-error" className="text-center text-sm text-fg-2">{appendError}</p>
                    )}
                    {cursor !== null && (
                      <Button
                        type="button"
                        size="sm"
                        data-testid="report-load-older"
                        disabled={loading || loadingOlder}
                        onClick={() => { void loadOlder(); }}
                      >
                        {appendError === null ? <ArrowDown size={12} /> : <RefreshCw size={13} />}
                        {olderLabel}
                      </Button>
                    )}
                  </div>
                )}

                <div
                  ref={footRef}
                  tabIndex={-1}
                  aria-live="polite"
                  data-testid="report-table-foot"
                  className="flex items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2 font-mono text-xs text-fg-3 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {reportTableFootText(items.length, filters)}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ReportRow({ run }: { run: RunReportItem }) {
  const ExecutorIcon = EXECUTOR_ICON[run.executor_mode] ?? User;

  return (
    <tr
      data-testid={`report-row-${run.id}`}
      className="transition-colors duration-token ease-token hover:bg-surface-3"
    >
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs font-medium text-fg-0" title={run.id}>{run.id.slice(0, 8)}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="max-w-[320px] truncate text-sm text-fg-1" title={run.test_title}>{run.test_title}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-1">
          {run.module_name ?? '—'}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2">{run.environment_name ?? 'unknown env'}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-1">
          <ExecutorIcon size={13} className="shrink-0 text-fg-2" />
          {EXECUTOR_LABEL[run.executor_mode] ?? run.executor_mode}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="status-chip" data-status={STATUS_TOKEN[run.status]}>
          <span className="dot" data-status={STATUS_TOKEN[run.status]} />
          {STATUS_LABEL[run.status]}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2" title={run.started_at}>{formatRanAt(run.started_at)}</span>
      </td>
    </tr>
  );
}

function TotalChip({ label, count, icon: Icon, tone, testId }: {
  label: string
  count: number | null
  icon: LucideIcon
  tone: 'pass' | 'fail'
  testId: string
}) {
  const tint = tone === 'pass' ? 'bg-signal-pass-bg' : 'bg-signal-fail-bg';
  const ink = tone === 'pass' ? 'text-signal-pass' : 'text-signal-fail';

  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 rounded-2 border border-stroke-2 px-2.5 py-1 text-sm text-fg-1 ${tint}`}
    >
      <Icon size={13} className={`shrink-0 ${ink}`} />
      {label}
      {' '}
      <span className="font-mono font-semibold text-fg-0">{count === null ? '—' : count}</span>
    </span>
  );
}

// Skeleton rows shown WHILE a filter change is in flight — a DISTINCT state
// from the mockup's request (not a dim-existing-rows treatment, because
// totals are filter-reactive here and the previous filter's numbers would be
// a stale, misleading answer under a freshly pressed chip).
function ReportSkeletonRows() {
  const widths = ['64px', '220px', '130px', '150px', '70px', '76px', '110px'];
  return (
    <div data-testid="report-loading" aria-hidden="true">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {['Run', 'Test', 'Module', 'Environment', 'Executor', 'Outcome', 'Ran'].map(column => (
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
      </table>
      {[0, 1, 2, 3].map(row => (
        <div key={row} className="flex items-center gap-4 border-t border-stroke-1 px-3 py-2">
          {widths.map((width, i) => (
            <span
              key={i}
              className="h-3 animate-status-pulse rounded-1 bg-surface-3"
              style={{ width }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Suspense fallback for `runs/page.tsx`'s async section, following the
// `RunHistorySkeleton` precedent: a static skeleton not gated by the same
// async read as the real table, so it paints immediately.
export function ProjectRunsReportSkeleton() {
  return (
    <div data-testid="project-runs-report-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="flex items-end gap-4">
            <div className="h-11 w-[300px] animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-11 w-[172px] animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-11 w-40 animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-11 w-32 animate-status-pulse rounded-2 bg-surface-3" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-24 animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-6 w-24 animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-6 w-48 animate-status-pulse rounded-2 bg-surface-3" />
          </div>
          <Card className="flex flex-col gap-2 p-4">
            <div className="h-3 w-full animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-5/6 animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-4/6 animate-status-pulse rounded-1 bg-surface-3" />
            <div className="h-3 w-3/6 animate-status-pulse rounded-1 bg-surface-3" />
          </Card>
        </div>
      </div>
    </div>
  );
}
