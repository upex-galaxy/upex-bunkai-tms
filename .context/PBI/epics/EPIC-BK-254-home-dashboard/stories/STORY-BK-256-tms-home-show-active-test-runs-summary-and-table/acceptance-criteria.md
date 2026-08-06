# BK-256 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-256)

```
Scenario: Workspace has active runs across multiple projects
  Given a QA Lead's workspace has several runs currently in progress across more than one project
  When he opens the Home screen
  Then he sees a table listing every one of those runs
  And each row shows the run identifier, project, execution mode, status, step-completion progress, and executor
```

```
Scenario: No active runs in the workspace
  Given no run in a QA Lead's workspace is currently in progress
  When he opens the Home screen
  Then the active runs table shows an empty state indicating nothing is running right now
```

```
Scenario: Resuming the most recently active run
  Given a QA Lead's workspace has at least one run currently in progress
  When he opens the Home screen
  Then he can resume the most recently active run directly from the Home screen
```

---
_Synced from Jira by sync-jira-issues_
