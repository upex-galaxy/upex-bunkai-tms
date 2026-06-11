# BK-43 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-43)

- Sync runs automatically on filing only when the integration is enabled for the project
- Sync is one-way: changes flow from Bunkai to the external tracker, never back
- Sync is best-effort and never blocks or fails the act of filing a defect
- A defect whose sync fails stays fully usable in Bunkai and is marked sync-failed
- Sync-failed defects are retried automatically until they succeed, with no manual action required
- The synced external item always carries a link back to the originating defect in Bunkai
- A defect filed while the integration is disabled is never sent and carries no sync state

---
_Synced from Jira by sync-jira-issues_
