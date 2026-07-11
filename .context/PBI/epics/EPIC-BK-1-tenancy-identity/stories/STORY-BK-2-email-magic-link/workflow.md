# BK-2 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-2)

1. Visitor lands on /login.

2. Enters email, clicks "Send magic link".

3. Supabase Auth dispatches signed email.

4. Visitor opens email client, clicks link.

5. Browser hits /auth/callback?token=...; server validates token via Supabase.

6. On success: user row created/upserted; if first verified login and no pending invite, default workspace created; session cookie set.

7. Redirect to /home (Workspace Home).

---
_Synced from Jira by sync-jira-issues_
