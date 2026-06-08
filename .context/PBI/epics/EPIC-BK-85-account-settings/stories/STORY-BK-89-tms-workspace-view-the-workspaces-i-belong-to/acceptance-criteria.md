# BK-89 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-89)

```gherkin
Scenario: Workspaces section lists membership with roles
  Given Mateo belongs to "Acme QA" (Admin) and "Fintech Audit" (Member)
   When he opens the Workspaces section
   Then he sees both workspaces, each labelled with his role
    And the currently active workspace is visibly marked
```

```gherkin
Scenario: Single-workspace user sees a clear state
  Given Mateo belongs to only one workspace
   When he opens the Workspaces section
   Then he sees that single workspace marked active
    And no confusing empty or broken layout
```

---
_Synced from Jira by sync-jira-issues_
