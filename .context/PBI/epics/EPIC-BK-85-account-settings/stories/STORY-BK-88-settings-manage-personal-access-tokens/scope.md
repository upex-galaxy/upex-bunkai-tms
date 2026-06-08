# BK-88 — Scope

> Jira field: `customfield_10119` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

- List the caller's tokens with name, scopes, created date (secret never shown).
- Issue a new token by name + scopes (atc:read, atc:write, run:execute, workspace:admin), optionally workspace-bound + optional expiry.
- On issuance show the full `bk*pat*...` secret exactly once with an explicit "store it now, cannot be retrieved later" warning + copy affordance.
- Revoke a token with a confirm step; row reflects revoked state immediately.
- Empty state when no tokens yet, guiding first issuance.

---
_Synced from Jira by sync-jira-issues_
