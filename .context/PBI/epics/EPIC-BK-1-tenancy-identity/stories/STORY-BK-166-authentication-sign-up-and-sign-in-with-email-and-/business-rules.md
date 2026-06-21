# BK-166 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-166)

- ***Email-first detection***: a single email field determines whether an account exists and routes the user to sign-in (password) or account creation. User enumeration is accepted as a standard tradeoff for this UX, mitigated by rate-limiting.
- ***Email verification is mandatory on all rails***: an account is not usable (cannot sign in) until its email is verified via a 6-digit one-time code, on both the browser and the API/automation rails. There is no public auto-confirm shortcut.
- ***Verification code***: 6 digits; single-use; time-limited (TTL) — an expired or already-used code is rejected and a new code can be requested.
- ***Password policy***: minimum length of 8 characters (no maximum below the platform limit). Stored only as a salted hash by the auth provider; never logged or returned.
- ***Sign-in failure messaging***: a wrong password and a non-existent account return the same generic "email or password is incorrect" message at the password step (the email-first step already revealed account existence; this rule prevents leaking which field was wrong).
- ***Rate-limiting***: repeated failed sign-in attempts and repeated code submissions for the same email/identity within a short window are throttled; further attempts are temporarily refused with a wait-and-retry message. This is the primary mitigation for the accepted enumeration tradeoff and for credential stuffing.
- ***Session coexistence invariant***: a browser cookie session and an API personal access token for the same account are independent credentials. Creating, using, or expiring one MUST NOT revoke or invalidate the other. This is the resolveIdentity gateway contract (ADR-0001) and MUST be covered by a test.
- ***Personal access token issuance***: a successful API sign-in (and API confirm) returns a personal access token the consumer uses as a bearer credential on subsequent calls.
- ***Testability allowance***: designated test accounts may use fixed verification codes (seeded), and test scripts may seed accounts via an admin-only fixture path. Neither mechanism is a publicly reachable auto-confirm backdoor.

---
_Synced from Jira by sync-jira-issues_
