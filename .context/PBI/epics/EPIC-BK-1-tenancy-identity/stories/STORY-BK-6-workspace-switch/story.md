# TMS-Workspace | Switch between workspaces

**Jira Key:** [BK-6](https://jira.upexgalaxy.com/browse/BK-6)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

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
4. UI POSTs `/api/v1/me/active-workspace` with {{{ workspace_id: "B" }}}.
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
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Tests (4)

- [BK-251](https://jira.upexgalaxy.com/browse/BK-251): BK-6: TC2: should reject the switch with 403 given the user has no membership in the target workspace _(AUTOMATED)_
- [BK-253](https://jira.upexgalaxy.com/browse/BK-253): BK-6: TC4: should display the newly active workspace in the header switcher after switch and page reload _(Candidate)_
- [BK-252](https://jira.upexgalaxy.com/browse/BK-252): BK-6: TC3: should reject the switch with 403 given the user's membership in the target workspace is suspended _(AUTOMATED)_
- [BK-250](https://jira.upexgalaxy.com/browse/BK-250): BK-6: TC1: should update active workspace context when switching to a workspace given the user is an active member _(AUTOMATED)_

### Defect (1)

- [BK-316](https://jira.upexgalaxy.com/browse/BK-316): WorkspaceSwitch: API: active-workspace switch not reflected in Bearer/PAT-authenticated GET /me _(Closed)_

### Bug (1)

- [BK-83](https://jira.upexgalaxy.com/browse/BK-83): WorkspaceSwitch: API: POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role) _(Closed)_

### Tech Story (1)

- [BK-328](https://jira.upexgalaxy.com/browse/BK-328): Add data-testid attributes to WorkspaceSwitcher component (unblocks BK-253 automation) _(To Do)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 8/8/2026
- **Reporter:** Ely
- **Assignee:** Luis Eduardo Flores Villarroel
- **Labels:** mvp, tenancy, wave-1

---

_Synced from Jira by sync-jira-issues_
