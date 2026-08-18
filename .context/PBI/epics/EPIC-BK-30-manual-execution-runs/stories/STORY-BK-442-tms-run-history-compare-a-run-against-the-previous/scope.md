# BK-442 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-442)

- Compare one finished Run against the immediately preceding finished Run of the same Test
- Classify every step present in both Runs as a new failure, still failing, newly fixed, or an unchanged pass
- Show a count per classification, summing to every step present in both Runs
- Report steps present in only one of the two Runs as added or removed, kept out of the four classifications
- Report steps that were blocked or skipped in either Run with both of their outcomes stated
- State explicitly when the Test has no earlier finished Run to compare against
- State explicitly when nothing changed between the two Runs
- State explicitly when the baseline Run was aborted before reaching every step
- Reach the comparison from the Run being viewed, alongside the Test's existing Run history (BK-37)

---
_Synced from Jira by sync-jira-issues_
