# BK-6 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-6)

- User MUST be an active member of the target workspace (status = "active"); suspended / removed members get 403.

- The session's active*workspace*id MUST be the single source of truth for tenancy scoping in API middleware.

- Switching does NOT invalidate the session; only the scope changes.

- All subsequent API responses MUST reflect data scoped to the new active workspace.

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:46.123Z_
