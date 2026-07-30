# Design brief — Bunkai TMS / bk-221-automation-ci

Tool session: NEW Open Design project `bunkai-bk-221-automation-ci`, design system `user:bunkai`
(the repo's frozen `DESIGN.md` mirrored as an OD user package — same package every prior batch used).
Tokens are NOT re-pasted below: the attached package carries them; the generating agent must use
native token names (`--bg-0..5`, `--fg-0..4`, `--accent`, `--pass/--fail/--blocked/--skipped/--running`)
rather than inventing values.

## Mission

Design 4 files for Bunkai, a test-management tool for QA engineers who work with hundreds of
acceptance test cases per project. The register is a dense engineer's terminal — precise, dark,
developer-first — closer to Linear and VS Code than to a consumer dashboard. This batch is
**Automation & CI Ingestion**: one brand-new screen (a CI-results upload flow) plus three
**extension crops** — small, targeted additions layered onto screens that already exist elsewhere
in this design system. An extension crop is NOT a full screen redesign: it reproduces the relevant
region of its base screen faithfully, then shows only the new CI-related elements added on top, so
a developer can read it as a precise before/after diff. We describe WHAT each file must accomplish;
HOW it looks is your call — layout, composition, hierarchy, component choices, density and
micro-interactions are fully delegated to you, constrained only by the design contract carried by
the attached `user:bunkai` package and, for the extension crops, by the base screen's established
anatomy (cited per file below).

When done, export and return the files as described in "Export & return".

## Product context

Bunkai (分解) turns a Test — an ordered chain of Acceptance Test Cases — into a checklist a QA
engineer works through against a real environment, run by run. Today every Run is born from a human
clicking through steps; automation results live in CI logs and get copy-pasted in, or lost. This
epic makes Karim (an autonomous AI test agent) and CI pipelines first-class run reporters: they
submit results into the same Runs views the team already uses, tagged with commit/branch/pipeline
context, and QA leads can finally see manual and automated coverage side by side.

## Frozen design contract (non-negotiable)

Carried by the attached OD package `user:bunkai` — do not re-derive or re-pick tokens. Native token
vocabulary to use verbatim: surfaces `--bg-0`..`--bg-5`, text `--fg-0`..`--fg-4`, strokes
`--stroke-1`..`--stroke-3`/`--stroke-strong`, accent `--accent`/`--accent-hi`/`--accent-glow`, and
the run-status signal palette `--pass`/`--fail`/`--blocked`/`--skipped`/`--running` (each has a ~10%
alpha background variant) — status colors must always pair with text/icon, never stand alone.
Component vocabulary already established across this project's package: `.btn`, `.chip`, `.dot`,
`.kbd`, `.tag`, `.input`/`.select`, `.card`, `.seg`, `.bar` (progress), `.modchip`, `.fchip`
(applied-filter chip). Radii cap at 10px. No gradients, no glassmorphism, no emoji in production UI.
Every identifier-like value (Run id, Test id, module code, commit SHA, branch name, pipeline id)
renders in JetBrains Mono; prose renders in Inter.

## Screens requested

### 1. `ci-results-upload` — Upload CI results (NEW screen)

- Route: modal/flow triggered off `/projects/[projectSlug]/runs` (the project runs view already
  designed in a prior batch — `bk-30-test-runs-index/test-runs-index.html`). Design this as a
  self-contained flow (you may show it as an overlay/modal composition, or as its own page-level
  flow) — it is a brand-new file, not an extension crop.
- Purpose: let Sara turn a CI pipeline's results file into a finished, fully-populated Run without
  hand-copying anything — "I have a JUnit XML report from last night's pipeline; make it a Run."
- User stories: BK-226 — Upload a CI results file to create a run.
- The user must be able to:
  - Choose which Test the report belongs to and which environment it ran against, then supply the
    results file (JUnit XML, one file per upload, 10 MB max) by drag-and-drop or browse.
  - Review a mapping preview before anything is created: each report entry matched to the Test's
    ATC steps by position/order — this preview is the contract, what gets confirmed is exactly what
    gets recorded.
  - See report entries that don't map to any step clearly separated ("not mapped") and Test steps
    the report never touched clearly flagged as coverage gaps — neither is ever silently dropped.
  - Explicitly acknowledge unmapped entries before the run can be created (a gate, not a warning
    that can be ignored).
  - See a verdict preview (any failed entry makes the whole run "failed") and a coverage summary
    before confirming.
  - Get rejected with a clear, specific message (naming the supported format and the size limit)
    when the file is the wrong type or too large — no run gets created.
  - On success, land back on the runs view with the new run visible and clearly highlighted as
    freshly created.
- States the ACs demand:
  - Choose-file step — Test picker, environment picker, drop zone, nothing uploaded yet.
  - Mapping preview — full match (every entry maps cleanly to a step).
  - Mapping preview with gaps — some entries unmapped AND some steps uncovered, acknowledgement
    required before continuing.
  - Rejected upload — unsupported format or oversized file, inline error naming format + size limit.
  - Confirm step — summary (steps covered, verdict preview) with the create action.
- Viewport: desktop-first 1440px.

### 2. `test-runs-index--ci-extension` — extends `test-runs-index.html` (execution-mode filter)

- **Base screen anatomy to reproduce**: the filter row, totals strip, and runs table from
  `.context/designs/bunkai-test-management-tool/bk-30-test-runs-index/test-runs-index.html`. That
  screen already has an "Executor" filter (Human / Agent / CI, a `.seg` control) and an "Executor"
  table column showing each run's human/agent/CI badge, plus a totals strip reading
  "Passed N · Failed N · Aborted N". Reproduce that filter row + totals strip + table header/rows
  faithfully as your starting point — same row treatment, same `.seg` and `.chip` components.
- Purpose: let Elena separate manually-executed runs from automated ones (agent- or CI-reported) at
  a glance and in aggregate, without losing the existing per-executor-type detail.
- User stories: BK-225 — Filter runs by manual or automated execution mode.
- The ADDITIVE elements only — this is a crop, not a redesign:
  - A "Mode" badge on every run row reading "Manual" (human executor) or "Automated" (agent or CI
    executor) — a derived, read-only value, never user-entered.
  - A "Mode" filter control (All / Manual / Automated) in the filter row, composing with the
    existing date/module/status/executor filters, not replacing the Executor filter.
  - Per-mode totals in the totals strip, alongside the existing Passed/Failed/Aborted counts (e.g.
    "Manual 12 · Automated 30").
  - An empty state for "Automated" filtered to zero results: explains no automated runs have been
    reported yet and points to how they get reported (agents and CI pipelines), distinct from the
    generic no-match empty state already on the base screen.
- Viewport: desktop-first 1440px, same App Shell chrome as the base screen (sidebar "Test Runs"
  active, topbar).

### 3. `run--ci-extension` — extends `run.jsx` (CI metadata on a run's detail header)

- **Base screen anatomy to reproduce**: the top header bar from
  `.context/designs/bunkai-test-management-tool/project/screens/run.jsx` — the row showing the run
  id + Test code + Test name (`{run.id} · {run.test.code}` / `{run.test.name}`), set on a `bg-1`
  bar with a bottom border. That file depicts a manual run IN PROGRESS; this crop adapts the same
  header visual language to a FINISHED, CI-reported run's detail view (no dedicated "finished run
  detail" screen exists yet in this design system — this crop is the first design intent for it,
  scoped narrowly to the CI-metadata row only, not a full run-detail redesign).
- Purpose: let Sara answer "what commit and branch produced this run, and which pipeline reported
  it?" without leaving the run.
- User stories: BK-228 — See CI-triggered runs linked to a commit and branch.
- The ADDITIVE elements only — reproduce the header bar, then add:
  - A compact "CI context" row directly below the run title: a branch chip (branch name), a short
    commit reference in JetBrains Mono with a visible external-link affordance (it links out to the
    commit page on the configured repository host), and the pipeline name (also links out, to the
    pipeline URL when one is provided).
  - Graceful degradation: when a run carries no CI metadata at all, this row does not render —
    show that state explicitly (no placeholder, no broken layout).
  - Graceful degradation: when the project has no repository URL configured, the commit reference
    renders as plain monospace text (no link) with a small hint that configuring the project's
    repository URL enables the link.
- Viewport: desktop-first 1440px, same header-bar chrome as the base screen.

### 4. `project--ci-extension` — extends `project.jsx` (Test automation status)

- **Base screen anatomy to reproduce**: the dense list/filter-bar pattern from `TableView` in
  `.context/designs/bunkai-test-management-tool/project/screens/project.jsx` — the filter bar built
  from `FilterPill` controls, the sticky table header row, and the `.chip`/`.tag` row treatment.
  That table lists ATCs today; no dedicated Test-scoped list/detail screen exists yet in this design
  system (`TestDetail` in that file is a placeholder). This crop adapts the SAME list anatomy to a
  Test-scoped list, and separately crops the same file's detail-header + side-panel pattern (seen
  on `ATCDetail`) adapted to a Test's detail header — both as new design intent for the not-yet-
  designed Test library / Test view, scoped narrowly to the automation-status elements only.
- Purpose: let Elena mark which Tests are manual-only, candidates for automation, or already
  automated, and let the team filter and track that over time.
- User stories: BK-227 — Track the automation status of a test.
- The ADDITIVE elements only — show TWO regions in this one file:
  1. **Test library rows**: each row gains an automation-status badge next to the test name — one
     distinct tone per status (Manual-only / Automation candidate / Automated, reusing the existing
     pill/chip family, same visual language as layer chips and tags). The toolbar gains a "Status"
     filter control (alongside the existing tag-style filters) with a live count per status shown
     in the control itself (e.g. "20 / 5 / 8").
  2. **Test detail header + side panel**: the status renders as a badge in the header that becomes
     a dropdown for member-and-above roles (viewers see it read-only, same badge, no dropdown
     affordance); a side panel lists the status history — each entry shows author, date, and the
     from → to transition, oldest at the bottom, append-only (never edited or removed).
- Viewport: desktop-first 1440px, same shell chrome as the base screen.

## Hard constraints

- Name each file with its exact slug as the filename (`ci-results-upload.html`,
  `test-runs-index--ci-extension.html`, `run--ci-extension.html`, `project--ci-extension.html`) —
  the repo maps files by slug.
- No new tokens. A value not in the attached `user:bunkai` package is a defect, not a creative choice.
- UI copy in ENGLISH.
- Every interactive element needs a visible `:focus-visible` treatment (1px solid `--accent`, 1px
  offset). Every primary action and every filter has a keyboard path.
- Color is never the only signal: pair status/verdict color with text and/or an icon.
- Contrast must hold WCAG AA against the dark surfaces.
- For the 3 extension crops (files 2–4): reproduce the cited base-screen region faithfully first —
  same components, same visual language — then layer the additive CI/automation elements on top.
  Do not redesign the base region's existing elements; a developer reading the file should see
  exactly what's the same and what's new.
- Screens 2–4 should stay visually consistent with screen 1 and with each other (same project,
  same conversation memory) — reuse whatever CI-metadata visual language (branch chip, commit
  mono+link, pipeline link) you establish in the earlier files rather than re-inventing it later.

## Export & return

**Open Design** (local app, MCP-driven): runs are commissioned via `start_run` against project
`bunkai-bk-221-automation-ci`. Once a run reaches `succeeded`, its artifact file lives under this
project's data directory; the orchestrating agent copies it into
`.context/designs/bunkai-test-management-tool/bk-221-automation-ci/` in the repo.

Preferred output: one self-contained HTML/CSS file per screen/crop named by its slug.
