# BK-3 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

## Acceptance Test Plan — BK-3: OAuth Sign-in/Sign-up

### AC-1: GitHub first-time sign-up

Given unauthenticated visitor on /login
When clicks "Continue with GitHub"
Then redirects to GitHub OAuth consent
And after consent, creates workspace
And redirects to /onboarding

### AC-2: Google first-time sign-up

Same as AC-1 but Google provider

### AC-3: Returning user no duplicate workspace

Given existing workspace from OAuth
When OAuth again with same provider
Then redirects to /projects (no duplicate workspace)

### AC-4: Consent denied

When user denies OAuth consent on provider page
Then redirects back to /login with error toast

### AC-5: CSRF state mismatch

When state cookie is tampered/modified
Then returns 403

### AC-6: 3rd-party cookie blocked

When 3rd-party cookies blocked
Then polling fallback completes within 30s

### AC-7: Cross-provider auto-link

Given GitHub-authenticated user with email X
When signs in with Google (same email X)
Then links to same workspace

### AC-8: Workspace bootstrap failure

When workspace creation fails after OAuth
Then error displayed to user

### AC-9: Initiation failure

When OAuth button fails to start flow
Then error shown

### AC-10: UI buttons enabled

GitHub/Google buttons visible, enabled, correct copy

### Risk-based coverage

- 10 positive scenarios (1 per AC)
- 8 negative scenarios (invalid state, denied consent, expired state, etc.)
- 10 boundary scenarios (timeout edges, rate limits, etc.)
- 4 integration scenarios (callback + session + redirect chain)

---
_Synced from Jira by sync-jira-issues_
