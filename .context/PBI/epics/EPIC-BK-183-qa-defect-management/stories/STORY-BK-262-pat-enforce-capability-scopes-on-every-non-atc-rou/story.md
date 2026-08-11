# PAT | Enforce capability scopes on every non-ATC route

**Jira Key:** [BK-262](https://jira.upexgalaxy.com/browse/BK-262)
**Epic:** [BK-183](https://jira.upexgalaxy.com/browse/BK-183) (QA Defect Management)
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** -

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

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)

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

### Improvement (1)

- [BK-97](https://jira.upexgalaxy.com/browse/BK-97): Enforce per-route PAT capabilities on non-ATC API routes (ADR-0001 follow-up) _(Open)_

---

## Metadata

- **Created:** 8/2/2026
- **Updated:** 8/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
