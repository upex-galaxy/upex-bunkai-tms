'use client';

import type { ActivityItemResponse, ActivityPageResponse } from '@app/api/v1/activity/response';
import { Button } from '@components/ui/button';
import { Card } from '@components/ui/card';
import { ACTIVITY_PAGE_SIZE } from '@lib/activity/constants';
import { extractRunVerdict, resolveActivityViewState, resolveActorLabel } from '@lib/activity/view';
import { Activity as ActivityIcon, ArrowDown, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

// BK-49 — the workspace Activity feed, a standalone `/activity` route (§5
// D15 design divergence, ratified: Home is 0% built, its mockup panel is a
// non-paginated last-24h widget that cannot satisfy AC2's "load older").
// Structural precedent: RunHistoryView's list+load-older pattern, minus the
// outcome filter/totals axis this feed does not have (activity has no
// pass/fail dimension).
//
// The first page is fetched SERVER-side by `activity/page.tsx` and handed
// down as `initialPage`, so the screen paints complete with no client
// waterfall. After mount this component owns every later query (load older,
// retry-on-error) through the API route — mirrors RunHistoryView /
// ProjectRunsReportView.

export type ActivityItem = ActivityItemResponse;
export type ActivityPage = ActivityPageResponse;

interface ActivityViewProps {
  initialPage: ActivityPage
  // Set when the SERVER-side first-page read failed; the client renders the
  // error block with a Retry that re-queries through the API route.
  initialError?: string | null
}

interface ApiErrorBody {
  error?: { message?: string }
}

const FALLBACK_ERROR_MESSAGE = 'Could not load the activity feed.';

// Deterministic UTC rendering: this is a CLIENT component but still
// server-renders its first paint, so `toLocale*` would drift between the
// server and the browser timezone and trip a hydration mismatch. Slicing the
// ISO string is timezone-stable on both (mirrors RunHistoryView's
// `formatRanAt`). '2026-07-29T11:52:00+00:00' -> '2026-07-29 11:52'.
function formatActivityTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

async function fetchActivity(
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ ok: true, page: ActivityPage } | { ok: false, message: string }> {
  const params = new URLSearchParams({ limit: String(ACTIVITY_PAGE_SIZE) });
  if (cursor !== null) { params.set('cursor', cursor); }

  const response = await fetch(`/api/v1/activity?${params}`, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    // Server copy is rendered VERBATIM — never rephrased client-side.
    return { ok: false, message: body.error?.message ?? FALLBACK_ERROR_MESSAGE };
  }
  return { ok: true, page: (await response.json()) as ActivityPage };
}

export function ActivityView({ initialPage, initialError = null }: ActivityViewProps) {
  const [items, setItems] = useState<ActivityItem[]>(initialPage.items);
  const [cursor, setCursor] = useState<string | null>(initialPage.next_cursor);
  // First-page error (whole-view block) vs. append error (inline, load-older
  // control only) — same split as RunHistoryView, for the same reason: an
  // append failure must never unmount rows already loaded and paid for.
  const [error, setError] = useState<string | null>(initialError);
  const [appendError, setAppendError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

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

  // The foot line doubles as the focus target when the load-older button
  // unmounts under the pointer/keyboard that just activated it, and as the
  // polite live region that narrates the row count.
  const footRef = useRef<HTMLDivElement | null>(null);
  const focusFootAfterAppend = useRef(false);
  useEffect(() => {
    if (focusFootAfterAppend.current && cursor === null) {
      focusFootAfterAppend.current = false;
      footRef.current?.focus();
    }
  }, [cursor]);

  const retry = async () => {
    const controller = startRequest();
    const { signal } = controller;
    setRetrying(true);
    setError(null);
    try {
      const result = await fetchActivity(null, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setItems(result.page.items);
      setCursor(result.page.next_cursor);
    }
    catch (err) {
      if (signal.aborted) { return; }
      setError(err instanceof Error ? err.message : FALLBACK_ERROR_MESSAGE);
    }
    finally {
      if (inFlight.current === controller) {
        setRetrying(false);
      }
    }
  };

  // Append the next keyset page BELOW the current rows, so the list stays
  // newest-first overall.
  const loadOlder = async () => {
    if (cursor === null || loadingOlder) { return; }
    const controller = startRequest();
    const { signal } = controller;
    setLoadingOlder(true);
    setAppendError(null);
    try {
      const result = await fetchActivity(cursor, signal);
      if (signal.aborted) { return; }
      if (!result.ok) {
        // Inline, NOT the whole-view error: the rows already on screen stay.
        setAppendError(result.message);
        return;
      }
      // Last page — the button the user just activated is about to unmount,
      // so flag the focus move for the effect that runs once cursor clears.
      if (result.page.next_cursor === null) {
        focusFootAfterAppend.current = true;
      }
      setItems(current => [...current, ...result.page.items]);
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

  const state = resolveActivityViewState({ error: error !== null, rowCount: items.length });

  const footText = cursor === null
    ? `${items.length} ${items.length === 1 ? 'entry' : 'entries'} · end of activity`
    : `${items.length} ${items.length === 1 ? 'entry' : 'entries'} loaded`;

  const olderIdleLabel = appendError === null ? 'Load older activity' : 'Try again';
  const olderLabel = loadingOlder ? 'Loading…' : olderIdleLabel;

  return (
    <div data-testid="activity-view" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3">
          <Card className="overflow-hidden">
            {state === 'error' && (
              <div data-testid="activity-error" className="flex flex-col items-start gap-3 p-4">
                <p className="text-sm text-fg-2">{error}</p>
                <Button
                  type="button"
                  size="sm"
                  data-testid="activity-retry"
                  disabled={retrying}
                  onClick={() => { void retry(); }}
                >
                  <RefreshCw size={13} />
                  {retrying ? 'Retrying…' : 'Retry'}
                </Button>
              </div>
            )}

            {state === 'empty' && (
              <div
                data-testid="activity-empty"
                className="flex flex-col items-center gap-2 px-4 py-8 text-center"
              >
                <ActivityIcon size={18} className="text-fg-3" />
                <span className="text-md font-semibold text-fg-1">No activity yet</span>
                <span className="max-w-[46ch] text-sm text-fg-3">
                  Nothing has happened in this workspace yet. Actions like creating a Test or
                  finishing a run will show up here.
                </span>
              </div>
            )}

            {state === 'rows' && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Actor', 'Action', 'Item', 'Time'].map(column => (
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
                    <tbody data-testid="activity-rows">
                      {items.map(item => (
                        <ActivityRow key={item.id} item={item} />
                      ))}
                    </tbody>
                  </table>
                </div>

                {(cursor !== null || appendError !== null) && (
                  <div className="flex flex-col items-center gap-2 border-t border-stroke-2 bg-surface-1 px-3 py-2">
                    {appendError !== null && (
                      <p data-testid="activity-append-error" className="text-center text-sm text-fg-2">
                        {appendError}
                      </p>
                    )}
                    {cursor !== null && (
                      <Button
                        type="button"
                        size="sm"
                        data-testid="activity-load-older"
                        disabled={loadingOlder}
                        onClick={() => { void loadOlder(); }}
                      >
                        {appendError === null ? <ArrowDown size={12} /> : <RefreshCw size={13} />}
                        {olderLabel}
                      </Button>
                    )}
                  </div>
                )}

                {/* Polite live region: doubles as the focus target when the
                    final "Load older activity" click unmounts the button
                    itself (mirrors RunHistoryView's `run-history-foot`). */}
                <div
                  ref={footRef}
                  tabIndex={-1}
                  aria-live="polite"
                  data-testid="activity-foot"
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

// One activity row. NOT clickable — a drill-through into the source entity
// is not in this story's scope (implementation-plan.md, out-of-scope.md).
function ActivityRow({ item }: { item: ActivityItem }) {
  const verdict = extractRunVerdict(item.action, item.payload);

  return (
    <tr
      data-testid={`activity-row-${item.id}`}
      className="transition-colors duration-token ease-token hover:bg-surface-3"
    >
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="text-xs text-fg-2">{resolveActorLabel(item.actor)}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-sm text-fg-1">
          {item.action_label}
          {verdict !== null && (
            <span className="status-chip" data-status={verdict === 'passed' ? 'pass' : 'fail'}>
              <span className="dot" data-status={verdict === 'passed' ? 'pass' : 'fail'} />
              {verdict === 'passed' ? 'Passed' : 'Failed'}
            </span>
          )}
        </span>
      </td>
      <td className="max-w-[320px] truncate border-t border-stroke-1 px-3 py-1.5">
        <span className="text-sm text-fg-2">{item.item.label}</span>
      </td>
      <td className="whitespace-nowrap border-t border-stroke-1 px-3 py-1.5">
        <span className="font-mono text-xs text-fg-2" title={item.created_at}>
          {formatActivityTime(item.created_at)}
        </span>
      </td>
    </tr>
  );
}

// Suspense fallback for `activity/page.tsx`'s async section (mirrors
// `RunHistorySkeleton`): a static skeleton not gated by the same async read
// as the real table, so it paints immediately.
export function ActivitySkeleton() {
  return (
    <div data-testid="activity-skeleton" className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto flex max-w-[820px] flex-col gap-3" aria-hidden="true">
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
