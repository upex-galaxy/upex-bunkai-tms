# BK-10 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-10)

| ***Rule**** | ****Constraint*** |
| --- | --- |
| Name on rename | Required, 2–80 characters |
| Delete type | Soft — the Module is archived, never physically removed |
| Cascade | Archiving a Module also archives its descendant Modules and their linked User Stories, ACs, ATCs and Tests |
| Visibility | Archived Modules and their cascade are excluded from the default tree and listings |
| Scope | Only members of the owning Workspace can rename or delete a Module |

---
_Synced from Jira by sync-jira-issues_
