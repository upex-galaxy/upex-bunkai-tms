# BK-3 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-3)

- OAuth state token MUST be validated server-side; mismatch → 403 reject.
- An OAuth-only user has NO password and cannot use email magic-link as alternate sign-in unless explicitly linked (Phase 2).
- If a user signs up with both GitHub and Google using the same verified email, the second attempt is rejected with EMAIL_EXISTS (manual linking by support in MVP).

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:46.119Z_
