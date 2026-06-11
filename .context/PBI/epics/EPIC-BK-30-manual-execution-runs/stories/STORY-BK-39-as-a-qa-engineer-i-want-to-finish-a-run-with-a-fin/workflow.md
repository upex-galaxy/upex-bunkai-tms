# BK-39 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-39)

1. Elena reaches the end of her execution and clicks "Finish Run".
2. She chooses the final verdict — passed or failed.
3. Bunkai closes the run with that verdict, stamps the finish time, marks any steps she never reached as skipped, and keeps her recorded results intact.
4. Afterward the run shows its final verdict and finish time; trying to finish an already-closed run is rejected with a message that the run is closed.
5. When an AI Test Agent or a CI pipeline finishes a run instead, the same verdict recording and skipped-step handling apply, producing identical run data.

---
_Synced from Jira by sync-jira-issues_
