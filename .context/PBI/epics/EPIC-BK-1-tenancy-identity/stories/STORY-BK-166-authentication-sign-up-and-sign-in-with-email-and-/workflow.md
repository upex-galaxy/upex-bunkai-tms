# BK-166 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-166)

## Browser (Sara — Full-Stack Developer)

1. Sara lands on the login screen and sees a single email field, with password as the primary method and an "email me a link instead" fallback below.
2. She enters her email and continues.
3. The screen detects whether the email already has an account:
4. After account creation, she is told the account is pending confirmation and receives an email with a 6-digit code.
5. She enters the 6-digit code; on success the account is confirmed and she is signed in and lands on her Workspace home.
6. If the code is wrong or expired, she sees an invalid/expired message and can request a new code.
7. If she would rather not type a password, she chooses "email me a link instead" and completes the magic-link flow.
8. Repeated wrong passwords or wrong codes are temporarily refused with a wait-and-retry message.

## API / automation (Karim — autonomous consumer)

1. Karim signs up a new account over the API; the account comes back pending confirmation.
2. Karim submits the 6-digit code to confirm the account and receives an authenticated session plus a personal access token.
3. For an existing confirmed account, Karim signs in over the API and receives a personal access token directly.
4. Karim uses the personal access token as a bearer credential on subsequent API calls.
5. If the same account is also open in a browser, the browser cookie session and Karim's token operate independently — both are accepted as the same identity and neither revokes the other.

---
_Synced from Jira by sync-jira-issues_
