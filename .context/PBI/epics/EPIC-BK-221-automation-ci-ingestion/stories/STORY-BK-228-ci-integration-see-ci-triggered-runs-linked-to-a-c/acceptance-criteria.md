# BK-228 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-228)

```
Scenario: CI metadata is visible on a run
  Given a CI-reported run carries commit "a1b2c3d", branch "feature/checkout-discounts", and pipeline "nightly-regression"
  When Sara opens the run detail
  Then she sees the short commit reference, the branch name, and the pipeline name
  And the commit reference links out to the commit page on the repository host
```

```
Scenario: Find the runs for my branch
  Given finished runs exist for branch "main" and branch "feature/checkout-discounts"
  When Sara filters the project runs view by branch "feature/checkout-discounts"
  Then only that branch's runs are listed with their verdicts
```

```
Scenario: Answer "did my change break this test?"
  Given the Test "Checkout happy path" passed yesterday on commit "9f8e7d6" and failed today on commit "a1b2c3d", both on branch "main"
  When Sara opens the Test's run history
  Then she sees both runs with their commit references side by side
  And she can open the failing run's commit link to inspect the change
```

```
Scenario: Runs without CI metadata degrade gracefully
  Given a manual run and an agent-reported run submitted without CI metadata
  When Sara views them in the runs views and run detail
  Then no commit, branch, or pipeline information is shown and nothing renders as a broken link
  And the branch filter simply excludes them
```

```
Scenario: Commit link needs a configured repository
  Given the project has no repository URL configured
  When Sara opens a run that carries commit "a1b2c3d"
  Then the commit reference is shown as plain text with a hint that configuring the project's repository URL enables the link
```

---
_Synced from Jira by sync-jira-issues_
