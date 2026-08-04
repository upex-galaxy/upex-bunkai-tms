# Master Design Plan — Bunkai TMS

> **Visual contract. Inquebrantable.** This is the design analog of `.context/master-implementation-plan.md`.
> Source of truth for what every screen MUST look like. No developer invents UI on the fly — they cite the relevant screen section here BEFORE writing any component.
>
> **Design medium of record:** the Claude Design handoff mockups in `.context/designs/bunkai-test-management-tool/` (5 screens + `styles.css` token system). When mockup and implementation disagree, **the mockup wins** unless a divergence is explicitly ratified in §5.
>
> Last audit: 2026-06-09. Status legend: ✅ MATCH · ⚠️ PARTIAL · 🔶 DIVERGENT (gap to correct) · ❌ MISSING · 🔒 frozen contract

---

## 0. Engagement rule (READ BEFORE CODING UI)

Every user story that touches UI MUST:

1. Identify which screen(s) it affects → open that screen's section in §4.
2. Reuse the **frozen design contract** (§2) — never re-pick colors, radii, fonts, spacing.
3. Build against the **screen spec checklist**, not against intuition or the current (partial) implementation.
4. If the story genuinely requires departing from the mockup, it must be **ratified in §5 first** (with reason + cost) — silent divergence is a defect.
5. Update the screen's fidelity status in this doc when the gap closes.

> The mockups are intentionally well-designed. Treat them as a finished visual language to *implement faithfully*, not a draft to *reinterpret*.

---

## 1. Current fidelity scorecard

| Area | Fidelity | State |
|------|----------|-------|
| Design tokens (color/type/radii/shadow) | ~95% | ✅ Byte-exact — strong base |
| Atom CSS classes (`.btn/.input/.seg/.card/.bar`…) | ~30% | ⚠️ Only 4 of ~13 ported |
| App Shell (global sidebar + nav) | ~75% | ⚠️ `AppSidebar` shipped (logo 分-box, workspace switcher, nav scaffold, pinned projects, user block); missing destinations gated as "soon"; polish + persistent-project-explorer pending (BK-147) |
| Login | ~70% marketing / auth divergent | 🔶 |
| Projects (Tree/Table/Mindmap + detail) | ~70% | 🔶 Tree/Table/Mind map switcher + Tree detail pane + open-ATC tabs done (BK-98); remaining: run surfaces, mindmap coverage/bug modes, inline filter (data-gated/P2) |
| ATC Editor (form + live preview) | ~40% | 🔶 Anchoring-first, no preview |
| ATC Library (global promotion) | build 0% | ❌ Still project-scoped in impl (`projects/[slug]/atcs/*`) · ✅ mockup ready 2026-07-30 (§4.9) |
| Home / Dashboard | 0% | ❌ Missing |
| Test Runner | 0% | ❌ Missing |
| Bug Reports (+ Defect Heatmap) | build 0% | ❌ Not built · ✅ mockups ready 2026-07-30 (§4.6) |
| Metrics | 0% | ❌ Missing (no data model) · ✅ mockups ready 2026-07-30 (§4.7) |
| Test Runs | build 0% | ❌ Not built · ✅ mockups ready 2026-07-30 (§4.8) |
| Settings (5-screen suite) | build 0% | ❌ Not built · ✅ mockups ready 2026-07-30 (§4.10) |
| Test Plans & Milestones (post-MVP, 3-screen set) | build 0% | ❌ Not built — all 6 stories Backlog · ✅ mockups ready 2026-07-30 (§4.11) |
| Automation & CI Ingestion (post-MVP, 1 screen + 3 extension crops) | build 0% | ❌ Not built — all 4 in-scope stories Backlog · ✅ mockups ready 2026-07-30 (§4.12) |
| Notifications Center (post-MVP, 3-screen set) | build 0% | ❌ Not built — all stories Backlog · ✅ mockups ready 2026-07-30 (§4.13) |
| Team Chat (post-MVP, 4-screen set) | build 0% | ❌ Not built — all stories Backlog · ✅ mockups ready 2026-07-30 (§4.14) |
| Billing & Plans (post-MVP, 5-screen set) | build 0% | ❌ Not built — all stories Backlog · ✅ mockups ready 2026-07-30 (§4.15) |
| Activity (BK-49, standalone, spec-only — no mockup) | build 0% | ❌ Not built — BK-49 Ready For Dev · 🔒 DESIGN.md §2 tokens only, no mockup (D15, §5) |

Current build stage: ATC-builder (tickets BK-19, BK-96). Token layer inherited faithfully; screen structure reinterpreted; 2 mockup screens + 4 nav domains not yet built.

---

## 2. Frozen design contract 🔒

These values are **canonical**. Implementation already matches (verified byte-exact in `app/globals.css` + `tailwind.config.ts`). Do not change without a design ADR. Full design-system spec (component vocabulary, motion, a11y, theming) lives in root **`DESIGN.md`** — this section is the frozen summary; DESIGN.md is the authority for the system layer.

### 2.1 Tokens (✅ faithful — keep frozen)

| Group | Values |
|-------|--------|
| Surfaces `bg-0..5` | `#0a0b0d` · `#101216` · `#14171c` · `#1a1e25` · `#232830` · `#2d333c` |
| Text `fg-0..4` | `#f1f3f5` · `#d4d8de` · `#9aa1ab` · `#6b727c` · `#4a5057` |
| Strokes 1/2/3/strong | `rgba(255,255,255, .05 / .08 / .13 / .22)` |
| Accent (vermillion) | `--accent #d9543f` · `-hi #e87060` · `-glow rgba(217,84,63,.18)` · `-soft rgba(217,84,63,.10)` |
| Signal | pass `#2fb673` · fail `#e5484d` · blocked `#e8a838` · skipped `#8a91a0` · running `#4f8cf7` (+ `-bg` at .10/.08) |
| Layer chips | UI `#8b6df0` · API `#4f8cf7` · Unit `#2fb673` |
| Radii | `3 / 5 / 7 / 10px` (sharp) |
| Fonts | Inter (UI) · JetBrains Mono (code/IDs) · Noto Serif JP (分解 brand) |
| Base | `13px / 1.45`, font-feature-settings `cv11 1, ss01 1` |
| Shadows | pop `0 12px 28px rgba(0,0,0,.55)…` · card `0 1px 0 rgba(255,255,255,.03) inset…` |

### 2.2 Atom classes — canonical spec (⚠️ refactor target)

Mockup `styles.css` defines ~13 atom classes. Only `.dot`, `.kbd`, `.layer-chip`, `.status-chip` are ported, and 3 of those drifted. Canonical = mockup. Gaps:

| Atom | Canonical (mockup) | Current | Action |
|------|--------------------|---------|--------|
| `.dot` running pulse | box-shadow ring 2px→5px @ 0.18 alpha | opacity fade @ 0.10 | 🔶 restore box-shadow pulse |
| `.kbd` | 16px min-w / 10.5px / translucent white bg | 18px / 11px / solid `--bg-3` | 🔶 restore size+bg |
| `.status-chip` | 18px h, 1px colored border, 10.5px sans | no border, 11px | 🔶 restore border+size |
| `.layer-chip` | 18px h, sans, 1px colored border | mono uppercase, no border | 🔶 restore sans+border |
| `.btn` `.input` `.textarea` `.select` `.seg` `.tag` `.card` `.bar` `.caret` `.divider` `.t-*` | defined | ❌ not ported as classes | 🔶 port (or map shadcn variants 1:1 to these specs) |

> Decision needed (track in §5): port mockup atoms as literal CSS classes, OR map existing shadcn/React components to these exact specs. Either way the *visual output* must match the mockup atoms.

---

## 3. App Shell 🔶 (highest-priority gap)

The mockup renders a persistent global shell on every screen (`Shell` = Sidebar + Topbar + content). **It now largely exists** — `components/layout/AppSidebar.tsx` is mounted in `app/(app)/layout.tsx` inside a `grid-cols-[224px_1fr]` shell (audit predating BK-147 said it was missing; that is stale). Note the name collision still stands: `components/layout/Sidebar.tsx` is the *per-project module-tree explorer*, distinct from the global `AppSidebar.tsx`. Remaining BK-147 work is shell polish + making the **project** explorer persist across the detail routes (D6), not building the global shell from scratch.

| Element | Canonical spec | Current | Verdict |
|---------|----------------|---------|---------|
| Persistent global sidebar (`<aside>` full-height) | rendered on every non-login screen | `AppSidebar` mounted in `app/(app)/layout.tsx` (224px grid) | ✅ shipped |
| Logo | `分` (single kanji) in vermillion box + "Bunkai" | `Wordmark` = `分解` text, no box, not in shell | 🔶 |
| New (+) button | ghost icon in sidebar header | none | ❌ |
| Workspace switcher | `UG` gradient avatar + "upex-galaxy" + chevron, in sidebar | topbar dropdown, no UG avatar, mixes project name | ⚠️ relocate+restyle |
| Search ⌘K | full-width sidebar button "Search or jump to…" + ⌘K | `CommandPalette` stub, not mounted | ⚠️ wire + place |
| Main nav | Home / Projects `5` / ATC Library `623` / Test Runs `3` / Bug Reports `33` / Metrics / Settings (icon + badge) | none | ❌ build |
| Pinned projects sub-nav | label + `+`, project rows (mono code + name + status dot) | none | ❌ |
| Bottom user block | MT gradient avatar + "Mariko Tanaka" + "QA Architect · v0.4.2" + More | `UserMenu` topbar: initial + email, no name/role/version | ⚠️ |
| Topbar | 40px, `bg-1`, bottom border, left/center/right slots | `h-10 bg-surface-1 border-b` | ✅ keep |
| ScreenSwitcher floating "Screens" btn | prototype-only jumper | none | ✅ correctly omitted (prototype device) |

**Priority: P1.** The shell is the frame every other screen hangs on; absence blocks faithful nav for all screens.

---

## 4. Screen specs (9 screens)

Order = mockup screen number, then nav-implied domains.

### 4.1 Login — 🔶 (marketing ~70%, auth gap)
Mockup: `.context/designs/.../screens/login.jsx` · Impl: `app/(auth)/login/`

| Feature | Verdict | Action |
|---------|---------|--------|
| 2-col grid 1fr/460px, gradient, 32px grid overlay, kanji 分解 + accent dot, BUN·KAI, etymology, IQL/ATC/KATA ticks, disclaimer, footer | ✅ | keep — near-faithful port |
| Left panel hidden `<lg` | 🔶 | mockup always-visible; restore or ratify responsive hide |
| Brand mark | 🔶 | use Logo component (分 box), not `BUNKAI·TMS` text |
| H1 size 30px → 24px; version v0.4.2 → v0.1.0 | ⚠️ | restore 30px; version may stay current |
| **Auth method: OAuth GitHub+Google primary** | ✅ **delivered (D1 resolved, BK-3)** | OAuth GitHub+Google enabled end-to-end: enabled buttons (faithful to `login.jsx`), server initiation + CSRF state, callback code exchange. Coexists with password-primary + magic-link. See §5 D1 + ADR-0008. |
| Self-hosted card hover-reveal URL | ⚠️ | restore hover interaction |
| Demo "Skip to workspace" | ✅ | correctly omitted |

### 4.2 Home / Dashboard — ❌ (0%, build from scratch)
Mockup: `screens/home.jsx` · Impl: none (`app/page.tsx` redirects only)

Required: welcome banner ("Welcome back, {name}"), sprint-day eyebrow ("SPRINT 24-Q2 · DAY 7/10"), 4 stat cards (TOTAL ATCS / ACTIVE RUNS / OPEN BUGS / COVERAGE w/ deltas), Recent projects list (coverage `.bar` progress + module/ATC counts + last activity), Recent activity feed (last-24h, actor + action + target + time), Active test runs table (Run/Project/Mode/Status/Progress/Executor), header actions Sync / Filter / Start run.
**Blocked by:** runs + bugs + coverage data models (don't exist). **Priority: P2** (needs data domains first).

### 4.3 Projects — 🔶 (~35%, IA divergent)
Mockup: `screens/project.jsx` · Impl: `app/(app)/projects/[projectSlug]/` + `project-explorer.tsx` + `AtcTable.tsx` + `AnchoringPanel.tsx`

| Area | Feature | Verdict | Action |
|------|---------|---------|--------|
| Toolbar | Breadcrumb `›` 4-level live path | ⚠️ | 3 items, `/`, "All ATCs" static → make live + `›` |
| Toolbar | **Tree/Table/Mind map toggle** | ❌ | build view switcher |
| Toolbar | Inline filter box (name/ATC ID/tag) | 🔶 | replaced by CommandPalette → add inline filter |
| Toolbar | New ATC + `N` kbd / New Test | ⚠️ | add kbd binding; New Test deferred |
| Explorer | "EXPLORER" header | ✅ | keep |
| Explorer | **Filter chips all/fail/blocked/unrun + counts** | ✅ | **done (BK-9)** — live counts from tree; hidden when project has 0 ATCs |
| Explorer | Tree hierarchy | ✅ | module→story→AC/ATC; **stories are accordions** (AC+ATC collapse until toggled), ATCs nest under their US showing slug not UUID. `folder`/`test` nodes stay presentation-only (D4) |
| Explorer | Status dots / layer chips on rows | ✅ | layer chips on ATC leaves; status dots on ATC leaves + **roll-up status dots on module/story rows** (worst-of-subtree, derived from ATC statuses) |
| Explorer | Context menu (Open/Run/Edit/Rename/Duplicate/Copy ID/Link/Deps/Delete) | ✅ | **done (BK-10)** — custom right-click popover; Duplicate/Run render `soon`; hover icons kept as touch fallback |
| Explorer | **Panel collapse + drag-resize** (Jira-style divider) | ✅ | **added** (UX review) — collapse to rail, resize 220–520px. Beyond mockup; ratified §5 D8 |
| Explorer | **Create-ATC shortcut from story/AC** (deep-link `/atcs/new?story&ac`) | ✅ | **added** (UX review) — pre-anchors module+story+AC in the editor. Ratified §5 D8 |
| Tabs | Open-ATC tabs row (dot+id+layer+close, active accent top-border) | ✅ | **done** — Tree view opens ATCs in closeable in-pane tabs (BK-98) |
| Detail | Status badge + last-run-failed banner + Run btn + Used-by-tests | 🔶 | **status badge done** (read-only detail pane); last-run banner + Run + Used-by deferred — need runs/tests data (§7) |
| Detail | Linked story card US-742 | ✅ | **done** — read-only card + AC checkboxes in the Tree detail pane |
| Detail | AC checkboxes | ✅ | keep — matches |
| Detail | Steps / Assertions read-only render | ✅ | **done** — read-only render in the Tree detail pane (full editor stays at `/atcs/{id}` §4.4) |
| Views | Tree / Table / **Mind map** | ✅/✅/🔶 | **toggle + Table + Topology mind map done (BK-98)**; mindmap Coverage/Bug-density modes deferred (need coverage/bug data §7) |

**Priority: P1 done** (toggle ✅, filter chips ✅, tabs ✅, Tree detail pane ✅). Remaining P2: mindmap Coverage/Bug-density + run surfaces (banner/Run/Used-by), inline toolbar filter (BK-20).

### 4.4 ATC Editor — 🔶 (~40%, reconceived anchoring-first)
Mockup: `screens/editor.jsx` (Compose LEFT + **Live Preview RIGHT**) · Impl: `components/atcs/AtcEditor.tsx` + `NewAtcEditor.tsx` + `StepEditor.tsx` + `AnchoringPanel.tsx`

| Area | Feature | Verdict | Action |
|------|---------|---------|--------|
| Topbar | Back / Cancel / Save ⌘S / id+editing | ✅/✅/⚠️/⚠️ | wire ⌘S keybind (chips decorative) |
| Topbar | **Auto-saved · Preview-only · Run draft** | ❌ | build all 3 |
| Compose | Title required | ✅ | keep |
| Compose | Layer segmented UI/API/Unit + dots | ✅ | keep — faithful |
| Compose | Tags chip input | ✅ | keep |
| Compose | Module field | 🔶 | edit=read-only, new=`<select>`; mockup=dropdown both |
| Compose | User story autocomplete (inline, ⌘N new) | 🔶 | moved to right AnchoringPanel → restore inline search |
| Compose | AC multi-select chips "N selected from M" | 🔶 | in right panel → restore inline chips + counter |
| Compose | Steps authoring | ✅ | **Monaco markdown code-editor kept (D3 reversed — product decision)** + inline format hint. Mockup's structured rows intentionally not restored. |
| Compose | Assertions authoring | ✅ | **Monaco YAML code-editor kept (D3 reversed)** + inline format hint. |
| Preview | **ENTIRE Live Preview pane** (read-only badge, "what runners/agents see", rendered card: id+layer+draft+breadcrumb, title, story, ✓ACs, steps, assertions code block, tags, "schema · atc.v1", "Updated live as you edit") | ❌ | **build** — right column is AnchoringPanel instead |

**Priority: P1.** Live-preview is the screen's defining feature; its absence is the single biggest editor gap. Note: anchoring-enforcement model is the impl's addition — reconcile in §5 (keep enforcement, but restore preview as the right pane; anchoring controls move/inline).

### 4.5 Test Runner — ❌ (0%, build from scratch)
Mockup: `screens/run.jsx` · Impl: none

Required: run header (RUN-1839 + test name + SegProgress stepper "Step 3 of 6" + pass/fail/blk counts + Pause/Abort), left Test Outline (step list w/ pass/fail icons + layer chips + executor card), main step detail ("FOLLOW THESE STEPS" ordered sub-steps + "← now"), **Pass / Fail / Block** verdict buttons (P/F/B kbd), Notes & evidence (textarea + Attach + URL), **Report bug** right drawer (title, severity P1–P4 segmented, module auto-from-context, description, steps-to-reproduce copied from active step, tags), keyboard footer (P/F/B/⌘↵/⌘B).
**Blocked by:** runs + bugs data models. **Priority: P2.**

### 4.6 Bug Reports — ❌ build 0% · ✅ mockups ready (2026-07-30)
Nav badge `33`. No route, no data model. **The 🔒 mockup gate is LIFTED**: a 2-screen set was
generated via Open Design (MCP-driven Mode A, project `bunkai-bk-31-bug-reports`, design system
`user:bunkai`) and lives in `.context/designs/bunkai-test-management-tool/bk-31-bug-reports/`
(provenance: `BRIEF.md` in the same folder). Both screens share the App Shell (sidebar with "Bug
Reports" active, topbar), English copy, frozen §2 tokens verbatim, `:focus-visible` 1px `--accent`,
severity/status color always paired with text/icon. Filing itself is still covered by the runner's
Report-bug drawer (`run.jsx`, BK-40) — not redesigned here.

**Placement note (BK-42 defect heatmap):** BK-42 had no single natural screen in the nav (§8
previously listed "Metrics · Bug Reports"). Folded into `bug-reports-index.html` as a second
selectable view (List / Heatmap) rather than deferred to the future Metrics batch, since BK-42 was
Ready For Dev and the epic pairs "Bugs & Defect Heatmap" together by name. If a future Metrics
screen (§4.7) also wants a heatmap summary panel, it should reference this screen's heatmap
treatment rather than re-derive one.

| Screen file | Route(s) | Spec highlights (checklist source) |
|---|---|---|
| `bug-reports-index.html` | `/projects/[projectSlug]/bugs` | List view: module filter (selecting a module rolls up all nested sub-modules by path prefix), status (open/in progress/resolved/closed) and severity (P1–P4) toggle chips, combinable; live severity/status counts over the full filtered set (not just the page); full module path shown for disambiguation; run-link column (`RUN-xxx` or a "—" with sr-only text for standalone defects). Heatmap view (same screen, view switch): one cell per active module with full path, defect count, and week-over-week trend; 7d/30d/90d window (30d default); count buckets Clean/Low/Elevated/Hotspot with a text legend/tag (never color-only); zero-to-N trend reads "Rising +N", zero-to-zero reads "Flat ±0" (no infinite percentages); freshness cue. States strip: list default / filtered-combined / no-match (zeroed counts, not an error) / heatmap 30d / heatmap 7d / heatmap zero-flat boundary / loading skeleton / error with per-view Retry. |
| `bug-detail.html` | `/projects/[projectSlug]/bugs/[bugId]` | Read-only single-defect record, reuses screen 1's shell + chip language. Header: id, severity chip, status chip, title, full module path, filed-by/date. Description, mono numbered steps-to-reproduce with the failing step highlighted (`--fail-bg` + "Failed here" tag), Expected vs Actual boxes, evidence list (`N / 10`, each row openable). Right rail: Details kv (severity/status/module/layer/environment/reporter/filed), Origin (linked `ATC-xxx` + `RUN-xxx` with "Failed at step N" cross-reference), External tracker panel. No edit/status-transition controls (out of scope — BK-40's editing-after-filing note). States strip: default (synced + linked run) / standalone (no run, "Filed manually" quiet state, not an error) / sync-failed (badge in header + failure-reason card, rest of record intact) / no-integration-configured (tracker panel absent entirely, no badge, no error). |

Build order note: BK-41 (list/filter + counts) and BK-42 (heatmap) both render `bug-reports-index.html`
(the two views of one screen); BK-40 (file from failing step) continues to render into the
Test Runner's Report-bug drawer, not this screen; BK-43 (sync) renders the sync-status states on
`bug-detail.html`. **Priority: P1** — all 4 BK-31 stories are Ready For Dev and were blocked only by
this mockup gate; that block is now lifted.

### 4.7 Metrics — ❌ build 0% · ✅ mockups ready (2026-07-30)
Nav item, no badge. No data model — was previously "only implied", no mockup screen. **The 🔒
mockup gate is LIFTED**: a 2-screen set was generated via Open Design (MCP-driven Mode A, project
`bunkai-bk-44-metrics-coverage`, design system `user:bunkai`) and lives in
`.context/designs/bunkai-test-management-tool/bk-44-metrics-coverage/` (provenance: `BRIEF.md` in
the same folder). Both screens share the App Shell, English copy, frozen §2 tokens verbatim,
`:focus-visible` 1px `--accent`, and reuse §4.6's Bug Reports heatmap grammar (Clean/Low/
Elevated/Hotspot tiers + absolute week-over-week delta) for the defect-density panel rather than
re-deriving one. Coverage % also still surfaces on Home (§4.2, unchanged).

| Screen file | Route(s) | Spec highlights (checklist source) |
|---|---|---|
| `metrics-dashboard.html` | `/projects/[projectSlug]/metrics` | KPI row (AC coverage %, executed coverage %, modules fully covered, median recovery cycle). Coverage-by-module table with a segmented All / Coverage gaps / Never run filter — "never run" (ATCs bound, zero executions) reads distinctly from "no coverage" (nothing bound); segmented coverage bars encode executed (`--pass`) vs. bound-never-run (`--skipped`) vs. unbound (empty track). Fully-covered modules get a calm, distinct chip treatment. No-coverage panel lists ACs/modules with zero linked ATCs. Recovery-cycle table per user story: resolved cycles (mono duration), "not yet green" in-progress cycles (`--running` + elapsed-so-far, pulsing), and "no cycle · never failed" (`--skipped`, distinct from both). Defect-density panel reuses §4.6's heatmap tier/trend grammar verbatim. Each section links out to `traceability-chain.html`. States strip: default / fully-covered module / never-run filter vs. no-coverage (two distinct empty states) / in-progress vs. no-cycle recovery states / loading skeleton / error with retry. |
| `traceability-chain.html` | `/projects/[projectSlug]/traceability` | Full US→AC→ATC→Test→Run→Bug chain for one selected user story, single-page, no extra navigation: per-AC cards over a shared 4-column grid (ATC+layer chip / Test / latest Run outcome chip + `RUN-###`/date / linked Defects with ID+title+status). "No data yet" (dotted `--skipped` pill, e.g. AC has ATCs but no test/run recorded yet) is visually distinct from "uncovered" (`--fail` strip, AC has zero ATCs bound) — never a broken/null cell either way. Combinable filters (result multi-select, module, date range) with an active-filter chip summary + `aria-live` count + one-action Clear all; zero-match state ("filters excluded everything") reads distinct from the zero-coverage empty state (data doesn't exist at all); inverted date range is rejected inline without breaking other filters. Export snapshot is the screen's one mutating action — single accent button, produces a point-in-time export carrying its own real timestamp (confirmation toast, mono filename), explicitly not live-updating. States strip: full chain / partial chain / mixed AC coverage (covered + uncovered ACs on the same story) / zero-AC story / zero-coverage story (ACs exist, no ATCs anywhere) / filtered-with-results / filtered-zero-match / invalid date range / loading / error with retry. |

Build order note: BK-46 (coverage gaps + never-run filter) and BK-47 (time-to-green) both render
`metrics-dashboard.html`; BK-45 (full chain render) and BK-48 (filter the chain) both render
`traceability-chain.html`; BK-50 (export) renders the export action on `traceability-chain.html`;
BK-49 (activity stream) renders into `home.jsx`, not either of these screens (unchanged from
before). **Priority: P1** — BK-45/BK-46 are Ready For Dev and were blocked only by this mockup
gate; that block is now lifted. BK-47/BK-48 remain Shift-Left QA, BK-50 remains in Estimation —
unaffected by mockup readiness.

### 4.8 Test Runs — ❌ build 0% · ✅ mockups ready (2026-07-30)
Nav badge `3`. Active runs partially shown on Home dashboard table. **The 🔒 mockup gate is
LIFTED**: a 2-screen set was generated via Open Design (MCP-driven Mode A, project
`bunkai-bk-30-test-runs-index`, design system `user:bunkai`) and lives in
`.context/designs/bunkai-test-management-tool/bk-30-test-runs-index/` (provenance: `BRIEF.md` in
the same folder). Both screens share the App Shell (sidebar with "Test Runs" active, topbar),
English copy, frozen §2 tokens verbatim, `:focus-visible` 1px `--accent`, and treat "aborted" as
the `--blocked` signal token (anomalous termination, not `--skipped`).

| Screen file | Route(s) | Spec highlights (checklist source) |
|---|---|---|
| `test-runs-index.html` | `/projects/[projectSlug]/runs` | Project-wide run list. Combinable filters (date range, module select, status segment Passed/Failed/Aborted with `aria-pressed` — Running excluded from the status filter, executor Human/Agent/CI); Passed/Failed/Aborted totals recompute per filter combination; per-row Test, module, environment, executor mode, outcome chip (dot+text), date. States strip: default / filtered-combined / no-match (zeroed totals, explicitly "not an error") / loading (opacity-pulse skeleton) / error (mono error line + Retry, filters preserved). "Clear filters" restores full list + totals. |
| `test-run-history.html` | tab on `/projects/[projectSlug]/tests/[testId]` ("Run History") | Single-Test scoped history (self-contained page for now — a Test-detail screen doesn't exist yet; ships with an anticipatory Overview/Steps/Run History tab strip). All-time Passed/Failed/Aborted summary + 4px segmented outcome bar; single-select outcome filter (pass/fail/aborted, Running excluded, click-again or "Clear filter" resets); "Load older runs" pagination appends older rows, list stays newest-first; Duration column added vs. the project-wide row (Test/Module columns dropped — already scoped). States strip: default / filtered / empty ("No runs yet for this Test", no skeleton, no error) / pagination / loading. Continuity anchors (`RUN-472` running/agent, `RUN-461` failed/CI) reused from `test-runs-index.html`'s dataset for cross-screen coherence. |

Build order note: BK-38 (project-wide filter + totals) renders `test-runs-index.html`; BK-37 (a
Test's run history) renders `test-run-history.html`, currently as a standalone route until a
Test-detail screen is designed to host it as a tab. **Priority: P1** — BK-38 is Ready For Dev and
was blocked only by this mockup gate; that block is now lifted.

### 4.9 ATC Library — ⚠️ (project-scoped, not global) · ✅ global-view mockup ready (2026-07-30)
Nav badge `623`. Impl has ATC CRUD nested under project (`projects/[slug]/atcs/*`) but no **global cross-project library**. **Priority: P3** — promote to global view. **The 🔒 mockup gate is
LIFTED for the global view**: a 1-screen mockup was generated via Open Design (MCP-driven Mode A,
project `bunkai-bk-13-atc-library-global`, design system `user:bunkai`) and lives in
`.context/designs/bunkai-test-management-tool/bk-13-atc-library-global/` (provenance: `BRIEF.md` in
the same folder). The screen shares the App Shell (sidebar with "ATC Library" active + its `623`
badge, topbar), English copy, frozen §2 tokens verbatim, `:focus-visible` 1px `--accent`, and pairs
layer chip color (UI/API/Unit) with its text label per the standing color-not-sole-signal rule.

| Screen file | Route(s) | Spec highlights (checklist source) |
|---|---|---|
| `atc-library-global.html` | `/atcs` (workspace-scoped, not nested under a project) | Cross-project ATC index at real scale (623 deterministic rows across 8 projects). Dense rows: mono `ATC-xxx` id, name, owning Project, Module, layer chip (dot + text label, never color alone), mono `US-xxx · AC-x` anchor, "used in N tests" reuse count. Incremental name search (`/` or ⌘K focuses, Esc clears) combines with Project/Module/layer/US-AC-anchor filters (AND); one-gesture "Clear all" restores the full list. Row open is lookup-and-launch only (fires a toast naming the destination Project — no in-place edit, matching this screen's non-editor scope). States strip: default (full 623-row scale) / filtered-combined / search-no-match (explicit "not an error" empty state) / loading skeleton (opacity-pulse) / error (mono `ATC_INDEX_TIMEOUT` + Retry). |

Build order note: BK-20 (search & autocomplete) is the story this screen renders for at the global
level — its current Jira scope maps to `project.jsx`'s toolbar filter (project-scoped), so this
mockup is ahead of the story's contracted scope, not a replacement for it; treat as forward design
for the P3 global-promotion backlog item, not a new obligation on BK-20 as filed. BK-20/BK-23 remain
`BLOCKED` in Jira for unrelated contract reasons (dev-roadmap §6) — this mockup does not resolve
that.

### 4.10 Settings — ❌ build 0% · ✅ mockups ready (2026-07-30)
Nav item. Closest impl = `workspaces/[id]/members` (members only). **The 🔒 mockup gate is LIFTED**: a
5-screen suite was generated via Open Design (MCP-driven Mode A, project `bunkai-bk-85-account-settings`,
design system `user:bunkai`) and lives in `.context/designs/bunkai-test-management-tool/bk-85-account-settings/`
(provenance: `BRIEF.md` in the same folder). All screens share one Settings shell (48px rail + 216px
settings nav + topbar), English copy, frozen §2 tokens verbatim, `:focus-visible` 1px `--accent`.

| Screen file | Route(s) | Spec highlights (checklist source) |
|---|---|---|
| `settings-account.html` | `/settings`, `/settings/account` | Hub landing. Identity card (own name/email/`USR-id`/role, Sign out ghost); dense workspaces table (active = dot + "active" text); Danger zone (delete account: `alertdialog`, typed-email confirm); states strip: loading / empty (identity intact + `$ bunkai workspace create` terminal + create/join CTAs) / error (identity still renders, retriable) / session-expired. Future sections in nav announced "soon", non-focusable. |
| `settings-tokens.html` | `/settings/tokens` | PAT list (name mono + `PAT-id`, scope chips, workspace, created, expires; secret never listed; expiring row = `--blocked` chip + text; revoked row = strikethrough + fail chip). Two-step issuance modal: name + 4 fixed scopes + optional workspace + optional expiry → secret shown ONCE (`role="alert"` "never shown again", one-click copy + aria-live). Revoke: `alertdialog` naming exact token, row flips instantly. States: empty (what tokens are for + first-issue CTA) / secret-revealed / loading / error. No edit path — revoke + reissue (footer copy). |
| `settings-workspaces.html` | `/settings/workspaces` | Membership list (role chips Owner/Admin/Member/Viewer, active = dot + text; only ACTIVE memberships). Sole-owner row: NO leave button — lock + "Can't leave" (`--blocked`) + reason visible before trying. Leave: `alertdialog` naming exact workspace, typed-name confirm; post-leave live (row gone, next workspace becomes active, aria-live announce). States: single-workspace (no ambiguity) / post-leave / loading / error. |
| `account-menu-overlay.html` | shell overlay (any signed-in page) | Global-shell account menu over a dimmed Explorer page. Trigger = avatar button in rail (`aria-haspopup`/`aria-expanded`). Open menu: identity header (name + email mono), role + `WS-id · name` context row, items Settings / Personal access tokens / Sign out (real links across the suite). Full keyboard: roving tabindex, arrows wrap, Home/End, Esc + focus return, Tab closes. Sign out → `/signin` landing (no chrome, brand-clarification line) — no confirm (cheap to revert). States: closed affordance / open / keyboard-focused item / signed-out. |
| `settings-coming-soon.html` | any unshipped `/settings/*` | Honest dead-end pattern (example: `/settings/members`, chip `not shipped`). One-liner of what the section will do, "planned, no committed date", `GET → 200 · never a 404` mono line, real links back to live sections. "Every planned section" card: Members / Notifications / Billing / Environments each with one-liner + route + `soon` tag. Nav treatment: live = link; soon = `aria-disabled` div, skipped by Tab, textual tag — structural difference, never color-only. Zero fake forms/controls/JS. |

Build order note: BK-87 builds the hub shell + account (first two files), BK-88 tokens, BK-89/90
workspaces; the overlay is BK-86 (already shipped live — validate against `account-menu-overlay.html`
for fidelity polish). D11's future tech-story (relocate Environments into Settings) remains deferred.

### 4.11 Test Plans & Milestones — post-MVP · ❌ build 0% · ✅ mockups ready (2026-07-30)
No nav badge yet (all 6 stories parked in Backlog, not Shift-Left QA — future-authored work; the
epic assumes the full MVP chain ships first). **The 🔒 mockup gate is LIFTED**: a 3-screen set was
generated via Open Design (MCP-driven Mode A, project `bunkai-bk-201-test-plans`, design system
`user:bunkai`) and lives in `.context/designs/bunkai-test-management-tool/bk-201-test-plans-milestones/`
(provenance: `BRIEF.md` in the same folder). All three screens share the App Shell (sidebar with
"Test Plans" or "Milestones" active, topbar), English copy, frozen §2 tokens verbatim,
`:focus-visible` 1px `--accent`, and pair every outcome/status/overdue signal with a text label
alongside its color per the standing color-not-sole-signal rule. Briefed from each story's Jira
Scope/AC/Mockup fields (no existing screen to anchor to — dev-roadmap §5 confirmed no prior mockup
intent for this epic).

| Screen file | Route(s) | Spec highlights (checklist source) |
|---|---|---|
| `test-plans-index.html` | `/projects/[projectSlug]/plans` | Project-scoped Test Plans list: name, goal/release tag, status chip (Open/Closed, dot+text), live test count, creator; Open/Closed segmented filter with live counts. "New plan" dialog: name (required, unique per project case-insensitive, inline duplicate/blank message), optional description, optional goal. Viewer role sees the list with the create action structurally absent (locked note), not just hidden. States strip: default / empty (guides first-plan creation) / create-validation / filtered / loading / error. |
| `plan-detail.html` | `/projects/[projectSlug]/plans/[planId]` | One Test Plan's full working surface (extends screen 1's shell one level deeper — BK-202 identity/inline-edit, BK-203 membership, BK-204 progress, BK-207 close). Add-tests picker (search, multi-select, already-included tests marked, confirm-count bar); per-row remove (plan-only, test untouched elsewhere — a Test may belong to many Plans); per-member-test outcome chip (passed/failed/aborted/in-progress/not-run, dot+text) with run timestamp, click-through to that test's latest run; aggregate progress header (per-outcome counts + percent-passed bar), computed only from existing run outcomes, refreshed on view. Close flow: required verdict (passed/failed) + optional summary, confirmation names the exact plan and states the not-run-test count before finalizing; closed state is fully read-only (locked banner, frozen verdict/summary/closed-by/closed-at/progress-snapshot, every mutating control removed) — creator/admin-only close, viewer sees content only. States strip: default / empty-membership / empty-progress (no percent) / add-tests-picker / close-confirmation / closed-locked / role-gated / loading / error. |
| `milestones-board.html` | `/projects/[projectSlug]/milestones` | Project-scoped Milestones list + detail (BK-205 create/edit, BK-206 attach/readiness; reuses screen 1's shell with "Milestones" active). List: name, target date, days-remaining chip, creator; overdue milestones (target date passed + readiness <100%) get a structural overdue block, never color-only. Create/edit: name (required, unique per project) + required target date (today or later, past date rejected with a clear message) + optional description. Attach/detach existing Plans via a picker (a Plan may attach to more than one Milestone); overall readiness bar/summary + per-plan breakdown row, recalculated live on attach/detach; empty-readiness state (no plans attached) shows an invitation, never a percentage; plan rows click through to `plan-detail.html`. Viewer role: content visible, all mutating actions structurally absent. States strip: default / empty-list / create-validation / empty-readiness / populated-readiness / overdue / loading / error. |

Build order note: none of BK-202–BK-207 are Ready For Dev — the whole epic is deliberately parked
Backlog until the MVP chain (Runs, Tests) ships first. This batch is forward design for the
post-MVP P1 frontier (dev-roadmap §5), not an unblock for any story in flight today. **Priority:
post-MVP P1** — first in the epic-backbone post-MVP order, per the mockup roadmap.

---

### 4.12 Automation & CI Ingestion — post-MVP · ❌ build 0% · ✅ mockups ready (2026-07-30)
No nav badge yet (all 4 in-scope stories parked in Backlog — post-MVP work; BK-222/BK-223 excluded
from mockup scope entirely, see below). **The 🔒 mockup gate is LIFTED**: a 4-file set (1 new screen
+ 3 extension crops) was generated via Open Design (MCP-driven Mode A, project
`bunkai-bk-221-automation-ci`, design system `user:bunkai`) and lives in
`.context/designs/bunkai-test-management-tool/bk-221-automation-ci/` (provenance: `BRIEF.md` in the
same folder). All four files share English copy, frozen §2 tokens verbatim, `:focus-visible` 1px
`--accent`, and pair every status/mode/verdict signal with a text label alongside its color per the
standing color-not-sole-signal rule.

**Excluded from mockup scope:** BK-222 (submit automated run via API) and BK-223 (stream step
results during an automated run) are explicitly API-first, UI-light per the epic scope boundary —
they render into the existing/future Run detail with no dedicated screen work beyond the CI-metadata
crop below.

**Extension-crop convention (new in this batch):** 3 of the 4 files are NOT new screens — they are
targeted crops that reproduce the relevant region of an existing base screen (cited per file) and
then layer ONLY the additive CI-related elements on top, so a developer reads each file as a precise
before/after diff rather than a full redesign. The generating agent did not have live repo file
access (OD runs sandboxed); each base region was reproduced from a detailed textual anatomy
description authored in `BRIEF.md`, not by reading the actual base file — **a fidelity pass against
the real base files (`test-runs-index.html`, `run.jsx`, `project.jsx`) is recommended before build**,
flagged by the generating agent itself in its closing note on the 4th run.

| Screen file | Base screen extended | Route(s) | Spec highlights (checklist source) |
|---|---|---|---|
| `ci-results-upload.html` | — (new screen) | modal/flow off `/projects/[projectSlug]/runs` (§4.8) | BK-226. Three-step flow: choose Test + environment + JUnit XML file (drag-drop or browse, 10 MB cap) → mapping preview (report entries matched to ATC steps by position; unmapped entries and uncovered steps surfaced in distinct panels, never dropped; explicit acknowledgement gate before continuing) → confirm (coverage summary + verdict preview, any failed entry drives a "failed" verdict). Rejected-upload state names the supported format and size limit inline, no run created. On success, closes back into the runs view with the new run highlighted. Establishes the batch's reusable CI vocabulary: `.ci-ref` mono chip (branch/commit/pipeline, with a `data-empty` variant), `data-map="mapped\|unmapped\|gap"` row chips, `.verdict[data-v]` pill. States strip: choose-file / full-match preview / preview-with-gaps / rejected-upload / confirm. |
| `test-runs-index--ci-extension.html` | `test-runs-index.html` (§4.8) — filter row, totals strip, runs table | extends `/projects/[projectSlug]/runs` | BK-225. Reproduces the base screen's Date/Module/Status/Executor filters, totals strip, and Run/Test/Module/Environment/Executor/Outcome/Ran table faithfully, then adds: a derived read-only "Mode" badge per row (Manual for human executor, Automated for agent-or-CI executor — summarizes, does not replace, the existing Executor column); a Mode filter (All/Manual/Automated) composing with the existing filters; per-mode totals in the totals strip ("Manual 12 · Automated 30"); a dedicated empty state for Mode=Automated with zero results (explains no automated runs reported yet, points to agents/CI as the reporting path — distinct from the base screen's generic no-match state). States strip: default-with-badges / Automated-filter-composed-with-another-filter / Automated-filter-zero-results. |
| `run--ci-extension.html` | `run.jsx` (§4.5) — Test Runner header bar | extends run detail (finished/CI-reported run — no dedicated finished-run-detail screen exists yet; this crop is the first design intent for it, scoped to the CI-metadata addition only) | BK-228. Reproduces the header bar's structure (left identity block, center run/test identity, right actions), adapted from the live-run controls to a finished/read-only run (verdict chip + tally + timestamp), then adds a "CI context" row below the title: branch chip, short commit in JetBrains Mono with an external-link affordance to the repository host, pipeline name linking to its URL. Degrades per the AC: row absent entirely when a run carries no CI metadata; commit renders as plain mono text with an inline "configure repository URL" hint when the project has none configured. Reuses the `.ci-ref` chip from `ci-results-upload.html` verbatim. States strip: full CI context on a Passed run / no-repository-URL degradation / manual run with no CI row. |
| `project--ci-extension.html` | `project.jsx` (§4.3/§4.4) — `TableView` dense list + `ATCDetail` header/rail pattern | extends the not-yet-designed Test library list + Test detail view (adapts the ATC-scoped list/detail anatomy to a Test-scoped one — no dedicated Test list/detail screen exists yet, `TestDetail` in `project.jsx` is a placeholder; same judgment call as §4.7's "no mockup, only implied" precedent) | BK-227. Two regions in one file. Region A (list): reproduces `TableView`'s filter-pill toolbar + sticky dense table, adds an automation-status badge per row (Manual-only default / Automation candidate / Automated — one tone per status, reusing `--skipped`/`--blocked`/`--running` respectively) and a Status filter pill with live per-status counts. Region B (detail): reproduces `ATCDetail`'s header + right-rail pattern, adds the status badge as a real dropdown control for member+ roles (3 states, no enforced order) vs. a structurally read-only badge (no popup affordance, not just disabled styling) for viewers, plus an append-only "Automation status history" rail panel (author/timestamp/from→to, newest first). Deliberately does not reuse the CI branch/commit/pipeline vocabulary — automation status is independent of CI metadata per the story's business rules. States strip: mixed-status list with counts / list filtered to one status / detail dropdown open (member role) / detail read-only + history (viewer role). |

**Design-agent judgment call flagged:** the "Automated" automation-status tone reuses `--running`
(blue) — a token whose canonical meaning elsewhere is "run in progress" — rather than introducing a
new token. Acceptable under the no-new-tokens constraint and visually distinct in context (a Test's
static property badge vs. a Run's live status), but worth a second look during the build-time
fidelity pass noted above.

Build order note: none of BK-225–BK-228 are Ready For Dev — the whole epic is deliberately parked
Backlog, post-MVP. This batch is forward design for the post-MVP P1 frontier (mockup roadmap #6),
not an unblock for any story in flight today. **Priority: post-MVP P1** — second in the epic-backbone
post-MVP order, per the mockup roadmap, right after §4.11 Test Plans & Milestones.

### 4.13 Notifications Center — post-MVP · ❌ build 0% · ✅ mockups ready (2026-07-30)
All BK-208 stories parked Backlog (post-MVP). **The 🔒 mockup gate is LIFTED**: a 3-screen set was
generated via Open Design (MCP-driven Mode A, project `bunkai-bk-208-notifications`, design system
`user:bunkai`) and lives in `.context/designs/bunkai-test-management-tool/bk-208-notifications/`
(provenance: `BRIEF.md` in the same folder). English copy, frozen §2 tokens verbatim,
`:focus-visible` 1px `--accent`, unread state never color-only.

| Screen file | Route / surface | Spec highlights |
|---|---|---|
| `notifications-inbox.html` | in-app inbox — sidebar bell + panel, global app shell (D17: mockup drew a topbar, live shell is the sidebar) | Workspace-event inbox: run finished/aborted (BK-211) and bug assignment/status (BK-212) events render with their established entity vocabulary (`RUN-xxx` / `BUG-xxx` mono chips + signal tokens paired with text); unread = structural marker + text, mark-read/mark-all affordances; states strip per batch convention. |
| `settings-notifications.html` | `/settings/notifications` — extends the §4.10 Settings hub | Notification preferences (BK-213): settings shell verbatim (rail + settings nav + topbar) with "Notifications" now LIVE in the nav (Members/Billing/Environments stay "soon"); per-event-type and per-channel controls, states strip. Cross-reference: §4.10 build order — whoever builds the hub first hosts this section. |
| `email-digest-template.html` | email surface (non-app) | Unread digest (BK-214): email-safe constrained layout, still token-faithful; send rule surfaced in the design ("Daily at 17:00 workspace time · only when unread count > 0 — a zero-unread digest is never sent"). |

Provenance note: the batch's final screen completed in OD moments before the orchestrating agent hit
a session limit; export + this spec were completed by the main session against the verified
`succeeded` run states (all 3 runs exit 0, artifacts intact). No refinement runs were needed.

---

### 4.14 Team Chat — post-MVP · ❌ build 0% · ✅ mockups ready (2026-07-30)
All BK-210 stories parked Backlog (post-MVP). **The ⚠️ wireframe-pending flag in §8 is LIFTED**: a
4-screen set was generated via Open Design (REST-driven Mode A, design system `user:bunkai`) and
lives in `.context/designs/bunkai-test-management-tool/bk-210-team-chat/` (provenance: `BRIEF.md`
in the same folder). Screen 1 ran in project `bunkai-bk-210-team-chat`; screens 2–4 each ran in a
dedicated satellite project (`bunkai-bk-210-team-chat-2/-3/-4`) after the primary project's
follow-up-run channel stopped forwarding new messages to the agent (repeatable daemon glitch, not a
design defect) — each satellite prompt inlined screen 1's concrete shell anatomy (panel/header/
message-list/composer class-level structure) so visual continuity held without relying on OD's
cross-run memory. English copy, frozen §2 tokens verbatim, `:focus-visible` 1px `--accent`, no
color-only signals.

| Screen file | Route / surface | Spec highlights |
|---|---|---|
| `chat-panel-workspace.html` | global panel/dock in the App Shell — workspace channel | BK-215 real-time general channel: header (channel + roster toggle + close), newest-at-bottom message list with own/collapsed-sender treatment, `@mention` autocomplete pill (BK-217, stronger fill when self-mentioned), `ATC-xxx`/`RUN-xxx` mono id-chips inline, composer with Enter/Shift+Enter/@ hint row; states cover read-only viewer composer, inline edit-in-progress, own-delete tombstone, admin-delete tombstone (BK-219), and a reconnect-catch-up sequence. |
| `chat-panel-project.html` | panel within `/projects/[projectSlug]` — project channel | BK-216 per-project channel: adds a channel switcher above the shared shell (general pinned + accessible project channels with unread badges that clear on open); reuses screen 1's message/composer/roster anatomy verbatim, scoped to project membership. |
| `chat-entity-rich-link.html` | component inside the chat panel (both channel types) | BK-218 rich cards for ATC/Test/Run references: icon + title + status/verdict row with project name as a second line, resolved-card states plus same-footprint restricted (no access) and deleted (entity gone) placeholders, composer-side entity picker popover. |
| `chat-search.html` | overlay within the chat panel | BK-220 message-history search: input + channel/author/date filter chips + result list (channel badge, author, date, highlighted snippet) over the same panel shell; default/populated/filtered/no-matches states, jump-to-message-in-context on select. |

Cross-epic note: BK-217 mention delivery renders into the Notifications inbox (§4.13,
`notifications-inbox.html`) — that screen's entity-chip and signal-token idiom is the one this
batch's mention pills and rich-link id-chips deliberately reuse, so the two surfaces read as one
system.

---

### 4.15 Billing & Plans — post-MVP · ❌ build 0% · ✅ mockups ready (2026-07-30)
All BK-224 stories parked Backlog (post-MVP, last in the epic-backbone dependency order — depends
on BK-1 Tenancy/Identity and BK-87 Settings hub). **The ⚠️ wireframe-pending flag in §8 is
LIFTED**: a 5-screen set was generated via Open Design (REST-driven Mode A, design system
`user:bunkai`) and lives in `.context/designs/bunkai-test-management-tool/bk-224-billing/`
(provenance: `BRIEF.md` in the same folder). Provenance/workaround: each screen ran in its own
fresh Open Design project (`bunkai-bk-224-billing`, `-2`, `-3`, `-4`, `-5`) rather than as
follow-up runs inside one project/conversation — a repeatable daemon bug silently drops the new
instruction on follow-up runs in the same project, first observed and worked around in the §4.14
Team Chat batch. Each satellite project's prompt inlined the shell anatomy (CSS class vocabulary,
grid structure) read directly from the actual exported `billing-overview.html`, which ran first
and established the Settings-hub billing surface. English copy, frozen §2 tokens verbatim,
`:focus-visible` 1px `--accent`, no color-only signals, all 5 runs exit 0 with clean artifacts —
no refinement runs were needed.

| Screen file | Route / surface | Spec highlights |
|---|---|---|
| `billing-overview.html` | `/settings/billing` — extends the §4.10 Settings hub | Plan/seats/usage (BK-229): settings shell verbatim (rail + settings nav + topbar) with "Billing" now LIVE in the nav; plan card (tier, per-seat price, renewal — Free plan shows no renewal/payment, an upgrade entry instead); seat meter "N of limit seats" (active members only, pending invites never count); per-resource usage meters (projects, run-history retention) with an 80%+ "near limit" state that pairs color with a text chip, never color alone; states strip per batch convention. |
| `billing-details-invoices.html` | `/settings/billing` (same page, lower section) — extends the §4.10 Settings hub | Billing details + invoices (BK-231): reuses `billing-overview.html`'s shell/card classes verbatim as the next section of the same page. Editable company billing profile card; payment method shown as a redacted brand+last-4 reference only (never a full card number); invoice history table (period, amount, status, PDF download); persistent failed-renewal banner naming the grace-period end date with a retry gated on a new payment method. Payment-method entry is explicitly framed as happening in the payment provider's hosted window — no live card-number/CVC form fields anywhere. |
| `plan-comparison-checkout.html` | `/settings/billing/upgrade` — reached from `billing-overview.html`'s upgrade CTA | Upgrade flow (BK-230): three-column tier comparison (Free/Team/Enterprise) with the current plan structurally marked; Team checkout (seat quantity + payment step) preserves the plan/seat choice through a declined-payment retry; Enterprise is a contact path only, no checkout; admin (non-owner) view replaces the confirm action with a note naming the workspace owner. Same non-functional-payment-placeholder convention as the invoices screen. |
| `billing-downgrade-cancel.html` | `/settings/billing` (dialog/flow off the plan card) — extends the §4.10 Settings hub | Downgrade/cancel (BK-233): "Change plan" and "Cancel subscription" as de-emphasized secondary/tertiary actions on the plan card; downgrade requires a consequence-preview `alertdialog` naming the exact affected-resource count and a "nothing deleted" statement before confirming; pending-cancellation banner with end date + Resubscribe; admin (non-owner) view has both actions structurally absent, not just disabled. |
| `plan-limit-warning.html` | cross-app reusable component, demonstrated in an Explorer/project-creation context (App Shell, NOT the Settings hub) | Plan-limit warnings (BK-232): the only screen in this batch that departs from the Settings-hub shell — reuses just the 48px icon-rail chrome from the rest of the product. Non-blocking dismissible warning banner at 80%+ usage; blocking paywall modal at 100% with a role-aware single action (owner: direct "Upgrade plan" CTA; member/viewer: names the workspace owner, no checkout offered). Establishes the shared component pattern every plan-limited resource across the app will reuse. |

Build order note: none of BK-229–BK-233 are Ready For Dev — the whole epic is deliberately parked
Backlog, post-MVP, last in the mockup roadmap's epic-backbone order. This batch is forward design
for the post-MVP P2 frontier, not an unblock for any story in flight today. `billing-overview.html`
and `billing-details-invoices.html` share the Settings hub container with §4.13's
`settings-notifications.html` — whoever builds the hub first should sequence tab/section layout
for Billing and Notifications together to avoid divergent hub chrome, per the anomaly already
flagged when §4.13 shipped.

---

### 4.16 Activity (BK-49) — ❌ (0%, spec-only, no mockup)
Mockup: none — see §5 D15. Impl: none yet.

**Ratified DEPARTURE (D15, §5).** Standalone route `/activity`, NOT the Home dashboard's recent-activity widget (§4.2 — Home is 0%-built, no ticket, and its widget is a non-paginated last-24h view incompatible with this story's required "load older" pagination). No mockup exists for this screen shape, so it builds against **`DESIGN.md`'s frozen §2 tokens only** (surfaces, text, strokes, accent, signal colors, radii, fonts — no new colors/spacing/components), structurally modeled on Run History's list + load-older pattern (§4.8, `components/runs/RunHistoryView.tsx`) for layout inspiration only:

- Header: page title + a one-line "workspace activity, newest first" subhead (mirrors `RunHistoryView`'s summary-line convention, no outcome-style totals chips — activity has no pass/fail axis).
- List: newest-first rows, each showing actor (resolved email or safe fallback), action label (from the allowlist mapping — see `implementation-plan.md`), item label (payload-derived or generic `"a <entity_type>"` fallback), relative-or-absolute timestamp (mirrors `RunHistoryView`'s deterministic UTC slice-format, no client-locale drift/hydration mismatch).
- States: loading skeleton (mirrors `RunHistorySkeleton`), empty state (no activity yet), error state with Retry (mirrors `RunHistoryView`'s whole-view error block, first-page vs append-error split), page-end state (no more "Load older" control), append-error (inline, rows already loaded stay mounted).
- "Load older" control at the foot, same idle/loading/retry label pattern as `run-history-load-older`.
- No filters in MVP (no outcome-equivalent axis to filter by — event-type filtering is a candidate future enhancement, not in this story's scope per `scope.md`/`out-of-scope.md`).

Nav entry point: TBD in the implementation plan (Stage 1) — likely a new App Shell nav item or a Home-adjacent link; the App Shell (§3) does not yet enumerate an Activity destination, so this is additive nav, not a gap fill.

---

## 5. Divergences — gaps to correct, UI-first

**Guiding principle (2026-06-08):** **maximize UI fidelity to the mockup WITHOUT triggering backend refactors.** The mockup wins at the *presentation layer*. Where matching the mockup would only require frontend work (layout, components, render), close the gap. Where it would require reverting/rebuilding schema, APIs, or auth infra, **adapt the UI on top of the existing backend** instead — keep the data model, change only what renders. A gap is "to correct" only to the extent it's a frontend change.

Decision rule per divergence:
- **UI-only cost** → correct now (align to mockup).
- **Backend cost** → do NOT refactor backend; build the faithful UI as a presentation layer over the current data, or defer + ratify via ADR.

| # | Divergence | Layer | Decision (UI-first) |
|---|------------|-------|---------------------|
| D1 | Auth: magic-link only vs mockup OAuth GitHub+Google | **Backend** | **RESOLVED (2026-06-24, BK-3).** OAuth infra sequenced and shipped: GitHub+Google enabled end-to-end (server initiation + custom CSRF state → 403, callback code exchange, faithful enabled buttons), coexisting with the password+magic-link rails. See ADR-0008. (Originally: keep visually faithful but disabled until infra sequenced.) |
| D2 | ATC Editor: AnchoringPanel right pane vs Live Preview pane | **UI** | Correct → restore Live Preview as the right pane. Keep anchoring **enforcement logic** (backend-backed) but move its controls inline into the compose column. No API change. |
| D3 | Steps/Assertions: Monaco code-authoring vs mockup's structured numbered rows / enter-to-add list | **UI (product decision)** | **REVERSED 2026-06-09 — KEEP the Monaco code editors.** Product decision: the user prefers code-authoring (type the markdown/YAML format → live preview renders it). The mockup's structured rows are intentionally NOT restored. Mitigation shipped: an inline format hint (`AuthoringFormatHint`) under each editor shows the exact syntax with a real example, so the box isn't mistaken for a free textarea. |
| D4 | Explorer tree: real `module→story→AC→atc` vs mockup `module→folder→atc/test` | **Backend if reverted** | **Keep the DB.** Render `folder`/`test`/tab nodes as a **presentation layer** over the existing model (mockup already embraces stories+ACs — US-742 / AC-742-3). Zero schema/API change. |
| D5 | App shell: per-page chrome vs global persistent Sidebar+nav | **UI** | Correct → build global shell (§3). Nav badges can read live counts from existing APIs; missing-domain badges render `0`/hidden until those domains exist. |
| D6 | Projects: routed multi-page vs single-page workbench w/ tabs | **UI** | Correct → add open-ATC tabs as a client-side layer over current routes. No backend change. |
| D7 | Login left panel hidden `<lg` | **UI** | Correct → restore always-visible (or ratify responsive hide via ADR). |
| D8 | Explorer additions beyond mockup: **US accordion**, **panel collapse/drag-resize**, **Create-ATC shortcut from story/AC** | **UI (additive)** | **Ratified ADD** (2026-06-09 UX review). Mockup's flat tree becomes unusable at scale (20 US × ~10 AC = 200 flat rows), so stories collapse their AC/ATC children; the panel gains a Jira-style collapse/resize divider; story/AC rows deep-link to the pre-anchored ATC editor. All UI-only over the existing model — zero schema/API change, consistent with D4. |
| D9 | Test builder (BK-27): mockup `TestDetail` is a placeholder (`project.jsx:564-570`) — no authored builder spec | **UI (derived)** | **Ratified DERIVATION** (2026-06-12, BK-27 Stage 1). Builder implemented as a routed page `/projects/{slug}/tests/new` by analogy with the ATC-creation precedent (`atcs/new` page + editor component); chained-ATC rows reuse the ATCDetail "Used by"-row anatomy (`project.jsx:529-546`); frozen §2 tokens only. Deferred with it: Test `code` generation (`T-{PROJ}-{SLUG}` in mock; schema is title-only — render title for MVP) and tree placement under modules (Tests are workspace-scoped, no module anchor — flat "Tests" explorer group). Reorder UX = BK-28; rich Test detail tab = BK-32. Ratified ADD (2026-06-12): explorer Test rows show a muted mono chain-length count (additive, D8-style affordance — chain size at a glance, no mockup equivalent). |
| D10 | Test detail view (BK-32): mockup `TestDetail` is a placeholder (`project.jsx:564-570`) — no authored spec for the read-only expanded view | **UI (derived)** | **Ratified DERIVATION** (2026-06-19, BK-32 Stage 1). Read-only expanded Test view implemented as a routed page `/projects/{slug}/tests/{testId}` (analogy with `atcs/[atcId]` detail page); explorer Test rows become navigating `Link`s (mirrors `AtcTable`). Each ATC rendered as an expanded card reusing ATCDetail anatomy: "Used by"-row header (`project.jsx:528-546`), ordered steps `<ol>` (`:476-501`), stacked assertions `<code>` (`:502-518`) — neutral styling, no pass/fail color (no Runs, §7 gate). Frozen §2 tokens only. Strictly read-only (no edit/add/remove/reorder — those are BK-28+). Empty per-section state for ATCs with 0 steps/0 assertions; **NO zero-ATC empty Test** (BK-27 ≥1-ATC rule wins, overrides BK-32 `business-rules.md` line ~10 — flagged for PM/glossary reconciliation). |
| D11 | Project Environments management (BK-148): mockup home is the unbuilt **Settings** screen (§4.10, 🔒 mockup-gated) — no authored env-management spec | **UI (spec-only departure)** | **Ratified DEPARTURE** (2026-06-20, BK-148 Stage 1). Env CRUD (list/add/rename/remove) lands on the **project explorer rail** (an Environments group sibling to the module tree + Tests group), NOT the unbuilt Settings screen — building a `/settings/environments` route would be net-new navigation inheriting the Settings 🔒 gate. Reuses the module-CRUD idiom byte-for-byte: hand-rolled overlay modals hosted in `project-explorer.tsx`, `fetch → router.refresh() → friendlyError → sonner toasts`, member+ gate, frozen §2 tokens only — **zero new design-system primitives**. No ADR needed (no architectural reversal, fully reversible when the Settings screen ships — the eventual home per §4.10 with per-env config is noted as a future tech-story). |
| D12 | Auth method: mockup `login.jsx` shows OAuth GitHub+Google as the only auth controls — no password or magic-link form. BK-166 makes password the PRIMARY method, email-first, with magic-link as visible secondary and OAuth disabled. | **UI + Backend (ratified product)** | **Ratified DEPARTURE** (2026-06-21, BK-166). Password-primary email-first form is primary; magic-link visible secondary; OAuth stays disabled (D1). Backend: public signUp (202) + new /auth/confirm (OTP→session+PAT); admin auto-confirm removed. Coexistence invariant (ADR-0001) reaffirmed; see ADR-0007. Frozen §2 tokens only. |
| D13 | Test Run History (BK-37): §4.8 routes the screen as a **tab on the Test detail page**, but its own build-order note says "standalone route until a Test-detail screen is designed to host it" — a premise that went stale when D10 shipped `/projects/{slug}/tests/{testId}` on 2026-06-19. The mockup markup follows the stale premise: standalone page, sidebar **Test Runs** marked current, breadcrumb `PRJ / Project / Test Runs / {test}`. | **UI (live-UI-first)** | **Ratified DERIVATION** (2026-07-30, BK-37 Stage 1, user-ratified). Run History ships as a **sub-route** `/projects/{slug}/tests/{testId}/runs` behind a shared `layout.tsx` that hosts the Test header plus a `Steps \| Run History` tab strip. Critical Rule #14: the live Test detail page is the real host, so the mockup's standalone framing is obsolete. Sub-route over client-side tabs so the active tab and the outcome filter live in the URL — deep-linkable and directly assertable by QA. Consequences: breadcrumb stays `Tests / {title}` (arrival is via the Test, not the project-wide run index) and the sidebar keeps the project explorer active. The mockup's `Overview` tab is dropped — the live page has no Overview content to route to, and an empty tab is worse than two honest ones. Frozen §2 tokens only; no new primitives. |
| D14 | Signal token for **aborted**: §4.8 rules an aborted run as the `--blocked` family (an anomalous termination, not a failed assertion), but `app/globals.css` shipped `.status-chip[data-status='aborted']` in the `--fail` family with BK-36, and `RunnerView` renders it that way. The same run therefore read red in the runner and amber in history. | **UI (design-system correction)** | **Ratified CORRECTION** (2026-07-30, BK-37 Stage 2, user-ratified). `app/globals.css` now maps `aborted` to the `--blocked` family **app-wide**, superseding BK-36's mapping; the previously-missing `.dot[data-status='aborted']` rule was added alongside so the chip's dot is not unstyled. Rationale: run history lists Failed and Aborted side by side and its whole purpose is comparing outcomes at a glance — two identical reds defeat the outcome filter's color dots and the summary proportion bar. **RunnerView's aborted chip shifts from red to amber with it, by design.** Colour only, no behavioural change. Note for the design track: §2.2's canonical atom column (`.status-chip` 18px/10.5px/coloured border, `.kbd`, ring-pulse dot) still disagrees with the Open Design mockups' own atoms (`.chip` 11.5px/transparent border, opacity pulse), and §2.2's own "port mockup atoms as literal CSS vs map to components" question is still unrecorded here — BK-37 followed the live CSS per Rule #14 and did **not** resolve that conflict. Worth a dedicated design tech-story. |
| D16 | Coverage view (BK-46), §4.7 `metrics-dashboard.html`: Jira AC2's literal Gherkin text ("shows only the criteria and modules whose coverage has never been executed") reads as wanting a per-AC itemization for the "not run" state, symmetric to the `no_coverage` array's per-AC list for the "uncovered" state — but the mockup's own `applyFilter` JS and its MOD-001..008 demo data only ever expose a per-**module** "Never run" filter/count, no per-AC not-run list. | **UI (spec-only departure)** | **Ratified DEPARTURE** (2026-08-01, BK-46 final chain review, flagged by adversarial review, backfilled here — the divergence itself was made correctly at Slice-1 authoring time and matches the shipped mockup exactly; only this §5 paper trail was missing until now). `bunkai_report_project_coverage` (`0048_project_coverage_report.sql`) and `ProjectCoverageView` follow the mockup literally: per-module not-run counts/filter, no per-AC not-run list. The AC2 Gherkin text is read as narrower-than-literal, matching Critical Rule #15's UI-first principle (mockup fidelity over a literal AC reading, when the two disagree and the mockup is the more recent/authoritative source). No schema/API change needed if a future story adds per-AC itemization — `no_coverage`'s existing per-AC shape is the template. No ADR needed (UI-scope-only, fully additive and reversible later). |
| D15 | Activity Stream (BK-49): §4.2/§8 map BK-49 into the Home dashboard's `home.jsx` recent-activity widget, but Home is 0%-built and blocked by data domains that don't exist yet (§7 — runs/bugs/coverage), has no Jira ticket of its own, and the mockup's widget is a non-paginated last-24h list — incompatible with this story's AC2 ("load older", deterministic keyset pagination), which the PO-proxy's bounded-5sp estimate explicitly named in scope. | **UI (spec-only departure)** | **Ratified DEPARTURE** (2026-07-31, BK-49 Stage 1, product-owner-ratified in chat). Ships as a **standalone route** `/activity` (Option A of 3 weighed — see `comments.md`), not embedded in Home. Waiting for Home (Option B) was ruled out: it depends on work that doesn't exist and isn't scoped into any current epic. Shrinking to a non-paginated 24h widget matching the mockup as-drawn (Option C) was ruled out: it would silently cut already-agreed scope. **No mockup exists for a standalone Activity screen** (Home's widget is the only activity-shaped mockup, and it doesn't fit — see above), so this also trips the missing-row/no-mockup path: built against **`DESIGN.md`'s frozen §2 tokens only**, no mockup fidelity target, structurally modeled on the closest existing paginated-list pattern in this codebase — Run History's list + load-older UI (`components/runs/RunHistoryView.tsx`, BK-37, §4.8) — for layout/structure inspiration only (its own screen area, own filters where they make sense, no visual copy-paste). No ADR: this is a page-placement/routing decision, reversible by re-hosting the same feed component inside Home once Home is scoped and built; it does not touch schema, auth, or any cross-cutting invariant (fails ADR gate 1). |
| D17 | Notifications bell + panel (BK-209), §4.13 `notifications-inbox.html`: the mockup mounts the bell in a **topbar** ("global overlay, mounted in the App Shell topbar... near the search box"), but this product's actual persistent global shell element is the **sidebar** (`components/layout/AppSidebar.tsx`, §3/D5) — there is no equivalent global topbar to mount into; the per-page `Topbar.tsx` bar (§3 row "Topbar... ✅ keep") is a route-level element, not the global shell. | **UI (live-UI-first)** | **Ratified DEPARTURE** (2026-08-03, BK-209 Slice 3 Stage 1, backfilled here — the placement call was made correctly ahead of implementation per Critical Rule #14/#15, matching D5's own precedent of building against the live shell rather than the mockup's topbar framing; only this §5 paper trail was missing until now). Bell + unread badge live in `AppSidebar.tsx`'s top row, beside the existing "New project" affordance — the closest live equivalent to "next to search, in the topbar." The panel itself is portaled to `document.body` (`react-dom`'s `createPortal`) rather than positioned in-flow: `<aside>` is `overflow-hidden` (its own root className), which silently clips a 380px-wide panel anchored via plain CSS against a 224px-wide rail — caught during live-UI validation, not visible from source alone. Position is computed from the bell button's own `getBoundingClientRect()` at open time. Frozen §2 tokens only; reuses the sidebar's own existing overlay idiom (fixed backdrop + Escape-to-close, mirroring the workspace switcher already in this file) — no new design-system primitives. No ADR: this is a shell-placement/rendering-technique decision, fully reversible, and does not touch schema, auth, or any cross-cutting invariant (fails ADR gate 1). |
| D18 | Project sub-nav (BK-265): §3 specs the GLOBAL shell nav (Home / ATC Library / Test Runs / Bug Reports / Metrics as workspace-wide aggregates) and no mockup exists for a PROJECT-level sub-nav. Meanwhile `/projects/{slug}/runs` (BK-38), `/bugs` (BK-41, BK-42) and `/metrics` (BK-46) shipped to `staging` with zero `href` anywhere in the app — reachable only by typing the URL. | **UI (spec-only departure)** | **Ratified DEPARTURE** (2026-08-04, BK-265). Access to the three surfaces comes from a project-scoped sub-nav in the persistent project shell (`app/(app)/projects/[projectSlug]/project-sub-nav.tsx`, rendered by `project-shell.tsx`), NOT from the global sidebar: those items are workspace-wide aggregates that do not exist and stay `soon` + non-focusable per the ratified product decision. The shell is the host because it already survives the project's detail routes (BK-147 / ADR-0003), so the sub-nav is present on the workbench, an open ATC, an open Test, and each of the three surfaces without re-mounting per route. Entries are derived from routes that actually exist — one per built surface, none invented (ATCs and Tests have no list route of their own). Active entry is resolved by EXACT path match, so `aria-current="page"` stays literally true and `/tests/{testId}/runs` (BK-37) cannot light up the project-wide Test Runs entry. Built against `DESIGN.md` frozen §2 tokens plus the shell's own live chrome grammar (the view-toggle pill styling, the sidebar's active `bg-surface-3 text-fg-0`) per Critical Rule #14 — no new colours, radii, fonts or spacing, no new design-system primitives. The topbar breadcrumb's last crumb now tracks the active section instead of hardcoding "All ATCs" (it would otherwise contradict the sub-nav the moment these routes became reachable). No ADR: no schema, auth, or cross-cutting invariant is touched, and the sub-nav is fully reversible. |

> **Net:** D2, D5, D6, D7 are pure UI — close them for full fidelity. D1 and D4 carry backend cost — make them **look** faithful now, defer the backend (OAuth infra / never revert schema) to separate, explicitly-sequenced work. D3 is a **ratified product divergence** (keep the code editors, do not restore the mockup's structured rows). D8 is an additive UI enhancement (no mockup equivalent) ratified from the 2026-06-09 UX review. This honors both rules: design fidelity up, backend churn zero.

---

## 6. Refactor backlog (prioritized)

**P1 — design-language integrity + core screens already in flight**
1. Port/align atom classes (§2.2) — `.btn/.input/.seg/.card/.bar` + fix `.dot/.kbd/.status-chip/.layer-chip` drift.
2. Build global App Shell (§3) — sidebar, main nav + badges, pinned projects, user block, Logo 分-box. (D5)
3. ATC Editor Live Preview pane + structured Steps/Assertions. (D2, D3)
4. Projects: view toggle, explorer filter chips, open-ATC tabs, inline filter box, live breadcrumb. (D6)
5. Login: OAuth buttons **visually** faithful (disabled until infra), Logo component, H1 30px, panel always-visible. (D1 UI-only, D7)

**P2 — new screens needing data domains**
6. Home / Dashboard (needs runs/bugs/coverage data). (§4.2)
7. Test Runner (needs runs/bugs data). (§4.5)
8. Projects: Mind map view + run-result surfaces (banner, Run btn, Used-by-tests).

**P3 — remaining nav domains**
9. Bug Reports, Test Runs index, global ATC Library, Metrics (author spec — no mockup), Settings.

---

## 7. Data models that gate design (not yet existing)

These domains have **no schema/API/UI** and block faithful screens:
- **Runs** (Test Runs, Active runs, run-result banners, runner) → blocks Home, Test Runner, Projects detail.
- **Bugs** (Bug Reports, Report-bug drawer, OPEN BUGS card) → blocks Home, Runner, Bug Reports.
- **Coverage / Metrics** (COVERAGE card, progress bars, Metrics screen) → blocks Home, Metrics.

Design cannot reach 100% fidelity until these exist. Sequence backend domains alongside the P2/P3 screen work.

---

## 8. User Story → Screen map

> Purpose: every US knows which screen(s) it renders into, so its visual spec comes from §4 — and later we can **attach the matching wireframe/mockup to each US in Jira** (when we start uploading wireframes). One US can touch several screens; the **primary** screen is bold.

| Epic | Story | Screen(s) | Mockup ref |
|------|-------|-----------|------------|
| **BK-1 Tenancy & Identity** | BK-2 Email magic-link | **Login** | `login.jsx` |
| | BK-3 OAuth sign-in | **Login** (D1 resolved — OAuth shipped) | `login.jsx` |
| | BK-4 Workspace create | **Login**/onboarding · Shell switcher | `login.jsx`, `app.jsx` |
| | BK-5 Invite teammate | Settings · (workspace members) | §4.10 |
| | BK-6 Workspace switch | **Shell** workspace switcher | `app.jsx` §3 |
| | BK-166 Auth: sign-up + sign-in with email & password | **Login** — password-primary departure (D12, ADR-0007) | `login.jsx` |
| **BK-7 Project & Module Hierarchy** | BK-8 Create project | **Projects** index · Home recent-projects | `home.jsx`, `project.jsx` |
| | BK-9 Create modules | **Projects** explorer tree | `project.jsx` §4.3 |
| | BK-10 Rename/delete module | **Projects** explorer (context menu) | `project.jsx` |
| | BK-11 Move module | **Projects** explorer | `project.jsx` |
| | BK-147 App Shell — ATCs/Tests as tabs + persistent explorer | **Shell** (§3, D5) · **Projects** workbench (§4.3, D6) | `app.jsx` §3, `project.jsx` §4.3 |
| | BK-148 Project Environments — list/add/rename/remove | **Projects** explorer rail — Environments group (D11, live-first; no Settings mockup) | `project-explorer.tsx` |
| **BK-12 User Stories & AC** | BK-14 User Story CRUD | **Projects** explorer (story nodes) · ATC Editor anchoring | `project.jsx`, `editor.jsx` |
| | BK-15 AC CRUD + reorder | **Projects** detail · **ATC Editor** AC chips | `editor.jsx` |
| | BK-16 Markdown editor + render | ATC Editor · Story detail | `editor.jsx` |
| | BK-17 Jira import (JQL/ADF) | **Projects** explorer (import action) | §4.3 |
| **BK-13 ATC Library** | BK-18 ATC create/edit REST API | (backend — feeds **ATC Editor**) | `editor.jsx` |
| | BK-19 ATC builder UI (multi-step) | **ATC Editor** | `editor.jsx` §4.4 |
| | BK-20 ATC search autocomplete | **ATC Library** · Projects toolbar filter | `project.jsx` · §4.9 `bk-13-atc-library-global/atc-library-global.html` (global-view mockup, ahead of current story scope) |
| | BK-21 ATC edit propagation/versioning | ATC Editor · Tests | `editor.jsx` |
| | BK-22 ATC usage report ("used in N tests") | **Projects** detail "Used by tests" | `project.jsx` |
| | BK-23 ATC duplicate/clone | ATC Editor · Explorer context menu | `project.jsx` |
| **BK-24 Tests (chains of ATCs)** | BK-27 Assemble test by chaining | **Projects** (Test nodes) · Tests builder | `project.jsx` |
| | BK-28 Reorder ATCs in a test | Tests builder | `project.jsx` |
| | BK-32 Open test, see every ATC | **Projects** detail (test view) | `project.jsx` |
| | BK-33 Assign tags to a test | Tests · ATC Editor tags | `editor.jsx` |
| **BK-30 Manual Execution & Runs** | BK-34 Start a manual run | **Test Runner** | `run.jsx` §4.5 |
| | BK-35 Mark each step pass/fail/block | **Test Runner** step list | `run.jsx` §4.5 |
| | BK-36 Abort a run in progress | **Test Runner** (abort action) | `run.jsx` §4.5 |
| | BK-37 View a test's past runs | **Test Runs** index (per-test history) | §4.8 · `bk-30-test-runs-index/test-run-history.html` |
| | BK-38 Filter all project runs | **Test Runs** index · Home active-runs | §4.8 · `bk-30-test-runs-index/test-runs-index.html` |
| | BK-39 Finish a run with a final verdict | **Test Runner** (finish/verdict) | `run.jsx` §4.5 |
| **BK-31 Bugs & Defect Heatmap** | BK-40 File defect from failed step | **Test Runner** (Report-bug drawer) · Bug Reports (read view) | `run.jsx` §4.5 · §4.6 · `bk-31-bug-reports/bug-detail.html` |
| | BK-41 List/filter defects | **Bug Reports** | §4.6 · `bk-31-bug-reports/bug-reports-index.html` |
| | BK-42 Defect heatmap | **Bug Reports** (heatmap view, placement note §4.6) | §4.6 · `bk-31-bug-reports/bug-reports-index.html` |
| | BK-43 Sync defects to Jira | Bug Reports (integration) | §4.6 · `bk-31-bug-reports/bug-detail.html` |
| **BK-44 Coverage & Traceability** | BK-45 US→bug evidence chain | **Traceability** | §4.7 · `bk-44-metrics-coverage/traceability-chain.html` |
| | BK-46 Surface untested ACs/modules | **Metrics** · Home coverage card | §4.7 · `bk-44-metrics-coverage/metrics-dashboard.html`, `home.jsx` |
| | BK-47 Time-to-green per US | **Metrics** | §4.7 · `bk-44-metrics-coverage/metrics-dashboard.html` |
| | BK-48 Filter chain by verdict/module | **Traceability** | §4.7 · `bk-44-metrics-coverage/traceability-chain.html` |
| | BK-49 Activity stream (read feed) | **Activity** (standalone route, spec-only — D15, no mockup) | §5 D15 · `components/runs/RunHistoryView.tsx` (structural precedent only) |
| | BK-50 Export assembled chain | **Traceability** (export) | §4.7 · `bk-44-metrics-coverage/traceability-chain.html` |
| **BK-85 Account & Settings** | BK-86 View identity/role + sign-out | **Shell** user block · Settings | `app.jsx` §3 · `bk-85-account-settings/account-menu-overlay.html` |
| | BK-87 Settings hub + account view | **Settings** | §4.10 · `bk-85-account-settings/settings-account.html` + `settings-coming-soon.html` |
| | BK-88 Manage personal access tokens | **Settings** | §4.10 · `bk-85-account-settings/settings-tokens.html` |
| | BK-89 View my workspaces | Settings · Shell switcher | §4.10 · `bk-85-account-settings/settings-workspaces.html` |
| | BK-90 Leave a workspace | **Settings** | §4.10 · `bk-85-account-settings/settings-workspaces.html` |
| **BK-29 QA Credentials** | (epic) | `/qa` page (out of mockup scope) | — |
| **BK-201 Test Plans & Milestones** | BK-202 Create a test plan grouping tests | **Test Plans index + Plan detail** (new, Project scope) | §4.11 · `bk-201-test-plans-milestones/test-plans-index.html` + `plan-detail.html` |
| | BK-203 Add/remove tests from a plan | **Plan detail** (test picker) | §4.11 · `bk-201-test-plans-milestones/plan-detail.html` |
| | BK-204 Track plan progress from run outcomes | **Plan detail — progress view** | §4.11 · `bk-201-test-plans-milestones/plan-detail.html` |
| | BK-205 Create a milestone with a target date | **Milestones view** (new, Project scope) | §4.11 · `bk-201-test-plans-milestones/milestones-board.html` |
| | BK-206 Assign plans + track milestone progress | **Milestones view** · Plan detail | §4.11 · `bk-201-test-plans-milestones/milestones-board.html` |
| | BK-207 Close a plan with an outcome summary | **Plan detail** (close action) · Test Plans index | §4.11 · `bk-201-test-plans-milestones/plan-detail.html` + `test-plans-index.html` |
| **BK-208 Notifications Center** | BK-209 Inbox of workspace events | **Notifications inbox** — sidebar bell + panel (D17) | §4.13 · `bk-208-notifications/notifications-inbox.html` |
| | BK-211 Run finished/aborted events | Notifications inbox (event producer — renders into BK-209 inbox) | §4.13 · `bk-208-notifications/notifications-inbox.html` |
| | BK-212 Bug assignment/status events | Notifications inbox (event producer — renders into BK-209 inbox) | §4.13 · `bk-208-notifications/notifications-inbox.html` |
| | BK-213 Notification preferences | **Settings — Notification preferences** (extends §4.10 hub) | §4.10 · §4.13 · `bk-208-notifications/settings-notifications.html` |
| | BK-214 Email digest of unread notifications | **Email digest template** (non-app surface — email design) | §4.13 · `bk-208-notifications/email-digest-template.html` |
| **BK-210 Team Chat** | BK-215 Workspace real-time channel | **Team Chat panel** (new — workspace channel) | §4.14 · `bk-210-team-chat/chat-panel-workspace.html` |
| | BK-216 Per-project channel | **Team Chat panel** (project channels) | §4.14 · `bk-210-team-chat/chat-panel-project.html` |
| | BK-217 Mention a teammate | **Chat panel** · Notifications inbox (mention delivery) | §4.14 · `bk-210-team-chat/chat-panel-workspace.html` · §4.13 `bk-208-notifications/notifications-inbox.html` |
| | BK-218 Share ATC/Test/Run as rich link | **Chat panel** — entity rich card | §4.14 · `bk-210-team-chat/chat-entity-rich-link.html` |
| | BK-219 Edit/delete my own messages | **Chat panel** (message actions) | §4.14 · `bk-210-team-chat/chat-panel-workspace.html` |
| | BK-220 Search the message history | **Chat search** (within chat panel) | §4.14 · `bk-210-team-chat/chat-search.html` |
| **BK-221 Automation & CI Ingestion** | BK-222 Submit automated run via API | API-first, UI-light — renders into existing **Run detail** | `run.jsx` §4.5 |
| | BK-223 Stream step results during automated run | API-first, UI-light — renders live into existing **Run detail** | `run.jsx` §4.5 |
| | BK-225 Filter runs by manual/automated | **Test Runs index** — execution-mode badge/filter (extends existing runs view) | §4.12 · `bk-221-automation-ci/test-runs-index--ci-extension.html` |
| | BK-226 Upload a CI results file | **CI results upload** (modal/flow off the runs view) | §4.12 · `bk-221-automation-ci/ci-results-upload.html` |
| | BK-227 Track automation status of a test | **Test library — automation status** (extends existing test library/list) | §4.12 · `bk-221-automation-ci/project--ci-extension.html` |
| | BK-228 CI-triggered runs linked to commit/branch | **Run detail — CI metadata** (extends run detail) | `run.jsx` §4.5 · §4.12 · `bk-221-automation-ci/run--ci-extension.html` |
| **BK-224 Billing & Plans** | BK-229 View plan, seats & usage | **Settings — Billing overview** (extends §4.10 hub) | §4.10 · §4.15 · `bk-224-billing/billing-overview.html` |
| | BK-230 Upgrade to a paid plan | **Billing — plan comparison & checkout** | §4.15 · `bk-224-billing/plan-comparison-checkout.html` |
| | BK-231 Billing details + invoices | **Billing — details & invoices** (extends §4.10 hub) | §4.10 · §4.15 · `bk-224-billing/billing-details-invoices.html` |
| | BK-232 Plan-limit warnings + upgrade path | **Plan-limit warning states** (cross-app banner/modal patterns) | §4.15 · `bk-224-billing/plan-limit-warning.html` |
| | BK-233 Downgrade or cancel the subscription | **Billing — downgrade/cancel flow** (extends §4.10 hub) | §4.10 · §4.15 · `bk-224-billing/billing-downgrade-cancel.html` |

> **Wireframe-to-Jira workflow (future):** when uploading wireframes, attach each US's mockup crop/section (from the screen named above) to its Jira issue. Screens with no mockup yet (Metrics, Settings, Bug Reports, Test Runs, ATC Library global) need wireframes authored first — flagged ❌/⚠️ in §1.
>
> **Post-MVP mockup roadmap: complete.** Every post-MVP epic cluster in the mockup roadmap now has
> a designed screen set. **BK-201 Test Plans & Milestones is done** — 3-screen set shipped
> 2026-07-30, see §4.11. **BK-221 Automation & CI Ingestion is done** — 1 new screen + 3 extension
> crops shipped 2026-07-30, see §4.12. **BK-208 Notifications Center is done** — 3-screen set
> shipped 2026-07-30, see §4.13. **BK-210 Team Chat is done** — 4-screen set shipped 2026-07-30,
> see §4.14. **BK-224 Billing & Plans is done** — 5-screen set shipped 2026-07-30, see §4.15. Build
> work against every one of these sets remains 0% (all source stories parked Backlog) — this
> footnote tracks design-mockup coverage only, not implementation status (§1 scorecard is the
> source of truth for build state).

---

## 9. Maintenance

- Re-run the fidelity audit when a P1/P2 item lands; update §1 scorecard + the screen's table.
- New mockups (e.g. a Metrics screen design) → drop in `.context/designs/.../screens/` and add a §4 section.
- Any ratified departure from the mockup → ADR in `.context/ADR/` + row in §5.
- New US → add a row to §8 mapping it to its screen(s) before dev starts.
