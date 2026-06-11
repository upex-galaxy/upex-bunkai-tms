# BK-47 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-47)

- The clock starts at the first failing run recorded for the story and stops at the first run where all of the story's test coverage passes.
- A story counts as "recovered" only after the failure that opened the cycle has a resolved defect and a subsequent all-passing run.
- Stories that have never failed have no cycle and are excluded from cycle-time reporting.

---
_Synced from Jira by sync-jira-issues_
