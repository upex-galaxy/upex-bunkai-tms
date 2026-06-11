# BK-5 — Scope

> Jira field: `customfield_10119` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-5)

- POST /api/v1/workspaces/{id}/invites (create invite)
- POST /api/v1/invites/{token}/accept (accept invite)
- Role-hierarchy enforcement: caller can only invite at role <= their own
- Email dispatch with signed token (HMAC, 24h TTL)
- 409 on duplicate (existing member)
- 403 on insufficient role / role-above-caller
- Invite list endpoint GET /api/v1/workspaces/{id}/invites (pending invites)

---
_Synced from Jira by sync-jira-issues_
