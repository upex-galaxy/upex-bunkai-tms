# BK-36 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-36)

- Only a run that is still in progress can be aborted; already-closed runs are rejected
- An abort requires a reason of at least 3 characters
- All steps not yet executed are marked skipped on abort
- Already-executed step results are preserved and not overwritten
- Aborting is terminal — an aborted run is never re-opened; re-testing creates a new run
- The abort reason is recorded and remains visible on the run and in its history

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:52.241Z_
