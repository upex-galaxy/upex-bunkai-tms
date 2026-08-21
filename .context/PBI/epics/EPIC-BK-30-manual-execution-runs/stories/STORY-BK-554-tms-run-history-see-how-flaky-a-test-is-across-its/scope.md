# BK-554 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-554)

- Show a per-Test flakiness signal on that Test's Run history, beside the all-time outcome totals
- Count a flip whenever two consecutive finished Runs of the Test ended on different verdicts
- Compute the flip rate over the Test's ten most recent Runs that ended Passed or Failed
- State the flip count, the number of Runs the sample covered, and the resulting rate
- Place the Test in one of three bands: stable, occasionally flaky, or flaky
- Say that a Test cannot be judged yet, and how many more Runs are needed, whenever fewer than five of its Runs ended Passed or Failed
- Leave Aborted Runs out of the rate and state how many were left out
- Keep the signal unchanged when the Run history's outcome filter is applied
- Count Runs from every Project Environment the Test ran in as one sample
- Read the signal with the same permission that already reads the Run history, and offer nothing that changes it

---
_Synced from Jira by sync-jira-issues_
