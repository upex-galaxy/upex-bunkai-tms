# BK-373 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-373)

- Automatic recovery of defects that failed to reach Jira, running on its own schedule with no user action
- Spacing successive attempts further apart, up to a ceiling on the interval, with no ceiling on the number of attempts while the failure could still clear
- Stopping attempts for failures that can never clear on their own, and saying so
- The four frozen External tracker panel states on the defect record: sent, failed, absent, and the in-flight treatment
- Rate-limited sends treated as delayed rather than failed, and invisible as failures
- Recovering an attempt that died mid-flight without ever producing a second Jira issue for one defect

---
_Synced from Jira by sync-jira-issues_
