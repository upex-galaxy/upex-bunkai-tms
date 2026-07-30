# Design brief — Bunkai TMS / bk-31-bug-reports

Tool session: NEW Open Design project `bunkai-bk-31-bug-reports`, design system `user:bunkai`
(the repo's frozen `DESIGN.md` mirrored as an OD user package — same package `bk-30-test-runs-index`
and `bk-85-account-settings` used). Tokens are NOT re-pasted below: the attached package carries
them; the generating agent must use native token names (`--bg-0..5`, `--fg-0..4`, `--accent`,
`--pass/--fail/--blocked/--skipped/--running`) rather than inventing values.

## Mission

Design 2 screens for Bunkai, a test-management tool for QA engineers who work with hundreds of
acceptance test cases per project. The register is a dense engineer's terminal — precise, dark,
developer-first — closer to Linear and VS Code than to a consumer dashboard. This batch is the
Bug Reports surface: reviewing filed defects, narrowing them down by module/status/severity, and
seeing where quality is degrading across the module tree. We describe WHAT each screen must
accomplish; HOW it looks is your call — layout, composition, hierarchy, component choices, density
and micro-interactions are fully delegated to you. Your only hard boundary is the design contract
carried by the attached `user:bunkai` package: never invent colors, fonts, spacing or radii
outside it.

When done, export and return the files as described in "Export & return".

## Product context

Bunkai (分解) turns a Test — an ordered chain of Acceptance Test Cases — into a checklist a QA
engineer works through against a real environment. When a step fails mid-run, QA files a defect
right there with the failing context already captured (that filing drawer already exists inside
the Test Runner mockup — not part of this batch). This batch designs the surfaces that make sense
of defects once they exist: a filterable list QA sweeps by module/status/severity, a single
defect's full record, and — folded into the list screen — a per-module heatmap that shows QA Leads
where defects are piling up and trending worse.

## Placement note — defect heatmap (BK-42)

BK-42 (per-module defect heatmap + week-over-week trend) has no single natural screen in the
product's nav — it could live inside this Bug Reports surface or inside a future Metrics screen.
Since BK-42 is Ready For Dev now and the epic pairs "Bugs & Defect Heatmap" together by name, this
batch folds the heatmap into `bug-reports-index` as a second selectable view (List / Heatmap),
rather than waiting for the separate Metrics batch. Design both views as tabs/segments of the same
screen, sharing its filters where it makes sense (module scope) but the heatmap's own window
control (7d/30d/90d) is independent of the list's status/severity filters.

## Screens requested

### 1. `bug-reports-index` — Project Bug Reports (List + Heatmap)

- Route: `/projects/[projectSlug]/bugs`
- Purpose: let QA review every defect filed against a Project, narrow it down by module/status/
  severity, and — in a second view on the same screen — see which modules are quality hotspots and
  whether they're trending better or worse.
- User stories: BK-41 — List and filter defects by module, status, severity, with live counts.
  BK-42 — Per-module defect heatmap with count and week-over-week trend (see placement note above).
- The user must be able to, in the **List** view:
  - Review defects scoped to a chosen module, automatically including defects filed against every
    nested sub-module beneath it (a module chosen at any depth rolls up its whole subtree).
  - Filter by status (open, in progress, resolved, closed) and by severity (P1–P4), combinable
    together.
  - See live counts broken down by severity and by status for whatever is currently in view — the
    counts reflect the full filtered set, not just the visible page.
  - See a clear "no defects match" state when a filter combination returns nothing — never a blank
    screen.
  - Read per-row context at a glance: title, module (with full path for nested modules), severity,
    status, and whether it's linked to a Run.
- The user must be able to, in the **Heatmap** view:
  - See one cell per active module, each showing the module's full path (so nested modules with
    duplicate names, e.g. two different "Payment" sub-modules, stay distinguishable), its defect
    count for the selected window, and a week-over-week trend direction (rising / falling / flat).
  - Switch the window between 7d, 30d, and 90d (30d is the default); counts and trends recompute
    per window.
  - Immediately spot which modules are the strongest hotspots — the emphasis must combine visual
    weight with count text and a label/legend, never rely on color alone.
  - See zero-defect modules rendered clean and clearly distinct from hotspots, not hidden.
  - Trust the data is fresh: a newly filed defect should be reflected in the heatmap promptly, and
    the view should expose some as-of/freshness cue.
  - Understand a trend that moved from zero defects to some defects as "rising" without a nonsense
    percentage (no literal "infinity"); a flat zero-to-zero module reads as "flat", not an error.
- States the ACs demand:
  - List default — full unfiltered list scoped to the project, with counts.
  - List filtered/combined — status + severity + module filters applied together, list and counts
    both narrow accordingly.
  - List no-match — a filter combination matches nothing: empty list, counts show zero, not an
    error state.
  - Heatmap default — every active module has a cell, 30-day window.
  - Heatmap window-switched — 7d/30d/90d, counts and trends update, selected window always visible.
  - Heatmap boundary — a module with zero defects in both the current and previous window reads as
    a clean "flat" cell, never as broken or missing data.
  - Loading and error states for both views (list still fetching / heatmap still fetching; query
    fails with a retry path).
- Viewport: desktop-first 1440px, inside the persistent App Shell (global sidebar + topbar — this
  is a primary nav destination, "Bug Reports" active in the sidebar, not a modal or drawer).

### 2. `bug-detail` — Single defect record

- Route: `/projects/[projectSlug]/bugs/[bugId]`
- Purpose: let anyone open one defect and see its full context in one place — what it is, where it
  lives in the module tree, how it was reproduced, what run/test it came from (if any), and whether
  it has synced out to the team's external tracker.
- User stories: BK-40 — displays the context a defect carries once filed (module, severity,
  steps-to-reproduce, linked ATC/Run, evidence links) as a read view, not the filing form itself
  (that drawer already exists in the Test Runner mockup and is out of scope here). BK-43 — surfaces
  the one-way sync status to the external tracker.
- The user must be able to:
  - See the defect's title, severity (P1–P4), current status, and its module shown with full path.
  - Read the steps-to-reproduce and, when the defect was filed from a run, see the linked failing
    ATC and the originating Run referenced clearly.
  - See a standalone defect (filed with no run attached) clearly show it has no linked run, rather
    than an empty/broken-looking reference.
  - See up to 10 attached evidence links, each openable.
  - See the defect's sync status to the external tracker: synced (with a way to open the external
    item), sync-failed (a clear badge, while the defect remains fully usable and nothing else about
    it looks broken), or no sync attempted (workspace has no tracker integration — no badge, no
    error, this is a normal quiet state).
- States the ACs demand:
  - Default — synced defect with a run/ATC link.
  - Standalone — no linked run.
  - Sync-failed — badge visible, rest of the record fully intact and readable.
  - No integration configured — no sync affordance shown at all, not an error.
- Viewport: desktop-first 1440px, inside the persistent App Shell. Reuse the shell anatomy and the
  severity/status chip language of `bug-reports-index` (screen 1 of this batch) so the two screens
  read as one coherent surface.

## Hard constraints

- Name each screen file with its `{screen-slug}` exactly (`bug-reports-index.html`,
  `bug-detail.html`) — the repo maps files by slug.
- No new tokens. A value not in the attached `user:bunkai` package is a defect, not a creative
  choice.
- UI copy in ENGLISH.
- Every interactive element needs a visible `:focus-visible` treatment (1px solid `--accent`, 1px
  offset). Every filter, view switch, and window control has a keyboard path.
- Color is never the only signal: severity, status, trend direction, and sync state must each pair
  color with text and/or an icon — the signal palette (`--fail`/`--blocked`/`--skipped`/`--running`/
  `--pass`) is available but always paired.
- Contrast must hold WCAG AA against the dark surfaces.
- Every identifier (Bug id, Run id, ATC id, module code) renders in JetBrains Mono; prose renders
  in Inter.
- This is a primary nav destination, not a standalone flow: render it inside the same persistent
  App Shell (sidebar + topbar) already established by this product's other screens — "Bug Reports"
  is the active sidebar item.
- No destructive actions on these two screens (no delete/edit-status controls) — keep both
  read/filter-focused per the stories' out-of-scope notes; do not invent an edit or status-change
  affordance that isn't backed by an AC.

## Export & return

**Open Design** (local app, MCP-driven): runs are commissioned via `start_run` against project
`bunkai-bk-31-bug-reports`. Once a run reaches `succeeded`, its artifact file lives under this
project's data directory; the orchestrating agent copies it into
`.context/designs/bunkai-test-management-tool/bk-31-bug-reports/` in the repo.

Preferred output: one self-contained HTML/CSS file per screen named by its `{screen-slug}`.
