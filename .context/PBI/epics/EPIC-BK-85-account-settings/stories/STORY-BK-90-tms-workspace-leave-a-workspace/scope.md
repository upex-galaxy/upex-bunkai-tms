# BK-90 — Scope

> Jira field: `customfield_10119` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-90)

- A "Leave workspace" action per workspace in the Workspaces section (Story 4).
- A confirmation that names the workspace being left before committing.
- After leaving, the list updates and the active workspace falls back to another the user still belongs to.
- Guard: action unavailable (or clearly blocked with a reason) for a workspace the user cannot leave (e.g. sole owner).
- Backend prerequisite: a NEW self-removal endpoint must be built first (no such endpoint exists today); the sole-owner guard must be enforced server-side.

---
_Synced from Jira by sync-jira-issues_
