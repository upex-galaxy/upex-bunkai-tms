# BK-3 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

- OAuth state token MUST be validated server-side; mismatch → 403 reject.
- Identities that share the same VERIFIED email are automatically linked to a single Bunkai account (Supabase default behavior), across GitHub, Google, and email/password. Same verified email = same user — sign-in is seamless regardless of the method used, with no EMAIL_EXISTS block. (PO decision 2026-06-24: prioritize sign-in UX over hard provider separation.)
- A user may therefore authenticate with any linked method (OAuth provider or password) once their email is verified; there is no per-method account isolation.

---
_Synced from Jira by sync-jira-issues_
