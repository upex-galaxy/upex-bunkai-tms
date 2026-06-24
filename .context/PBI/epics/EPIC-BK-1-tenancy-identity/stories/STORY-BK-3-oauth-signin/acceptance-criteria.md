# BK-3 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

```
Scenario: AC-1 GitHub OAuth first-time sign-up (happy path)
Given a visitor on the Sign-in screen
When they click "Continue with GitHub" and approve the OAuth consent
Then Supabase Auth completes the code exchange with a valid CSRF state token
And the user row is upserted in auth.users with provider=github
And a default workspace is bootstrapped for the first-time user
And the user lands on /onboarding to create their workspace
```

```
Scenario: AC-2 Google OAuth first-time sign-up (happy path)
Given a visitor on the Sign-in screen
When they click "Continue with Google" and approve the OAuth consent
Then Supabase Auth completes the code exchange and signs in / signs up the user
And the first-time user (no workspace yet) lands on /onboarding
```

```
Scenario: AC-3 Returning OAuth user sign-in — no duplicate workspace
Given a returning user who already has an active workspace
When they sign in again via GitHub or Google OAuth
Then no duplicate workspace is created
And the user lands on /projects directly
```

```
Scenario: AC-4 OAuth consent denied
Given a visitor who clicks "Continue with GitHub"
When they deny the consent screen on the provider side
Then Bunkai redirects to /login with error code OAUTH_DENIED
And surfaces a "Try a different method" CTA including the magic-link fallback
```

```
Scenario: AC-5 OAuth state CSRF token mismatch
Given an OAuth callback whose state token does not match the issued one
When the callback hits /auth/callback
Then the request is rejected with code OAUTH**STATE**MISMATCH and 403
And no session is created
```

```
Scenario: AC-6 OAuth callback blocked by third-party-cookie restrictions
Given a visitor on a browser blocking third-party cookies
When the OAuth callback popup fails to set a cookie within 30s
Then Bunkai surfaces the magic-link fallback within 30s
And shows a clear copy explaining the fallback
```

```
Scenario: AC-7 Cross-provider same verified email — automatic identity linking
Given a user who already has an account via one method (GitHub, Google, or email/password)
When they sign in via a different method using the SAME verified email
Then Supabase automatically links the new identity to the existing account
And the user is signed in to that same account (no duplicate user, no EMAIL_EXISTS block)
And the user lands on /projects with their existing workspace
```

```
Scenario: AC-8 Workspace bootstrap failure
Given an authenticated first-time OAuth user whose workspace auto-creation fails server-side
When the callback finishes the code exchange
Then the session is persisted and not rolled back
And the user is redirected to /onboarding to complete workspace creation
And the failure is logged server-side with the user ID and error details
```

```
Scenario: AC-9 OAuth initiation failure
Given a visitor who clicks an OAuth provider button
When the OAuth initiation fails before a session is established (e.g. provider 5xx)
Then Bunkai surfaces a graceful error on /login
And offers the magic-link fallback CTA
And no session is created
```

```
Scenario: AC-10 OAuth UI buttons enabled and copy updated
Given the Sign-in screen
When the page renders
Then the GitHub and Google OAuth buttons are enabled (no disabled state, no "soon" copy)
And each button has a working onClick handler that starts the OAuth flow
And the login copy no longer states that OAuth ships next sprint
```

---
_Synced from Jira by sync-jira-issues_
