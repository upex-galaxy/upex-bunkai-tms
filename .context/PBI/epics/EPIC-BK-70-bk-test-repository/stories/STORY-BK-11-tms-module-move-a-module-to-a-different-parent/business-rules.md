# BK-11 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-11)

| ***Rule**** | ****Constraint*** |
| --- | --- |
| Same Project | A Module can only be moved within its own Project |
| No cycles | A Module cannot be moved under itself or any of its own descendants |
| Depth | After the move, the deepest node in the moved branch must stay within 6 levels |
| Breadcrumb rebuild | Breadcrumbs of the moved Module and every descendant are recalculated |
| Scope | Only members of the owning Workspace can move a Module |

---
_Synced from Jira by sync-jira-issues_
