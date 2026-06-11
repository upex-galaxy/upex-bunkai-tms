# BK-37 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-37)

- Run history is scoped to a single Test
- Runs are ordered newest first by when they ran
- The outcome filter accepts passed, failed, or aborted; a still-running run is not an outcome filter option
- Filters and ordering compose — a filtered list stays newest-first within the matching runs
- History is paged; older runs load on demand beyond the first page
- A Test with no runs shows an empty state, never a blank or error list

---
_Synced from Jira by sync-jira-issues_
