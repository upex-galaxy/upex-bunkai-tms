# BK-264 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-264)

- A defect can only be assigned to someone who is an active member of the workspace, holding at least Member-level access — a view-only Viewer, or someone outside the workspace, cannot be assigned
- Only a workspace member holding at least Member-level access may assign, reassign, or unassign a defect, or change a defect's status
- The action is always attributed to the workspace member who actually performed it; no member can attribute an assignment or status change to someone else
- A defect's status can only advance one stage at a time, in this fixed order: open, in progress, resolved, closed — a move that skips a stage or goes backward is rejected
- Reassigning or unassigning a defect does not affect its status, and changing status does not affect who it is assigned to — the two are independent

---
_Synced from Jira by sync-jira-issues_
