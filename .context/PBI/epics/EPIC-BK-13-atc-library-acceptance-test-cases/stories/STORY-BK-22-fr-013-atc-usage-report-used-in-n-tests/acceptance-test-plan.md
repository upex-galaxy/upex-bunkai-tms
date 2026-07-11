# BK-22 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-22)

# BK-22 — Acceptance Test Plan (ATP)

***Strategy******:*** API verification (read-only endpoint)
***Shift-left ATP******:*** 15 outlines (refined by Andrés, 2 Jun)

## Test Cases

1. GET usage for ATC used in a test → 200 + data
2. GET usage for non-existent ATC → 404
3. GET usage for ATC with zero usage → 200 + empty
4. Workspace isolation → scoped response

---
_Synced from Jira by sync-jira-issues_
