# BK-36 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-36)

```
Scenario: Abort a run mid-flight and skip the rest
  Given Elena is executing a running run of "Checkout happy path" with 10 steps where 4 are passed and 6 are still pending
  When she aborts the run with the reason "Staging environment went down"
  Then the run is closed as "aborted"
  And the 6 pending steps are marked "skipped"
  And the 4 passed steps remain marked "passed"
  And the reason "Staging environment went down" is shown on the run
```

```
Scenario: Reason that is too short is rejected
  Given Elena is executing a running run of "Checkout happy path"
  When she tries to abort with the reason "x"
  Then the run stays open and in progress
  And she sees the message "Please give a reason of at least 3 characters"
```

```
Scenario: Cannot abort a run that already finished
  Given the run of "Checkout happy path" already finished as passed
  When Elena tries to abort it with the reason "Stopping early"
  Then the run stays finished as passed
  And she sees the message "This run is already closed and cannot be aborted"
```

```
Scenario: Aborted run stays in the Test's history
  Given Elena aborted a run of "Checkout happy path" with the reason "Blocked by missing test data"
  When she opens the Test's run history
  Then the aborted run appears in the list with outcome "aborted"
  And its reason "Blocked by missing test data" is visible
```

---
_Synced from Jira by sync-jira-issues_
