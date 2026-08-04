// BK-255 — which `activity_log.action` values the Home welcome banner counts as
// "an ATC changed" and "a Test changed". Kept in a zero-import module, matching
// `lib/activity/constants.ts`'s split, so the server page can import them
// without dragging anything else along.
//
// These are NOT the same list as `ACTIVITY_ALLOWED_ACTIONS` (the /activity feed
// allowlist) and must not be collapsed into it: that list is "what is worth
// showing in a feed" and spans modules, runs and bugs; this one is "what the
// member would call a change to their ATCs and Tests". The values themselves
// come from the RPCs that write them — `atc.created` (0021, 0028),
// `atc.updated` (0021, 0035), `test.created` (0024), `test.reordered` (0026),
// `test.tags_changed` (0030).

export const HOME_ATC_CHANGE_ACTIONS = [
  'atc.created',
  'atc.updated',
] as const;

export const HOME_TEST_CHANGE_ACTIONS = [
  'test.created',
  'test.reordered',
  'test.tags_changed',
] as const;

// How far back the banner looks when it says "what changed recently".
//
// This was originally the member's `last_sign_in_at`, which does NOT survive
// contact with how the app actually keeps sessions alive: GoTrue only advances
// that field on a real sign-in, never on the cookie refresh that carries a
// session forward. So the baseline was frozen for a session's whole life —
// zero on the dominant path (sign in, land on Home seconds later) and, for a
// member signed in for a fortnight, an ever-growing window that re-announced
// work they reviewed a week ago. A fixed window is the honest version: it
// measures exactly what the copy claims, and the copy is written from this
// constant so the two cannot drift. 24 hours also matches the window §4.2
// already specifies for this same screen's Recent activity feed (BK-258), so
// the banner and the feed under it will not disagree about what "recent" is.
export const HOME_CHANGE_WINDOW_HOURS = 24;

// Ceiling on the activity rows the banner scans to work out how many DISTINCT
// ATCs and Tests changed. The count is over `entity_id`, not over rows — one
// ATC saved three times is one changed ATC — which means the rows have to come
// back rather than be counted server-side. A workspace that logs more than
// this many ATC/Test events inside the window makes the figure a floor; at 24
// hours that is a volume no workspace in this product reaches.
export const HOME_ACTIVITY_SCAN_LIMIT = 1000;

// BK-257 — how many projects the Home "Recent projects" widget shows. The
// widget is a shortcut back into recent work, not the project list: `/projects`
// (BK-266) owns the full, unbounded index, and the widget's footer links there.
export const HOME_RECENT_PROJECTS_LIMIT = 5;

// Ceiling on the rows each per-project activity scan reads (see the cost note
// in `lib/home/recent-projects.ts`). It bounds the ORDERING signal only — the
// module and ATC counts the widget prints are exact `count` reads issued after
// the ordering is settled, so this ceiling can never make a displayed number
// wrong, only make an already-stale project sort slightly lower among other
// already-stale ones.
export const HOME_PROJECT_ACTIVITY_SCAN_LIMIT = 1000;
