# BK-4 — Scope

> Jira field: `customfield_10119` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-4)

- POST /api/v1/workspaces endpoint
- Name validation: 3-60 chars, unique per owner (case-insensitive)
- Slug auto-derivation: lowercase, kebab-case, globally unique
- Reserved-slug rejection list (api, app, auth, admin, bunkai, ...)
- Creator auto-added as owner in workspace_members
- workspace.created event

---
_Synced from Jira by sync-jira-issues_
