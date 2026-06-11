# BK-41 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-41)

- A defect always belongs to exactly one module
- Selecting a module includes defects belonging to that module and to every module nested beneath it
- Status values are limited to open, in progress, resolved and closed
- Severity values are limited to P1, P2, P3 and P4
- Counts always reflect the currently applied filters, not the unfiltered total
- When no defects match the active filters, an explicit empty state is shown instead of a blank list

---
_Synced from Jira by sync-jira-issues_
