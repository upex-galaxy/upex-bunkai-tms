# BK-37 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-37)

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
Scenario: A Test that has never been run
  Given the Test "New regression suite" has 0 past runs
  When Elena opens its run history
  Then she sees the empty-state message "No runs yet for this Test"
  And no run rows are listed
```

```
Scenario: Load older runs beyond the first page
  Given the Test "Checkout happy path" has 60 past runs and the first 50 are shown
  When Elena chooses to load older runs
  Then the remaining 10 older runs are appended below, still newest-first overall
```

```
Scenario: Clearing the filter restores the full list
  Given Elena has filtered the history to outcome "aborted" showing 1 run
  When she clears the outcome filter
  Then all 8 runs are shown again, newest first
```

---
_Synced from Jira by sync-jira-issues_
