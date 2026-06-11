# BK-38 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-38)

- The run list is scoped to a single Project
- Filters — date range, module, status, executor type — apply in combination, narrowing the list
- Pass and fail totals always reflect the currently applied filters, not the whole Project
- A no-match filter combination returns an empty list with zeroed totals, never an error
- Status filter values are the run outcomes; executor type values are human, agent, and CI
- Clearing all filters returns the complete project-wide list and totals

---
_Synced from Jira by sync-jira-issues_
