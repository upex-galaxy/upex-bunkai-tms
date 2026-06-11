# BK-3 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

```
Scenario: GitHub OAuth happy path
Given a visitor on the Sign-in screen
When they click "Continue with GitHub" and approve the OAuth consent
Then Supabase Auth completes the code exchange with a valid CSRF state token
And the user row is upserted in auth.users with provider=github
And the user lands on the Workspace Home with status 201
And a default workspace exists
```

```
Scenario: Google OAuth happy path
Given a visitor on the Sign-in screen
When they click "Continue with Google" and approve the OAuth consent
Then Supabase Auth completes the code exchange and signs in / signs up the user
And the user lands on the Workspace Home
```

```
Scenario: OAuth consent denied
Given a visitor who clicks "Continue with GitHub"
When they deny the consent screen on the provider side
Then Bunkai redirects to /login with error code OAUTH_DENIED
And surfaces a "Try a different method" CTA including the magic-link fallback
```

```
Scenario: OAuth state CSRF token mismatch
Given an OAuth callback whose state token does not match the issued one
When the callback hits /auth/callback
Then the request is rejected with code OAUTH*STATE*MISMATCH and 403
And no session is created
```

```
Scenario: OAuth callback blocked by third-party-cookie restrictions
Given a visitor on a browser blocking third-party cookies
When the OAuth callback popup fails to set a cookie within 30s
Then Bunkai surfaces the magic-link fallback within 30s
And shows a clear copy explaining the fallback
```

---
_Synced from Jira by sync-jira-issues_
