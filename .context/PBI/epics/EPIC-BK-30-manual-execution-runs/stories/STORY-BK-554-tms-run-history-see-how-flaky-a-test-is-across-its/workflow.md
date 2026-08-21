# BK-554 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-554)

1. Elena finishes a regression pass and wants to know whether a Test she has been chasing is genuinely broken or merely unreliable.
2. She opens the Test and goes to its Run history.
3. The header she already knows shows the all-time Passed, Failed and Aborted totals and the proportional bar. Beside them, one more statement now tells her how flaky the Test is: the band, the flip count, the size of the sample it was drawn from, and the rate.
4. She reads "Flaky — 5 flips in the last 10 runs (56%)" and stops treating the Test's last red result as evidence of a regression. The Test's answer is not trustworthy; that is the finding.
5. On another Test she reads "Stable — no flips in the last 10 runs" under totals that are mostly red, and draws the opposite conclusion: this one is reliably broken, and the failure is real.
6. On a third she reads "Not enough runs yet — 3 of 5 needed", and knows the tool is declining to guess rather than reporting zero.
7. Where the Test has Aborted Runs in the window, the signal says how many it left out, so the sample size in front of her always adds up against the list below.
8. She applies the Failed filter to read the failing Runs one by one. The list narrows; the signal does not move, because it describes the Test and not the current view.

---
_Synced from Jira by sync-jira-issues_
