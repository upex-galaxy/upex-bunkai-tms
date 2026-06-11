# BK-36 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-36)

- Only a run that is still in progress can be aborted; already-closed runs are rejected
- An abort requires a reason of at least 3 characters
- All steps not yet executed are marked skipped on abort
- Already-executed step results are preserved and not overwritten
- Aborting is terminal — an aborted run is never re-opened; re-testing creates a new run
- The abort reason is recorded and remains visible on the run and in its history

---
_Synced from Jira by sync-jira-issues_
