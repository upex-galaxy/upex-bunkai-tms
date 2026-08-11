# BK-372 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-372)

1. Elena files a defect during a run in a Project whose defect sync is enabled.
2. Bunkai saves the defect immediately and shows it in her list. She carries on with the run; nothing waits on Jira.
3. In the background, Bunkai creates a matching issue in that Project's Jira destination, carrying the severity as priority, the Module's full path in the body, and a link back to the Bunkai defect.
4. Sara picks the issue up in Jira and follows the back-link when she needs the full context — the run, the step, the evidence.
5. If Jira could not be reached, the defect is still filed and fully usable; the reason the send failed is recorded against it, ready for slice c to act on.
6. If anything attempts to send that same defect again after it has reached Jira, nothing happens. There is one issue, and there will only ever be one.

---
_Synced from Jira by sync-jira-issues_
