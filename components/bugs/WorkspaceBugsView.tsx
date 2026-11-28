'use client';

import type { BugSeverity, BugStatus } from '@lib/bugs/constants';
import type { BugAggregates } from '@lib/bugs/list-view';
import type { WorkspaceBugFilters, WorkspaceBugItem, WorkspaceBugsPage } from '@lib/bugs/workspace-bugs-constants';
import { CountChip, FilterChip, SEVERITY_FILTER_TONE, STATUS_FILTER_LABEL, STATUS_FILTER_TONE } from '@components/bugs/BugsListView';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { Select } from '@components/ui/select';
import { BUG_SEVERITY_LABEL, BUG_SEVERITY_VALUES, BUG_STATUS_VALUES } from '@lib/bugs/constants';
import { EMPTY_WORKSPACE_BUG_FILTERS } from '@lib/bugs/workspace-bugs-constants';
import {
  buildWorkspaceBugsParams,
  formatWorkspaceBugRow,
  hasActiveWorkspaceBugFilters,
  resolveWorkspaceBugsViewState,
  WORKSPACE_BUGS_EMPTY_COPY,
  WORKSPACE_BUGS_ERROR_MESSAGE,
  workspaceBugsFootText,
} from '@lib/bugs/workspace-bugs-view';
import { cn } from '@lib/utils';
import { ArrowDown, Inbox, Play, RefreshCw, SearchX, User, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

// BK-555 — the workspace-wide Bug Reports index (`/bugs`). The workspace
// sibling of the Project bug list (`BugsListView`, BK-41), built from the same
// live atoms per master-design-plan §5 D70: the status and severity filter
// chips, the count chips, the `.status-chip` severity and status, the table,
// the skeleton and the empty, no-match and error blocks, under the Runs index
// page header (§4.27). Added here: a Project filter, a Project column and an
// Origin column. No module filter (AI Product Owner ruling Q3, 2026-08-19).
//
// The first page is read on the server; this view owns every later query (a
// filter change, Retry, "Load more defects") through
// GET /api/v1/workspaces/{id}/bugs. It only reads: a row opens the defect's
// record inside its owning Project, and no control assigns, advances or edits.

interface WorkspaceBugsViewProps {
  workspaceId: string
  projects: { id: string, name: string }[]
  initialPage: WorkspaceBugsPage
  initialError?: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

const COLUMNS = ['Defect', 'Title', 'Project', 'Module', 'Severity', 'Status', 'Assignee', 'Origin'];

const LABEL_CLASS = 'text-2xs font-semibold uppercase tracking-[0.04em] text-fg-2';
const TH_CLASS = 'whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3';
const TD_CLASS = 'whitespace-nowrap border-t border-stroke-1 px-3 py-1.5';
const LINK_CLASS = 'rounded-1 underline decoration-transparent underline-offset-2 transition-colors duration-token ease-token focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent';

async function fetchPage(
  workspaceId: string,
  filters: WorkspaceBugFilters,
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ ok: true, page: WorkspaceBugsPage } | { ok: false, message: string }> {
  const params = buildWorkspaceBugsParams(filters, cursor);
  const response = await fetch(`/api/v1/workspaces/${workspaceId}/bugs?${params}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    return { ok: false, message: body.error?.message ?? WORKSPACE_BUGS_ERROR_MESSAGE };
  }
  return { ok: true, page: (await response.json()) as WorkspaceBugsPage };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export function WorkspaceBugsView({ workspaceId, projects, initialPage, initialError = null }: WorkspaceBugsViewProps) {
  const [filters, setFilters] = useState<WorkspaceBugFilters>(EMPTY_WORKSPACE_BUG_FILTERS);
  const [items, setItems] = useState<WorkspaceBugItem[]>(initialPage.data);
  const [aggregates, setAggregates] = useState<BugAggregates>(initialPage.aggregates);
  const [cursor, setCursor] = useState<string | null>(initialPage.next_cursor);
  const [total, setTotal] = useState<number | null>(initialError === null ? initialPage.workspace_bug_count : null);
  const [error, setError] = useState<string | null>(initialError);
  // A failed "load more" keeps the rows already loaded (BK-41 / BK-513 split).
  const [appendError, setAppendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // At most one request is useful: a newer one supersedes whatever is in
  // flight, so a late answer can never overwrite a newer filter.
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

  const loadFirstPage = useCallback(async (nextFilters: WorkspaceBugFilters, controller: AbortController) => {
    const { signal } = controller;
    setLoading(true);
    setError(null);
    setLoadingMore(false);
    setAppendError(null);
    try {
      const result = await fetchPage(workspaceId, nextFilters, null, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.page.data);
      setAggregates(result.page.aggregates);
      setCursor(result.page.next_cursor);
      setTotal(result.page.workspace_bug_count);
    }
    catch {
      if (signal.aborted) { return; }
      setError(WORKSPACE_BUGS_ERROR_MESSAGE);
    }
    finally {
      if (inFlight.current === controller) {
        setLoading(false);
      }
    }
  }, [workspaceId]);

  // Re-query page 1 on every filter change. The first run is skipped: the
  // server already delivered the unfiltered page 1.
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

  // Move focus off "Load more defects" when the final append unmounts it.
  useEffect(() => {
    if (focusFootAfterAppend.current && cursor === null) {
      focusFootAfterAppend.current = false;
      footRef.current?.focus({ preventScroll: true });
    }
  }, [cursor]);

  const clearFilters = () => {
    setCursor(null);
    setFilters(EMPTY_WORKSPACE_BUG_FILTERS);
  };

  // Append the next keyset page below the current rows; the filters travel
  // with the cursor, so the list stays most-severe-first and filtered overall.
  const loadMore = async () => {
    if (cursor === null || loading || loadingMore) { return; }
    const controller = startRequest();
    const { signal } = controller;
    setLoadingMore(true);
    setAppendError(null);
    try {
      const result = await fetchPage(workspaceId, filters, cursor, signal);
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
      setTotal(result.page.workspace_bug_count);
    }
    catch {
      if (signal.aborted) { return; }
      setAppendError(WORKSPACE_BUGS_ERROR_MESSAGE);
    }
    finally {
      if (inFlight.current === controller) {
        setLoadingMore(false);
      }
    }
  };

  // Retry re-runs the same query with the filters still applied (AC-17).
  const retry = () => {
    void loadFirstPage(filters, startRequest());
  };

  const hasActiveFilters = hasActiveWorkspaceBugFilters(filters);
  const viewState = resolveWorkspaceBugsViewState({ error: error !== null, rowCount: items.length, hasActiveFilters });
  const filteredTotal = Object.values(aggregates.by_status).reduce((sum, n) => sum + n, 0);
  const moreLabel = loadingMore ? 'Loading…' : appendError === null ? 'Load more defects' : 'Try again';

  return (
    <div data-testid="workspace-bugs-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">
          {/* Filters: Project, status (multi), severity (multi). Never disabled
              while a query is in flight: a newer request supersedes the older.
              Not rendered without a workspace: there is nothing to query, so
              a filter could only turn the empty state into a false error. */}
          {workspaceId !== '' && (
            <div
              role="group"
              aria-label="Defect filters"
              data-testid="workspace-bugs-filters"
              className="flex flex-wrap items-end gap-4 rounded-3 border border-stroke-2 bg-surface-2 p-3 shadow-card"
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="workspace-bugs-filter-project" className={LABEL_CLASS}>Project</label>
                <Select
                  id="workspace-bugs-filter-project"
                  data-testid="workspace-bugs-filter-project"
                  value={filters.projectId ?? ''}
                  onChange={e => setFilters(prev => ({ ...prev, projectId: e.target.value === '' ? null : e.target.value }))}
                  className="min-w-[200px]"
                >
                  <option value="">All projects</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <span id="workspace-bugs-status-label" className={LABEL_CLASS}>Status</span>
                <div role="group" aria-labelledby="workspace-bugs-status-label" className="flex flex-wrap gap-1.5">
                  {BUG_STATUS_VALUES.map((value: BugStatus) => (
                    <FilterChip
                      key={value}
                      pressed={filters.statuses.includes(value)}
                      tone={STATUS_FILTER_TONE[value]}
                      label={STATUS_FILTER_LABEL[value]}
                      onClick={() => setFilters(prev => ({ ...prev, statuses: toggle(prev.statuses, value) }))}
                      testId={`workspace-bugs-filter-status-${value}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span id="workspace-bugs-severity-label" className={LABEL_CLASS}>Severity</span>
                <div role="group" aria-labelledby="workspace-bugs-severity-label" className="flex flex-wrap gap-1.5">
                  {BUG_SEVERITY_VALUES.map((value: BugSeverity) => (
                    <FilterChip
                      key={value}
                      pressed={filters.severities.includes(value)}
                      tone={SEVERITY_FILTER_TONE[value]}
                      label={(
                        <>
                          <span className="font-mono">{value}</span>
                          {' '}
                          {BUG_SEVERITY_LABEL[value]}
                        </>
                      )}
                      onClick={() => setFilters(prev => ({ ...prev, severities: toggle(prev.severities, value) }))}
                      testId={`workspace-bugs-filter-severity-${value}`}
                    />
                  ))}
                </div>
              </div>

              {hasActiveFilters && (
                <Button type="button" variant="ghost" size="sm" data-testid="workspace-bugs-clear-filters" className="ml-auto" onClick={clearFilters}>
                  <X size={12} />
                  Clear filters
                </Button>
              )}
            </div>
          )}

          <span className="text-xs text-fg-3" aria-live="polite" aria-busy={loading} data-testid="workspace-bugs-count-label">
            {loading
              ? (
                  <>
                    Fetching defects
                    <span aria-hidden="true" className="ml-1 inline-block h-3.5 w-[7px] animate-caret-blink bg-fg-3 align-text-bottom" />
                  </>
                )
              : total === null
                ? null
                : `${total} ${total === 1 ? 'defect' : 'defects'} in this workspace`}
          </span>

          {/* Counts over the WHOLE filtered set (AC-12), shown in every
              non-error state so a no-match reads as zeros, not as nothing. */}
          {viewState !== 'error' && !loading && (
            <div data-testid="workspace-bugs-counts" aria-live="polite" className="flex flex-wrap items-center gap-3 text-sm">
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
                  testId={`workspace-bugs-count-severity-${value}`}
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
                  testId={`workspace-bugs-count-status-${value}`}
                />
              ))}
            </div>
          )}

          <Card className="overflow-hidden">
            {loading && <WorkspaceBugsSkeletonRows />}

            {!loading && viewState === 'error' && (
              <div data-testid="workspace-bugs-error" role="alert" className="flex flex-col items-start gap-3 p-4">
                <p className="text-sm text-fg-2">{error}</p>
                <Button type="button" size="sm" data-testid="workspace-bugs-retry" onClick={retry}>
                  <RefreshCw size={13} />
                  Retry
                </Button>
              </div>
            )}

            {!loading && viewState === 'empty-workspace' && (
              <div data-testid="workspace-bugs-empty" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Inbox size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{WORKSPACE_BUGS_EMPTY_COPY['empty-workspace'].title}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">{WORKSPACE_BUGS_EMPTY_COPY['empty-workspace'].description}</span>
              </div>
            )}

            {!loading && viewState === 'empty-no-match' && (
              <div data-testid="workspace-bugs-no-match" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <SearchX size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{WORKSPACE_BUGS_EMPTY_COPY['empty-no-match'].title}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">{WORKSPACE_BUGS_EMPTY_COPY['empty-no-match'].description}</span>
                <Button type="button" size="sm" data-testid="workspace-bugs-no-match-clear" onClick={clearFilters}>
                  <X size={12} />
                  Clear all filters
                </Button>
              </div>
            )}

            {!loading && viewState === 'rows' && (
              <>
                <div className="scroll-edge-x overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {COLUMNS.map(column => <th key={column} scope="col" className={TH_CLASS}>{column}</th>)}
                      </tr>
                    </thead>
                    <tbody data-testid="workspace-bugs-rows">
                      {items.map(bug => <WorkspaceBugRowView key={bug.id} bug={bug} />)}
                    </tbody>
                  </table>
                </div>

                {(cursor !== null || appendError !== null) && (
                  <div className="flex flex-col items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2">
                    {appendError !== null && (
                      <p data-testid="workspace-bugs-append-error" className="text-center text-sm text-fg-2">{appendError}</p>
                    )}
                    {cursor !== null && (
                      <Button
                        type="button"
                        size="sm"
                        data-testid="workspace-bugs-load-more"
                        disabled={loading || loadingMore}
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
                  data-testid="workspace-bugs-table-foot"
                  className="flex items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2 font-mono text-xs text-fg-3 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {workspaceBugsFootText(items.length, filteredTotal, cursor !== null)}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function WorkspaceBugRowView({ bug }: { bug: WorkspaceBugItem }) {
  const row = formatWorkspaceBugRow(bug);
  const openTitle = `Open this defect in ${row.projectName}`;

  return (
    <tr data-testid={`workspace-bugs-row-${row.id}`} className="transition-colors duration-token ease-token hover:bg-surface-3">
      <td className={TD_CLASS}>
        {row.href === null
          ? <span className="font-mono text-xs font-medium text-fg-0" title={row.id}>{row.id.slice(0, 8)}</span>
          : (
              <Link
                href={row.href}
                title={row.id}
                aria-label={`Defect ${row.id.slice(0, 8)}, open in ${row.projectName}`}
                data-testid={`workspace-bugs-open-${row.id}`}
                className={cn('font-mono text-xs font-medium text-fg-0 hover:decoration-fg-0', LINK_CLASS)}
              >
                {row.id.slice(0, 8)}
              </Link>
            )}
      </td>
      <td className={TD_CLASS}>
        {row.href === null
          ? <span className="block max-w-[300px] truncate text-sm text-fg-1" title={row.title}>{row.title}</span>
          : (
              <Link
                href={row.href}
                title={openTitle}
                data-testid={`workspace-bugs-title-${row.id}`}
                className={cn('block max-w-[300px] truncate text-sm text-fg-0 hover:decoration-fg-0', LINK_CLASS)}
              >
                {row.title}
              </Link>
            )}
      </td>
      <td className={TD_CLASS}>
        <span className="text-sm text-fg-1">{row.projectName}</span>
      </td>
      <td className={TD_CLASS}>
        <span className="font-mono text-xs text-fg-2">{row.modulePath}</span>
      </td>
      <td className={TD_CLASS}>
        <span className="status-chip" data-status={row.severityToken}>
          <span className="dot" data-status={row.severityToken} />
          {row.severity}
          {' · '}
          {row.severityLabel}
        </span>
      </td>
      <td className={TD_CLASS}>
        <span className="status-chip" data-status={row.statusToken}>
          <span className="dot" data-status={row.statusToken} />
          {row.statusLabel}
        </span>
      </td>
      <td className={TD_CLASS}>
        <span data-testid={`workspace-bugs-assignee-${row.id}`} className="text-xs text-fg-2">{row.assigneeLabel}</span>
      </td>
      <td className={TD_CLASS}>
        <span data-testid={`workspace-bugs-origin-${row.id}`} className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-2">
          {row.fromRun
            ? <Play size={11} aria-hidden="true" className="shrink-0" />
            : <User size={11} aria-hidden="true" className="shrink-0" />}
          {row.originLabel}
        </span>
      </td>
    </tr>
  );
}

function WorkspaceBugsSkeletonRows() {
  const widths = ['64px', '220px', '110px', '120px', '96px', '86px', '120px', '90px'];
  return (
    <div data-testid="workspace-bugs-loading" aria-hidden="true">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map(column => <th key={column} scope="col" className={TH_CLASS}>{column}</th>)}
          </tr>
        </thead>
      </table>
      {[0, 1, 2, 3].map(row => (
        <div key={row} className="flex items-center gap-4 border-t border-stroke-1 px-3 py-2">
          {widths.map((width, i) => (
            <span key={i} className="h-3 animate-status-pulse rounded-1 bg-surface-3" style={{ width }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Suspense fallback for the `/bugs` page's async section: a static skeleton
// that paints before the first-page read resolves (AC-16).
export function WorkspaceBugsSkeleton() {
  return (
    <div data-testid="workspace-bugs-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="h-16 w-full animate-status-pulse rounded-3 bg-surface-3" />
          <div className="h-4 w-40 animate-status-pulse rounded-1 bg-surface-3" />
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
