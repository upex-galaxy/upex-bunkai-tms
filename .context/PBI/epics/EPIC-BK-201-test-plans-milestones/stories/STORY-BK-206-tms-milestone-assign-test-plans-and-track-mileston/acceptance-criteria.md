# BK-206 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-206)

```
Scenario: Attach plans to a milestone and see per-plan progress
  Given the milestone "Release 2.4" has no attached plans
  And the plans "Release 2.4 regression" and "Smoke pass" exist in the same project
  When Mateo attaches both plans to the milestone
  Then the milestone detail lists both plans, each with its own progress summary
```

```
Scenario: Readiness aggregates across attached plans
  Given the milestone "Release 2.4" has two attached plans
  And "Release 2.4 regression" has 8 of 10 tests passed and "Smoke pass" has 4 of 10 tests passed
  When Mateo opens the milestone
  Then the readiness view shows 12 of 20 tests passed, 60 percent overall
  And each plan row shows its own breakdown
```

```
Scenario: Detach a plan and recalculate readiness
  Given the milestone "Release 2.4" shows 60 percent readiness from two plans
  When Mateo detaches "Smoke pass"
  Then readiness recalculates using only the remaining plan
  And the plan "Smoke pass" itself remains unchanged and still available in the Test Plans list
```

```
Scenario: Overdue milestone is flagged
  Given the milestone "Release 2.4" has target date 2026-08-15 and readiness below 100 percent
  When Mateo views the milestones list on 2026-08-16
  Then the milestone carries an overdue signal in the list and on its detail header
```

```
Scenario: Milestone with no plans shows an empty readiness state
  Given the milestone "Hotfix window 2.4.1" has no attached plans
  When Mateo opens it
  Then the readiness area shows an empty state inviting him to attach plans instead of a percentage
```

---
_Synced from Jira by sync-jira-issues_
