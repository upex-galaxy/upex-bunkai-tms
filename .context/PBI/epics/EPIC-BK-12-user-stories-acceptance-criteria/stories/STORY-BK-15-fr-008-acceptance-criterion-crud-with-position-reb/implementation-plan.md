# BK-15 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-15)

## Spec Implementation Plan (Dev) — BK-15

Manage Acceptance Criteria under a User Story: AC CRUD with stable, gap-free ordering plus a ready-to-test gate. Three confirmed design decisions: add `user_stories.status`, atomic SECURITY DEFINER rebalance functions with a partial unique index, and up/down arrow reordering.

### AC -> implementation map

- AC1 Add AC appears first: `bunkai*insert*acceptance_criterion` defaults position to tail; first AC lands at position 1. Scoped POST route.
- AC2 Insert preserves order: insert function shifts active siblings at or after the target by +1 via the negative-parking trick (collision-free under the partial unique index).
- AC3 Reorder re-numbers with no gaps: `bunkai*move*acceptance_criterion` re-threads the active set into contiguous 1..N with the moved row at the target slot.
- AC4 Zero ACs cannot be marked ready to test: gate inside PATCH /user-stories/{id} counts active ACs; zero -> 409 `ac*required*for*ready*to_test`.
- AC5 Title under 3 chars rejected: Zod `criterionTitleError` (min 3, max 200) returns `title*too*short` -> 422 validation_failed.
- AC6 Removing the last AC blocks ready-to-test again: `bunkai*archive*acceptance*criterion` closes the gap and, when it removes the last active AC of a ready*to_test story, reverts that story to draft and reports it.

### Slice 1 — Migration 0017 (additive)

- Add `user*stories.status text not null default 'draft'` with a check constraint in (draft, ready*to_test).
- Drop the FULL unique `acceptance*criteria*user*story*id*position*key`; create a PARTIAL unique index on (user*story*id, position) WHERE archived*at IS NULL, plus an active-list index on (user*story*id) WHERE archived*at IS NULL.
- Three SECURITY DEFINER plpgsql functions, all `set search*path = ''`, workspace-gated through `bunkai*can*write*workspace` (resolves workspace from user*stories.project*id -> projects.workspace_id), each ending with `revoke execute ... from public, anon`:

  - `bunkai*insert*acceptance*criterion(p*user*story*id, p*title, p*description default null, p_position default null)` returns jsonb.
  - `bunkai*move*acceptance*criterion(p*id, p*new*position)` returns jsonb.
  - `bunkai*archive*acceptance*criterion(p*id)` returns jsonb (criterion plus user*story*reverted flag).

- Rebalance is collision-free via negative-parking: park shifting active rows to negative positions, then restore to the final positive slots, so the partial unique index never sees a transient duplicate.
- Advisor lint 0029 on these DEFINER functions is the accepted project posture.
- After apply: `bun run types:gen` then patch `lib/types.ts` (new functions plus the status column).

### Slice 2 — Validation and error helpers

- `lib/acceptance-criteria/validation.ts`: `criterionTitleError` (min 3, max 200), `MAX*AC*DESCRIPTION_BYTES` = 50 KB, mirroring the user-story helpers. Framework-agnostic, unit-tested.
- `lib/acceptance-criteria/errors.ts`: `mapCriterionRpcError` mapping 42501 -> 403 not*a*member, P0002 -> 404, default -> 500; plus a `titleMessage` table.

### Slice 3 — API routes (mirror the BK-14 scoped-create / flat-mutate split)

- `app/api/v1/user-stories/[id]/acceptance-criteria/route.ts`: POST creates via the insert function (title required, optional Markdown detail sanitized on save, optional position); GET lists active ACs ordered by position ascending.
- `app/api/v1/acceptance-criteria/[id]/route.ts`: GET reads one active AC; PATCH updates title/description through an RLS update and/or position through the move function; DELETE archives through the archive function.
- Hybrid error model: house `code` plus granular `details.reason`. 50 KB byte-cap guard on description (server side), mirroring BK-14.
- Conditional RPC args object omits nulls (Supabase typegen types text params as non-nullable).

### Slice 4 — Ready-to-test gate on the User Story route

- Extend `app/api/v1/user-stories/[id]/route.ts` PATCH: add `status` to the schema (enum draft, ready*to*test). When moving to ready*to*test, count active ACs; zero -> 409 `ac*required*for*ready*to_test`. Keep the existing no-op short-circuit.
- Surface `status` in STORY_COLUMNS and the GET payload.

### Slice 5 — UI (up/down reorder, no drag-drop)

- AC management panel under the selected User Story: ordered, numbered list of ACs; add form (title plus optional MarkdownEditor detail with the 50 KB overCap submit-gate); per-AC edit, remove, and up/down arrow buttons calling PATCH position.
- User-story status badge plus a Mark ready to test / Back to draft toggle. With zero ACs the toggle is blocked and shows the at-least-one-AC message. Tokens: signal-blocked amber for the gate warning. No window.prompt (inline input).
- Mirror create-module and user-story form styling and the Sidebar action patterns; keep the design system.

### Slice 6 — OpenAPI and tests

- Register the new routes in the OpenAPI generation (`bun run openapi:gen`) and run `bun run api:sync`.
- Unit tests for the validation helpers (title bounds, byte cap). Manual smoke: add three ACs, reorder via arrows, archive, and verify the ready-to-test gate both directions.

### Verification

- `bun run lint:check`, `bun run types:check`, `bun test`, and `bun run build` all green before PR.

### Out of scope

- Authoring the parent User Story (BK-14), the Markdown editor itself (BK-16), linking ATCs to ACs (ATC epic), and AC change history.

## Review Workload Forecast

Estimated: ~900 additions + ~40 deletions = ~940 total lines
400-line budget risk: High
Chain strategy: size-exception (single cohesive story; solo-owner admin merge; matches BK-10 ~1435 and BK-14 ~900 precedent shipped as single PRs)
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
