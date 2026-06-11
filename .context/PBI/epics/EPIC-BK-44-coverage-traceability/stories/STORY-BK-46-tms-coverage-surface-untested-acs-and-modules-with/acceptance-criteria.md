# BK-46 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-46)

```
Scenario: List acceptance criteria with no ATC
  Given a module whose acceptance criteria are partly covered by ATCs
  When the QA Lead opens the coverage view for that module
  Then the view lists the acceptance criteria that have no ATC linked
```

```
Scenario: Filter to never-run coverage
  Given acceptance criteria that have ATCs but have never been included in a run
  When the QA Lead applies the "not run" filter
  Then the view shows only the criteria and modules whose coverage has never been executed
```

```
Scenario: Fully covered module
  Given a module whose acceptance criteria all have executed test coverage
  When the QA Lead opens its coverage view
  Then the view reports the module as fully covered with no gaps
```

---
_Synced from Jira by sync-jira-issues_
