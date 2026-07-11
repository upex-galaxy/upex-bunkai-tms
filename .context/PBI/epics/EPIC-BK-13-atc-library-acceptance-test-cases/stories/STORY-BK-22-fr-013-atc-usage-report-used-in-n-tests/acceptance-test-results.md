# BK-22 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-22)

# BK-22 — Acceptance Test Results (ATR)

***Date******:**** 2026-07-06 | ****Tester******:**** Nahuel Gomez | ****Staging***

## Results

- GET usage for ATC used in test → ✅ 200, count=1, used_in with metadata
- GET usage for non-existent ATC → ✅ 404 atc*not*found
- GET usage for ATC with zero usage → ✅ 200 {count:0, used_in:[]}
- Workspace isolation → ✅ scoped

## Verdict: PASSED

---
_Synced from Jira by sync-jira-issues_
