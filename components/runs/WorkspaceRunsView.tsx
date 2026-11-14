'use client';

import type { WorkspaceRunFilters, WorkspaceRunItem, WorkspaceRunMode, WorkspaceRunOutcome, WorkspaceRunsPage, WorkspaceRunStatus } from '@lib/runs/workspace-runs-constants';
import { RunModeBadge } from '@components/runs/RunModeBadge';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { Select } from '@components/ui/select';
import { RUN_MODE_LABEL } from '@lib/runs/run-mode';
import { EMPTY_WORKSPACE_RUN_FILTERS, WORKSPACE_RUN_MODE_VALUES, WORKSPACE_RUN_OUTCOME_VALUES } from '@lib/runs/workspace-runs-constants';
import {
  buildWorkspaceRunsParams,
  hasActiveWorkspaceRunFilters,
  resolveWorkspaceRunsViewState,
  WORKSPACE_RUNS_EMPTY_COPY,
  WORKSPACE_RUNS_ERROR_MESSAGE,
  workspaceRunsFootText,
} from '@lib/runs/workspace-runs-view';
import { ArrowDown, Bot, Inbox, RefreshCw, SearchX, User, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

// BK-513 — the workspace-wide Runs index (`/runs`). The workspace sibling of
// the Project run report (`ProjectRunsReportView`, BK-38), built from the same
// live atoms per master-design-plan §5 D66: the filter group and segmented
// controls, the `.status-chip` outcome, `RunModeBadge`, the table, the
// skeleton, the empty / no-match blocks and the error block with Retry. Added
// here: a Project column, a Steps column and a Finished column. No totals
// strip: workspace totals are out of scope.
//
// The first page is read on the server; this view owns every later query (a
// filter change, Retry, "Load older runs") through
// GET /api/v1/workspaces/{id}/runs. It only reads: a row opens the Run inside
// its owning Project.

interface WorkspaceRunsViewProps {
  workspaceId: string
  projects: { id: string, name: string }[]
  environments: string[]
  initialPage: WorkspaceRunsPage
  initialError?: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

const STATUS_TOKEN: Record<WorkspaceRunStatus, string> = {
  passed: 'pass',
  failed: 'fail',
  aborted: 'aborted',
  running: 'running',
};

const STATUS_LABEL: Record<WorkspaceRunStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
  aborted: 'Aborted',
  running: 'Running',
};

const OUTCOME_DOT_CLASS: Record<WorkspaceRunOutcome, string> = {
  passed: 'bg-signal-pass',
  failed: 'bg-signal-fail',
};

const COLUMNS = ['Run', 'Test', 'Project', 'Environment', 'Mode', 'Outcome', 'Steps', 'Started', 'Finished'];

const SEGMENT_CLASS = 'inline-flex h-6.5 items-center gap-1.5 border-r border-stroke-1 px-2.5 text-xs font-medium tracking-[0.02em] transition-colors duration-token ease-token last:border-r-0';
const SEGMENT_ON = 'bg-surface-5 text-fg-0';
const SEGMENT_OFF = 'text-fg-2 hover:bg-surface-4 hover:text-fg-1';
const LABEL_CLASS = 'text-2xs font-medium uppercase tracking-[0.06em] text-fg-3';
const TH_CLASS = 'whitespace-nowrap border-b border-stroke-2 bg-surface-1 px-3 py-2 text-left text-2xs font-medium uppercase tracking-[0.06em] text-fg-3';
const TD_CLASS = 'whitespace-nowrap border-t border-stroke-1 px-3 py-1.5';

// Deterministic UTC rendering (BK-37/BK-38 precedent): a client component that
// server-renders its first paint must not drift between server and browser
// timezones.
function formatAt(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

async function fetchPage(
  workspaceId: string,
  filters: WorkspaceRunFilters,
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ ok: true, page: WorkspaceRunsPage } | { ok: false, message: string }> {
  const params = buildWorkspaceRunsParams(filters, cursor);
  const response = await fetch(`/api/v1/workspaces/${workspaceId}/runs?${params}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    return { ok: false, message: body.error?.message ?? WORKSPACE_RUNS_ERROR_MESSAGE };
  }
  return { ok: true, page: (await response.json()) as WorkspaceRunsPage };
}

export function WorkspaceRunsView({ workspaceId, projects, environments, initialPage, initialError = null }: WorkspaceRunsViewProps) {
  const [filters, setFilters] = useState<WorkspaceRunFilters>(EMPTY_WORKSPACE_RUN_FILTERS);
  const [items, setItems] = useState<WorkspaceRunItem[]>(initialPage.items);
  const [cursor, setCursor] = useState<string | null>(initialPage.next_cursor);
  const [total, setTotal] = useState<number | null>(initialError === null ? initialPage.workspace_run_count : null);
  const [error, setError] = useState<string | null>(initialError);
  // A failed "load older" keeps the rows already loaded (BK-37/BK-38 split).
  const [appendError, setAppendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // At most one request is useful: a newer one supersedes whatever is in flight.
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

  const loadFirstPage = useCallback(async (nextFilters: WorkspaceRunFilters, controller: AbortController) => {
    const { signal } = controller;
    setLoading(true);
    setError(null);
    setLoadingOlder(false);
    setAppendError(null);
    try {
      const result = await fetchPage(workspaceId, nextFilters, null, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.page.items);
      setCursor(result.page.next_cursor);
      setTotal(result.page.workspace_run_count);
    }
    catch {
      if (signal.aborted) { return; }
      setError(WORKSPACE_RUNS_ERROR_MESSAGE);
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

  // Move focus off "Load older runs" when the final append unmounts it.
  useEffect(() => {
    if (focusFootAfterAppend.current && cursor === null) {
      focusFootAfterAppend.current = false;
      footRef.current?.focus();
    }
  }, [cursor]);

  const toggleStatus = (value: WorkspaceRunOutcome) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status.includes(value) ? prev.status.filter(v => v !== value) : [...prev.status, value],
    }));
  };

  const clearFilters = () => {
    setCursor(null);
    setFilters(EMPTY_WORKSPACE_RUN_FILTERS);
  };

  // Append the next keyset page below the current rows; the filters travel
  // with the cursor, so the list stays newest-first and filtered overall.
  const loadOlder = async () => {
    if (cursor === null || loading || loadingOlder) { return; }
    const controller = startRequest();
    const { signal } = controller;
    setLoadingOlder(true);
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
      setItems(current => [...current, ...result.page.items]);
      setCursor(result.page.next_cursor);
      setTotal(result.page.workspace_run_count);
    }
    catch {
      if (signal.aborted) { return; }
      setAppendError(WORKSPACE_RUNS_ERROR_MESSAGE);
    }
    finally {
      if (inFlight.current === controller) {
        setLoadingOlder(false);
      }
    }
  };

  // Retry re-runs the same query with the filters still applied (AC-17).
  const retry = () => {
    void loadFirstPage(filters, startRequest());
  };

  const hasActiveFilters = hasActiveWorkspaceRunFilters(filters);
  const viewState = resolveWorkspaceRunsViewState({ error: error !== null, rowCount: items.length, hasActiveFilters });
  const olderLabel = loadingOlder ? 'Loading…' : appendError === null ? 'Load older runs' : 'Try again';

  return (
    <div data-testid="workspace-runs-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">
          {/* Filters: Project, environment, outcome (multi), mode. Never
              disabled while a query is in flight: a newer request supersedes
              the older one. */}
          <div role="group" aria-label="Run filters" data-testid="workspace-runs-filters" className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="workspace-runs-filter-project" className={LABEL_CLASS}>Project</label>
              <Select
                id="workspace-runs-filter-project"
                data-testid="workspace-runs-filter-project"
                value={filters.projectId ?? ''}
                onChange={e => setFilters(prev => ({ ...prev, projectId: e.target.value === '' ? null : e.target.value }))}
                className="flex w-[172px]"
              >
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="workspace-runs-filter-environment" className={LABEL_CLASS}>Environment</label>
              <Select
                id="workspace-runs-filter-environment"
                data-testid="workspace-runs-filter-environment"
                value={filters.environment ?? ''}
                onChange={e => setFilters(prev => ({ ...prev, environment: e.target.value === '' ? null : e.target.value }))}
                className="flex w-[172px]"
              >
                <option value="">All environments</option>
                {environments.map(name => <option key={name} value={name}>{name}</option>)}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <span id="workspace-runs-outcome-label" className={LABEL_CLASS}>Outcome</span>
              <div
                role="group"
                aria-labelledby="workspace-runs-outcome-label"
                data-testid="workspace-runs-filter-outcome"
                className="inline-flex overflow-hidden rounded-2 border border-stroke-2 bg-surface-2"
              >
                {WORKSPACE_RUN_OUTCOME_VALUES.map(status => (
                  <button
                    key={status}
                    type="button"
                    data-testid={`workspace-runs-outcome-${status}`}
                    aria-pressed={filters.status.includes(status)}
                    onClick={() => toggleStatus(status)}
                    className={`${SEGMENT_CLASS} ${filters.status.includes(status) ? SEGMENT_ON : SEGMENT_OFF}`}
                  >
                    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${OUTCOME_DOT_CLASS[status]}`} />
                    {STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span id="workspace-runs-mode-label" className={LABEL_CLASS}>Mode</span>
              <div
                role="group"
                aria-labelledby="workspace-runs-mode-label"
                data-testid="workspace-runs-filter-mode"
                className="inline-flex overflow-hidden rounded-2 border border-stroke-2 bg-surface-2"
              >
                {([null, ...WORKSPACE_RUN_MODE_VALUES] as (WorkspaceRunMode | null)[]).map((mode) => {
                  const ModeIcon = mode === 'manual' ? User : mode === 'automated' ? Bot : null;
                  return (
                    <button
                      key={mode ?? 'all'}
                      type="button"
                      data-testid={`workspace-runs-mode-${mode ?? 'all'}`}
                      aria-pressed={filters.mode === mode}
                      onClick={() => setFilters(prev => ({ ...prev, mode }))}
                      className={`${SEGMENT_CLASS} ${filters.mode === mode ? SEGMENT_ON : SEGMENT_OFF}`}
                    >
                      {ModeIcon !== null && <ModeIcon size={11} aria-hidden="true" className="shrink-0" />}
                      {mode === null ? 'All' : RUN_MODE_LABEL[mode]}
                    </button>
                  );
                })}
              </div>
            </div>

            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" data-testid="workspace-runs-clear-filters" className="ml-auto" onClick={clearFilters}>
                <X size={12} />
                Clear filters
              </Button>
            )}
          </div>

          <span className="text-xs text-fg-3" aria-live="polite" aria-busy={loading} data-testid="workspace-runs-count-label">
            {loading
              ? (
                  <>
                    Fetching runs
                    <span aria-hidden="true" className="ml-1 inline-block h-3.5 w-[7px] animate-caret-blink bg-fg-3 align-text-bottom" />
                  </>
                )
              : total === null
                ? null
                : `${total} ${total === 1 ? 'run' : 'runs'} in this workspace`}
          </span>

          <Card className="overflow-hidden">
            {loading && <WorkspaceRunsSkeletonRows />}

            {!loading && viewState === 'error' && (
              <div data-testid="workspace-runs-error" role="alert" className="flex flex-col items-start gap-3 p-4">
                <p className="text-sm text-fg-2">{error}</p>
                <Button type="button" size="sm" data-testid="workspace-runs-retry" onClick={retry}>
                  <RefreshCw size={13} />
                  Retry
                </Button>
              </div>
            )}

            {!loading && viewState === 'empty-workspace' && (
              <div data-testid="workspace-runs-empty" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Inbox size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{WORKSPACE_RUNS_EMPTY_COPY['empty-workspace'].title}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">{WORKSPACE_RUNS_EMPTY_COPY['empty-workspace'].description}</span>
              </div>
            )}

            {!loading && viewState === 'empty-no-match' && (
              <div data-testid="workspace-runs-no-match" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <SearchX size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{WORKSPACE_RUNS_EMPTY_COPY['empty-no-match'].title}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">{WORKSPACE_RUNS_EMPTY_COPY['empty-no-match'].description}</span>
                <Button type="button" size="sm" data-testid="workspace-runs-no-match-clear" onClick={clearFilters}>
                  <X size={12} />
                  Clear all filters
                </Button>
              </div>
            )}

            {!loading && viewState === 'rows' && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {COLUMNS.map(column => <th key={column} scope="col" className={TH_CLASS}>{column}</th>)}
                      </tr>
                    </thead>
                    <tbody data-testid="workspace-runs-rows">
                      {items.map(run => <WorkspaceRunRow key={run.id} run={run} />)}
                    </tbody>
                  </table>
                </div>

                {(cursor !== null || appendError !== null) && (
                  <div className="flex flex-col items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2">
                    {appendError !== null && (
                      <p data-testid="workspace-runs-append-error" className="text-center text-sm text-fg-2">{appendError}</p>
                    )}
                    {cursor !== null && (
                      <Button
                        type="button"
                        size="sm"
                        data-testid="workspace-runs-load-older"
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
                  data-testid="workspace-runs-table-foot"
                  className="flex items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2 font-mono text-xs text-fg-3 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {workspaceRunsFootText(items.length, hasActiveFilters ? null : total, cursor !== null)}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function WorkspaceRunRow({ run }: { run: WorkspaceRunItem }) {
  const href = run.project_slug === null ? null : `/projects/${run.project_slug}/runs/${run.id}`;
  const steps = `${run.passed_steps} passed, ${run.failed_steps} failed, ${run.blocked_steps} blocked`;

  return (
    <tr data-testid={`workspace-runs-row-${run.id}`} className="transition-colors duration-token ease-token hover:bg-surface-3">
      <td className={TD_CLASS}>
        <span className="font-mono text-xs font-medium text-fg-0" title={run.id}>{run.id.slice(0, 8)}</span>
      </td>
      <td className={TD_CLASS}>
        {href === null
          ? <span className="max-w-[320px] truncate text-sm text-fg-1" title={run.test_title}>{run.test_title}</span>
          : (
              <Link
                href={href}
                data-testid={`workspace-runs-open-${run.id}`}
                title={`Open this run in ${run.project_name ?? 'its project'}`}
                className="block max-w-[320px] truncate rounded-1 text-sm text-fg-0 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
              >
                {run.test_title}
              </Link>
            )}
      </td>
      <td className={TD_CLASS}>
        <span className="text-sm text-fg-1">{run.project_name ?? '—'}</span>
      </td>
      <td className={TD_CLASS}>
        <span className="font-mono text-xs text-fg-2">{run.environment_name ?? 'unknown env'}</span>
      </td>
      <td className={TD_CLASS}>
        <RunModeBadge executorMode={run.executor_mode} />
      </td>
      <td className={TD_CLASS}>
        <span className="status-chip" data-status={STATUS_TOKEN[run.status]}>
          <span className="dot" data-status={STATUS_TOKEN[run.status]} />
          {STATUS_LABEL[run.status]}
        </span>
      </td>
      <td className={TD_CLASS}>
        <span data-testid={`workspace-runs-steps-${run.id}`} aria-label={steps} title={steps} className="inline-flex items-center gap-2.5 font-mono text-xs text-fg-2">
          <StepCount status="pass" count={run.passed_steps} label="passed" />
          <StepCount status="fail" count={run.failed_steps} label="failed" />
          <StepCount status="blocked" count={run.blocked_steps} label="blocked" />
        </span>
      </td>
      <td className={TD_CLASS}>
        <span className="font-mono text-xs text-fg-2" title={run.started_at}>{formatAt(run.started_at)}</span>
      </td>
      <td className={TD_CLASS}>
        <span className="font-mono text-xs text-fg-2" title={run.finished_at ?? 'Still running'}>
          {run.finished_at === null ? '—' : formatAt(run.finished_at)}
        </span>
      </td>
    </tr>
  );
}

// A step count: dot + number + word, so it never relies on colour alone.
function StepCount({ status, count, label }: { status: 'pass' | 'fail' | 'blocked', count: number, label: string }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1">
      <span className="dot" data-status={status} />
      <span className="text-fg-1">{count}</span>
      <span className="text-fg-3">{label}</span>
    </span>
  );
}

function WorkspaceRunsSkeletonRows() {
  const widths = ['64px', '220px', '120px', '90px', '76px', '76px', '150px', '110px', '110px'];
  return (
    <div data-testid="workspace-runs-loading" aria-hidden="true">
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

// Suspense fallback for the `/runs` page's async section: a static skeleton
// that paints before the first-page read resolves (AC-16).
export function WorkspaceRunsSkeleton() {
  return (
    <div data-testid="workspace-runs-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3" aria-hidden="true">
          <div className="flex items-end gap-4">
            <div className="h-11 w-[172px] animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-11 w-[172px] animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-11 w-36 animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-11 w-44 animate-status-pulse rounded-2 bg-surface-3" />
          </div>
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
