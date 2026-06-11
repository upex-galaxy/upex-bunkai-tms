# BK-47 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-47)

```
Scenario: Cycle time for a recovered user story
  Given a user story that had a failing run, a defect, and later a fully passing run after the defect was resolved
  When the QA Lead opens its cycle-time clock
  Then the view shows the elapsed time from the first failing run to the first all-passing run
```

```
Scenario: User story still failing
  Given a user story whose latest run still has failures
  When the QA Lead opens its cycle-time clock
  Then the view shows the story as "not yet green" with the time elapsed so far
```

```
Scenario: User story never failed
  Given a user story whose runs have always passed
  When the QA Lead opens its cycle-time clock
  Then the view reports no cycle to measure
```

---
_Synced from Jira by sync-jira-issues_
