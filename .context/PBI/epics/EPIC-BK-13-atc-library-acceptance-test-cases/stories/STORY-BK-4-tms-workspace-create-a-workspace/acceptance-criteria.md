# BK-4 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-4)

```gherkin
Scenario: Successful workspace creation
Given an authenticated user
When they POST /api/v1/workspaces with name "Acme QA"
Then the system inserts a row in workspaces with the auto-derived slug "acme-qa"
And inserts the creator into workspace_members with role "owner"
And returns 201 with body { workspace_id, slug: "acme-qa" }

Scenario: Name too short rejected
Given an authenticated user
When they submit a workspace name "A" (1 char)
Then the system returns 400 with code NAME*TOO*SHORT (min 3 chars)

Scenario: Reserved slug rejected
Given an authenticated user
When they submit name "API" which slugifies to "api"
Then the system returns 400 with code SLUG_RESERVED
And the response lists the reserved slugs (api, app, auth, admin, bunkai, ...)

Scenario: Duplicate name per owner case-insensitive
Given a user who already owns a workspace named "Acme QA"
When they POST a second workspace with name "acme qa"
Then the system returns 409 with code NAME*DUPLICATE*FOR_OWNER

Scenario: workspace.created event emitted
Given a successful workspace creation
When the row is inserted
Then a workspace.created event is emitted on the realtime channel for the owner
```

---
_Synced from Jira by sync-jira-issues_
