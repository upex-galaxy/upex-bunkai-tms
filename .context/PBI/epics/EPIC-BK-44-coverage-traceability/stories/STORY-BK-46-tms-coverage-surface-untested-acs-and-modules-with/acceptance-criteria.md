# BK-46 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy69.atlassian.net/browse/BK-46)

```gherkin
Scenario: List acceptance criteria with no test component
  Given a module whose acceptance criteria are partly covered by test components
  When the QA Lead opens the coverage view for that module
  Then the view lists the acceptance criteria that have no test component linked
```

```gherkin
Scenario: Filter to never-run coverage
  Given acceptance criteria that have test components but have never been included in a run
  When the QA Lead applies the "not run" filter
  Then the view shows only the criteria and modules whose coverage has never been executed
```

```gherkin
Scenario: Fully covered module
  Given a module whose acceptance criteria all have executed test coverage
  When the QA Lead opens its coverage view
  Then the view reports the module as fully covered with no gaps
```

---
_Synced from Jira by sync-jira-issues_
