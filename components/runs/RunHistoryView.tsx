'use client';

import type { RunHistoryOutcome } from '@lib/runs/history-validation';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { formatRunDuration } from '@lib/runs/duration';
import { RUN_HISTORY_OUTCOMES, RUN_HISTORY_PAGE_SIZE } from '@lib/runs/history-validation';
import {
  capitalizeOutcome,
  resolveRunHistoryViewState,
  RUN_HISTORY_EMPTY_NEVER_RUN,
  runHistoryNoMatchMessage,
} from '@lib/runs/history-view';
import { ArrowDown, Ban, Bot, Check, History, ListX, RefreshCw, Server, User, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

// BK-37 — a Test's Run History: the "Run History" tab of the Test detail route.
// Renders the mockup (`bk-30-test-runs-index/test-run-history.html`) with the
// LIVE design system's tokens and atoms (Critical Rule #14) — notably the
// `.status-chip[data-status]` and `.dot[data-status]` in `app/globals.css`.
//
// Filtering and pagination are BOTH server-side (plan D-D): the mockup's script
// filters only already-loaded rows, which cannot satisfy the AC "the filter
// stays applied across load-more" (60 failed runs -> the next page must be 10
// more FAILED runs). So every filter change and every "load older" re-queries
// `GET /api/v1/tests/{id}/runs`, which scopes the keyset page to the filter.
//
// The first page is fetched SERVER-side by `runs/page.tsx` and handed down as
// `initialPage`, so the screen paints complete with no client waterfall. After
// mount this component owns the list: later prop updates (the RSC re-render that
// `router.replace` triggers) are ignored, because the client has already
// re-queried the same filter and may hold several appended pages.

export interface RunHistoryItem {
  id: string
  status: RunHistoryOutcome
  environment_id: string
  environment_name: string | null
  executor_mode: string
  started_at: string
  finished_at: string | null
}

export interface RunHistoryTotals {
  passed: number
  failed: number
  aborted: number
}

export interface RunHistoryPage {
  items: RunHistoryItem[]
  totals: RunHistoryTotals
  // Opaque page token (base64 of the keyset position), or null on the last page.
  next_cursor: string | null
}

interface RunHistoryViewProps {
  testId: string
  initialPage: RunHistoryPage
  initialOutcome: RunHistoryOutcome | null
  // Set when the SERVER-side first-page read failed; the client renders the
  // error block with a Retry that re-queries through the API route.
  initialError?: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

// Only used when a response carries no `error.message` at all (a proxy 502, a
// truncated body). Any message the server DOES send is rendered verbatim.
const FALLBACK_ERROR_MESSAGE = 'Could not load this Test\'s run history.';

// The API's terminal statuses -> the live `.status-chip` / `.dot` data-status
// tokens. The CSS keys differ from the API verbs, and `aborted` reads as the
// BLOCKED signal here (an anomalous termination, not a failed assertion) per
// master-design-plan §4.8 and the mockup's own summary bar.
const STATUS_TOKEN: Record<RunHistoryOutcome, string> = {
  passed: 'pass',
  failed: 'fail',
  aborted: 'blocked',
};

const OUTCOME_DOT_CLASS: Record<RunHistoryOutcome, string> = {
  passed: 'bg-signal-pass',
  failed: 'bg-signal-fail',
  aborted: 'bg-signal-blocked',
};

// Executor mode is icon + text, never icon alone (DESIGN.md §10: color and
// glyphs are never the sole carrier of meaning). The three modes are the ones
// the `runs_executor_mode` CHECK allows; the fallbacks are defensive only.
const EXECUTOR_LABEL: Record<string, string> = { human: 'Human', agent: 'Agent', ci: 'CI' };
const EXECUTOR_ICON: Record<string, LucideIcon> = { human: User, agent: Bot, ci: Server };

// Deterministic UTC rendering: this is a CLIENT component but still
// server-renders its first paint, so `toLocale*` would drift between the server
// and the browser timezone and trip a hydration mismatch. Slicing the ISO string
// is timezone-stable on both. '2026-07-29T11:52:00+00:00' -> '2026-07-29 11:52'.
function formatRanAt(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

async function fetchRunHistory(
  testId: string,
  outcome: RunHistoryOutcome | null,
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ ok: true, page: RunHistoryPage } | { ok: false, message: string }> {
  const params = new URLSearchParams({ limit: String(RUN_HISTORY_PAGE_SIZE) });
  if (outcome !== null) { params.set('outcome', outcome); }
  if (cursor !== null) { params.set('cursor', cursor); }

  const response = await fetch(`/api/v1/tests/${testId}/runs?${params}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    // Server copy is rendered VERBATIM — never rephrased client-side.
    return { ok: false, message: body.error?.message ?? FALLBACK_ERROR_MESSAGE };
  }
  return { ok: true, page: (await response.json()) as RunHistoryPage };
}

export function RunHistoryView({ testId, initialPage, initialOutcome, initialError = null }: RunHistoryViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [outcome, setOutcome] = useState<RunHistoryOutcome | null>(initialOutcome);
  const [items, setItems] = useState<RunHistoryItem[]>(initialPage.items);
  const [totals, setTotals] = useState<RunHistoryTotals>(initialPage.totals);
  const [cursor, setCursor] = useState<string | null>(initialPage.next_cursor);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // At most one history request is ever useful: a newer one always supersedes
  // whatever is in flight. Holding its controller in a ref lets both the filter
  // effect and the imperative handlers cancel the previous request, and lets
  // unmount cancel the last one.
  const inFlight = useRef<AbortController | null>(null);
  const startRequest = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    return controller;
  }, []);
  useEffect(() => () => inFlight.current?.abort(), []);

  // Replace the whole list with page 1 of `next` — the filter changed, or the
  // user retried after an error.
  const loadFirstPage = useCallback(async (next: RunHistoryOutcome | null, signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRunHistory(testId, next, null, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      setItems(result.page.items);
      setTotals(result.page.totals);
      setCursor(result.page.next_cursor);
      setLoading(false);
    }
    catch (err) {
      if (signal.aborted) { return; }
      setError(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
      setLoading(false);
    }
  }, [testId]);

  // Re-query page 1 whenever the filter changes. The FIRST run is skipped: the
  // server already delivered page 1 for `initialOutcome`, and re-fetching it on
  // mount would be a pointless round-trip.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    const controller = startRequest();
    void loadFirstPage(outcome, controller.signal);
    return () => controller.abort();
  }, [outcome, loadFirstPage, startRequest]);

  // Single-select: clicking the active outcome clears it. The URL is the source
  // of truth for deep links, so it moves with the filter (replace, not push —
  // filtering is not a navigation step to walk back through).
  const applyOutcome = (next: RunHistoryOutcome | null) => {
    if (next === outcome) { return; }
    setOutcome(next);
    const params = new URLSearchParams();
    if (next !== null) { params.set('outcome', next); }
    const query = params.toString();
    router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  // Append the next keyset page BELOW the current rows, so the list stays
  // newest-first overall. The active filter travels with the cursor — the server
  // scopes the page to it, which is what makes "filter stays applied across
  // load-more" true rather than a client-side illusion.
  const loadOlder = async () => {
    if (cursor === null || loadingOlder) { return; }
    const { signal } = startRequest();
    setLoadingOlder(true);
    try {
      const result = await fetchRunHistory(testId, outcome, cursor, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        setLoadingOlder(false);
        return;
      }
      setItems(current => [...current, ...result.page.items]);
      setTotals(result.page.totals);
      setCursor(result.page.next_cursor);
      setLoadingOlder(false);
    }
    catch (err) {
      if (signal.aborted) { return; }
      setError(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
      setLoadingOlder(false);
    }
  };

  const retry = () => {
    void loadFirstPage(outcome, startRequest().signal);
  };

  const state = resolveRunHistoryViewState({ error: error !== null, rowCount: items.length, outcome });
  const allTimeTotal = totals.passed + totals.failed + totals.aborted;
  // With a filter on, the scoped all-time count for that outcome is known and is
  // the honest denominator; unfiltered, it is every terminal Run of the Test.
  const scopedTotal = outcome === null ? allTimeTotal : totals[outcome];

  return (
    <div data-testid="run-history-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">

          {/* All-time outcome summary. Deliberately FILTER-INVARIANT (plan D-B):
              it answers "how has this Test fared overall", not "what is on
              screen". BK-38's project-wide totals are filter-reactive — the two
              screens ask different questions. */}
          <div
            data-testid="run-history-summary"
            className="flex flex-wrap items-center gap-2"
          >
            <TotalChip outcome="passed" count={totals.passed} icon={Check} />
            <TotalChip outcome="failed" count={totals.failed} icon={X} />
            <TotalChip outcome="aborted" count={totals.aborted} icon={Ban} />
            <ProportionBar totals={totals} total={allTimeTotal} />
            <span className="text-sm text-fg-3">
              <span className="font-mono text-fg-2">{allTimeTotal}</span>
              {' '}
              runs all time · newest first
            </span>
          </div>

          {/* Outcome filter — single-select, `running` deliberately absent (an
              in-progress Run is not an outcome and is never history). */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span
                id="run-history-outcome-label"
                className="text-2xs font-medium uppercase tracking-[0.06em] text-fg-3"
              >
                Outcome
              </span>
              <div
                role="group"
                aria-labelledby="run-history-outcome-label"
                data-testid="run-history-filter"
                className="inline-flex overflow-hidden rounded-2 border border-stroke-2 bg-surface-2"
              >
                {RUN_HISTORY_OUTCOMES.map(option => (
                  <button
                    key={option}
                    type="button"
                    data-testid={`run-history-filter-${option}`}
                    aria-pressed={outcome === option}
                    disabled={loading}
                    onClick={() => applyOutcome(outcome === option ? null : option)}
                    className={`inline-flex h-7 items-center gap-1.5 border-r border-stroke-1 px-2.5 text-sm font-medium tracking-[0.02em] transition-colors duration-token ease-token last:border-r-0 disabled:pointer-events-none disabled:opacity-50 ${
                      outcome === option
                        ? 'bg-surface-5 text-fg-0'
                        : 'text-fg-2 hover:bg-surface-4 hover:text-fg-1'
                    }`}
                  >
                    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${OUTCOME_DOT_CLASS[option]}`} />
                    {capitalizeOutcome(option)}
                  </button>
                ))}
              </div>
            </div>

            <span className="pb-1.5 text-xs text-fg-3">
              One outcome at a time — pick it again or clear to show all
            </span>

            {outcome !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="run-history-clear-filter"
                className="ml-auto"
                onClick={() => applyOutcome(null)}
              >
                <X size={12} />
                Clear filter
              </Button>
            )}
          </div>

          <Card className="overflow-hidden">
            {state === 'error' && (
              <div data-testid="run-history-error" className="flex flex-col items-start gap-3 p-4">
                <p className="text-sm text-fg-2">{error}</p>
                <Button
                  type="button"
                  size="sm"
                  data-testid="run-history-retry"
                  disabled={loading}
                  onClick={retry}
                >
                  <RefreshCw size={13} />
                  {loading ? 'Retrying…' : 'Retry'}
                </Button>
              </div>
            )}

            {state === 'empty-never-run' && (
              <div
                data-testid="run-history-empty"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <History size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{RUN_HISTORY_EMPTY_NEVER_RUN}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">
                  This Test has never been executed. Its history starts with the first run.
                </span>
              </div>
            )}

            {state === 'empty-no-match' && outcome !== null && (
              <div
                data-testid="run-history-no-match"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <ListX size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">{runHistoryNoMatchMessage(outcome)}</span>
                <span className="max-w-[46ch] text-sm text-fg-3">
                  No run of this Test ended this way. Clear the filter to see the full history.
                </span>
                {/* The toolbar's `run-history-clear-filter` is still on screen
                    above; this is the second, in-context affordance the mockup
                    ships (`#empty-clear`), so it carries its own testid rather
                    than duplicating that one. */}
                <Button
                  type="button"
                  size="sm"
                  data-testid="run-history-no-match-clear"
                  onClick={() => applyOutcome(null)}
                >
                  <X size={12} />
                  Clear filter
                </Button>
              </div>
            )}

            {state === 'rows' && (
              <>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Run', 'Environment', 'Executor', 'Outcome', 'Duration', 'Ran'].map(column => (
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
                  <tbody data-testid="run-history-rows">
                    {items.map(run => (
                      <RunRow key={run.id} run={run} />
                    ))}
                  </tbody>
                </table>

                {/* Shown only while another page exists. The cursor carries the
                    keyset position; the outcome travels with it. */}
                {cursor !== null && (
                  <div className="flex justify-center border-t border-stroke-2 bg-surface-1 px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      data-testid="run-history-load-older"
                      disabled={loadingOlder}
                      onClick={() => { void loadOlder(); }}
                    >
                      <ArrowDown size={12} />
                      {loadingOlder ? 'Loading…' : 'Load older runs'}
                    </Button>
                  </div>
                )}

                <div
                  data-testid="run-history-foot"
                  className="flex items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2 font-mono text-xs text-fg-3"
                >
                  {`runs 1–${items.length} of ${scopedTotal} · ${outcome === null ? 'newest first' : `${capitalizeOutcome(outcome)} only`}`}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// One history row. NOT clickable — a Run drill-through from history is not in
// this story's scope.
function RunRow({ run }: { run: RunHistoryItem }) {
  const ExecutorIcon = EXECUTOR_ICON[run.executor_mode] ?? User;
  const duration = formatRunDuration(run.started_at, run.finished_at);

  return (
    <tr
      data-testid={`run-history-row-${run.id}`}
      className="transition-colors duration-token ease-token hover:bg-surface-3"
    >
      {/* Runs carry no human-readable code in the schema (D9 defers code
          generation), so the row is identified by the head of its uuid, with the
          full value one hover away. */}
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs font-medium text-fg-0" title={run.id}>
          {run.id.slice(0, 8)}
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
          {capitalizeOutcome(run.status)}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className={`font-mono text-xs ${duration === null ? 'text-fg-4' : 'text-fg-2'}`}>
          {duration ?? '—'}
        </span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2" title={run.started_at}>
          {formatRanAt(run.started_at)}
        </span>
      </td>
    </tr>
  );
}

function TotalChip({ outcome, count, icon: Icon }: { outcome: RunHistoryOutcome, count: number, icon: LucideIcon }) {
  const tint: Record<RunHistoryOutcome, string> = {
    passed: 'bg-signal-pass-bg',
    failed: 'bg-signal-fail-bg',
    aborted: 'bg-signal-blocked-bg',
  };
  const ink: Record<RunHistoryOutcome, string> = {
    passed: 'text-signal-pass',
    failed: 'text-signal-fail',
    aborted: 'text-signal-blocked',
  };

  return (
    <span
      data-testid={`run-history-total-${outcome}`}
      className={`inline-flex items-center gap-1.5 rounded-2 border border-stroke-2 px-2.5 py-1 text-sm text-fg-1 ${tint[outcome]}`}
    >
      <Icon size={13} className={`shrink-0 ${ink[outcome]}`} />
      {capitalizeOutcome(outcome)}
      <span className="font-mono font-semibold text-fg-0">{count}</span>
    </span>
  );
}

// 4px segmented bar: one span per outcome, width proportional to its all-time
// share. `role="img"` + a descriptive label because the proportions themselves
// are the information, and they are otherwise carried by color alone.
function ProportionBar({ totals, total }: { totals: RunHistoryTotals, total: number }) {
  const share = (count: number) => (total === 0 ? 0 : (count / total) * 100);

  return (
    <span
      role="img"
      aria-label={`Outcome breakdown of ${total} finished runs: ${totals.passed} passed, ${totals.failed} failed, ${totals.aborted} aborted`}
      className="flex h-1 w-[220px] overflow-hidden rounded-1 bg-surface-4"
    >
      <span className="h-full bg-signal-pass" style={{ width: `${share(totals.passed)}%` }} />
      <span className="h-full bg-signal-fail" style={{ width: `${share(totals.failed)}%` }} />
      <span className="h-full bg-signal-blocked" style={{ width: `${share(totals.aborted)}%` }} />
    </span>
  );
}

// Suspense fallback for `runs/page.tsx`'s async section, following the
// `WorkspacesListSkeleton` precedent: a static skeleton that is NOT gated by the
// same async read as the real table, so it paints immediately.
export function RunHistorySkeleton() {
  return (
    <div data-testid="run-history-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3" aria-hidden="true">
          <div className="flex items-center gap-2">
            <div className="h-6 w-24 animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-6 w-24 animate-status-pulse rounded-2 bg-surface-3" />
            <div className="h-6 w-24 animate-status-pulse rounded-2 bg-surface-3" />
          </div>
          <div className="h-7 w-64 animate-status-pulse rounded-2 bg-surface-3" />
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
