# BK-442 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-442)

1. Elena, a Senior QA Engineer, finishes a regression Run on a Test and sees that a number of steps failed.
2. Her first question is not how many failed, but which of them are new. Today she would open the previous Run in a second tab and read the two lists against each other.
3. Instead she opens the comparison from the Run she is looking at. Bunkai picks the immediately preceding finished Run of the same Test as the baseline and names both sides, with the time each one ran.
4. She sees four counts up front: how many steps are new failures, how many were already failing, how many are now fixed, and how many passed both times.
5. She goes to the new failures first, because those are what today's change broke. The still-failing steps she already knows about; the newly fixed ones tell her the last round of fixes landed.
6. Where the Test's chain changed between the two Runs, the steps that exist on only one side are called out as added or removed, so she is not misled into reading a shifted step as a regression.
7. If the baseline Run was aborted partway, the comparison says so, and steps that Run never reached are not dressed up as fixes.
8. When the Test has never run before, the comparison says there is nothing to compare against, rather than showing an empty result she has to interpret.

---
_Synced from Jira by sync-jira-issues_
