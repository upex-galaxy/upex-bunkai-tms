# BK-38 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-38)

```
Scenario: Review a sprint's runs across the whole Project
  Given the Project "Checkout v2" had 40 runs between 2026-05-12 and 2026-05-26
  When Mateo filters all project runs to the date range 2026-05-12 to 2026-05-26
  Then all 40 runs in that window are listed
  And the totals show "32 passed, 8 failed"
```

```
Scenario: Combine module and executor-type filters
  Given the Project "Checkout v2" has runs across the modules "Cart" and "Payment"
  When Mateo filters to module "Payment" and executor type "agent"
  Then only agent-executed runs under the "Payment" module are listed
  And the pass and fail totals count only those runs
```

```
Scenario: Filter combination with no matching runs
  Given no CI-executed runs exist under the "Cart" module
  When Mateo filters to module "Cart", executor type "ci", and status "failed"
  Then the list is empty
  And the totals show "0 passed, 0 failed"
```

```
Scenario: Each row carries the context a Lead needs
  Given the Project "Checkout v2" has runs to review
  When Mateo opens the project-wide run list
  Then each row shows the Test name, module, environment, executor mode, outcome, and date
```

```
Scenario: Clearing all filters restores the full view
  Given Mateo has narrowed the list to 5 failed agent runs in the "Payment" module
  When he clears all filters
  Then the full project-wide run list returns
  And the totals reflect every run in the Project
```

---
_Synced from Jira by sync-jira-issues_
