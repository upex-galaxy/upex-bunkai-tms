# BK-442 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-442)

- The baseline is the immediately preceding ***finished*** Run of the same Test — the most recent Run that started before the one being viewed and reached a terminal outcome
- A Run still in progress is never used as either side of a comparison
- The four classifications apply only to steps present in both Runs: new failure (passed then failed), still failing (failed both times), newly fixed (failed then passed), unchanged pass (passed both times)
- A step present in only one of the two Runs is reported as added or removed and is never counted as a new failure or as newly fixed
- A step that was blocked or skipped in either Run falls outside the four classifications; both of its outcomes are stated rather than collapsed into pass or fail
- A step the baseline Run never reached, because that Run was aborted, is never reported as newly fixed — the baseline has no verdict to improve on
- A Test with no earlier finished Run has no comparison; the surface says so rather than rendering a zeroed one
- The comparison reads Run snapshots only and never modifies a Run, its ATC positions, or its steps
- The comparison is visible to any workspace member who can already see both Runs, and to no one else
- `aborted` is a Run-grain outcome only; it never appears as a step outcome on either side of the comparison

---
_Synced from Jira by sync-jira-issues_
