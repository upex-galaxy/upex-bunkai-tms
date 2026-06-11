# BK-28 — Scope

> Jira field: `customfield_10119` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-28)

## In scope

- Elena can reorder the ATCs inside an existing Test she has access to, preserving the set of ATCs (no add, no remove)
- The new order persists across reloads and across sessions
- The same reorder operation is reachable from the UI and from any headless client (AI agent, CI) using the Bunkai surface
- A no-op reorder (saving the same order back) does NOT create an activity log entry and does NOT bump the Test's last-modified timestamp
- Activity log captures every real reorder event: author, timestamp, and the new chain after the reorder
- Permission rules: only member, admin, and owner can reorder; viewer cannot, and the affordance is hidden from them
- Concurrent-edit safety: if a teammate reordered the same Test in between, Elena's stale save is blocked with a clear message instead of silently overwriting

---
_Synced from Jira by sync-jira-issues_
