# BK-4 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-4)

- name MUST be 3-60 chars, contain ≥1 alphanumeric.

- slug derived from name: lowercase, kebab-case (spaces → hyphens, accents stripped), strip leading/trailing hyphens, max 60 chars.

- slug MUST be globally unique across all workspaces.

- slug MUST NOT match any reserved value (loaded from config).

- Creator inherits role owner; no other roles assignable at create-time.

---
_Synced from Jira by sync-jira-issues_
