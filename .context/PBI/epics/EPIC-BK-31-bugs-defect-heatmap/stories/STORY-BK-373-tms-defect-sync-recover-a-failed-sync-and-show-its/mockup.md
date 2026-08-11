# BK-373 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-373)

Design plan §4.6 · bk-31-bug-reports/bug-detail.html

This slice renders the External tracker panel, and the mockup is the contract for it. The four states and their literal copy:

| State | What renders |
| --- | --- |
| Sent | Pass-tone badge "Synced to Jira", a button carrying the Jira issue key that opens it, and "Last synced <timestamp>" |
| Failed | Fail-tone badge "Sync failed", then "Jira rejected the last push (<reason>) at <timestamp>.", then "The defect is fully saved in Bunkai and stays usable. Sync retries automatically once the connection is fixed in Settings." |
| Not configured | The panel is absent entirely — no badge, no error, no empty panel |
| Standalone defect | Unaffected by sync state; the Origin panel shows "Filed manually." |

> ***NOTE:*** §5 divergence recorded by ruling 12177 (decision 5): the frozen mockup models three states and has no in-flight state, but an asynchronous send necessarily has one. The in-flight case renders the sent state's layout with the badge reusing the in-flight grammar already established on the metrics screen. No new component, no re-picked tokens. Typically visible for under a second.

The mockup carries no edit or transition controls on this record, and no retry control. Do not add one.

---
_Synced from Jira by sync-jira-issues_
