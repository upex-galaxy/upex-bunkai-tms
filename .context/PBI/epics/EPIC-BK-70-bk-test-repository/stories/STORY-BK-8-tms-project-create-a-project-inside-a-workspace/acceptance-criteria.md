# BK-8 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-8)

```
Scenario: Successful Project creation
Given a workspace member of Workspace W
When they POST /api/v1/workspaces/W/projects with { name: "Checkout v2" }
Then the system inserts a row in projects with slug "checkout-v2" auto-derived
And returns 201 with { project_id, slug: "checkout-v2" }
```

```
Scenario: Name too short rejected
Given a workspace member
When they submit name "AB" (2 chars)
Then the system returns 400 with code NAME*TOO*SHORT (min 3 chars)
```

```
Scenario: Duplicate slug in workspace rejected
Given workspace W already has a Project with slug "checkout-v2"
When a member POSTs another Project with name "Checkout V2"
Then the system returns 409 with code SLUG*DUPLICATE*IN_WORKSPACE
```

```
Scenario: Member cannot create in workspace they do not belong to
Given an authenticated user who is NOT a member of Workspace X
When they POST /api/v1/workspaces/X/projects
Then the system returns 403 with code NOT*A*MEMBER
```

---
_Synced from Jira by sync-jira-issues_
