# BK-35 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-35)

- A step result can only be reported while the run is still in progress; closed runs reject further results
- A step can be marked passed, failed, or blocked; note and evidence link are optional
- The parent ATC verdict is derived, not chosen by the engineer: passed when all its steps pass, failed when any step fails, blocked when any step is blocked and none failed
- Once an ATC is failed, later passing steps do not undo the failed verdict
- Overall run progress reflects the share of steps that have been resolved
- The most recently reported result for a step is the one that stands
- Teammates watching the run see verdict and progress changes without refreshing

---
_Synced from Jira by sync-jira-issues_
