# BK-45 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy69.atlassian.net/browse/BK-45)

```gherkin
Scenario: Open the evidence chain for a covered user story
  Given a user story that has acceptance criteria, test components, tests, runs and a defect
  When the QA Lead opens its traceability view
  Then the view shows, in one read, each acceptance criterion with its test components, the tests they belong to, the latest run result, and any linked defect
```

```gherkin
Scenario: User story with partial coverage
  Given a user story whose acceptance criteria have test components but no run yet
  When the QA Lead opens its traceability view
  Then the chain renders down to the test components and marks the run and defect levels as "no data yet"
```

```gherkin
Scenario: User story with no coverage
  Given a user story with no test components linked to its acceptance criteria
  When the QA Lead opens its traceability view
  Then the view clearly states the story has no coverage and shows no broken or empty chain rows
```

---
_Synced from Jira by sync-jira-issues_
