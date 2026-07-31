import type { RunHistoryItem, RunHistoryTotals } from '@components/runs/RunHistoryView';
import type { RunHistoryOutcome } from '@lib/runs/history-validation';
import { RunHistorySkeleton, RunHistoryView } from '@components/runs/RunHistoryView';
import { encodeRunCursor, RUN_HISTORY_OUTCOMES, RUN_HISTORY_PAGE_SIZE } from '@lib/runs/history-validation';
import { listTestRuns } from '@lib/supabase/rpc';
import { createClient } from '@lib/supabase/server';
import { loadTestDetail } from '@lib/tests/load-test-detail';
import { Suspense } from 'react';

interface PageProps {
  params: Promise<{ projectSlug: string, testId: string }>
  searchParams: Promise<{ outcome?: string | string[] }>
}

// BK-37 — a Test's Run History, the second tab of the Test detail route. The
// first page is read HERE, server-side, so the table paints complete instead of
// waterfalling a client fetch after hydration; `RunHistoryView` owns every
// later query (filter change, load older) through the API route.
//
// One read, one rulebook: this calls the SAME SECURITY DEFINER RPC the headless
// route uses (`bunkai_list_test_runs`) rather than fetching our own API route
// from a server component — that would be an extra HTTP hop through the same
// process, with the session cookie forwarded by hand.
//
// `loadTestDetail` runs first for its 404 semantics: it is the shared,
// `cache()`-memoized read the layout already performed, so it costs nothing here
// and guarantees a Test the caller cannot see never reaches the history query.
export default async function TestRunHistoryPage({ params, searchParams }: PageProps) {
  const { projectSlug, testId } = await params;
  const { outcome: rawOutcome } = await searchParams;
  await loadTestDetail(projectSlug, testId);

  // A junk or repeated `?outcome=` is treated as "no filter" rather than an
  // error: this is a URL a human can type, and the honest answer to an
  // unrecognized outcome is the full history, not a broken screen.
  const outcome = RUN_HISTORY_OUTCOMES.includes(rawOutcome as RunHistoryOutcome)
    ? (rawOutcome as RunHistoryOutcome)
    : null;

  return (
    <Suspense fallback={<RunHistorySkeleton />}>
      <RunHistorySection testId={testId} outcome={outcome} />
    </Suspense>
  );
}

interface RunHistoryPayload {
  items: RunHistoryItem[]
  totals: RunHistoryTotals
  next_cursor: { started_at: string, id: string } | null
}

const EMPTY_TOTALS: RunHistoryTotals = { passed: 0, failed: 0, aborted: 0 };

// The first-page read, isolated in its own async component so it streams inside
// the `<Suspense>` boundary above (the `WorkspacesSection` precedent). A failure
// is caught here and handed to the view as its error state — it must never
// throw up to the route's error boundary and take the whole Test detail with it.
async function RunHistorySection({ testId, outcome }: { testId: string, outcome: RunHistoryOutcome | null }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No session.');
    }

    const { data, error } = await listTestRuns(supabase, {
      actorUserId: user.id,
      testId,
      outcome,
      limit: RUN_HISTORY_PAGE_SIZE,
    });
    if (error) {
      throw error;
    }

    const payload = data as unknown as RunHistoryPayload;

    return (
      <RunHistoryView
        testId={testId}
        initialOutcome={outcome}
        initialPage={{
          items: payload.items ?? [],
          totals: payload.totals ?? EMPTY_TOTALS,
          // The RPC returns the raw keyset position; the client only ever echoes
          // the opaque wire token back, exactly as the API route emits it.
          next_cursor: payload.next_cursor === null
            ? null
            : encodeRunCursor({ startedAt: payload.next_cursor.started_at, id: payload.next_cursor.id }),
        }}
      />
    );
  }
  catch {
    return (
      <RunHistoryView
        testId={testId}
        initialOutcome={outcome}
        initialPage={{ items: [], totals: EMPTY_TOTALS, next_cursor: null }}
        initialError="Could not load this Test's run history."
      />
    );
  }
}
