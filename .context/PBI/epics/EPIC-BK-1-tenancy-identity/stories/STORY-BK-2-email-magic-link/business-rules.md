# BK-2 — Business Rules

> Jira field: `customfield_10134` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-2)

- Email must be unique in auth.users (Supabase enforces).

- First verified sign-in MUST create exactly one default workspace; idempotent on retry.

- Magic-link tokens are signed JWTs (Supabase managed), single-use, TTL 15 minutes.

- A user who accepted a workspace invite skips the personal-workspace auto-create.

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:44.075Z_
