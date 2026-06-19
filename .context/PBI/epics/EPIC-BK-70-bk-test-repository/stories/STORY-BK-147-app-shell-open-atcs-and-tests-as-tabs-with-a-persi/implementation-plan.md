# BK-147 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-147)

# BK-147 — Implementation Plan (Spec Implementation Plan, Dev)

***Story******:*** App Shell — open ATCs and Tests as tabs with a persistent explorer.
***Scope******:**** Presentation-layer only. No backend/schema/RPC change. Global App Shell is already ~85% shipped (`AppSidebar`); the real build is the persistent ****project*** workbench (D6) + shell polish.
***Architecture decision******:**** route-driven workbench tabs via a new `[projectSlug]/layout.tsx`. See ****ADR-0003*** (Proposed).

## Resolved decisions (Stage 1)

1. ***Index data sharing**** → the no-tab index page reads tree/rows/tests from the workbench ****client context*** (loaded once in the layout); no second DB round-trip.
2. ***Double top-bar*** → accepted as the "routes unchanged" trade-off; a one-line `h-screen → h-full` fit on `AtcEditor`/`TestDetailView` is permitted only if the nesting reads poorly (neither moves nor splits the editor). Validate live.
3. ***not-found copy*** → a small client component reads `usePathname()` for a "Back to project" link + a generic "this item is no longer available" message, rendered inside the persistent shell.
4. ***Chain strategy**** → single `feature/BK-147-app-shell-workbench-tabs` branch, ****3 atomic commits*** (2a / 2b / 2c) + the separate `fix(BK-28)` hydration commit, ONE PR. Sole owner-reviewer + mostly-moved code make a per-commit review tractable despite the >400-line forecast (size-exception, reviewed per commit).

---

## Chunk 2a — Global App Shell polish (small, additive)

1. ***Make ****`CommandPalette`**** controllable.**** `components/layout/CommandPalette.tsx`: add optional `open?`, `onOpenChange?`, `trigger?` (default `trigger=true` keeps the current Topbar trigger). When controlled, route the ⌘K listener through `onOpenChange`; when `trigger={false}`, render only the modal. **verify***:** `types:check` clean; existing Topbar palette + ⌘K still work.
2. ***Wire the sidebar search button.**** `components/layout/AppSidebar.tsx`: add `paletteOpen` state; the existing search `<button>` gets `onClick`+`data-testid="sidebar-search"`; mount `<CommandPalette trigger={false} open onOpenChange />` in the aside. **verify***:** clicking `sidebar-search` opens the palette; Esc closes; ⌘K toggles.
3. ***Verify account block + logo (no hardcoded identity).**** Confirm the user block is dynamic (`email`, no "Mariko Tanaka") and the logo is the 分 vermillion box. Optional: prefer `user*metadata.full*name ?? email` if cheaply available. **verify***:** TC-02; screenshot logo.

## Chunk 2b — Project layout + persistent explorer + route-driven tab bar + index split

1. ***Open-tabs context.**** NEW `app/(app)/projects/[projectSlug]/workbench-context.tsx` (`'use client'`): `WorkbenchTab = {kind:'atc'|'test', id, href}`; context exposes `openTabs`, `view` (tree|table|mindmap), `setView`, `openTab`, `closeTab`, derived `activeHref`, plus `tree`/`rows`/`tests` for the index. Seed `openTabs` from `usePathname()` on mount (deep-link). Dedup in `openTab`. `closeTab` → navigate to neighbour route, else index. **verify***:** `types:check`; seeding returns the single deep-link tab.
2. ***Persistent project layout.**** NEW `app/(app)/projects/[projectSlug]/layout.tsx` (server): relocate the entire data load from `page.tsx` (workspace/project/canCreate/tree/rows/tests + `notFound()` guards); render `<ProjectShell ...>{children}</ProjectShell>`. **verify***:** index/atc/test routes resolve tree+tests once; layout not remounted across child nav.
3. ***Client shell.**** NEW `app/(app)/projects/[projectSlug]/project-shell.tsx` (`'use client'`): the refactored top half of `project-workbench.tsx` — Topbar (breadcrumb, view toggle from context, CommandPalette, New ATC/New Test), persistent `<ProjectExplorer>`, the ****tab bar**** (move lines ~144-175 markup; ATC chip `atc-tab-${id}`/`atc-tab-close-${id}`; Test chip `test-tab-${id}`/`test-tab-close-${id}` with GitBranch + title + step_count; active = `border-t-accent bg-surface-0`; click → `router.push(href)`; close → `closeTab`), and the content slot `{children}`. Metadata for chips looked up from `tree`/`tests`. **verify***:** TC-01/03/09; tab anatomy matches mockup.
4. ***Explorer ATC clicks → route nav.**** `components/layout/Sidebar.tsx` + `project-explorer.tsx`: drop the `onOpenAtc` interception + prop chain (plain `<Link href=/atcs/[id]>` navigates); derive `selectedAtcId` from `useParams().atcId` so the active row highlights; keep the context-menu "open in new tab" power-user affordance. **verify***:** TC-03 (nav + highlight), TC-06 (dedup), middle-click still opens editor in a new browser tab.
5. ***Index page = no-tab main views.**** `app/(app)/projects/[projectSlug]/page.tsx`: strip the data load; render only the main-area views for `view` from context — Tree empty state ("Select an ATC…"), Table (`AtcTable rows`), Mindmap (`MindMapView tree`). **verify***:** TC-08 (close last tab → index empty state, shell stays); view toggle renders Table/Mindmap.
6. ***Retire superseded code.**** Delete `project-workbench.tsx`, `atc-detail-pane.tsx`, `atc-detail-action.ts` (superseded by route-driven tabs). **verify***:** `grep` shows no residual imports; `types:check` + `lint:check` clean.

## Chunk 2c — Tests-as-tabs highlight + deep-link seeding + not-found

1. ***Highlight active Test row.**** `project-explorer.tsx`: derive `activeTestId` from `useParams().testId`; apply `border-l-2 border-accent bg-accent-soft text-fg-0` to the active Test row (mirrors ATC). **verify***:** TC-04, TC-10 (highlight on deep-link).
2. ***Deep-link tab seeding (verify Step 4 e2e).**** Hard load of `/atcs/[id]` or `/tests/[id]` → exactly one open tab (current route, active); index load → zero tabs; refresh keeps the active tab. **verify***:** TC-10/TC-11 (Playwright on Rocket: paste URL → opens as sole tab, explorer visible, row highlighted).
3. ***Segment not-found inside the shell.**** NEW `app/(app)/projects/[projectSlug]/not-found.tsx`: safe state with §2 tokens + "Back to project" link (client `usePathname()` for slug). **verify***:** TC-12 (delete Test, open old URL → safe state inside shell), TC-13 (invisible item → safe state, no leak); explorer/tab bar still visible.
4. ***Verify back-links + tab overflow.**** Confirm `TestDetailView`/`AtcEditor` back-links land on the index within the persistent layout; confirm the tab bar `overflow-x-auto` scrolls many tabs. **verify***:** TC-05/07 (multi-tab switch + close→neighbour), TC-16 (overflow), TC-14 (project switch resets tabs).

---

## AC → Step coverage

| AC scenario | TC | Step(s) |
| --- | --- | --- |
| Shell stays visible after sign-in + real identity | TC-01, TC-02 | 2, 3, 5, 6 |
| Explorer stays visible; item opens as tab; highlighted | TC-03, TC-04 | 6, 7, 10 |
| Multiple tabs switchable | TC-05 | 4, 6, 13 |
| Re-open focuses, no duplicate | TC-06 | 4, 7 |
| Close tab → adjacent active, explorer stays | TC-07 | 4, 6, 13 |
| Close last tab → index | TC-08 | 4, 8 |
| Toolbar reachable from any tab | TC-09 | 6, 1-2 |
| Deep link opens as tab + highlighted | TC-10, TC-11 | 4, 11, 7/10 |
| No-longer-available item → safe not-found in shell | TC-12, TC-13 | 12 |
| Switching projects does not carry tabs | TC-14 | 4 (provider keyed per slug) |

Business-rule TCs: TC-15 (disabled nav) already satisfied by AppSidebar "soon" rendering (verify-only); TC-16 (overflow) → Step 13. ***No AC left uncovered.***

## Risks

- ***R1 double top-bar / ****`h-screen`**** nesting*** → content slot `min-h-0 flex-1 overflow-auto` clamps; permit one-line `h-screen→h-full` on the two detail components if needed (flagged, not silent).
- ***R2 view/tab state ownership*** → must live in the layout's client context (survives child nav); `page.tsx` is a pure consumer.
- ***R3 retiring BK-98 + ****`onOpenAtc`**** chain*** → remove prop top-down through ProjectExplorer→Sidebar→nodes; grep for residuals.
- ***R4 not-found can't read params*** → client component reads `usePathname()`.
- ***R6 project-switch reset*** → provider keyed by `[projectSlug]` segment remount.

## Review Workload Forecast

```
Estimated: 320 additions + 240 deletions = 560 total lines (much is MOVED code)
400-line budget risk: High
Chain strategy: size-exception (single branch, 3 atomic commits 2a/2b/2c + fix(BK-28); per-commit review)
Decision needed before apply: No (resolved above)
```

## Verification approach

Per chunk: `bun run types:check` + `bun run lint:check`; `bun test` for any touched unit (workbench-context seeding/dedup logic if extracted). Live Playwright validation on the ***Rocket*** project (3 ATCs + 1 Test "Checkout Happy Path") against the 16 ATP TCs. Stage-3 Spec Compliance Matrix maps every AC → evidence before merge.

---
_Synced from Jira by sync-jira-issues_
