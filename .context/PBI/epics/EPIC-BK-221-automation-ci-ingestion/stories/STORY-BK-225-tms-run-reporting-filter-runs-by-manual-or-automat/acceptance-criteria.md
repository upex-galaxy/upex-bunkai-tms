# BK-225 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-225)

```
Scenario: Every run row carries an execution-mode badge
  Given the project "Web Store" has finished runs executed manually and runs reported by automation
  When Elena opens the project runs view
  Then every run row shows a mode badge: "Manual" for human-executed runs and "Automated" for agent- or CI-reported runs
```

```
Scenario: Filter the runs view to a single mode
  Given the project runs view lists 12 manual runs and 30 automated runs
  When Elena applies the execution-mode filter "Automated"
  Then only the 30 automated runs remain listed
  And the mode filter combines with the existing outcome and environment filters
```

```
Scenario: Totals split per execution mode
  Given the project has 12 manual runs and 30 automated runs
  When Elena opens the project runs view with no filters applied
  Then the summary shows per-mode totals ("Manual 12", "Automated 30") alongside the existing pass/fail totals
```

```
Scenario: Empty filter result keeps context
  Given the project has no automated runs yet
  When Elena applies the execution-mode filter "Automated"
  Then an empty state explains that no automated runs have been reported yet and points to how runs get reported (agents and CI pipelines)
  And clearing the filter restores the full list
```

---
_Synced from Jira by sync-jira-issues_
