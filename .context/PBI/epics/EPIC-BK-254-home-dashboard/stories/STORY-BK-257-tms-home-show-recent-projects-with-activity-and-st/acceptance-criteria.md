# BK-257 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-257)

```
Scenario: Member sees projects ordered by recent activity
  Given a Senior QA Engineer's workspace has multiple projects with different last-activity times
  When she opens the Home screen
  Then she sees a list of projects ordered from most to least recently active
  And each project shows its module count, ATC count, and last-activity time
```

```
Scenario: Navigating to a project from Home
  Given a Senior QA Engineer is viewing the recent projects list on Home
  When she selects a project from the list
  Then she is taken to that project
```

```
Scenario: Workspace with a single active project
  Given a Senior QA Engineer's workspace only has one project with any activity
  When she opens the Home screen
  Then the recent projects list shows just that project
```

---
_Synced from Jira by sync-jira-issues_
