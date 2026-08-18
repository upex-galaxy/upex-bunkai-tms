# BK-37 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-37)

***Refined by Shift-Left QA — 2026-07-21.*** Original 5 scenarios exploded to 8 (1:N per outcome-enum + pagination boundary). All 3 inferred scenarios confirmed by PO — 2026-07-21 (see comments).

```
Scenario: View a Test's runs newest first
  Given the Test "Checkout happy path" has 5 past runs
  When Elena opens the Test's run history
  Then the 5 runs are listed newest first
  And each entry shows its outcome, environment, executor mode, and when it ran
```

```
Scenario: Filter history to failed runs only
  Given the Test "Checkout happy path" has 8 runs: 5 passed, 2 failed, 1 aborted
  When Elena filters the history by outcome "failed"
  Then only the 2 failed runs are shown
  And the passed and aborted runs are hidden
```

```
Scenario: Filter matches zero runs
  Given the Test "Checkout happy path" has 8 runs, 0 of which are "aborted"
  When Elena filters the history by outcome "aborted"
  Then a distinct "No aborted runs found" message is shown
  And no run rows are listed
```

```
Scenario: A Test that has never been run
  Given the Test "New regression suite" has 0 past runs
  When Elena opens its run history
  Then she sees the empty-state message "No runs yet for this Test"
  And no run rows are listed
```

```
Scenario: In-progress runs excluded from history
  Given the Test "Checkout happy path" has 1 Run currently "running" and 0 terminal runs
  When Elena opens its run history
  Then she sees the "No runs yet for this Test" empty state
  And the in-progress Run is not counted as a past run
```

```
Scenario: Load older runs beyond the first page
  Given the Test "Checkout happy path" has 60 past runs and the first 50 are shown
  When Elena chooses to load older runs
  Then the remaining 10 older runs are appended below, still newest-first overall
```

```
Scenario: Filter stays applied across load-more
  Given the Test "Checkout happy path" has 60 failed runs, filtered by outcome "failed", first 50 shown
  When Elena loads older runs
  Then the next 10 failed runs are appended
  And the load-more action stays scoped to the active filter
```

```
Scenario: Clearing the filter restores the full list
  Given Elena has filtered the history to outcome "aborted" showing 1 run
  When she clears the outcome filter
  Then all 8 runs are shown again, newest first
```

---
_Synced from Jira by sync-jira-issues_
