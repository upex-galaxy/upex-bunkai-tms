# BK-371 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-371)

1. Mateo opens the tracker settings of a Project and finds the defect sync switched off, with no destination set.
2. He enters the key of the Jira project his engineers work out of and runs the connection check.
3. Bunkai tells him whether that destination is reachable; if it is not, it tells him why, so he can fix it before turning anything on.
4. He switches the sync on and saves. The Project now records where its defects should go.
5. Any defect already filed in that Project that never reached Jira is queued to be sent again, so switching the sync on repairs the backlog rather than only affecting future defects.
6. Elena, who is not an administrator, can open the same screen and read the destination, but the controls are not hers to change.

---
_Synced from Jira by sync-jira-issues_
