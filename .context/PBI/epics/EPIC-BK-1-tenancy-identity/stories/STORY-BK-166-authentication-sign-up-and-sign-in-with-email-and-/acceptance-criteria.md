# BK-166 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-166)

```gherkin
Scenario: Email-first detection routes an existing account to the password step
  Given Sara is on the login screen
    And an account already exists for "sara@example.com"
   When she enters "sara@example.com" and continues
   Then she is shown a password field to sign in
    And she is not offered account creation
```

```gherkin
Scenario: Email-first detection routes a new email to account creation
  Given Sara is on the login screen
    And no account exists for "new.sara@example.com"
   When she enters "new.sara@example.com" and continues
   Then she is shown the account-creation step asking her to set a password
    And she is not shown the sign-in password field
```

```gherkin
Scenario: Sign in with email and correct password (happy path)
  Given Sara has a confirmed account for "sara@example.com" with password "Sup3rSecret!"
   When she enters "sara@example.com", continues, and submits the password "Sup3rSecret!"
   Then she is signed in
    And she lands on her Workspace home
```

```gherkin
Scenario: Sign up creates the account, sends a verification code, and confirms it (happy path)
  Given Sara is creating an account for "new.sara@example.com" with password "Sup3rSecret!"
   When she submits the account-creation form
   Then she is told the account is pending confirmation
    And she receives an email with a 6-digit verification code
   When she enters the correct 6-digit code
   Then her account is confirmed and she is signed in
    And she lands on her Workspace home
```

```gherkin
Scenario: Sign in with a wrong password is rejected
  Given Sara has a confirmed account for "sara@example.com" with password "Sup3rSecret!"
   When she enters "sara@example.com", continues, and submits the password "wrong-password"
   Then she is not signed in
    And she sees a message that the email or password is incorrect
```

```gherkin
Scenario: Sign in is blocked for an unconfirmed account
  Given an account for "new.sara@example.com" exists but has not been confirmed
   When she enters "new.sara@example.com" and submits her correct password
   Then she is not signed in
    And she is prompted to verify her email with the 6-digit code before continuing
```

```gherkin
Scenario: An invalid or expired verification code is rejected
  Given Sara is on the verification step for "new.sara@example.com"
   When she enters a code that is wrong or has expired
   Then her account is not confirmed
    And she sees a message that the code is invalid or expired
    And she can request a new code
```

```gherkin
Scenario: Repeated failed attempts are rate-limited
  Given Sara has submitted several wrong passwords (or wrong codes) for "sara@example.com" in quick succession
   When she exceeds the allowed number of attempts
   Then further attempts are temporarily refused
    And she sees a message asking her to wait before trying again
```

```gherkin
Scenario: The magic-link fallback stays available on the login screen
  Given Sara is on the login screen with password as the primary method
   When she looks for an alternative to typing a password
   Then she sees a visible "email me a link instead" option
    And she can complete sign-in via the magic-link flow
```

```gherkin
Scenario: An API consumer's token and a browser cookie session coexist without clobbering each other
  Given Karim (an API/automation consumer) authenticates over the API at POST /api/v1/auth/signin and receives a personal access token
    And the same account is also signed in through the browser, holding a cookie session
   When Karim makes authenticated API calls with the token AND the browser makes authenticated requests with its cookie
   Then both are accepted as the same identity
    And neither one revokes or invalidates the other
```

```gherkin
Scenario: An API consumer completes email-verified sign-up over the API and receives a session and a token
  Given Karim signs up a new account over the API and the account is pending confirmation
   When Karim submits the 6-digit code to POST /api/v1/auth/confirm
   Then the account is confirmed
    And the response returns an authenticated session and a personal access token usable on subsequent API calls
```

---
_Synced from Jira by sync-jira-issues_
