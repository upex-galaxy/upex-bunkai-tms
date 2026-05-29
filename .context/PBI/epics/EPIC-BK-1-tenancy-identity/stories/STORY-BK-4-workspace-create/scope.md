# BK-4 — Scope

> Jira field: `customfield_10142` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-4)

- POST /api/v1/workspaces endpoint
- Name validation: 3-60 chars, unique per owner (case-insensitive)
- Slug auto-derivation: lowercase, kebab-case, globally unique
- Reserved-slug rejection list (api, app, auth, admin, bunkai, ...)
- Creator auto-added as owner in workspace_members
- workspace.created event

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:46.121Z_
