# BK-35 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-35)

```gherkin
Scenario: Mark a step passed and watch progress advance
  Given Elena is executing a running run of "Checkout happy path" with 10 steps, all pending
  When she marks step 1 "Open the cart page" as passed
  Then step 1 shows "passed"
  And the run progress advances to "10% complete"
```

```gherkin
Scenario: A failed step turns the parent ATC verdict to failed
  Given the ATC "Apply discount code" has 3 steps and Elena has passed the first 2
  When she marks step 3 "Verify the 10% discount is applied" as failed with the note "Total unchanged" and an evidence link
  Then step 3 shows "failed" with the note and the evidence link attached
  And the ATC "Apply discount code" verdict becomes "failed"
```

```gherkin
Scenario: Blocked step with no failure makes the ATC verdict blocked
  Given the ATC "Pay with saved card" has 2 steps and Elena passed the first
  When she marks step 2 "Confirm payment succeeds" as blocked
  Then the ATC "Pay with saved card" verdict becomes "blocked"
  And no step in that ATC is marked failed
```

```gherkin
Scenario: A watching teammate sees progress update live
  Given Mateo is watching the same running run on his screen showing "30% complete"
  When Elena marks the next step passed
  Then Mateo's view updates to "40% complete" without him refreshing
```

```gherkin
Scenario: Cannot report a result on a run that has already finished
  Given the run of "Checkout happy path" has already finished as passed
  When Elena tries to mark a step blocked
  Then no result is recorded
  And she sees the message "This run is already closed and can no longer be updated"
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:51.466Z_
