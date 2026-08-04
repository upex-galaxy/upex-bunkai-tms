// BK-260 — the selection + time-formatting rules behind Home's condensed
// "Recent activity" feed. Framework-agnostic and I/O-free (CLAUDE.md §10's
// shared-utility rule), so the Home server component stays a thin caller and
// these rules stay testable without a browser or a live DB — the same split
// `lib/activity/view.ts` (BK-49) and `lib/home/welcome-summary.ts` (BK-255)
// already use on their own screens.
//
// There is deliberately NO fetching here. The rows come from
// `fetchActivityPage` (`app/api/v1/activity/response.ts`), the very function
// BK-49's `/activity` route and page already share, so an event cannot read
// one way on Home and another way on the full feed: same allowlist, same
// action labels, same actor batch-resolution, same item labels. This story
// adds no second read path and no second endpoint.

// Generic over the row shape rather than importing `ActivityItemResponse`:
// this module has no business knowing the wire type, and staying generic keeps
// `lib/` from importing `app/`.
export interface SelectRecentActivityParams<T extends { created_at: string }> {
  items: T[]
  // The rows as the feed returns them: newest first.
  now: Date
  windowHours: number
  limit: number
}

// The condensed feed answers "what happened just now", so it is bounded on
// BOTH axes: a time window (the mockup's "Last 24h" hint, `home.jsx` §4.2) and
// a row cap. Requesting exactly `limit` rows from the feed and then dropping
// the ones outside the window is exact, not an approximation: the rows arrive
// newest-first, so anything the window rejects is older than everything it
// keeps, and no row inside the window can be hiding behind a rejected one.
//
// The window is what makes AC3's "nothing has happened recently" reachable at
// all — without it, a workspace that has ever logged one event would show that
// event on Home forever, and the empty state would be dead code.
export function selectRecentActivity<T extends { created_at: string }>(
  params: SelectRecentActivityParams<T>,
): T[] {
  const floor = params.now.getTime() - params.windowHours * 60 * 60 * 1000;
  return params.items
    .filter((item) => {
      const at = Date.parse(item.created_at);
      // An unparseable timestamp is kept rather than dropped: the row is real
      // activity that the member is entitled to see, and `formatEventTime`
      // below degrades it to its raw value instead of inventing an age.
      return Number.isNaN(at) || at >= floor;
    })
    .slice(0, params.limit);
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// AC1 asks for "a relative time", and this widget is the one surface on which
// that is the point — "12m ago" is what tells a member something is still
// warm. It is a DEPARTURE from the absolute `YYYY-MM-DD HH:MM` every other
// timestamp in this app renders (`/activity`, run history, BK-257's recent
// projects — ratified as master-design-plan §5 D21(c)), so the two are not
// allowed to drift apart: the component renders this string as the visible
// label and puts `formatAbsoluteTime`'s exact UTC value in the element's
// `title`, one hover away. Recorded as §5 D22.
//
// Safe to compute on the server: Home is a dynamic route (it reads cookies and
// the session), this runs inside a server component with no client counterpart,
// and a DURATION carries no timezone — unlike `toLocale*`, which is exactly why
// D21(c) refused relative time where a client component would re-render it.
// The trade-off it accepts is staleness: the label is correct as of the
// render, and a page left open all afternoon keeps the age it was born with.
export function formatRelativeTime(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    return iso;
  }

  // Clock skew between Postgres and the app server can put an event a few
  // seconds in the future. "in 3 seconds" would be nonsense on a feed of
  // things that already happened, so the future collapses into the present.
  const elapsed = Math.max(0, now.getTime() - at);

  if (elapsed < MINUTE_MS) {
    return 'just now';
  }
  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  }
  // Only reachable if the caller widens the window past a day — the condensed
  // feed's own window is 24h. Kept so the helper never lies by rounding a
  // three-day-old event down to "23h ago".
  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

// The exact value behind every relative label, in the app's house format:
// timezone-stable on server and client alike, matching `/activity`'s
// `formatActivityTime` and run history's `formatRanAt`.
// '2026-08-04T09:41:00+00:00' -> '2026-08-04 09:41'.
export function formatAbsoluteTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
