# Design brief — Bunkai TMS / bk-201-test-plans-milestones

Tool session: NEW project `bunkai-bk-201-test-plans-milestones` (design system `user:bunkai`, MCP-driven Mode A — see `.claude/skills/design-system/references/open-design-app.md` §"Flujo MCP autónomo")

## Mission

Design 3 screens for Bunkai, a dark, dense, engineer-first test-management tool. We describe WHAT
each screen must accomplish; HOW it looks is your call — layout, composition, hierarchy, component
choices, and micro-interactions are fully delegated to you. Your only hard boundary is the attached
design system (`user:bunkai`) — never invent colors, fonts, spacing, or radii outside its native
tokens. When done, export and return the files as described in "Export & return".

## Product context

Bunkai is a QA test-management tool for engineering teams: users author Atomic Test Cases (ATCs),
chain them into Tests, execute manual Runs, and track defects. This batch adds **planned, organized
execution** on top of that: Test Plans group existing Tests around a goal or release; Milestones
group Plans under a target date with readiness computed automatically from run outcomes. Persona:
Mateo Silva, QA Lead, and Elena Vargas, Senior QA Engineer — both fluent, fast, keyboard-first users.

## Frozen design contract (non-negotiable)

Carried by the attached `user:bunkai` design-system package (native token names — do NOT re-paste
values here, use them by name): surfaces `--bg-0..5`, text `--fg-0..4`, strokes `--stroke-1/2/3`,
accent `--accent` (vermillion) + `--accent-hi`/`-glow`/`-soft`, signal palette `--pass`/`--fail`/
`--blocked`/`--skipped`/`--running` (+ `-bg` variants), layer chips (UI/API/Unit), radii 3/5/7/10px,
fonts Inter (UI) + JetBrains Mono (code/IDs, e.g. `PLAN-xxx`, `MS-xxx`), base 13px/1.45. Component
conventions: shadcn-style atoms (`.btn`/`.input`/`.select`/`.seg`/`.tag`/`.card`/`.bar`), 1px borders,
no glassmorphism, no gradients, no emoji.

## Screens requested

### 1. test-plans-index — Test Plans list
- Route: `/projects/[projectSlug]/plans`
- Purpose: entry point to a project's Test Plans — see what exists, filter by status, start a new one.
- User stories: BK-202 — create a test plan grouping tests for a goal; BK-207 — close a plan with an outcome summary (list-side: status filter only, the close flow itself lives on screen 2)
- The user must be able to: see every plan in the project (name, goal, status, live test count,
  creator); filter the list by status Open/Closed; create a new plan by supplying a name (required,
  unique per project, rejects blank/duplicate with a clear message), an optional description, and an
  optional goal/release label; open a plan to reach its detail; understand at a glance which plans
  are actively tracked vs. closed history. Viewers can see the list but the create action is not
  available to them (role gate).
- States the ACs demand: default (populated list); empty (no plans yet, guide to create one);
  create-validation (blank name / duplicate name in project, case-insensitive, inline message);
  filtered (Open/Closed toggle applied); loading; error.
- Viewport: desktop-first 1440px.

### 2. plan-detail — Test Plan detail
- Route: `/projects/[projectSlug]/plans/[planId]`
- Purpose: the working surface for one Test Plan — its identity, its member tests, live progress
  from run outcomes, and (when ready) closing it as an audit record.
- User stories: BK-202 — plan identity + edit; BK-203 — add/remove tests (membership); BK-204 — track
  plan progress from run outcomes; BK-207 — close a plan with an outcome summary
- The user must be able to: view and (while open) edit the plan's name/description/goal inline;
  see the plan's status (Open/Closed); add tests to the plan via a search-and-multi-select picker
  scoped to the project's test library (already-included tests are marked so they can't be added
  twice); remove a member test from its row without affecting the test itself elsewhere (a test may
  belong to many plans); see each member test's latest run outcome (passed/failed/aborted/in
  progress/not run) with the time of that run, and click through to that test's latest run; see an
  aggregate progress summary for the whole plan (counts per outcome + percent passed), computed only
  from existing run outcomes, refreshing on view; close the plan by choosing a required verdict
  (passed or failed) and an optional summary, with a confirmation step that warns how many member
  tests were never run before finalizing; once closed, see the frozen verdict, summary, who closed it
  and when, and the progress snapshot at close time — and lose every edit/membership/close action,
  the whole screen becomes read-only. Only the plan's creator or a workspace admin can close it;
  viewers can see everything but change nothing.
- States the ACs demand: default (open plan, has tests); empty membership (open plan, zero tests,
  guide to add tests); empty progress (zero tests → progress area shows an empty state, not a
  percentage); per-test outcome variety (passed/failed/aborted/in-progress/not-run all representable
  at once); add-tests picker (search, multi-select, already-included markers); close confirmation
  (verdict required, not-run-count warning); closed/read-only (locked, verdict banner, no
  edit/membership/close affordances); role-gated (viewer sees content, not actions); loading; error.
- Viewport: desktop-first 1440px.
- Cite: reuse the shell anatomy of `test-plans-index.html` (screen 1) — this is the same app,
  navigated one level deeper.

### 3. milestones-board — Milestones view
- Route: `/projects/[projectSlug]/milestones`
- Purpose: named delivery goals with a target date, aggregating the readiness of the Test Plans
  attached to them.
- User stories: BK-205 — create a milestone with a target date; BK-206 — assign test plans and track
  milestone readiness
- The user must be able to: see every milestone in the project (name, target date, days remaining,
  creator); create a milestone with a name (required, unique per project), a required target date
  that must be today or later (rejects past dates with a clear message), and an optional description;
  open a milestone to see its details and edit name/description/date while it's active; attach
  existing Test Plans to a milestone and detach them (a plan may be attached to more than one
  milestone); see an overall readiness aggregate across all attached plans (e.g. "12 of 20 tests
  passed, 60 percent") plus a per-plan breakdown row, recalculating live as plans are attached or
  detached; see an overdue signal on both the list and a milestone's own detail when its target date
  has passed and readiness is still below 100 percent; click through from an attached plan's row to
  that plan's detail. Viewers can see everything but create/edit/attach/detach are not available to
  them.
- States the ACs demand: default (populated list, active milestones); empty list (no milestones yet,
  guide to create one); create-validation (past target date / duplicate name, inline message);
  milestone with no attached plans (readiness area shows an empty state inviting attachment, not a
  percentage); readiness populated (aggregate + per-plan rows); overdue (flagged distinctly from
  on-track, never color alone); loading; error.
- Viewport: desktop-first 1440px.
- Cite: reuse the shell anatomy of `test-plans-index.html` (screen 1) — same App Shell, "Milestones"
  active in nav instead of "Test Plans"/"Plans".

## Hard constraints

- Name each screen file exactly `test-plans-index.html`, `plan-detail.html`, `milestones-board.html`
  — the repo maps files by slug.
- No new tokens — use only the `user:bunkai` design-system package's native names. A value not in
  the frozen contract is a defect, not a creative choice.
- `:focus-visible` must render a 1px `--accent` outline with 1px offset on every interactive element;
  full keyboard operability (tab order, Enter/Space activation, Esc to close overlays).
- Color is never the sole signal for status/outcome/severity — pair every colored chip/dot/badge with
  a text label.
- WCAG AA contrast throughout (dark theme).
- Destructive/consequential confirmations (close a plan, detach a plan, remove a test) must name the
  exact object being acted on in the confirmation copy.
- No gradients, no glassmorphism, no emoji anywhere in the UI.
- All three screens share one persistent global App Shell (sidebar nav + topbar) — same chrome
  anatomy as the rest of Bunkai, "Test Plans" (screens 1-2) / "Milestones" (screen 3) marked active
  in the nav.
- UI copy in ENGLISH.

## Export & return

MCP-driven (Open Design daemon, project `bunkai-bk-201-test-plans-milestones`, design system
`user:bunkai`). The orchestrating agent commissions one `start_run` per screen (skill
`frontend-design`, agent `claude`), sequential, then copies the finished artifacts from
`data/projects/bunkai-bk-201-test-plans-milestones/*.html` into this same folder
(`.context/designs/bunkai-test-management-tool/bk-201-test-plans-milestones/`).
