# BK-8 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-8)

## Summary

API-first plus UI. Add `POST` and `GET` `/api/v1/workspaces/{id}/projects`, mirroring the workspace-invites route pattern, plus a Create-Project UI that replaces the current "Phase E" placeholder. The DB layer (`projects` table plus RLS policies) already enforces the membership and role rule, so no migration and no type regeneration are required.

## Resolved shift-left blockers

- Workspace path param: UUID (matches every existing `[id]` route).
- Auth: cookie session plus RLS gate (mirror invites). No bearer token.
- Error model: HYBRID. House enum `code` (`validation_failed`, `conflict`, `forbidden`) plus a granular `details.reason` so QA can still distinguish each rule.
- Slug: auto-derived lowercase kebab, unique per workspace, length 3 to 40 (reuse the workspace slug rule). Duplicate raises 409, no auto-suffix.
- Non-member: 403 (RLS `42501`).
- UI: in scope (Create-Project form).

## As-built observable contract (QA reference)

This refines the original AC `code`/status to the house convention. The granular intent survives in `details.reason`.

- Success: `201` with `{ project: { id, slug, name, description, workspace*id, created*at } }` (`project_id` equals `project.id`).
- Name shorter than 3, longer than 80, or with no alphanumeric char: `422` `code=validation*failed`, `details.reason` one of `name*too*short`, `name*too*long`, `name*no_alphanumeric`.
- Description larger than 5KB: `422` `code=validation*failed`, `details.reason=description*too_large`.
- Duplicate slug in the same workspace: `409` `code=conflict`, `details.reason=slug*duplicate*in_workspace`.
- Caller not a member or insufficient role: `403` `code=forbidden`, `details.reason=not*a*member`.
- Malformed or non-UUID workspace id, or invalid JSON body: `400` `code=bad_request`.
- Unauthenticated: `401` `code=unauthorized`.

## Tasks (AC-mapped)

1. Shared slug utility `lib/utils/slug.ts` exporting `slugify(name)`: lowercase, strip accents, kebab, collapse repeated hyphens, trim to 40 chars, ensure alphanumeric boundaries. Generalize the client-only `slugify` currently inlined in the onboarding form. Enables AC 1 slug derivation.
2. API route `app/api/v1/workspaces/[id]/projects/route.ts`:

   - `POST`: extract and UUID-guard the workspace id; cookie `getUser` else 401; parse JSON else 400; Zod parse `{ name, description? }`; explicit rule checks that throw `validation*failed` with the matching `details.reason`; `slugify` the name; insert through the RLS-gated client; map `42501` to 403 `not*a*member` and `23505` to 409 `slug*duplicate*in*workspace`; return 201 `{ project }`. Covers AC 1, 2, 3, 4.
   - `GET`: list the workspace projects visible to the member (matches the invites route shipping both verbs).

1. OpenAPI `app/api/v1/workspaces/[id]/projects/route.openapi.ts`: register both verbs with responses 201, 400, 401, 403, 409, 422 using the shared error envelope schema. Run `bun run api:sync`.
2. UI: replace the placeholder in `app/(app)/projects/page.tsx` with a Create-Project form (name input, optional description textarea, live slug preview). On 201 navigate to the new project; render `details.reason` as an inline field error. Covers workflow steps 1 to 3 and 9.
3. Unit tests with `bun test`: `slugify` (accents, length cap, hyphen collapse, boundary chars) plus body-validation reasons.

## Out of scope

Project rename, deletion or archival, transfer between workspaces, templates (per story OOS). No DB migration. No bearer-token auth path.

## Verification

- `bun run lint:check`, `bun run types:check`, and `bun test` all green (run in parallel, cap 3).
- `bun run api:sync` leaves no uncommitted OpenAPI drift.
- Stage 3 Spec Compliance Matrix maps each AC scenario to its test or evidence and documents the hybrid `code`/status refinement for QA.

## Review Workload Forecast

Estimated: about 240 additions plus 10 deletions, about 250 total lines.
400-line budget risk: Medium.
Chain strategy: single feature branch, one PR to staging.
Decision needed before apply: No.

---
_Synced from Jira by sync-jira-issues_
