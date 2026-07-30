# Design brief — Bunkai TMS / bk-30-test-runs-index

Tool session: NEW Open Design project `bunkai-bk-30-test-runs-index`, design system `user:bunkai`
(the repo's frozen `DESIGN.md` mirrored as an OD user package — same package `bk-85-account-settings`
used). Tokens are NOT re-pasted below: the attached package carries them; the generating agent must
use native token names (`--bg-0..5`, `--fg-0..4`, `--accent`, `--pass/--fail/--blocked/--skipped/--running`)
rather than inventing values.

## Mission

Design 2 screens for Bunkai, a test-management tool for QA engineers who work with hundreds of
acceptance test cases per project. The register is a dense engineer's terminal — precise, dark,
developer-first — closer to Linear and VS Code than to a consumer dashboard. This batch is the
Test Runs surface: reviewing what got executed, by whom (human/agent/CI), and with what outcome.
We describe WHAT each screen must accomplish; HOW it looks is your call — layout, composition,
hierarchy, component choices, density and micro-interactions are fully delegated to you. Your only
hard boundary is the design contract carried by the attached `user:bunkai` package: never invent
colors, fonts, spacing or radii outside it.

When done, export and return the files as described in "Export & return".

## Product context

Bunkai (分解) turns a Test — an ordered chain of Acceptance Test Cases — into a checklist a QA
engineer works through against a real environment, run by run. Every Run carries an executor mode
(human, AI agent, or CI) so history and totals aggregate all three without special-casing. This
batch designs the review surfaces: a project-wide run list a QA Lead sweeps for reporting, and a
single Test's run history an engineer scrolls to spot flaky areas.

## Frozen design contract (non-negotiable)

Carried by the attached OD package `user:bunkai` — do not re-derive or re-pick tokens. Native
token vocabulary to use verbatim: surfaces `--bg-0`..`--bg-5`, text `--fg-0`..`--fg-4`, strokes
`--stroke-1`..`--stroke-3`/`--stroke-strong`, accent `--accent`/`--accent-hi`/`--accent-glow`, and
the run-status signal palette `--pass`/`--fail`/`--blocked`/`--skipped`/`--running` (each has a
~10% alpha background variant) — status colors must always pair with text/icon, never stand alone.
Component vocabulary already established in this project's package: `.btn`, `.chip`, `.dot`,
`.kbd`, `.tag`, `.input`/`.select`, `.card`, `.seg`, `.bar` (progress). Radii cap at 10px. No
gradients, no glassmorphism, no emoji in production UI.

## Screens requested

### 1. `test-runs-index` — Project-wide Test Runs

- Route: `/projects/[projectSlug]/runs`
- Purpose: let a QA Lead review every Run executed in a Project, narrow it down, and read pass/fail
  totals for whatever slice they're looking at — "what did we execute and how did it go?"
- User stories: BK-38 — Filter all project runs by date/module/status/executor with pass/fail totals.
- The user must be able to:
  - Review every Run across the Project in a single list, newest activity first.
  - Filter by date range, module, status (passed/failed/aborted — a still-running Run is not a
    status-filter option), and executor type (human/agent/CI), combinable together.
  - See pass and fail totals that recompute to reflect whatever filters are currently applied, not
    the whole Project.
  - Read per-row context at a glance: which Test, which module, which environment, executor mode,
    outcome, and when it ran.
  - Clear all filters in one gesture and land back on the full project-wide list and totals.
- States the ACs demand:
  - Default — full unfiltered project list with totals.
  - Filtered, combined — multiple filters applied together, list and totals both narrow accordingly.
  - No-match — a filter combination matches nothing: empty list, totals show zero, never an error.
  - Loading — runs still fetching.
  - Error — the run query fails, with a retry path.
- Viewport: desktop-first 1440px, inside the persistent App Shell (global sidebar + topbar — this
  is a primary nav destination, "Test Runs" in the sidebar, not a modal or drawer).

### 2. `test-run-history` — Single Test's run history

- Route: a tab within a Test's detail view (`/projects/[projectSlug]/tests/[testId]`, "Runs" tab).
  No Test-detail screen exists yet in this project's mockup set — design this as a self-contained
  page for now (App Shell chrome + a clear "scoped to this Test" heading), since it will later be
  embedded as a tab once Test detail is designed.
- Purpose: let an engineer scroll one Test's execution history, newest first, and filter it down to
  spot flaky or recurring failures.
- User stories: BK-37 — View a Test's past runs, filterable by outcome.
- The user must be able to:
  - See every past Run for this one Test, ordered newest first.
  - Read each entry's outcome, environment, executor mode, and when it ran.
  - Filter the history to a single outcome — passed, failed, or aborted — hiding the rest.
  - Clear that filter and get the full newest-first list back.
  - Load older Runs beyond the first page, appended below, list staying newest-first overall.
- States the ACs demand:
  - Default — full newest-first history for the Test.
  - Filtered — narrowed to one outcome.
  - Empty — a Test with zero Runs ever: show "No runs yet for this Test", no row skeleton, no error.
  - Pagination — a "load older runs" affordance beneath the visible page.
  - Loading — history still fetching.
- Viewport: desktop-first 1440px, inside the persistent App Shell. Reuse the shell anatomy and run-row
  visual language of `test-runs-index` (screen 1 of this batch) — same row treatment for outcome,
  environment, executor mode, and date, just scoped to one Test instead of the whole Project.

## Hard constraints

- Name each screen file with its `{screen-slug}` exactly (`test-runs-index.html`,
  `test-run-history.html`) — the repo maps files by slug.
- No new tokens. A value not in the attached `user:bunkai` package is a defect, not a creative choice.
- UI copy in ENGLISH.
- Every interactive element needs a visible `:focus-visible` treatment (1px solid `--accent`, 1px
  offset). Every primary action and every filter has a keyboard path.
- Color is never the only signal: pair run-status color (`--pass`/`--fail`/`--blocked`/`--skipped`/
  `--running`) with text and/or an icon.
- Contrast must hold WCAG AA against the dark surfaces.
- Every identifier (Run id, Test id, module code, date-like machine value) renders in JetBrains
  Mono; prose renders in Inter.
- This is a primary nav destination, not a standalone flow: render it inside the same persistent
  App Shell (sidebar + topbar) already established by this product's other screens — "Test Runs" is
  the active sidebar item.

## Export & return

**Open Design** (local app, MCP-driven): runs are commissioned via `start_run` against project
`bunkai-bk-30-test-runs-index`. Once a run reaches `succeeded`, its artifact file lives under this
project's data directory; the orchestrating agent copies it into
`.context/designs/bunkai-test-management-tool/bk-30-test-runs-index/` in the repo.

Preferred output: one self-contained HTML/CSS file per screen named by its `{screen-slug}`.
