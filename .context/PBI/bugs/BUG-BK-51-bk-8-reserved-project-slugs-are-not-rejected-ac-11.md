# BUG: BK-8: Reserved project slugs are not rejected (AC-11) — created with HTTP 201

**Jira Key:** [BK-51](https://jira.upexgalaxy.com/browse/BK-51)
**Priority:** High
**Status:** Closed
**Components:** Project & Module Hierarchy
**Severity:** Mayor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Summary

`POST /api/v1/workspaces/{id}/projects` accepts reserved slugs that AC-11 and the Dev shift-left response require to be rejected. Project names whose derived slug is a reserved word (`api`, `new`, `settings`, `admin`, `null`, `docs`, and the rest of the agreed list) are created with HTTP 201 instead of being blocked.

## Environment

Staging — https://staging-upexbunkai.vercel.app · API `/api/v1` · 2026-06-04 · cookie-session auth as `bunkai-staging-user`.

## Severity / Type

Severity: ***Major**** · Error type: ****functional*** (latent routing-collision risk).

## Steps to Reproduce

1. Authenticate as an active workspace member.
2. `POST /api/v1/workspaces/{workspaceId}/projects` with body `{ "name": "api" }`.
3. Repeat with `{ "name": "new" }`, `{ "name": "settings" }`, `{ "name": "admin" }`, `{ "name": "null" }`, `{ "name": "docs" }`.

## Expected Result

`422 validation*failed` (or `400`) with `details.reason = slug*reserved` / error code `SLUG_RESERVED`, per AC-11 and the Dev shift-left commitment (reserved list: `api, new, create, edit, delete, settings, admin, null, undefined, true, false, me, self, health, docs, openapi, static, public`).

## Actual Result

All six requests returned ***HTTP 201*** and created the project. Verified in DB (`public.projects`) — rows present with slugs `api`, `new`, `settings`, `admin`, `null`, `docs` in workspace `bc75c0d4-6d92-4d3f-a92f-f41e4b1774fe`.

## Root Cause (code-confirmed)

`app/api/v1/workspaces/[id]/projects/route.ts` performs name length + alphanumeric checks but has ***no reserved-slug validation****. The reserved-slug guard exists only in the **workspaces* route (`app/api/v1/workspaces/route.ts`); `SLUG*RESERVED` is not even a member of `API*ERROR_CODES` in `lib/api/error-envelope.ts`.

## Impact

Reserved slugs collide with Next.js route segments under `app/(app)/projects/[projectSlug]/`. Once sibling static routes (e.g. `/projects/new`, `/projects/settings`) ship, those user projects become unreachable/shadowed. AC-11 fails outright.

## Evidence

`.context/PBI/epics/EPIC-BK-7-project-module-hierarchy/stories/STORY-BK-8-create-a-project-inside-a-workspace/test-session-memory.md` (T09 row) + DB rows.

---

## 🔍 Root Cause

**Category:** Code Error

---

## Related Issues

- is duplicated by: [BK-54](https://jira.upexgalaxy.com/browse/BK-54) - BK-8: Reserved project slugs are not rejected (AC-11) — created with HTTP 201

---

## Metadata

- **Created:** 6/3/2026
- **Updated:** 6/25/2026
- **Reporter:** Ely
- **Assignee:** Nahuel Gomez
- **Labels:** bk-8, sprint-defect, wave-1

---

_Synced from Jira by sync-jira-issues_
