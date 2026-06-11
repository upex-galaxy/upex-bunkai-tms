# BK-10 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-10)

## Summary

Rename and soft-delete a Module. Adds an `archived*at` soft-delete column to the four existing entity tables in a module subtree (modules, user*stories, acceptance*criteria, atcs) and two `SECURITY DEFINER` plpgsql functions that run the rename (with materialized-path rebuild across descendants) and the cascade archive atomically in a single transaction. A new flat `PATCH`/`DELETE /api/v1/modules/{id}` route fronts them with the BK-9 hybrid error model. The active-tree query gains an `archived*at IS NULL` filter so archived branches disappear. Per-node rename and delete affordances are added to the existing tree UI, mirroring the BK-9 create-module form.

## Resolved decisions (confirmed with PO)

- Route shape: flat `/api/v1/modules/{id}` (matches the Architect Annotation + ATP; module id is a global UUID). The BK-9 create stays scoped under `/projects/{id}/modules`.
- Rename rebuilds the materialized `path`: recompute the module slug, rewrite the `path` of the module AND every descendant in one transaction; a sibling slug collision returns 409. Honors the Architect DoD ("path rebuild verified") and the PO-confirmed "sibling uniqueness -> 409".
- Cascade scope: archive modules + user*stories + acceptance*criteria + atcs (every FK-linked table that exists today). The `tests` and `bugs` tables do not exist yet (Part 2 epics) — they are deferred and the cascade function is extended when those tables land.
- Soft-delete column name: `archived*at timestamptz null` (Business Rule says "archived, never destroyed"; Architect Annotation specifies `archived*at`).
- Atomicity: the Supabase JS client cannot run multi-statement transactions, so cascade + path-rebuild live in plpgsql functions invoked via `supabase.rpc()`. A function body is one implicit transaction -> the ATP "rollback on partial failure" requirement is satisfied for free.

## As-built observable contract (QA reference)

PATCH /api/v1/modules/{id} — rename and/or edit description. Body: `{ name?: string, description?: string | null }`, at least one field.

- Success: 200 `{ module: { id, project*id, parent*module*id, path, name, position, description, created*at, archived_at } }`. When `name` changes, `path` (and all descendant paths) reflect the new slug.
- name < 2 chars: 422 `validation*failed` + `details.reason=name*too_short`.
- name empty or whitespace-only (server trims): 422 `validation*failed` + `details.reason=name*required`.
- name > 80 chars: 422 `validation*failed` + `details.reason=name*too_long`.
- name has no alphanumeric: 422 `validation*failed` + `details.reason=name*no_alphanumeric`.
- description > 500 chars: 422 `validation*failed` + `details.reason=description*too_long`.
- Renamed slug collides with a sibling: 409 `conflict` + `details.reason=module*slug*duplicate`.
- Module not found or already archived: 404 `not_found`.
- Caller is a viewer / non-member: 403 `forbidden` + `details.reason=not*a*member`.
- Malformed UUID or invalid JSON: 400 `bad_request`. Unauthenticated: 401.

DELETE /api/v1/modules/{id} — soft-delete (archive) the module and its subtree + linked work.

- Success: 200 `{ archived: { modules, user*stories, acceptance*criteria, atcs } }` (per-table counts).
- Module not found: 404 `not_found`.
- Module already archived: 409 `conflict` + `details.reason=already_archived` (no double-archive).
- Caller is a viewer / non-member: 403 `forbidden` + `details.reason=not*a*member`.
- Malformed UUID: 400 `bad_request`. Unauthenticated: 401.

## Tasks (slices)

Slice 1 — Migration + types. `supabase/migrations/0014*module*soft*delete.sql`: add nullable `archived*at` to modules, user*stories, acceptance*criteria, atcs; partial index on `modules(project*id) where archived*at is null`. Add `bunkai*update*module(p*module*id, p*name, p*description, p*update*description)` and `bunkai*archive*module*subtree(p*module*id)` — both `SECURITY DEFINER`, `search*path=''`, role-gated via `bunkai*can*write*workspace`, revoke execute from public/anon. Apply via Supabase MCP `apply*migration`. `bun run types:gen` to regenerate `lib/types/supabase.ts`. Add `archived_at` to the Module, UserStory, AcceptanceCriterion, Atc interfaces in `lib/types.ts`.

Slice 2 — Backend route + OpenAPI. `app/api/v1/modules/[id]/route.ts` with PATCH (validate name/description, 404-on-missing-or-archived, rpc `bunkai*update*module`, map 42501 -> 403, 23505 -> 409) and DELETE (404 vs 409 split, rpc `bunkai*archive*module_subtree`, return cascade summary). `route.openapi.ts` + side-effect import in `scripts/openapi-gen.ts`.

Slice 3 — Pure helpers + unit tests. `lib/modules/path.ts`: `rebuildModulePath(oldPrefix, newPrefix, path)` and `moduleNameError(name)` pure helpers (the SQL mirrors the same rules). Unit tests via `bun test`.

Slice 4 — Frontend. Add `.is('archived_at', null)` to the modules (and stories/acs/atcs) queries in `app/(app)/projects/[projectSlug]/page.tsx`. Add per-node rename + delete affordances to `components/layout/Sidebar.tsx` (group-hover, gated by the existing member-role flag). Wire the flows in `project-explorer.tsx`. New `rename-module-form.tsx` (prefilled name + description, PATCH, friendlyError) and a delete confirmation panel (shows what will be archived, DELETE), both mirroring `create-module-form.tsx`. `router.refresh()` on success.

Slice 5 — Verification. `bun test`, `bun run types:check`, `bun run lint:check`, `bun run build`. Manual rename / leaf-delete / cascade-delete / viewer-denied checks on staging.

## Out of scope

Moving a module to a different parent (BK-11), hard delete / purge, un-archiving / restore, bulk rename or delete, archiving `tests` / `bugs` (those tables ship with their own epics), the rich Markdown editor (BK-16), activity_log writes, Realtime.

## Review Workload Forecast

Estimated: about 600 additions + 20 deletions = about 620 total lines.
400-line budget risk: High.
Chain strategy: single feature branch, one PR to staging (the five slices land as separate atomic commits). Same shape as BK-9; solo-owner repo, no chain split needed.
Decision needed before apply: No.

---
_Synced from Jira by sync-jira-issues_
