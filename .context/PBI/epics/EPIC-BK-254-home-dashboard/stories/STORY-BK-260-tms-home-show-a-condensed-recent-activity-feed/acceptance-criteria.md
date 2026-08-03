# BK-260 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-260)

```
Scenario: Member sees the most recent workspace activity
  Given a Senior QA Engineer's workspace has recent activity events
  When she opens the Home screen
  Then she sees a short list of the most recent events, each showing who acted, what they did, the target, and a relative time
```

```
Scenario: Member opens the full activity view from Home
  Given a Senior QA Engineer is viewing the condensed activity feed on Home
  When she selects the link to view all activity
  Then she is taken to the full activity view
```

```
Scenario: Workspace with no recent activity
  Given nothing has happened in a Senior QA Engineer's workspace recently
  When she opens the Home screen
  Then the condensed activity feed shows an empty state
```

---
_Synced from Jira by sync-jira-issues_
