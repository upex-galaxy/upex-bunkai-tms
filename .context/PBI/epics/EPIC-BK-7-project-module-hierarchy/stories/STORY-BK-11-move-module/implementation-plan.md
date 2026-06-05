# BK-11 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-11)

## Summary

Move a Module (with its whole sub-tree) to a different parent, or back to the Project root. Extends the BK-10 `PATCH /api/v1/modules/{id}` route with a `parent*module*id` branch and adds one atomic `SECURITY DEFINER` function `bunkai*move*module` that re-parents the module, rebuilds the materialized `path` of the module and every descendant, and repositions it — guarding against cycles, depth overflow, cross-project moves, and no-op moves. A move dialog with a valid-targets picker is added to the tree UI.

## Resolved decisions (confirmed with PO)

- Endpoint: extend the existing `PATCH /api/v1/modules/{id}` — the handler branches when `parent*module*id` is present (Architect Annotation). `parent*module*id: null` moves to the Project root; the key absent means no move. name / description / parent*module*id are independent and may co-occur (processed in order).
- Move UI: a dialog (mirrors the BK-10 modals) with a select of VALID destinations only — excludes the module itself, its descendants, its current parent, and any target that would push the branch past depth 6 — plus a "Project root" option. Client pre-flight for instant feedback; the server stays authoritative.

## Mechanics

- Cycle check via materialized path (no recursive walk needed): the new parent is the source or one of its descendants iff `new*parent.path = source.path OR new*parent.path LIKE source.path || '/%'`. Reject as a cycle.
- Depth check: `new*max = subtree*max*depth + (new*source*depth - old*source*depth)` where `new*source*depth = depth(new*parent*path) + 1` (or 1 at root). Reject if `new*max > 6`.
- Path rebuild reuses the BK-10 rule: re-base every subtree path from the old prefix (`source.path`) onto the new prefix (`new*parent.path/source*slug`, or `source_slug` at root) — the same `rebuildModulePath` helper, now also unit-tested for the move case.
- No-op: when the requested parent is the current parent (`is not distinct from`), return the unchanged row with zero DB writes.
- Sibling slug collision at the destination trips `unique(project_id, path)` → 409.

## As-built observable contract (QA reference)

PATCH /api/v1/modules/{id} with `{ parent*module*id: <uuid> | null }`:

- Success: 200 `{ module }` with the new `parent*module*id`, `path`, and `position`; all descendant paths re-based.
- Move under self or a descendant: 422 `validation*failed` + `details.reason=move*cycle`.
- Resulting depth > 6: 422 `validation*failed` + `details.reason=depth*exceeded`.
- New parent missing / archived / in another project: 422 `validation*failed` + `details.reason=parent*invalid`.
- Destination already has a sibling with this slug: 409 `conflict` + `details.reason=module*slug*duplicate`.
- Module not found or archived: 404. Viewer / non-member: 403 `forbidden` + `details.reason=not*a*member`. Bad UUID/JSON: 400. Unauthenticated: 401.
- No-op (same parent): 200 `{ module }`, no writes.

## Tasks (slices)

Slice 1 — Migration + types. `supabase/migrations/0015*module*move.sql`: `bunkai*move*module(p*module*id, p*new*parent*id)` SECURITY DEFINER, search*path='', role-gated. Resolve source; no-op short-circuit; validate new parent (same project, active); cycle check; depth check; one UPDATE that re-bases subtree paths + reassigns source parent + repositions. Custom SQLSTATEs 45001 (cycle) / 45002 (depth) / 45003 (parent_invalid). Apply via Supabase MCP; `bun run types:gen`.

Slice 2 — Route + OpenAPI + helpers. Extend `PATCH /api/v1/modules/[id]/route.ts` to accept `parent*module*id` and call `bunkai*move*module`; extend `mapRpcError` for 45001/45002/45003. Add `isDescendantPath` + `movedSubtreeMaxDepth` pure helpers in `lib/modules/path.ts` + unit tests. Update `route.openapi.ts`.

Slice 3 — Move UI. `move-module-dialog.tsx` (valid-targets select + Project root, computed from the tree, client pre-flight). Sidebar per-node Move action. ProjectExplorer wiring + modal.

Slice 4 — Verification. `bun test`, `bun run types:check`, `bun run lint:check`, `bun run build`; manual move / cycle / depth-boundary / root / no-op checks on staging.

## Out of scope

Cross-project / cross-workspace moves, sibling reordering (drag-and-drop), bulk move, create/rename/delete (BK-9/BK-10), the rich Markdown editor (BK-16).

## Review Workload Forecast

Estimated: about 400 additions + 20 deletions = about 420 total lines.
400-line budget risk: Medium-High.
Chain strategy: single feature branch, one PR to staging (slices as separate atomic commits). Same shape as BK-10.
Decision needed before apply: No.

---
_Synced from Jira by sync-jira-issues_
