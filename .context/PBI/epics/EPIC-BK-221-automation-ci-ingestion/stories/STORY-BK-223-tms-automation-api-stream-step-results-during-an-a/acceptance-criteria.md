# BK-223 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-223)

```
Scenario: Start a run and stream step results
  Given Karim holds a valid workspace Personal Access Token with the member role
  And the Test "Checkout happy path" exists with 4 chained ATC steps
  When Karim starts a run against environment "Staging"
  And reports step 1 as "pass", step 2 as "pass", and step 3 as "fail", one call at a time
  Then after each report the run detail reflects the newly reported step status
  And the run remains in progress until Karim finishes it
```

```
Scenario: A human watches progress live
  Given Elena has the run detail open in her browser while Karim's run is in progress
  When Karim reports step 2 as "fail"
  Then Elena sees step 2 flip to failed within a few seconds without reloading the page
```

```
Scenario: Finish the streamed run with a verdict
  Given Karim has reported a result for every step of the run
  When Karim finishes the run with verdict "failed" and total duration 145 seconds
  Then the run becomes a finished, immutable run with verdict "failed"
  And it appears in the project runs view like any other finished run
```

```
Scenario: Retried step report is idempotent
  Given Karim reported step 3 as "fail" with idempotency key "step3-attempt-1"
  When the connection drops and Karim retries the same report with the same key
  Then the run still holds exactly one result for step 3
  And the retry response matches the original response
```

```
Scenario: A crashed runner leaves an aborted run, not a zombie
  Given Karim's runner crashes after reporting 2 of 4 steps
  When Karim (or Elena from the run view) aborts the run with reason "runner crashed"
  Then the run is recorded as aborted with the 2 reported step results preserved
```

---
_Synced from Jira by sync-jira-issues_
