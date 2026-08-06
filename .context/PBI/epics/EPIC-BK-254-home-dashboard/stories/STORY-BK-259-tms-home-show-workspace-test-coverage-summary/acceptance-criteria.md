# BK-259 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-259)

```
Scenario: Workspace has a computable coverage percentage
  Given a QA Lead's workspace has acceptance criteria with and without executed test coverage
  When he opens the Home screen
  Then he sees the workspace's overall coverage percentage
```

```
Scenario: Coverage changed since a prior period
  Given a QA Lead's workspace coverage percentage differs from a prior period
  When he opens the Home screen
  Then he sees how the coverage percentage changed since that prior period
```

---
_Synced from Jira by sync-jira-issues_
