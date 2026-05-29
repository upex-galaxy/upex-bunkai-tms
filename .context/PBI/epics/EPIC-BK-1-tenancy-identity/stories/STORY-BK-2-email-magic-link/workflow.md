# BK-2 — Workflow

> Jira field: `customfield_10161` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-2)

1. Visitor lands on /login.

2. Enters email, clicks "Send magic link".

3. Supabase Auth dispatches signed email.

4. Visitor opens email client, clicks link.

5. Browser hits /auth/callback?token=...; server validates token via Supabase.

6. On success: user row created/upserted; if first verified login and no pending invite, default workspace created; session cookie set.

7. Redirect to /home (Workspace Home).

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:46.115Z_
