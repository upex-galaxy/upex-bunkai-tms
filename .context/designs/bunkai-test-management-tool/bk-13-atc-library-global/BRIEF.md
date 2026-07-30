# Design brief — Bunkai TMS / bk-13-atc-library-global

Tool session: NEW Open Design project `bunkai-bk-13-atc-library-global`, design system
`user:bunkai` (the repo's frozen `DESIGN.md` mirrored as an OD user package — same package the
`bk-30-test-runs-index` / `bk-31-bug-reports` / `bk-44-metrics-coverage` / `bk-85-account-settings`
batches used). Tokens are NOT re-pasted below: the attached package carries them; the generating
agent must use native token names (`--bg-0..5`, `--fg-0..4`, `--accent`, layer chip colors) rather
than inventing values.

## Mission

Design 1 screen for Bunkai, a test-management tool for QA engineers who work with hundreds of
acceptance test cases per project. The register is a dense engineer's terminal — precise, dark,
developer-first — closer to Linear and VS Code than to a consumer dashboard. This screen is the
ATC Library promoted to a global, cross-project view: today ATCs only exist nested inside a
Project's explorer tree; this screen is the workspace-wide index a QA Lead or engineer reaches for
when they don't yet know which Project an ATC lives in — "find the reusable test fragment first,
worry about its Project second." We describe WHAT the screen must accomplish; HOW it looks is your
call — layout, composition, hierarchy, component choices, density and micro-interactions are fully
delegated to you. Your only hard boundary is the design contract carried by the attached
`user:bunkai` package: never invent colors, fonts, spacing or radii outside it.

When done, export and return the files as described in "Export & return".

## Product context

Bunkai (分解) treats an ATC (Acceptance Test Case) as the reusable primitive: a small, named test
fragment anchored to one User Story and at least one Acceptance Criterion, chained together into
Tests. A workspace accumulates hundreds of these across every Project it holds, so the global
Library exists to answer "does an ATC like this already exist anywhere?" before someone
duplicates work, and to let engineers audit reuse and coverage across Project boundaries.

## Frozen design contract (non-negotiable)

Carried by the attached OD package `user:bunkai` — do not re-derive or re-pick tokens. Native
token vocabulary to use verbatim: surfaces `--bg-0`..`--bg-5`, text `--fg-0`..`--fg-4`, strokes
`--stroke-1`..`--stroke-3`/`--stroke-strong`, accent `--accent`/`--accent-hi`/`--accent-glow`, and
the ATC layer signal palette — UI `--layer-ui` (`#8b6df0`), API `--layer-api` (`#4f8cf7`), Unit
`--layer-unit` (`#2fb673`) — each layer color must always pair with its text label, never stand
alone as the only signal. Component vocabulary already established in this project's package:
`.btn`, `.chip`, `.dot`, `.kbd`, `.tag`, `.input`/`.select`, `.card`, `.seg`, `.bar`. Radii cap at
10px. No gradients, no glassmorphism, no emoji in production UI. ATC IDs render in monospace
(`ATC-xxx` pattern) everywhere they appear, matching how Test/Run/Bug IDs already render across
the rest of the product.

## Screens requested

### 1. `atc-library-global` — Global ATC Library

- Route: `/atcs` (workspace-scoped, sits alongside Home/Projects/Test Runs/Bug Reports/Metrics in
  the persistent App Shell — not nested under any single Project).
- Purpose: let anyone in the workspace browse and search every ATC that exists across every
  Project, narrow it down by facet, and jump straight into the ATC's own Project context to open
  or edit it — a lookup-and-launch surface, not an editor.
- User stories: BK-20 — Search ATCs by name and module via textual autocomplete, surfaced globally
  instead of only inside one Project's toolbar.
- The user must be able to:
  - Browse every ATC across the whole workspace in one dense list, not scoped to a single Project.
  - Search ATCs by name with fast, incremental narrowing as they type (autocomplete-style).
  - Filter by Project, by Module, by layer (UI / API / Unit), and by the User Story or Acceptance
    Criterion the ATC is anchored to — filters combine together, not mutually exclusive.
  - See at a glance which Project and Module each ATC belongs to, its layer, its mono ID, and how
    many Tests reference it ("used in N tests" reuse signal).
  - Open an ATC and land in its owning Project's context (this screen is a lookup-and-launch
    surface, not where an ATC gets edited).
  - Clear all active filters/search in one gesture and return to the full unfiltered list.
- States the ACs demand:
  - Default — the full dense list across every Project, unfiltered, communicating real scale
    (hundreds of ATCs, not a handful — this list should never look sparse or feel like a small
    table).
  - Filtered — one or more facets (Project/Module/layer/US/AC) narrowing the list together.
  - Search-no-match — a search term or filter combination that matches nothing: empty state that
    reads as "nothing found," explicitly not an error.
  - Loading — ATCs still fetching.
  - Error — the ATC query fails, with a retry path.
- Viewport: desktop-first 1440px, inside the persistent App Shell (global sidebar + topbar). This
  is a primary nav destination — "ATC Library" in the sidebar, currently showing a workspace-wide
  count badge of 623 — render the sidebar with that item active/current and its badge intact,
  matching the shell anatomy already established in this project's other screens (e.g.
  `test-runs-index.html`'s sidebar treats "Test Runs" the same way with its own badge).

## Hard constraints

- Name the screen file `atc-library-global.html` exactly — the repo maps files by slug.
- No new tokens. A value not in the attached `user:bunkai` package is a defect, not a creative
  choice.
- UI copy in ENGLISH.
- Every interactive element needs a visible `:focus-visible` treatment (1px solid `--accent`, 1px
  offset). Every filter, every search field, and every list item has a keyboard path.
- Color is never the only signal: pair layer color (`--layer-ui`/`--layer-api`/`--layer-unit`)
  with its text label; never rely on chip color alone to communicate layer or state.
- Self-contained single HTML file (inline CSS, no external assets/CDNs).
- Meet WCAG AA contrast on all text/background pairings.
- This is a dense, high-volume list screen — density and scannability take priority over
  whitespace-heavy, marketing-style layout. Hundreds of rows must feel navigable, not overwhelming.

## Export & return

MCP-driven (Mode A): Open Design generates directly into this project via `start_run`; the
orchestrating agent exports the resulting `atc-library-global.html` into this same folder
(`.context/designs/bunkai-test-management-tool/bk-13-atc-library-global/`) once the run reaches a
terminal `succeeded` status. No human copy/paste step for this batch.
