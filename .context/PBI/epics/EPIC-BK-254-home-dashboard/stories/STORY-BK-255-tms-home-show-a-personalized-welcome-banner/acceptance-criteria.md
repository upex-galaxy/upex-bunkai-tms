# BK-255 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-255)

```
Scenario: Member sees a personalized greeting on Home
  Given a Senior QA Engineer is signed in to a workspace
  When she opens the Home screen
  Then she sees a greeting that includes her display name
  And she sees the name of the workspace she is currently in
```

```
Scenario: Member sees a summary of what changed since she was last active
  Given a Senior QA Engineer was last active in the workspace at some point in the past
  And ATCs, Tests, or Runs changed in the workspace since then
  When she opens the Home screen
  Then she sees a short summary describing what changed since she was last active
```

```
Scenario: Nothing changed since the member was last active
  Given nothing has changed in the workspace since a Senior QA Engineer was last active
  When she opens the Home screen
  Then the summary indicates there is nothing new to review
```

---
_Synced from Jira by sync-jira-issues_
