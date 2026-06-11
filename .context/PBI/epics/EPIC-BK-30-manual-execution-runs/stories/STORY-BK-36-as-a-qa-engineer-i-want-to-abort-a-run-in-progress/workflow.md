# BK-36 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-36)

1. Elena is part-way through a run when something blocks her — the environment is down, or test data is missing.
2. She clicks "Abort Run" and types a short reason explaining why.
3. If the reason is shorter than 3 characters, Bunkai asks her to give a fuller reason and leaves the run open.
4. On a valid reason, Bunkai closes the run as aborted, marks every unexecuted step skipped, and keeps her already-recorded results intact.
5. The aborted run, with its reason, stays in the Test's run history; trying to abort an already-closed run is rejected.

---
_Synced from Jira by sync-jira-issues_
