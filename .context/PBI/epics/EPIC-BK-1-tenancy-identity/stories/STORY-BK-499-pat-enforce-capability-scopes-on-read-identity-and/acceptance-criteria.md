# BK-499 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-499)

## Refined Acceptance Criteria (Finalized 2026-08-21 — see AI Product Owner & AI Tech Lead Ruling comment)

### AC1 — Bootstrap workspace (carried verbatim from BK-262)

```gherkin
Scenario: Any authenticated token can bootstrap a new workspace
  Given Karim holds any valid, non-expired, non-revoked Personal Access Token with at least one scope
  When Karim sends a request to create a new workspace
  Then the workspace is created with 201
  And Karim becomes its admin

Scenario: A zero-scope token cannot bootstrap a workspace
  Given Karim holds a valid PAT minted with an empty scope array
  When Karim sends a request to create a new workspace
  Then the request is rejected with 403
```

### AC2/AC3 — Capability-gated reads (14 `atc:read`-gated routes)

Applies to: `GET /activity`, `GET /bugs`, `GET /bugs/{id}`, `GET /projects/{id}/bugs`, `GET /projects/{id}/bugs/heatmap`, `GET /projects/{id}/coverage`, `GET /projects/{id}/runs/report`, `GET /projects/{id}/traceability`, `GET /projects/{id}/metrics/recovery-cycles`, `GET /runs/{id}`, `GET /tests/{id}`, `GET /tests/{id}/runs`, `GET /workspaces`, `GET /workspaces/{id}`.

```gherkin
Scenario: A properly read-scoped token succeeds reading a non-ATC resource
  Given Karim holds a valid Personal Access Token scoped atc:read
  When Karim sends a request to read a non-ATC resource, such as listing the Bugs in a project (GET /api/v1/projects/{id}/bugs)
  Then the response returns 200 with the requested data

Scenario: A token missing the read scope is rejected reading a non-ATC resource
  Given Karim holds a valid Personal Access Token scoped only run:execute
  When Karim sends a request to read a non-ATC resource, such as listing the Bugs in a project (GET /api/v1/projects/{id}/bugs)
  Then Karim receives an authorization error with 403
  And no data is returned
```

### AC4 — Identity/notification routes accept any authenticated PAT regardless of scope

Applies to: `GET /me`, `GET /notification-preferences`, `PATCH /notification-preferences`, `POST /notifications/{id}/read`, `GET /workspaces/{id}/notifications`, `POST /workspaces/{id}/notifications/read-all`.

```gherkin
Scenario: Identity/notification routes succeed for any authenticated PAT regardless of scope
  Given Karim holds a Personal Access Token scoped only run:execute
  When Karim calls any of the 6 identity/notification routes above
  Then the request succeeds normally — no 403 for lacking a specific capability
```

### AC5 — Session-only routes reject every PAT regardless of scope

Applies to: `DELETE /workspaces/{id}/membership`, `POST /me/active-workspace`.

```gherkin
Scenario: Session-only routes reject any Bearer PAT outright
  Given Karim holds a Personal Access Token with every scope in the catalog
  When Karim sends the request via Authorization: Bearer
  Then the response is 403 "...Use a browser session." — not a scope-insufficiency message

Scenario: Session-only routes succeed for a browser session unconditionally
  Given Karim is authenticated via browser session
  When Karim sends the same request
  Then the response succeeds normally
```

### AC6 — Browser session is never scope-restricted (Business Rule 2)

```gherkin
Scenario: A browser session reads a capability-gated route with no scope check
  Given Karim is authenticated via browser session (no PAT, no scope concept applies)
  When Karim sends GET /activity (or any atc:read-gated route)
  Then the response returns 200 with data — capability check does not apply to session callers
```

### AC7 — Workspace role never substitutes for a missing capability (Business Rule 1)

```gherkin
Scenario: A workspace-owner-role PAT missing the required capability is still rejected
  Given Karim is the owner of the target workspace, holding a PAT scoped only run:execute
  When Karim sends a GET request to any atc:read-gated route inside that workspace
  Then the response is 403 — owner role does NOT substitute for the missing atc:read scope

Scenario: A viewer-role PAT holding the required capability succeeds
  Given Karim is a viewer in the target workspace, holding a PAT scoped atc:read
  When Karim sends a GET request to any atc:read-gated route inside that workspace
  Then the response returns 200 — viewer role is sufficient once the capability is present
```

### AC8 — Creating a project requires `atc:write`

```gherkin
Scenario: A properly write-scoped token succeeds creating a project
  Given Karim holds a valid PAT scoped atc:write, and is a member (role >= member) of the target workspace
  When Karim sends POST /api/v1/workspaces/{id}/projects with a valid name
  Then the response returns 201 with the created project

Scenario: A token missing the write scope is rejected creating a project
  Given Karim holds a valid PAT scoped only atc:read (or any scope set excluding atc:write)
  When Karim sends POST /api/v1/workspaces/{id}/projects
  Then Karim receives 403, evaluated BEFORE the existing workspace-membership (role >= member) check
  And no project is created
```

---

**Full analysis, rationale per ruling, and test outlines****:**** see the Acceptance Test Plan (ATP) field and the "AI Product Owner & AI Tech Lead Ruling" comment.**

---
_Synced from Jira by sync-jira-issues_
