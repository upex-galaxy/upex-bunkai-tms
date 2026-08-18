# BK-37 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-37)

- Run history is scoped to a single Test
- Runs are ordered newest first by when they ran
- The outcome filter accepts passed, failed, or aborted; a still-running run is not an outcome filter option
- Filters and ordering compose — a filtered list stays newest-first within the matching runs
- History is paged; older runs load on demand beyond the first page, page size = 50 (confirmed by PO — 2026-07-21)
- The active outcome filter stays applied when loading older runs — pagination scopes to the current filter, not the whole history (confirmed by PO — 2026-07-21)
- A Test with no runs shows an empty state, never a blank or error list
- In-progress ("running") Runs are excluded from history — only terminal Runs (passed / failed / aborted) count as "past runs" (confirmed by PO — 2026-07-21)

---
_Synced from Jira by sync-jira-issues_
