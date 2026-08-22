# BK-204 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-204)

- A test's latest outcome is the verdict of its most recent finished or aborted run, regardless of executor (human, agent, or CI) — executor parity is preserved.
- A test whose most recent run is still executing counts as in progress; a test with no runs counts as not run.
- Progress is always derived, never manually editable; the percentage uses the plan's member count as denominator.
- Outcome vocabulary matches the run vocabulary already shipped: passed, failed, aborted, plus the derived states in progress and not run.
- Viewers can see plan progress; no role can edit it.

## Design intent

- Plan detail header grows a progress strip: horizontal stacked bar segmented by outcome, with count chips (passed, failed, aborted, in progress, not run) beside it.
- Member-test table gains "Latest outcome" and "Last run" columns; outcome chips reuse the exact chip styles the run history views already use.
- Clicking an outcome chip navigates to that run, opened as a tab per the app shell's tab pattern.
- Plans list rows show a miniature version of the stacked bar.

---
_Synced from Jira by sync-jira-issues_
