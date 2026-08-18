# BK-207 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-207)

```
Scenario: Close a plan with a verdict and summary
  Given the open plan "Release 2.4 regression" shows 11 of 12 tests passed
  When Mateo closes it with the verdict passed and the summary "One known flaky test, accepted by the release manager"
  Then the plan status becomes Closed
  And the plan shows the verdict, the summary, who closed it, when, and the progress at close time
```

```
Scenario: Closing warns when tests were never run
  Given the open plan "Smoke pass" has 2 member tests that were never run
  When Mateo starts the close action
  Then he sees a confirmation stating that 2 tests are not run
  And the plan is closed only after he confirms
```

```
Scenario: A closed plan is read-only
  Given the plan "Release 2.3 regression" is Closed
  When Elena opens it
  Then she can view its tests, progress at close time, verdict, and summary
  And the actions to add tests, remove tests, edit details, or close again are not available
```

```
Scenario: Closing requires a verdict
  Given Mateo is closing the plan "Release 2.4 regression"
  When he tries to confirm without choosing a verdict
  Then the plan stays open and he sees a message that a verdict is required
```

```
Scenario: A member who is not the creator cannot close the plan
  Given Elena has the member role and did not create the plan "Release 2.4 regression"
  When she opens the plan
  Then the close action is not available to her
  And it is available to the plan's creator and to workspace admins
```

---
_Synced from Jira by sync-jira-issues_
