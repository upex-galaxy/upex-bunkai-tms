# BK-147 — Spec Compliance Matrix

> Maps every acceptance scenario to the evidence that proves it. Generated at Stage 3 (code review). Evidence is live Playwright validation on the **Rocket** project (3 ATCs + 1 Test "Checkout Happy Path"), unless noted. Screenshots live under `.session/sprint-development/BK-147/screenshots/` (gitignored).

| # | AC scenario | covered_by | evidence | status |
|---|-------------|-----------|----------|--------|
| 1 | Application shell stays visible after sign-in; account shows real identity | manual | Shell (sidebar/switcher/search/account) present on index, `/atcs/[id]`, `/tests/[id]`; account block renders `bunkai-staging-user@…` (dynamic, no placeholder) | manual |
| 2 | Explorer stays visible when opening an item; opens as tab; highlighted | manual | Snapshot on `/tests/[id]`: `complementary` explorer present, Test row `[active]`, `tab [selected]` in main; same for `/atcs/[id]` | manual |
| 3 | Multiple tabs open at once, switchable | manual | Snapshot of `workbench-tabs`: two tabs (`atc-a74a16de`, `Checkout Happy Path [selected]`) coexist with close buttons | manual |
| 4 | Re-opening a focused item does not duplicate the tab | review-approved:saiotest | `WorkbenchProvider` reconcile dedups via `prev.some(t => t.kind===kind && t.id===id)`; re-navigating to an open item kept a single tab | review-approved |
| 5 | Closing the active tab → adjacent becomes active; explorer stays | manual | Closed active Test tab → navigated to the neighbour ATC route; explorer remained | manual |
| 6 | Closing the last tab returns to the workbench index | manual | Closed the final ATC tab → URL `/projects/rocket` (index empty state); explorer stays | manual |
| 7 | Project toolbar reachable from any open tab | manual | Topbar (view toggle, New ATC, New Test, search) lives in the layout shell → present on every project route incl. open ATC/Test | manual |
| 8 | Deep link opens directly as a tab | manual | Hard load of `/projects/rocket/tests/<id>` and `/atcs/<id>` rendered the item as the sole active tab with the explorer visible (seeding) | manual |
| 9 | Opening an item no longer available → safe not-found inside the workbench | manual | Deep-link to a bogus Test UUID → `workbench-not-found` ("This item is no longer available" + Back to project) inside the shell; explorer + nav visible; **no stray tab**; HTTP 404 status | manual |
| 10 | Switching projects does not carry tabs across | manual | Opened an ATC tab on Rocket, clicked Checkout v2 (client nav) → eval: `tabBarPresent:false, tabCount:0`, breadcrumb = Checkout v2 (provider remounts on `key={projectSlug}`) | manual |

**Business-rule TCs (non-AC):** TC-15 disabled nav destinations — AppSidebar renders `href:null` items disabled with "soon" (verify-only). TC-16 tab overflow — tab bar `overflow-x-auto`.

**Gate:** No row is `uncovered`. All 10 acceptance scenarios covered (9 manual evidence, 1 review-approved). PR may merge.

**Quality gates:** `bun run types:check` ✓ · `bun run lint:check` ✓ · `bun test` (77 pass, 0 fail on the pure-logic suite; the UI refactor touches no `lib/` logic) ✓ · 0 console errors on all validated routes (the lone `/tests/<bogus>` 404 is the expected not-found HTTP status, not a JS error).

**Side-fix:** `fix(BK-28)` deterministic `DndContext id` — eliminated the pre-existing Test-detail hydration mismatch (82-line console dump → 0). Verified live.
