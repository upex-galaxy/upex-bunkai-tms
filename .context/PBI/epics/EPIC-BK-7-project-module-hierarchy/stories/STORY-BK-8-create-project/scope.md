# BK-8 — Scope

> Jira field: `customfield_10142` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-8)

- POST /api/v1/workspaces/{id}/projects endpoint
- Name validation: 3-80 chars
- Auto-derived slug (lowercase, kebab-case, unique per workspace)
- Optional description (Markdown, max 5KB)
- Caller MUST be a member of the workspace (role >= member)

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:47.770Z_
