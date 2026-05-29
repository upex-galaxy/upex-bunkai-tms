# Switch between Workspaces I belong to

**Jira Key:** [BK-6](https://upexgalaxy67.atlassian.net/browse/BK-6)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

***Source spec:*** FR-004 — Workspace switch

## User story

As an authenticated user, I want to switch between Workspaces I belong to so that I can serve multiple clients or teams from one Bunkai account.

Implements ***FR-004***.

## Business rules

- User MUST be an active member of the target workspace (`status = "active"`); suspended or removed members get 403.
- The session's `active*workspace*id` MUST be the single source of truth for tenancy scoping in API middleware.
- Switching does NOT invalidate the session; only the scope changes.
- All subsequent API responses MUST reflect data scoped to the new active workspace.

## Workflow

1. User clicks the workspace switcher in the header.
2. Dropdown shows the list from `GET /api/v1/me/workspaces`.
3. User clicks Workspace B.
4. UI POSTs `/api/v1/me/active-workspace` with `{ workspace_id: "B" }`.
5. Server validates membership + status.
6. Server rotates session's `active*workspace*id`.
7. Returns 200 with the new workspace context.
8. UI navigates to `/home` (Workspace B's home).
9. All subsequent requests carry the new context.

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

## Labels

`mvp`, `tenancy`, `wave-1`

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/27/2026
- **Reporter:** Ely
- **Assignee:** Luis Eduardo Flores Villarroel
- **Labels:** mvp, tenancy, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:46.124Z_
