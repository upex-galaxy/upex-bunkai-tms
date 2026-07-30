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
| Home / Dashboard | 0% | ❌ Missing |
| Test Runner | 0% | ❌ Missing |
| Bug Reports / Metrics / Test Runs | 0% | ❌ Missing (no data model) |
| Settings (5-screen suite) | build 0% | ❌ Not built · ✅ mockups ready 2026-07-30 (§4.10) |

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

### 4.6 Bug Reports — ❌ (0%)
Nav badge `33`. No route, no data model. Mockup detail comes from the runner's Report-bug drawer (severity P1–P4, module, repro, tags, `linked:RUN-xxxx`). **Priority: P3** (define bugs domain first).

### 4.7 Metrics — ❌ (0%)
Nav item, no badge. No mockup screen provided (only implied). Coverage % surfaces on Home. **Priority: P3** — needs design spec authored (no mockup) + metrics data.

### 4.8 Test Runs — ❌ (0%)
Nav badge `3`. Run list/index. Active runs partially shown on Home dashboard table. **Priority: P3.**

### 4.9 ATC Library — ⚠️ (project-scoped, not global)
Nav badge `623`. Impl has ATC CRUD nested under project (`projects/[slug]/atcs/*`) but no **global cross-project library**. **Priority: P3** — promote to global view.

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
| | BK-20 ATC search autocomplete | **ATC Library** · Projects toolbar filter | `project.jsx` |
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
| | BK-37 View a test's past runs | **Test Runs** index (per-test history) | ⚠️ wireframe pending |
| | BK-38 Filter all project runs | **Test Runs** index · Home active-runs | `home.jsx` |
| | BK-39 Finish a run with a final verdict | **Test Runner** (finish/verdict) | `run.jsx` §4.5 |
| **BK-31 Bugs & Defect Heatmap** | BK-40 File defect from failed step | **Test Runner** (Report-bug drawer) | `run.jsx` §4.5 |
| | BK-41 List/filter defects | **Bug Reports** | §4.6 |
| | BK-42 Defect heatmap | **Metrics** · Bug Reports | §4.7 |
| | BK-43 Sync defects to Jira | Bug Reports (integration) | §4.6 |
| **BK-44 Coverage & Traceability** | BK-45 US→bug evidence chain | **Metrics** · Projects traceability | §4.7 |
| | BK-46 Surface untested ACs/modules | **Metrics** · Home coverage card | `home.jsx` |
| | BK-47 Time-to-green per US | **Metrics** | §4.7 |
| | BK-48 Filter chain by verdict/module | Metrics · Traceability | §4.7 |
| | BK-49 Activity stream (read feed) | **Home** recent-activity | `home.jsx` §4.2 |
| | BK-50 Export assembled chain | Metrics/Traceability (export) | §4.7 |
| **BK-85 Account & Settings** | BK-86 View identity/role + sign-out | **Shell** user block · Settings | `app.jsx` §3 · `bk-85-account-settings/account-menu-overlay.html` |
| | BK-87 Settings hub + account view | **Settings** | §4.10 · `bk-85-account-settings/settings-account.html` + `settings-coming-soon.html` |
| | BK-88 Manage personal access tokens | **Settings** | §4.10 · `bk-85-account-settings/settings-tokens.html` |
| | BK-89 View my workspaces | Settings · Shell switcher | §4.10 · `bk-85-account-settings/settings-workspaces.html` |
| | BK-90 Leave a workspace | **Settings** | §4.10 · `bk-85-account-settings/settings-workspaces.html` |
| **BK-29 QA Credentials** | (epic) | `/qa` page (out of mockup scope) | — |
| **BK-201 Test Plans & Milestones** | BK-202 Create a test plan grouping tests | **Test Plans index + Plan detail** (new, Project scope) | ⚠️ wireframe pending |
| | BK-203 Add/remove tests from a plan | **Plan detail** (test picker) | ⚠️ wireframe pending |
| | BK-204 Track plan progress from run outcomes | **Plan detail — progress view** | ⚠️ wireframe pending |
| | BK-205 Create a milestone with a target date | **Milestones view** (new, Project scope) | ⚠️ wireframe pending |
| | BK-206 Assign plans + track milestone progress | **Milestones view** · Plan detail | ⚠️ wireframe pending |
| | BK-207 Close a plan with an outcome summary | **Plan detail** (close action) · Test Plans index | ⚠️ wireframe pending |
| **BK-208 Notifications Center** | BK-209 Inbox of workspace events | **Notifications inbox** (new — top-bar bell + panel) | ⚠️ wireframe pending |
| | BK-211 Run finished/aborted events | Notifications inbox (event producer — renders into BK-209 inbox) | ⚠️ wireframe pending |
| | BK-212 Bug assignment/status events | Notifications inbox (event producer — renders into BK-209 inbox) | ⚠️ wireframe pending |
| | BK-213 Notification preferences | **Settings — Notification preferences** (extends §4.10 hub) | §4.10 · ⚠️ wireframe pending |
| | BK-214 Email digest of unread notifications | **Email digest template** (non-app surface — email design) | ⚠️ wireframe pending |
| **BK-210 Team Chat** | BK-215 Workspace real-time channel | **Team Chat panel** (new — workspace channel) | ⚠️ wireframe pending |
| | BK-216 Per-project channel | **Team Chat panel** (project channels) | ⚠️ wireframe pending |
| | BK-217 Mention a teammate | **Chat panel** · Notifications inbox (mention delivery) | ⚠️ wireframe pending |
| | BK-218 Share ATC/Test/Run as rich link | **Chat panel** — entity rich card | ⚠️ wireframe pending |
| | BK-219 Edit/delete my own messages | **Chat panel** (message actions) | ⚠️ wireframe pending |
| | BK-220 Search the message history | **Chat search** (within chat panel) | ⚠️ wireframe pending |
| **BK-221 Automation & CI Ingestion** | BK-222 Submit automated run via API | API-first, UI-light — renders into existing **Run detail** | `run.jsx` §4.5 |
| | BK-223 Stream step results during automated run | API-first, UI-light — renders live into existing **Run detail** | `run.jsx` §4.5 |
| | BK-225 Filter runs by manual/automated | **Test Runs index** — execution-mode badge/filter (extends existing runs view) | ⚠️ wireframe pending |
| | BK-226 Upload a CI results file | **CI results upload** (modal/flow off the runs view) | ⚠️ wireframe pending |
| | BK-227 Track automation status of a test | **Test library — automation status** (extends existing test library/list) | ⚠️ wireframe pending |
| | BK-228 CI-triggered runs linked to commit/branch | **Run detail — CI metadata** (extends run detail) | `run.jsx` §4.5 · ⚠️ wireframe pending |
| **BK-224 Billing & Plans** | BK-229 View plan, seats & usage | **Settings — Billing overview** (extends §4.10 hub) | §4.10 · ⚠️ wireframe pending |
| | BK-230 Upgrade to a paid plan | **Billing — plan comparison & checkout** | ⚠️ wireframe pending |
| | BK-231 Billing details + invoices | **Billing — details & invoices** | ⚠️ wireframe pending |
| | BK-232 Plan-limit warnings + upgrade path | **Plan-limit warning states** (cross-app banner/modal patterns) | ⚠️ wireframe pending |
| | BK-233 Downgrade or cancel the subscription | **Billing — downgrade/cancel flow** | ⚠️ wireframe pending |

> **Wireframe-to-Jira workflow (future):** when uploading wireframes, attach each US's mockup crop/section (from the screen named above) to its Jira issue. Screens with no mockup yet (Metrics, Settings, Bug Reports, Test Runs, ATC Library global) need wireframes authored first — flagged ❌/⚠️ in §1.
>
> **Post-MVP screens (BK-201/208/210/221/224):** none of these screens exist in the mockup set — no §4 spec is authored yet. Until wireframes land, design intent lives in each Jira story's Mockup/Business-Rules fields (BK-2xx). When a wireframe/mockup is produced, drop it in `.context/designs/.../screens/` and add its §4 section per §9.

---

## 9. Maintenance

- Re-run the fidelity audit when a P1/P2 item lands; update §1 scorecard + the screen's table.
- New mockups (e.g. a Metrics screen design) → drop in `.context/designs/.../screens/` and add a §4 section.
- Any ratified departure from the mockup → ADR in `.context/ADR/` + row in §5.
- New US → add a row to §8 mapping it to its screen(s) before dev starts.
