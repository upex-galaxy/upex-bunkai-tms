# BK-39 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-39)

- Only a run that is still in progress can be finished; already-closed runs are rejected
- Finishing requires a final verdict of passed or failed
- Any steps still pending at finish are marked skipped automatically
- Already-executed step results are preserved and not overwritten
- A finish is terminal — a finished run is never re-opened; re-testing creates a new run
- An AI Test Agent or a CI pipeline may also finish a run, and the resulting verdict and skipped-step handling are identical to a human-finished run

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:51.468Z_
