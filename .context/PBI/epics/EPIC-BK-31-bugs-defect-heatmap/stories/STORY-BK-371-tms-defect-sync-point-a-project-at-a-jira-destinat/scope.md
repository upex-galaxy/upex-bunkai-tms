# BK-371 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-371)

- A per-Project tracker setting holding the destination Jira project key, the issue type defects are filed as, and an on/off switch
- Validation of the destination project key before it is accepted
- A connection check that reports whether the destination is reachable, and the reason when it is not
- Administrator-only writes; read access for anyone who can see the Project
- Re-queueing a Project's not-yet-sent defects when the sync is switched on or the destination changes
- Jira Cloud as the only destination, fixed and not user-selectable

---
_Synced from Jira by sync-jira-issues_
