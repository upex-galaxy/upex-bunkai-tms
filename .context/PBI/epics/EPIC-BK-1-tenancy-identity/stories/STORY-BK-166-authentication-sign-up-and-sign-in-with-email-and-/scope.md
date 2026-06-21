# BK-166 — Scope

> Jira field: `customfield_10119` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-166)

- Email-first login screen: a single email field that detects whether an account already exists and routes to sign-in (password) or account creation accordingly.
- Password as the primary sign-in method on the login screen.
- Magic-link kept as a visible secondary fallback ("email me a link instead").
- OAuth buttons remain present below the password method (their enablement is owned by BK-3).
- Account creation with a password, requiring email verification via a 6-digit code before the account becomes usable.
- Email verification required on both the browser rail and the API/automation rail.
- For API/automation consumers: completing email-verified sign-up and sign-in over the API and receiving a personal access token.
- Independent coexistence of a browser cookie session and an API personal access token for the same account (neither revokes the other).
- Wrong-password handling, unconfirmed-account handling, invalid/expired-code handling, and rate-limiting of repeated attempts.
- Testability support that does not rely on a public auto-confirm shortcut: fixed verification codes for designated test accounts plus admin-driven fixture seeding for test scripts only.

---
_Synced from Jira by sync-jira-issues_
