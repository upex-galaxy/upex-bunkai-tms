# Design brief — Bunkai TMS / bk-44-metrics-coverage
Tool session: NEW project (`bunkai-bk-44-metrics-coverage`)

## Mission
Design 2 screens for Bunkai, a dark, dense, developer-first test-management tool (register:
engineer's terminal, Linear/VS Code, not a consumer SaaS dashboard). We describe WHAT each screen
must accomplish; HOW it looks is your call — layout, composition, hierarchy, component choices,
and micro-interactions are fully delegated to you. Your only hard boundary is the design contract
below: never invent colors, fonts, or spacing values outside it.
When done, export and return the files as described in "Export & return".

## Product context
Bunkai turns test assets a QA team already maintains — user stories, acceptance criteria,
acceptance test cases, tests, runs and defects — into a navigable, read-only story of quality: how
much is covered, where the gaps are, how fast the team recovers from failure, and a shareable
audit-ready record of the evidence chain. Users are QA Leads and Senior QA Engineers.

## Frozen design contract (non-negotiable)
- Colors: surfaces `--bg-0..5` `#0a0b0d / #101216 / #14171c / #1a1e25 / #232830 / #2d333c`; text
  `--fg-0..4` `#f1f3f5 / #d4d8de / #9aa1ab / #6b727c / #4a5057`; strokes
  `rgba(255,255,255,.05/.08/.13/.22)`; accent (vermillion) `--accent #d9543f` / `-hi #e87060` /
  `-glow rgba(217,84,63,.18)` / `-soft rgba(217,84,63,.10)`; signal palette `--pass #2fb673` /
  `--fail #e5484d` / `--blocked #e8a838` / `--skipped #8a91a0` / `--running #4f8cf7` (each with a
  `-bg` tint at .08–.10 alpha); layer chips `UI #8b6df0` / `API #4f8cf7` / `Unit #2fb673`.
- Typography: Inter (UI text), JetBrains Mono (IDs, codes, numeric/metric values), Noto Serif JP
  (brand wordmark only). Base 13px/1.45. Type ramp tops out at 22px — hierarchy comes from weight
  and color tier, not size.
- Spacing scale: 4px grid — 4/6/8/10/12/16/20/24px. Primary surface padding caps at 16px, nothing
  exceeds 24px.
- Radius / shadows: radii 3/5/7/10px (sharp, never past 10). Low elevation with a 1px inset
  highlight on top (`--elev-raised`), never a plain drop shadow. Focus ring: 1px solid `--accent`,
  1px offset, on every interactive element.
- Component conventions: this project has the `user:bunkai` design system package attached — use
  its native token names directly (`--bg-2`, `--pass-bg`, `--fail`, etc.), no renaming pass. No
  glassmorphism, no gradients as decoration, no emoji. Dense information display, not whitespace-led.

## Screens requested

### 1. metrics-dashboard — Coverage & Cycle-Time Dashboard
- Route: `/projects/[projectSlug]/metrics`
- Purpose: give a QA Lead a one-minute, data-backed read of how covered the project is, where the
  coverage gaps are, and how fast the team recovers from failure — without assembling it by hand.
- User stories: BK-46 — surface acceptance criteria and modules with no linked ATC, and a filter
  for coverage that exists but has never been executed; BK-47 — compute per-user-story cycle time
  from first failing run to first fully-passing run.
- The user must be able to: see an overall coverage summary (how much of the project's acceptance
  criteria/modules have test coverage); list acceptance criteria and modules that have zero linked
  ATCs; apply a "not run" filter that narrows to coverage that exists but has never been executed
  in a run; see a module reported as fully covered when everything in it has executed coverage;
  see, per user story, the elapsed time from its first failing run to its first all-passing run;
  see a story that is still failing reported as "not yet green" with time elapsed so far (ongoing,
  not resolved); see a story that never failed reported as having no cycle to measure (distinct
  from a resolved cycle); see a defect-density summary at a glance — this project has an existing
  defect-heatmap treatment (module cells bucketed Clean/Low/Elevated/Hotspot by defect count, with
  a week-over-week trend reading "Rising +N" / "Falling -N" / "Flat +-0", never a color-only
  signal) — reuse that treatment rather than inventing a new one; a link or path from any metric
  into the fuller evidence chain (screen 2 of this batch).
- States the ACs demand: default (populated project); module with zero uncovered ACs → "fully
  covered" state, distinct visual treatment from "has gaps"; "not run" filter applied (coverage
  exists, ATCs bound, but never executed) vs. "no coverage" (no ATCs at all) — these must read as
  two different situations, not one generic empty state; a user story with an in-progress cycle
  (still failing, clock still running) vs. a user story with no cycle at all (never failed) — two
  different quiet states, neither is an error; loading; error with retry.
- Viewport: desktop-first 1440px.

### 2. traceability-chain — Evidence Chain (US → AC → ATC → Test → Run → Bug)
- Route: `/projects/[projectSlug]/traceability`
- Purpose: render, for a single user story, the complete read-only evidence chain from its
  acceptance criteria down through the ATCs that verify them, the tests that contain those ATCs,
  each test's latest run result, and any defect linked to a failing result — in one view, no
  further navigation required. Also let the QA Lead narrow that chain and take an audit-ready
  snapshot of it.
- User stories: BK-45 — render the full chain in a single read, handling partial and missing data
  gracefully; BK-48 — filter the chain by result (pass/fail/blocked/etc.), module, and date range,
  combinable, with a clear active-filter summary; BK-50 — export the assembled chain as a
  read-only, point-in-time snapshot.
- The user must be able to: open the chain for one user story and read it top to bottom without
  extra clicks — per acceptance criterion: its title; per ATC bound to that AC: its title and
  layer (UI/API/Unit); per test containing that ATC: its name; per test: its single latest run
  result and status (pass/fail/blocked/skipped); per run result: any linked defect(s) with ID,
  title, and current status; distinguish a layer that has no data yet (e.g. an AC with ATCs but no
  test written, or a test with no run recorded) from a layer that is missing because the AC itself
  has no ATCs bound at all ("uncovered") — these are two different situations; combine filters by
  result, module, and date range at once, and see which filters are currently active; clear all
  filters back to the unfiltered chain; trigger an export that produces a read-only snapshot of the
  chain exactly as it stood at that moment (a snapshot must visibly carry an export timestamp,
  since it will not reflect later changes to the live chain).
- States the ACs demand: fully covered chain (every layer populated); partial chain ("no data yet"
  placeholders at the Test/Run/Defect layers, never a broken or null-looking cell); a story with
  some ACs covered and some with zero ATCs bound (each AC renders independently — covered ACs show
  their chain, uncovered ACs show an "uncovered" indicator, not a broken row); a story with zero
  acceptance criteria at all (defined empty state, distinct copy from "has ACs but no coverage");
  a story with ACs but zero ATCs anywhere (defined empty state, distinct from the zero-AC state);
  filters applied with results (active-filter summary visible); filters applied with zero matches
  (empty result state, visibly different from the "no coverage exists at all" state — the data
  exists, the filter just excludes it); an inverted or invalid date-range input handled without a
  broken UI; loading; error with retry.
- Viewport: desktop-first 1440px.

## Hard constraints
- Name each screen file exactly `metrics-dashboard.html` and `traceability-chain.html` — the repo
  maps files by slug.
- No new tokens. A value not in the frozen contract is a defect, not a creative choice.
- Both screens render inside the persistent global App Shell (sidebar with global nav, "Metrics"
  item active for screen 1; screen 2 is reached from within a project/story context, so it may
  render inside the same App Shell with no distinct top-level nav item highlighted, or nest under
  "Metrics" — your call, note which you picked).
- Every status/severity/coverage signal must pair color with text or an icon — color is never the
  sole signal (WCAG AA).
- `:focus-visible` 1px `--accent` outline, 1px offset, on every interactive element; full keyboard
  operability for filters, view toggles, and the export action.
- UI copy in ENGLISH.
- No gradients as decoration, no glassmorphism, no emoji.
- This is a read-only reporting surface: no edit/create/delete affordances on chain entities
  (editing, filing, and running live elsewhere in the product) — the only mutating action on
  either screen is triggering an export snapshot.

## Export & return

**Open Design** (local app): a project has been created for this batch with the `user:bunkai`
design system attached (native tokens available directly — no token table needed in-session).
Screens are commissioned one run per screen, sequential. After both runs succeed, the orchestrating
agent copies the finished artifacts from the Open Design project data directory into
`.context/designs/bunkai-test-management-tool/bk-44-metrics-coverage/` in the repo.

When the files are in place, the screen-mapping phase resumes: `master-design-plan.md` §1/§4.7/§8
get updated to point at these two screens.
