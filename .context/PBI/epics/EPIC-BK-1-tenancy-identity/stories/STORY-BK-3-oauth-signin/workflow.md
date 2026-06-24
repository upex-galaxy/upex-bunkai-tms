# BK-3 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

1. Visitor clicks "Continue with GitHub" (or Google).

2. Browser is redirected to provider's consent screen with state token attached.

3. User approves on provider.

4. Provider redirects to /auth/callback?code=...&state=...

5. Server validates state, exchanges code with Supabase Auth.

6. On success: user row created/upserted with provider field; if first verified login, default workspace created; session cookie set.

7. Redirect to /home.

8. On any failure: redirect to /login with error code + magic-link fallback CTA.

---
_Synced from Jira by sync-jira-issues_
