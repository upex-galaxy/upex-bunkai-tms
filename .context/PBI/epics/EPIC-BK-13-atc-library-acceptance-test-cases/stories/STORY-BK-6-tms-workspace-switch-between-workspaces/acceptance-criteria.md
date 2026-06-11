# BK-6 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-6)

```gherkin
Scenario: Successful workspace switch
Given an authenticated user who is an active member of Workspace A and Workspace B
When they POST /api/v1/me/active-workspace with { workspace_id: "B" }
Then the system rotates the session's active*workspace*id to B
And returns 200 with the new workspace { id, slug, name, role }
And every subsequent API call is scoped to Workspace B

Scenario: Switch to non-member workspace rejected
Given an authenticated user who is NOT a member of Workspace C
When they POST /api/v1/me/active-workspace with { workspace_id: "C" }
Then the system returns 403 with code NOT*A*MEMBER
And does NOT change the session

Scenario: Switch to workspace where membership is suspended
Given an authenticated user with a workspace_members row where status = "suspended" for Workspace D
When they POST the switch
Then the system returns 403 with code MEMBERSHIP_SUSPENDED
And does NOT change the session

Scenario: UI switcher reflects current active workspace
Given a user has switched to Workspace B via API
When they reload the app
Then the workspace switcher in the header displays "Workspace B" as the active one
And the URL persists the workspace context (path-based or header-based, per architecture)
```

---
_Synced from Jira by sync-jira-issues_
