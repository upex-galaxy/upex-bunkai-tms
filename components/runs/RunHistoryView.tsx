'use client';

import type { RunHistoryOutcome } from '@lib/runs/history-constants';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { formatRunDuration } from '@lib/runs/duration';
// Constants come from the zod-free module, NOT `history-validation`: that file
// evaluates `z.object(...)` at its top level, so importing two literals from it
// would drag Zod and the whole query-schema graph into this client bundle.
import { RUN_HISTORY_OUTCOMES, RUN_HISTORY_PAGE_SIZE } from '@lib/runs/history-constants';
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
// tokens. The CSS keys differ from the API verbs for pass/fail; `aborted` keeps
// its own semantic token, the same one RunnerView uses, so both screens paint
// an aborted run identically. That token now resolves to the BLOCKED family in
// `app/globals.css` (an anomalous termination, not a failed assertion) per
// master-design-plan §4.8 — see the comment there.
const STATUS_TOKEN: Record<RunHistoryOutcome, string> = {
  passed: 'pass',
  failed: 'fail',
  aborted: 'aborted',
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
  // A failed APPEND is tracked apart from `error` deliberately. `error` drives
  // the whole-view error block, which REPLACES the table; using it for a failed
  // "load older" would throw away rows already loaded and paid for — 150 rows
  // deep, one flaky request would leave Retry able to restore only page 1. This
  // one surfaces inline at the load-older control and leaves the rows mounted.
  const [appendError, setAppendError] = useState<string | null>(null);
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

  // The foot line doubles as the focus target when the load-older button
  // unmounts under the pointer/keyboard that just activated it (see the effect
  // below). It is also the polite live region that narrates the row count.
  const footRef = useRef<HTMLDivElement | null>(null);
  const focusFootAfterAppend = useRef(false);

  // Replace the whole list with page 1 of `next` — the filter changed, or the
  // user retried after an error. Takes the CONTROLLER, not just its signal: the
  // `finally` needs identity to tell "I am still the current request" from "a
  // newer request has already taken over".
  const loadFirstPage = useCallback(async (next: RunHistoryOutcome | null, controller: AbortController) => {
    const { signal } = controller;
    setLoading(true);
    setError(null);
    // A first page supersedes any append in flight — its rows are about to be
    // replaced wholesale, so neither that request's spinner nor its failure
    // message survives the transition. Clearing here (rather than in the
    // aborted request's own `finally`) is what stops a filter click during a
    // load-older from stranding the button on a disabled "Loading…" forever.
    setLoadingOlder(false);
    setAppendError(null);
    try {
      const result = await fetchRunHistory(testId, next, null, signal);
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
      // Clear the flag ONLY while this is still the current request. A newer
      // one has already set it for itself; letting a superseded request clear
      // it would paint "idle" over work still in flight — which is how the
      // filter strip used to freeze for the rest of the session.
      if (inFlight.current === controller) {
        setLoading(false);
      }
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
    void loadFirstPage(outcome, controller);
    return () => controller.abort();
  }, [outcome, loadFirstPage, startRequest]);

  // Move focus off the load-older button when the FINAL append unmounts it.
  // Activating a control that then disappears drops focus to <body>, which
  // strands a keyboard user at the top of the document with no idea the rows
  // arrived. The foot line is the natural landing spot: it is the element whose
  // text just changed ("runs 1–60 of 60") and it is adjacent to the new rows.
  useEffect(() => {
    if (focusFootAfterAppend.current && cursor === null) {
      focusFootAfterAppend.current = false;
      footRef.current?.focus();
    }
  }, [cursor]);

  // Single-select: clicking the active outcome clears it. The URL is the source
  // of truth for deep links, so it moves with the filter (replace, not push —
  // filtering is not a navigation step to walk back through).
  //
  // COST, ACCEPTED: `router.replace` makes the server re-render this route, so a
  // filter change costs one extra history query whose result is deliberately
  // DISCARDED — the client ignores later `initialPage` props because it may be
  // holding several appended pages that the server's page 1 would silently drop.
  // The output is correct either way; only the request is redundant. Collapsing
  // it (a `?outcome=` read the client trusts, or a shallow URL update that skips
  // the RSC round trip) is a follow-up, not this story.
  const applyOutcome = (next: RunHistoryOutcome | null) => {
    if (next === outcome) { return; }
    setOutcome(next);
    // Drop the keyset position AT THE MOMENT the outcome changes. The cursor
    // belongs to the OLD outcome's result set; pairing it with the NEW one would
    // append rows of a different outcome underneath a pressed chip — "Failed"
    // selected, passed runs listed. Nulling it here also hides the load-older
    // control for the whole transition, closing the window between this click
    // and the effect that starts the refetch.
    setCursor(null);
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
    // Gated on BOTH flags. `loading` matters because a filter change is a whole
    // -list replacement: an append starting mid-change would pair the OLD cursor
    // with the NEW outcome and abort the first-page request on its way past.
    // `cursor === null` (set by applyOutcome) closes the same gap from the other
    // side, for the frames before `loading` has been set.
    if (cursor === null || loading || loadingOlder) { return; }
    const controller = startRequest();
    const { signal } = controller;
    setLoadingOlder(true);
    setAppendError(null);
    try {
      const result = await fetchRunHistory(testId, outcome, cursor, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        // Inline, NOT the whole-view error: the rows already on screen stay.
        setAppendError(result.message);
        return;
      }
      // Last page — the button the user just activated is about to unmount, so
      // flag the focus move for the effect that runs once the cursor clears.
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
      // Same identity guard as loadFirstPage, and the reason the button can no
      // longer strand itself on a disabled "Loading…": the flag is cleared on
      // EVERY exit path, including the aborted one.
      if (inFlight.current === controller) {
        setLoadingOlder(false);
      }
    }
  };

  const retry = () => {
    void loadFirstPage(outcome, startRequest());
  };

  // `error` is the FIRST-PAGE error only. An append failure is `appendError` and
  // is deliberately invisible to the resolver — it must not collapse the view.
  const state = resolveRunHistoryViewState({ error: error !== null, rowCount: items.length, outcome });
  const allTimeTotal = totals.passed + totals.failed + totals.aborted;
  // With a filter on, the scoped all-time count for that outcome is known and is
  // the honest denominator; unfiltered, it is every terminal Run of the Test.
  const scopedTotal = outcome === null ? allTimeTotal : totals[outcome];

  // While a filter change is in flight the table still holds the PREVIOUS
  // filter's rows, so a foot line reading "runs 1–50 of 50 · Failed only" would
  // be a plain untruth on a slow connection. Say what is actually happening
  // instead — the polite live region then announces the transition too.
  const scopeLabel = outcome === null ? 'newest first' : `${capitalizeOutcome(outcome)} only`;
  const loadingLabel = outcome === null ? 'Loading all runs…' : `Loading ${capitalizeOutcome(outcome)} runs…`;
  const footText = loading ? loadingLabel : `runs 1–${items.length} of ${scopedTotal} · ${scopeLabel}`;

  const olderIdleLabel = appendError === null ? 'Load older runs' : 'Try again';
  const olderLabel = loadingOlder ? 'Loading…' : olderIdleLabel;

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
                {/* Deliberately NEVER disabled, including while a filter change
                    is in flight. Disabling the whole group disables the chip
                    that currently HOLDS focus, and a disabled element cannot
                    keep it — a keyboard user is dumped to <body> the moment
                    they press one. `startRequest()` already supersedes the
                    in-flight query, so a rapid second click is safe: the first
                    response is aborted and never lands. */}
                {RUN_HISTORY_OUTCOMES.map(option => (
                  <button
                    key={option}
                    type="button"
                    data-testid={`run-history-filter-${option}`}
                    aria-pressed={outcome === option}
                    onClick={() => applyOutcome(outcome === option ? null : option)}
                    className={`inline-flex h-7 items-center gap-1.5 border-r border-stroke-1 px-2.5 text-sm font-medium tracking-[0.02em] transition-colors duration-token ease-token last:border-r-0 ${
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
                {/* Six columns of `whitespace-nowrap` content have a hard floor
                    width. Below it the card's own `overflow-hidden` (there to
                    clip the rounded corners) would silently CROP the trailing
                    `Ran` column instead of revealing it — and AC1 requires when
                    a run ran to be readable. Scroll the table on its own axis so
                    the card keeps its radius and no column is ever unreachable. */}
                <div className="overflow-x-auto">
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
                    {/* Dimmed and marked busy while a filter change is in
                        flight: these are still the PREVIOUS filter's rows, and
                        showing them at full strength under a freshly pressed
                        chip reads as "here are your Failed runs" when they are
                        not. Assistive tech gets the same signal from aria-busy. */}
                    <tbody
                      data-testid="run-history-rows"
                      aria-busy={loading}
                      className={`transition-opacity duration-token ease-token ${loading ? 'opacity-40' : ''}`}
                    >
                      {items.map(run => (
                        <RunRow key={run.id} run={run} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Shown while another page exists, or while the last attempt to
                    fetch one failed. The cursor carries the keyset position; the
                    outcome travels with it. A failed append reports HERE, next
                    to the control that caused it, and retries the APPEND — the
                    rows above are never unmounted for it. */}
                {(cursor !== null || appendError !== null) && (
                  <div className="flex flex-col items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2">
                    {appendError !== null && (
                      <p data-testid="run-history-append-error" className="text-center text-sm text-fg-2">
                        {appendError}
                      </p>
                    )}
                    {cursor !== null && (
                      <Button
                        type="button"
                        size="sm"
                        data-testid="run-history-load-older"
                        disabled={loading || loadingOlder}
                        onClick={() => { void loadOlder(); }}
                      >
                        {appendError === null ? <ArrowDown size={12} /> : <RefreshCw size={13} />}
                        {olderLabel}
                      </Button>
                    )}
                  </div>
                )}

                {/* Polite live region: its text is already the running tally
                    ("runs 1–60 of 60 · Failed only"), which is exactly what a
                    screen-reader user needs after an append or a filter change —
                    nothing else on this screen announces that the list moved.
                    `tabIndex={-1}` makes it the focus target when the last
                    "Load older runs" click unmounts the button itself. */}
                <div
                  ref={footRef}
                  tabIndex={-1}
                  aria-live="polite"
                  data-testid="run-history-foot"
                  className="flex items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2 font-mono text-xs text-fg-3 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {footText}
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
