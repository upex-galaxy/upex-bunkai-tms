# BK-27 — Scope

> Jira field: `customfield_10142` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-27)

## In scope

- Elena can create a Test by giving it a title and selecting an ordered chain of ATCs from her workspace's library
- The chain order is preserved exactly as Elena defined it
- Empty chains are blocked with a clear validation message before any Test is created
- The Test belongs to the workspace Elena was active in at the moment of creation
- Same operation reachable from the UI and from any headless client (AI agent, CI) using the Bunkai surface
- Accidental double-submission produces exactly one Test, not duplicates
- Workspace activity log captures every Test creation event (author, timestamp, Test title)
- Permission rules: viewer cannot create; member, admin, and owner can

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:49.009Z_
