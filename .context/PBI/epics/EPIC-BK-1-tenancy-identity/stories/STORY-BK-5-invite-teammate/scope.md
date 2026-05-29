# BK-5 — Scope

> Jira field: `customfield_10142` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-5)

- POST /api/v1/workspaces/{id}/invites (create invite)
- POST /api/v1/invites/{token}/accept (accept invite)
- Role-hierarchy enforcement: caller can only invite at role <= their own
- Email dispatch with signed token (HMAC, 24h TTL)
- 409 on duplicate (existing member)
- 403 on insufficient role / role-above-caller
- Invite list endpoint GET /api/v1/workspaces/{id}/invites (pending invites)

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:44.079Z_
