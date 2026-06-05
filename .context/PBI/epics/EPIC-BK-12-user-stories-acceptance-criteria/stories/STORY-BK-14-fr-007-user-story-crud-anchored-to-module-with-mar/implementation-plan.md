# BK-14 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-14)

## Summary

CRUD for User Stories anchored to a Module. The `user*stories` table already exists (id, module*id, title, description, external*id, external*url, created*at, archived*at). This story adds the per-project Jira-key uniqueness guarantee, the API surface, and the in-tree UI, reusing the BK-16 MarkdownEditor (50 KB mode) for the description and the BK-16 sanitizer on save. CRUD authorization rides the existing `user*stories` RLS policies (module -> project -> workspace*members) — no SECURITY DEFINER function needed.

## Resolved decisions (confirmed with PO)

- Routes: scoped create + list under `/api/v1/modules/{moduleId}/user-stories`; flat single-GET / PATCH / DELETE under `/api/v1/user-stories/{id}` (mirrors BK-9 scoped create/list + BK-10 flat mutate).
- Jira-key uniqueness: denormalize `project*id` onto `user*stories` (set from the module at insert) + a partial unique index `(project*id, upper(external*id)) WHERE external*id IS NOT NULL AND archived*at IS NULL` — DB-enforced, case-insensitive, race-proof.
- UI: inline in the Sidebar tree (the tree already renders US rows). Per-module "New User Story" + per-US edit/remove, with forms in ProjectExplorer modals (same pattern as module CRUD).

## Rules

- Title required, 3–200 chars. Description optional Markdown, <= 50 KB UTF-8, sanitized on save (BK-16 `sanitizeMarkdown`) and rendered safely (BK-16 `MarkdownRenderer`).
- `external_id` (Jira key) optional; when present must match `^[A-Z]+-\d+$`, normalized to uppercase before persist; unique per project (case-insensitive); immutable once set (PATCH rejects a change with 409).
- Remove = soft archive (`archived_at`), hidden from default lists.

## As-built observable contract (QA reference)

- POST `/api/v1/modules/{moduleId}/user-stories` `{ title, description?, external*id? }` -> 201 `{ user*story }`.
- GET `/api/v1/modules/{moduleId}/user-stories` -> `{ user_stories: [...] }` (active only, newest first).
- GET/PATCH/DELETE `/api/v1/user-stories/{id}`.
- 422 `title*too*short` (<3) / `title*too*long` (>200) / `title*required`; 422 `external*id*invalid` (bad format); 422 `description*too_long` (>50 KB).
- 409 `external*id*duplicate` (key already linked in this project); 409 `external*id*immutable` (attempt to change an already-set key).
- 404 not found / archived; 403 viewer / non-member; 400 bad UUID/JSON; 401 unauthenticated.

## Tasks (slices)

Slice 1 — Migration + types. `supabase/migrations/0016*user*story*uniqueness.sql`: add `user*stories.project*id` (FK -> projects, backfill from module), partial unique index on `(project*id, upper(external*id))` + active-list index. Apply via Supabase MCP; `bun run types:gen`; add `project*id` to the `UserStory` interface in `lib/types.ts`.

Slice 2 — API + OpenAPI. `app/api/v1/modules/[id]/user-stories/route.ts` (POST + GET list) and `app/api/v1/user-stories/[id]/route.ts` (GET + PATCH + DELETE). Zod schemas; title + external_id + description validation; sanitize description; map 23505 -> 409 (duplicate), immutability -> 409, 42501 -> 403. `route.openapi.ts` for both + side-effect imports.

Slice 3 — Validation helpers + tests. `lib/user-stories/validation.ts`: `storyTitleError`, `normalizeJiraKey`, `jiraKeyError`. Unit tests.

Slice 4 — UI. `user-story-form.tsx` (title + MarkdownEditor 50 KB + Jira-key input, disabled when already set) reused for create + edit; delete confirm; Sidebar per-module "New US" + per-US edit/remove actions; ProjectExplorer wiring. Implements the BK-16 carry-forward at this 50 KB mount: editor over-cap submit-disable + server-side 50 KB guard.

Slice 5 — Verification. `bun test`, `bun run types:check`, `bun run lint:check`, `bun run build`; manual create/edit/remove + duplicate-key + cross-module checks on staging.

## Out of scope

Acceptance Criteria authoring (BK-15), the Markdown editor itself (BK-16, reused here), bulk Jira import (BK-17), two-way Jira sync, US `status` workflow.

## Review Workload Forecast

Estimated: about 650 additions + 20 deletions = about 670 total lines.
400-line budget risk: High.
Chain strategy: single feature branch, slices as atomic commits, one PR to staging.
Decision needed before apply: No.

---
_Synced from Jira by sync-jira-issues_
