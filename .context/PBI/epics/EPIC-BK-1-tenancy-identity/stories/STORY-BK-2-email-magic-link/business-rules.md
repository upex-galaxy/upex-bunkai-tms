# BK-2 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-2)

- Email must be unique in auth.users (Supabase enforces).

- First verified sign-in MUST create exactly one default workspace; idempotent on retry.

- Magic-link tokens are signed JWTs (Supabase managed), single-use, TTL 15 minutes.

- A user who accepted a workspace invite skips the personal-workspace auto-create.

---
_Synced from Jira by sync-jira-issues_
