# BK-45 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-45)

```
Scenario: Open the evidence chain for a covered user story
  Given a user story that has acceptance criteria, ATCs, tests, runs and a defect
  When the QA Lead opens its traceability view
  Then the view shows, in one read, each acceptance criterion with its ATCs, the tests they belong to, the latest run result, and any linked defect
```

```
Scenario: User story with partial coverage
  Given a user story whose acceptance criteria have ATCs but no run yet
  When the QA Lead opens its traceability view
  Then the chain renders down to the ATCs and marks the run and defect levels as "no data yet"
```

```
Scenario: User story with no coverage
  Given a user story with no ATCs linked to its acceptance criteria
  When the QA Lead opens its traceability view
  Then the view clearly states the story has no coverage and shows no broken or empty chain rows
```

---
_Synced from Jira by sync-jira-issues_
