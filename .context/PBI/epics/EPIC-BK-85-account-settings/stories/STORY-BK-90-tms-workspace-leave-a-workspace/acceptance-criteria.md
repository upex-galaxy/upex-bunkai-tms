# BK-90 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

```gherkin
Scenario: Leaving a workspace asks for confirmation
  Given Mateo is viewing "Fintech Audit" in the Workspaces section
   When he selects "Leave workspace"
   Then a confirmation names "Fintech Audit" explicitly before he commits
    And on confirm the workspace disappears from his list
    And the active workspace falls back to "Acme QA"
```

```gherkin
Scenario: A user cannot leave a workspace they solely own
  Given Mateo is the only owner of "Acme QA"
   When he views that workspace in the Workspaces section
   Then the "Leave workspace" action is unavailable
    And he sees the reason (he is the sole owner)
```

---
_Synced from Jira by sync-jira-issues_
