# BK-9 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-9)

## Summary

Create modules as a self-referential tree (max depth 6) inside a Project. A scoped
`POST /api/v1/projects/{id}/modules` plus a create UI wired into the EXISTING tree
(`lib/tree.ts buildModuleTree` + `components/layout/Sidebar.tsx`). Adds a nullable
`description` column via a new migration. Reuses the BK-8 projects-route pattern and
the hybrid error model.

## Resolved decisions (shift-left)

- Endpoint: `POST /api/v1/projects/{id}/modules` (project id is a UUID). Scoped, mirrors

  `workspaces/{id}/projects`. The ATP's literal `/api/v1/modules` will be aligned.

- Description: new migration `0013*module*description.sql` adds nullable `modules.description`

  (with a CHECK <= 500 chars). Store raw Markdown; render plain + 3-line truncate for MVP
  (the rich editor is BK-16, Part 2). Migration applies to the shared Supabase project.

- path: `parent ? parent.path + '/' + slugify(name) : slugify(name)` — NO leading slash.

  Sibling uniqueness is by full path; a duplicate sibling slug returns 409.

- Depth: app layer computes resultingDepth = parentSegments + 1; if > 6 → early-return 422

  (no DB call); the DB depth CHECK is the safety net (Postgres 23514 → 422). Soft warning
  fires when resultingDepth >= 5 (QA refinement 2026-06-02 overrides the stale "depth 4+").

- position = max(position) + 1 within the (project*id, parent*module_id) sibling set;

  best-effort, no hardened concurrency.

- Auth: cookie session + RLS (role >= member); non-member / viewer → 403. Cross-project

  parent is validated in the app layer (RLS does not catch it).

- Skipped for MVP: Idempotency-Key, activity_log write, Supabase Realtime (use router.refresh()).

## As-built observable contract (QA reference)

- Success: 201 `{ module: { id, project*id, parent*module*id, path, name, position, description, created*at }, warning? }`. `warning` (a string) is present only when resultingDepth >= 5.
- Name < 2, > 80, no alphanumeric, or whitespace-only: 422 `validation*failed` + `details.reason` one of `name*too*short`, `name*too*long`, `name*no_alphanumeric`.
- Description > 500 chars: 422 `validation*failed` + `details.reason=description*too_long`.
- Resulting depth > 6: 422 `validation*failed` + `details.reason=depth*exceeded`.
- Duplicate sibling (same derived path): 409 `conflict` + `details.reason=module*slug*duplicate`.
- Parent not found or not in this project: 422 `validation*failed` + `details.reason=parent*invalid`.
- Caller not a member / viewer role: 403 `forbidden` + `details.reason=not*a*member`.
- Malformed UUID or invalid JSON: 400 `bad_request`. Unauthenticated: 401.

## Tasks (slices)

1. Migration + types: `supabase/migrations/0013*module*description.sql` (add nullable

   `description`, CHECK <= 500). Apply to the Supabase project. `bun run types:gen` to
   regenerate `lib/types/supabase.ts`. Add `description` to the `Module` interface in `lib/types.ts`.

1. Backend: `app/api/v1/projects/[id]/modules/route.ts` (POST). Validate name (2–80, trimmed,

   >=1 alphanumeric), optional description (<=500). Resolve parent (must belong to this project),
   compute path + resultingDepth (early-return 422 if > 6, warning flag if >= 5), position = max+1,
   RLS insert, map 23505→409, 23514→422, 42501→403. Return 201 `{ module, warning? }`. Add
   `route.openapi.ts` + the side-effect import in `scripts/openapi-gen.ts`. Unit tests
   (path build, depth math, position) via `bun test`.

1. Frontend: create-module UI in the project-detail page — "New Module" (root) + per-node

   "Add sub-module", a client form (name + live slug preview + optional description <=500,
   plain render), POST, soft-warning toast on depth >= 5, viewer-role disabled, `router.refresh()`.
   Reuse `buildModuleTree` + `Sidebar`.

1. Verification: `bun test`, `bun run types:check`, `bun run lint:check`, `bun run build`;

   manual depth 5 / 6 / 7 + cross-workspace checks on staging.

## Out of scope

Rename / move / delete (BK-10, BK-11), bulk import, drag-and-drop reorder, per-module
permissions, the rich Markdown editor (BK-16), Realtime, activity_log writes.

## Review Workload Forecast

Estimated: about 350 additions + 30 deletions, about 380 total lines.
400-line budget risk: Medium-High.
Chain strategy: single feature branch, one PR to staging (slices land as separate commits).
Decision needed before apply: No.

---
_Synced from Jira by sync-jira-issues_
