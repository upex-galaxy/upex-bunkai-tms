# BK-48 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy69.atlassian.net/browse/BK-48)

```gherkin
Scenario: Filter the chain to failures only
  Given a user story with a mix of passing and failing runs
  When the Senior QA Engineer filters the chain by result "failed"
  Then the chain shows only the criteria, tests and runs that ended in a failure
```

```gherkin
Scenario: Filter by module and date range
  Given evidence spanning several modules and dates
  When the Senior QA Engineer filters by a module and a date range
  Then the chain shows only the evidence for that module within that range
```

```gherkin
Scenario: Filter with no matches
  Given a filter combination that matches no evidence
  When the Senior QA Engineer applies it
  Then the view shows an empty result with the active filters clearly stated
```

---
_Synced from Jira by sync-jira-issues_
