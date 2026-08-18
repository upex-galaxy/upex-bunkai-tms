# BK-204 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-204)

```
Scenario: Plan shows per-test latest outcomes and an aggregate summary
  Given the plan "Release 2.4 regression" contains 10 tests
  And 6 of them have a latest run verdict of passed, 2 failed, 1 aborted, and 1 has never been run
  When Mateo opens the plan
  Then each test row shows its latest outcome chip and the time of that run
  And the plan header shows the aggregate: 6 passed, 2 failed, 1 aborted, 1 not run, with 60 percent passed
```

```
Scenario: A test that was never run shows as not run
  Given the test "New onboarding flow" belongs to the plan and has no runs
  When Mateo views the plan
  Then that row shows "Not run" and it is counted in the not-run total of the aggregate
```

```
Scenario: A newly finished run updates the plan on next view
  Given the test "Checkout with saved card" shows a failed latest outcome in the plan
  When Elena finishes a new run of that test with the verdict passed
  And Mateo reopens the plan
  Then that test row shows passed and the aggregate totals reflect the change
```

```
Scenario: A test with only an in-progress run shows as in progress
  Given the test "Profile settings" has one run that is still executing
  When Mateo views the plan
  Then that row shows "In progress" and it is not counted as passed, failed, or aborted
```

```
Scenario: An empty plan shows an empty progress state
  Given the plan "Smoke pass" has no member tests
  When Mateo opens it
  Then the progress area shows an empty state instead of a percentage
```

---
_Synced from Jira by sync-jira-issues_
