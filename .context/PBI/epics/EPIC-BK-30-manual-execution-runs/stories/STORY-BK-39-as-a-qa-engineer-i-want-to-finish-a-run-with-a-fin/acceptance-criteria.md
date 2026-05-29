# BK-39 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-39)

```gherkin
Scenario: Finish a fully executed run as passed
  Given Elena is executing a running run of "Checkout happy path" with 10 steps, all marked passed
  When she finishes the run with the verdict "passed"
  Then the run is closed with outcome "passed"
  And the finish time is recorded and shown on the run
```

```gherkin
Scenario: Finishing with steps still pending marks them skipped
  Given Elena is executing a running run of "Checkout happy path" with 10 steps where 7 are passed and 3 are still pending
  When she finishes the run with the verdict "failed"
  Then the run is closed with outcome "failed"
  And the 3 still-pending steps are marked "skipped"
  And the 7 passed steps remain marked "passed"
```

```gherkin
Scenario: Cannot finish a run that has already been aborted
  Given the run of "Checkout happy path" was already aborted with reason "Staging down"
  When Elena tries to finish it with the verdict "passed"
  Then the run stays aborted
  And she sees the message "This run is already closed and cannot be finished"
```

```gherkin
Scenario: An AI Test Agent finishes a run with the same handling as a human
  Given an AI Test Agent has executed a running run of "Nightly regression" with 20 steps where 18 are passed and 2 are still pending
  When the agent finishes the run with the verdict "failed"
  Then the run is closed with outcome "failed"
  And the 2 still-pending steps are marked "skipped"
  And the run is recorded identically to a run finished by a human
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:52.244Z_
