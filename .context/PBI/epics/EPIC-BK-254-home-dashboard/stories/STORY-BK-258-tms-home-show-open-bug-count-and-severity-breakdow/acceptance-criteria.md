# BK-258 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-258)

```
Scenario: Workspace has open bugs across severities
  Given a QA Lead's workspace has open bugs at more than one severity
  When he opens the Home screen
  Then he sees the total count of open bugs
  And he sees how many open bugs fall into each severity
```

```
Scenario: No open bugs in the workspace
  Given no bug in a QA Lead's workspace is currently open
  When he opens the Home screen
  Then the open bugs summary shows zero
```

---
_Synced from Jira by sync-jira-issues_
