# BK-315 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-315)

| Rule | Constraint |
| --- | --- |
| Format | CSV, UTF-8, comma-delimited, header row required |
| Columns | ATC ID, Slug, Title, Module, Layer, Tags, Status — fixed order, no configuration |
| Escaping | Any field containing a comma, a double quote, or a line break is quoted; embedded double quotes are doubled |
| Tags | Multiple tags for one ATC are joined into a single Tags cell so the row stays one CSV field per column |
| Scope | Only ATCs belonging to the requested Project; requester must be an active member (role >= viewer) of that Project's workspace |
| Empty result | A Project with zero ATCs exports a CSV containing only the header row, not an error |
| Access | A Project the requester cannot access behaves as if it does not exist — no export is produced and nothing reveals the Project's existence |

---
_Synced from Jira by sync-jira-issues_
