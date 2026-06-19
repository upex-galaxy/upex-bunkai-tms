# ADR-0003 — Persistent Project Shell & Route-Driven Workbench Tabs

- **Status:** Proposed — drafted by `/sprint-development` Stage 1 (BK-147); awaiting owner acceptance
- **Date:** 2026-06-19 (proposed)
- **Deciders:** Ely (owner) · drafted by `/sprint-development` Stage 1 (BK-147)
- **Tags:** frontend, app-shell, routing, workbench, ui-architecture, presentation-layer
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-147 ("App Shell — open ATCs and Tests as tabs with a persistent explorer", design divergence D6) requires the project explorer to stay visible while ATCs and Tests open as workbench tabs, including on deep-links. Today:

- The global app shell (`AppSidebar` in `app/(app)/layout.tsx`) already persists app-wide.
- But the **project** explorer + toolbar + tab bar live inside `project-workbench.tsx`, rendered only by the project **index** page (`/projects/[slug]/page.tsx`). Opening an ATC editor (`/atcs/[id]`) or a Test (`/tests/[id]`) navigates to a sibling route that re-renders full-width with **no project explorer** — the navigational context the story is about is lost.
- BK-98 shipped ATC tabs as **client-only** in-pane panes (`openTabs: Atc[]` state + lazy-fetch via `atc-detail-action.ts`), with no URL, so they cannot be deep-linked, shared, or restored on refresh. Tests never became tabs at all.

The story explicitly frames the work as "reuses the existing **routed** detail views as the content of workbench tabs" — a routing decision, and one external clients (shared deep-links) and future stories will build on, so it is hard to reverse once shipped.

## Decision

1. **Introduce a persistent project layout** at `app/(app)/projects/[projectSlug]/layout.tsx` (server component). It resolves workspace + project and loads the explorer data (module tree, ATC rows, Tests, `canCreate`) **once**, then renders a client shell holding the persistent **explorer + toolbar + tab bar** with the route's `{children}` as the tab-content slot. Next keeps a layout mounted across child-route navigations, so the explorer + tab bar + their client state persist across `/atcs/[id]` and `/tests/[id]` for free.

2. **Workbench tabs are route-driven and URL-addressable.** Each open tab corresponds to a real route; the **active** tab is derived from the pathname. Opening an item navigates to its route; the layout stays mounted and only the content slot swaps. This **supersedes the BK-98 client-only in-pane tab mechanism** (and retires `project-workbench.tsx`, `atc-detail-pane.tsx`, `atc-detail-action.ts`). Deep-links, browser back/forward, refresh-restores-active-tab, and not-found all work natively as a result.

3. **The set of open tabs is ephemeral client state** held in a context provider inside the layout's client shell (keyed per `projectSlug`, so switching projects resets tabs by construction). Only the **active** tab is URL-addressable; on refresh the active tab restores from the URL and the other previously-open tabs are intentionally not restored (out of scope: no cross-session tab persistence).

4. **Detail routes stay unchanged.** `/atcs/[id]` keeps rendering `AtcEditor`; `/tests/[id]` keeps rendering `TestDetailView`. Opening an ATC tab is read/navigate; mutation stays behind the editor's already-permission-gated Save. The editor is **not** moved or split.

5. **A segment-level `not-found.tsx`** at `app/(app)/projects/[projectSlug]/` renders the safe not-found state **inside** the persistent shell, because the existing `notFound()` calls in the detail routes (deleted/invisible ATC/Test) resolve to the nearest not-found boundary.

Invariant: project-scoped detail surfaces render as tab content within the project layout; they do not re-implement the explorer/shell, and their "open" action is navigation to a real route — never a bespoke client-only panel.

## Consequences

- **Positive:** the explorer persists across every project route with zero data refetch (loaded once in the layout, shared across child nav); deep-links, shareable URLs, back/forward, refresh-restore, and in-shell not-found come for free from the router; Tests-as-tabs falls out of the existing `<Link href=/tests/[id]>` once the shell persists; no backend/schema/RPC change.
- **Negative / trade-offs:** opening/switching a tab is now a client navigation (server round-trip per route) rather than BK-98's instant in-pane swap — mitigated by Next prefetch and the layout staying mounted (no tree refetch, no full reload); the BK-98 read-only ATC preview pane is superseded by the full editor route as tab content (an ATC tab shows the editor chrome, not a lightweight read-only pane — accepted because opening performs no write); the unchanged detail routes keep their own top bars, so an open tab shows the project tab bar stacked above the route's own toolbar (accepted as the "routes unchanged" trade-off; a one-line `h-screen → h-full` fit on `AtcEditor`/`TestDetailView` is permitted if the nesting reads poorly — neither moves nor splits the editor).
- **Neutral / follow-ups:** non-active open tabs are not restored on refresh (out of scope); if cross-session tab persistence is later wanted, it is an additive change (serialize open-tab list to storage) that does not change this routing model.

## Alternatives considered

- **Hoisted client tabs + History API URL sync** (keep BK-98 client panes, move state into the layout, push the active tab to the URL via `history.pushState`, seed on deep-link) — rejected: keeps two content sources (client pane vs route children), needs client lazy-fetch panes for Tests (new code mirroring the existing routes), handles not-found manually, and the History-API URL sync is non-idiomatic in the App Router. More custom code for a worse result than letting the router own it.
- **Query-param-driven tabs** (`/projects/[slug]?tab=atc:ID`) — rejected: loses clean RESTful deep-links (`/atcs/[id]`), flashes a redirect, and diverges from the existing detail routes the story says to reuse.
- **Relocate the ATC editor to `/atcs/[id]/edit` and make `/atcs/[id]` a read-only tab** — rejected for this story: changes link semantics across the app (Sidebar modifier-click, New-ATC flow) and touches the editing surface, exceeding "presentation-layer, editing gated by its own stories." Kept as a possible future refinement if read-only ATC tabs are explicitly wanted.

## References

- `.context/design/master-design-plan.md` §3 (App Shell), §4.3 (Projects), divergences D5 + D6; §8 BK-147 row
- BK-147 implementation plan, Jira `spec_implementation_plan` field / synced `implementation-plan.md`
- BK-98 (open-ATC client tabs — superseded) · BK-32 (`TestDetailView`) · BK-28 (`TestReorderClient`)
- `app/(app)/projects/[projectSlug]/` — `page.tsx`, `project-workbench.tsx`, `project-explorer.tsx`; `components/layout/Sidebar.tsx`, `AppSidebar.tsx`, `CommandPalette.tsx`
