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

// BK-256 — how many active runs the Home "Active test runs" table lists. The
// widget is a triage surface ("is anything stalled right now?"), not a runs
// index: the COUNT in its header is workspace-wide and exact regardless of this
// number, and each project's own `/projects/{slug}/runs` report owns the full,
// filterable list.
export const HOME_ACTIVE_RUNS_LIMIT = 5;

// BK-260 — how many events the Home "Recent activity" feed shows. The widget is
// a catch-up glance, not the feed: `/activity` (BK-49) owns the full, paginated
// history and the widget's header links there. This is also the page size asked
// of `fetchActivityPage`, because the 24h window (`HOME_CHANGE_WINDOW_HOURS`
// above — shared with the welcome banner so the two cannot disagree about what
// "recent" means) only ever REMOVES rows from that page, never needs more of
// them. See `lib/home/recent-activity.ts`.
export const HOME_ACTIVITY_FEED_LIMIT = 6;

// Ceiling on the rows the single grouped `run_steps` scan reads for the listed
// runs (see the cost note in `lib/home/active-runs.ts`). Unlike the recent
// projects scan limit above, this one bounds numbers the widget PRINTS, so it is
// not allowed to silently cap: the scan asks for an exact count alongside the
// rows and refuses the whole rollup if the two disagree. The ceiling is
// therefore a blast radius, not a truncation point — 2000 rows covers 400 steps
// on each of the widget's 5 runs, or 100 on each of the endpoint's maximum 20.
export const HOME_ACTIVE_RUNS_STEP_SCAN_LIMIT = 2000;

// Ceiling on the rows each per-project activity scan reads (see the cost note
// in `lib/home/recent-projects.ts`). It bounds the ORDERING signal only — the
// module and ATC counts the widget prints are exact `count` reads issued after
// the ordering is settled, so this ceiling can never make a displayed number
// wrong, only make an already-stale project sort slightly lower among other
// already-stale ones.
export const HOME_PROJECT_ACTIVITY_SCAN_LIMIT = 1000;

// BK-259 — how many per-project coverage RPCs the Home "Coverage" card runs at
// once.
//
// The workspace figure is the sum of every project's coverage, and the only
// thing entitled to decide a project's coverage is
// `bunkai_report_project_coverage` — so the rollup is one call per project and
// that count cannot be capped without making the percentage a fiction (see
// `lib/home/coverage.ts`). What CAN be bounded is how many run in parallel.
//
// This is deliberately NOT `Promise.all` over every project: Home is the
// post-login landing page, so an unbounded fan-out turns a single sign-in in a
// twenty-project workspace into twenty simultaneous whole-project scans — a
// connection-pool spike that would be felt by every other member's request, not
// just by the person who signed in. Four keeps the card's latency close to the
// parallel case (the calls are I/O-bound and short) while leaving the pool room
// to serve the rest of the page's widgets, which are loading at the same time.
export const HOME_COVERAGE_PROJECT_CONCURRENCY = 4;

// BK-259 — how long a computed workspace coverage rollup may be reused.
//
// Concurrency bounds how much runs AT ONCE; it does not bound how OFTEN. Home
// is the post-login landing page, so without this every member paid the whole
// per-project fan-out on every single load, and ten members signing in at 9am
// meant ten identical full sweeps of the same workspace. Coverage moves when
// somebody binds an ATC or finishes a run — minutes apart at the very fastest —
// so serving a figure up to a minute old costs the reader nothing and removes
// almost all of the repeat work.
//
// Deliberately short: this is a stampede damper, not a materialized view. A
// lead who binds a test case and reloads to check expects to see it, and a
// minute is inside the window where "it will show up in a moment" is a sane
// thing for the product to imply.
export const HOME_COVERAGE_CACHE_TTL_MS = 60_000;

// BK-259 — the largest number of projects the Home coverage card will roll up
// in one pass.
//
// This is a safety valve, NOT a page size. The rollup is one
// `bunkai_report_project_coverage` call per project, and that RPC's
// `atc_real_status` CTE (0050) is deliberately not project-scoped, so each call
// costs a pass over `run_atcs`. Total work therefore grows with projects ×
// run history, on the app's landing page, for every member — the one place in
// this product where unbounded work is least acceptable.
//
// Tripping it renders the card's EXISTING error state, not a partial figure.
// That is the whole point: a percentage computed over some of a workspace's
// projects is not a smaller truth, it is a wrong number that looks exactly like
// a right one, and this card's entire design (see `lib/home/coverage.ts`) is
// built on never printing one. "Coverage could not be measured" is recoverable;
// "78%" that silently omitted half the workspace is not.
//
// 60 against a largest real workspace of 15 projects — four times current
// headroom, so it cannot fire on today's data. If a workspace ever legitimately
// reaches it, the fix is the workspace-level RPC noted in `coverage.ts`, not a
// higher number here.
export const HOME_COVERAGE_MAX_PROJECTS = 60;

// BK-258 — which `bugs.status` values Home counts as "open".
//
// The shipped status vocabulary is `open | in_progress | resolved | closed`
// (0046_bugs.sql), moved forward one stage at a time and never backward
// (`bunkai_transition_bug_status`, 0054). "Open" here means UNRESOLVED — the
// two states before a fix exists — not the literal `open` status alone.
//
// The literal reading was rejected because it makes the number move the wrong
// way: a lead who triages ten defects into `in_progress` would watch the Home
// count drop by ten without a single bug being fixed, and would read the screen
// as "quality improved" on the morning her team started working. The story asks
// this widget to answer "what does quality look like right now"; a defect
// someone is actively fixing is still an outstanding defect.
//
// `resolved` and `closed` are both post-fix and both excluded. The distinction
// between them (fixed vs. verified-and-filed-away) matters to the bug list, not
// to a workspace-level "how much is outstanding" figure.
//
// This list is the SINGLE definition: `lib/home/open-bugs.ts` reads it, the
// endpoint publishes it verbatim as `open_statuses`, and
// `0061_home_open_bugs_index.sql`'s partial predicate mirrors it — so the
// widget, the API contract and the index can only drift apart visibly.
export const HOME_OPEN_BUG_STATUSES = ['open', 'in_progress'] as const;
