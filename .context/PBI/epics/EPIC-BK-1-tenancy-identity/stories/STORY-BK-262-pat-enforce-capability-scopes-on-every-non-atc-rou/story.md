# PAT | Enforce capability scopes on every non-ATC route

**Jira Key:** [BK-262](https://jira.upexgalaxy.com/browse/BK-262)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** ABORTED
**Priority:** Medium
**Story Points:** 21

---

## Overview

## User story

***As a*** Karim, the autonomous AI test agent that authenticates to Bunkai with a Personal Access Token
***I want to*** have my token's capability scope enforced on every route I call, not only the ATC routes
***So that*** a token minted for one narrow job can never be used to perform actions outside that job's scope, whether by mistake or because the token leaked

## Definition of done

- Every non-ATC route family (imports, modules, projects, user stories, acceptance criteria, workspaces, invites) checks the caller token's capability scope before making any change.
- A properly-scoped token succeeds; an under-scoped token is rejected before any change happens.
- A token with no resolvable workspace context is rejected with a clear, distinguishable error.
- Browser/session callers keep working exactly as before — nothing changes for that caller.
- Acceptance criteria validated end to end.

---

## QA Refinements (Shift-Left Analysis)

***Refined 2026-08-14.*** Full analysis, refined ACs, and test outlines: `shift-left-refinement.md` (linked from this Story's ATP DRAFT field). Decision summary + rationale also posted as a comment on this issue.

### Central feasibility finding

`requireCapability()` (via `withApiHandler({ requires: [...] })`) is the real, live enforcement mechanism — already covering 25/82 handlers today (all ATC-authoring, run-execution, and the 5 `workspace:admin` handlers). This Story extends that proven mechanism to the 49 handlers that currently omit it — it does not build enforcement from scratch. 2 of the 3 originally-published ACs (invite creation, workspace-context rejection) already pass on today's unfixed code — only the module-create AC targets a genuine gap.

### Clarified business rules

- Read (GET) endpoints across the 7 named route families require `atc:read`.
- Workspace-context rejection (`assertWorkspaceContext()`) stays scoped to the `workspace:admin` family only — not extended to the other 44 gap routes, which rely on capability + RLS membership alone.
- `invites/accept` (POST) is explicitly out of scope for this Story — documented follow-up debt.

### Edge cases identified

- Multi-scope PAT missing only the one scope a route needs — must reject (403), confirming scopes are non-overlapping.
- Revoked/expired PAT reaching a capability-gated route — rejected earlier, at `401`, before the capability check runs.
- Session/cookie callers are unaffected by this Story on every one of the 7 route families (no scope concept for them).

### Delivery plan

Grouped into 2 PRs — Group 1 (Foundation + Authoring writes), Group 2 (Reporting reads + Identity/notifications + Docs). `app/api/v1/projects/[id]/traceability/route.test.ts:127-134` (currently asserts the pre-fix `201` contract) will be updated to assert `403` in the same PR that fixes that route.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Bugs (7)

- [BK-84](https://jira.upexgalaxy.com/browse/BK-84): [Staging] PAT bearer auth rejected on member/owned-resource routes (Imports, Projects, Modules, Tokens) — requireAuth middleware regression _(Closed)_
- [BK-92](https://jira.upexgalaxy.com/browse/BK-92): BK-7: Module: PAT bearer token rejected on module/workspace resource endpoints (401) _(Duplicated)_
- [BK-93](https://jira.upexgalaxy.com/browse/BK-93): BK-7: Module: PAT bearer token rejected on module/workspace resource endpoints (401) _(Duplicated)_
- [BK-182](https://jira.upexgalaxy.com/browse/BK-182): Bearer run creation cannot resolve active workspace _(Ready For QA)_
- [BK-118](https://jira.upexgalaxy.com/browse/BK-118): TMS-Workspace: API: POST /api/v1/me/active-workspace returns legacy fields {ok, active_workspace_id} alongside fix fields _(Closed)_
- [BK-83](https://jira.upexgalaxy.com/browse/BK-83): WorkspaceSwitch: API: POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role) _(Closed)_
- [BK-135](https://jira.upexgalaxy.com/browse/BK-135): POST /api/v1/tokens issues workspace:admin tokens to member-role users without 403 enforcement _(Closed)_

### Storys (3)

- [BK-497](https://jira.upexgalaxy.com/browse/BK-497): PAT | Require every API route to declare its capability posture _(QA Approved)_
- [BK-498](https://jira.upexgalaxy.com/browse/BK-498): PAT | Enforce capability scopes on the authoring domain _(QA Approved)_
- [BK-499](https://jira.upexgalaxy.com/browse/BK-499): PAT | Enforce capability scopes on read, identity and notification routes _(Ready For Dev)_

### Improvement (1)

- [BK-97](https://jira.upexgalaxy.com/browse/BK-97): Enforce per-route PAT capabilities on non-ATC API routes (ADR-0001 follow-up) _(Duplicated)_

---

## Metadata

- **Created:** 8/2/2026
- **Updated:** 8/17/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-08-14, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
