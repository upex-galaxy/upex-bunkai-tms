# BK-2 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-2)

## Refined Acceptance Criteria (Shift-Left QA pass — 2026-05-25)

> Refined and consolidated by QA during the pre-sprint Shift-Left review. The original PO-authored Gherkin lives in the repo at `.context/PBI/epics/EPIC-BK-1-tenancy-identity/stories/STORY-BK-2-sign-up-and-sign-in-with-email-magic-link/story.md`. Reconciliation reasoning (AC ↔ code divergences, decisions, edge cases, UX proposals, scope cuts) is captured in the ***🧪 Acceptance Test Plan (ATP)**** field and the ****Shift-Left Refinement*** comment on this issue.

```
Background:
  Given the Supabase auth.otp_exp is set to 900 seconds (15 minutes)
    And the project SMTP / mailer is operational
    And the user is not currently signed in

# ---- Happy path ----

Scenario: Successful first-time email magic-link sign-up
  Given a visitor on /login
  When they enter "qa-new@bunkai.test" (a valid RFC 5321 email, <=254 chars)
    And click "Send magic link"
  Then the API responds 200 with `{ ok: true }`
    And the form shows the "Check your inbox" confirmation state
    And within 30s an email with subject "Sign in to Bunkai" arrives in that inbox
  When they click the magic link in the email
  Then the browser is redirected through `/auth/callback?code=...`
    And exchanged into a Supabase session (cookie set)
    And then routed to `/onboarding` (because the user has no workspace yet)
    And `/onboarding`'s server guard renders the workspace-create form
    And the workspace-name input is pre-filled with "qa-new's workspace"
    And the slug input is pre-filled with "qa-news-workspace" (slugified suggestion)
  When they accept the defaults and click "Create workspace"
  Then the RPC `bunkai*bootstrap*workspace` returns a workspace_id atomically
    And a row exists in `workspaces` with owner*user*id = the new user's id
    And a row exists in `workspace_members` (role=owner, status=active)
    And the user is redirected to `/projects`

Scenario: Successful returning-user sign-in (workspace exists)
  Given a user who already has at least one active workspace_member row
  When they request a magic link with their existing email
    And click the link
  Then `/auth/callback` exchanges the code into a session
    And redirects to `/onboarding`
    And `/onboarding`'s guard short-circuits to `/projects` (membership exists)
    And the user lands on `/projects` directly

# ---- Negative path ----

Scenario: Invalid email format rejected client-side
  Given a visitor on /login
  When they type "notanemail" into the email field
  Then the "Send magic link" button stays disabled
    And no POST is dispatched

Scenario: Invalid email format rejected server-side
  Given a visitor on /login
  When the client is bypassed and a body `{ email: "no-at-symbol" }` is POSTed to /api/v1/auth/magic-link
  Then the API responds 400 with envelope `{ ok: false, error: { code: "INVALID_EMAIL", message: ... } }`

Scenario: Email exceeds RFC 5321 length limit
  Given a visitor on /login
  When they enter an email whose total length is 255 characters
  Then the form rejects it client-side with "Email exceeds 254-character limit"
    And no POST is dispatched
  And the server-side Zod schema also rejects with code "INVALID_EMAIL" if bypassed

Scenario: Magic-link token replay blocked
  Given a user who has successfully signed in via a magic link
  When they click the same link a second time (or the same `?code=` is sent to /auth/callback)
  Then Supabase exchangeCodeForSession returns a "token already used" error
    And the callback redirects to /login?error=TOKEN_USED
    And the /login page renders "This link was already used — request a new one"

Scenario: Magic-link token expired
  Given a magic link generated more than 15 minutes ago
  When the visitor clicks it
  Then Supabase exchangeCodeForSession returns an OTP-expired error
    And the callback redirects to /login?error=TOKEN_EXPIRED
    And the /login page renders "Your link expired — request a new one" with the email field pre-filled

Scenario: Callback missing the `code` query parameter
  Given a request to /auth/callback with no `?code=`
  Then the route redirects to /login?error=MISSING_CODE

Scenario: Rate-limited resend (Supabase 429)
  Given a visitor who has requested a magic link 5 times in 60 seconds
  When they submit a 6th request
  Then the API responds 429 with envelope `{ code: "RATE_LIMITED", ... }`
    And the form shows a "Too many requests — try again in N seconds" toast

# ---- Boundary / edge ----

Scenario: Resend allowed after 60-second UI cooldown
  Given a visitor who has just sent a magic link
  When they look at the "Check your inbox" screen
  Then a "Resend link" button appears, initially disabled with countdown
  When 60 seconds pass
  Then the "Resend link" button becomes enabled
  When they click it
  Then a second magic link is dispatched to the same email
    And the prior link remains valid until its own 15-min TTL elapses
       (Note: per §2.6 — MVP keeps both valid; future Story may invalidate prior)

Scenario: Open-redirect attempt via `next` parameter blocked
  Given a magic link generated with `next=https://evil.example.com/steal`
  When the callback runs
  Then the unsafe `next` is rejected and replaced with the default `/onboarding` (or `/projects` if user has workspace)
    And the user does not leave the bunkai domain

Scenario: Session cookie set with secure attributes
  Given a successful callback exchange in production env
  Then the session cookie has `Secure`, `HttpOnly`, `SameSite=Lax`, and the Supabase-managed name
    And `getUser()` on the next protected route returns the new user
```

***Markers used:*** all NEEDS PO/DEV CONFIRMATION items are explicitly captured in §8 PO/Dev questions below; the AC text itself is final pending those answers.

---

---

**Copied from Refined AC by QA — Shift-Left pass 2026-05-25. PO ownership of this field returns after Estimation grooming; any further AC edits must go through PO.**

---
_Synced from Jira by sync-jira-issues_
