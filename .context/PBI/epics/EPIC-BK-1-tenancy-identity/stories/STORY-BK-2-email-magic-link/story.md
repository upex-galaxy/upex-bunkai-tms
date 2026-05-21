# Sign up and sign in with email (magic-link)

**Jira Key:** [BK-2](https://upexgalaxy67.atlassian.net/browse/BK-2)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Priority:** Medium
**Story Points:** 5
**Status:** Estimation

---

## User Story

As a visitor, I want to sign up and sign in with email using a magic-link flow so that I can access Bunkai without managing a password. Implements {{PROJECT_KEY}}-001 partially (email side). OAuth side is a separate story.

---

## Acceptance Criteria

Scenario: Successful email magic-link sign-up

  Given a visitor on the Sign-in screen

  When they enter a valid RFC 5321 email and click "Send magic link"

  Then the system sends a one-time signed link to that email within 30s

  And on click, the user lands on the Workspace Home with status 201 and a freshly-created default workspace named "{display_name}'s workspace"



Scenario: Invalid email format rejected

  Given a visitor on the Sign-in screen

  When they enter "notanemail" and submit

  Then the form returns error code INVALID_EMAIL and no email is dispatched



Scenario: Magic-link token replay blocked

  Given a user who clicked their magic link once and is signed in

  When they click the same link a second time

  Then the system rejects the second click with code TOKEN_USED and does not create a new session



Scenario: Magic-link expiry

  Given a magic link generated more than 15 minutes ago

  When the visitor clicks it

  Then the system rejects with code TOKEN_EXPIRED and offers "Send a new link"

---

## Business Rules

- Email must be unique in auth.users (Supabase enforces).

- First verified sign-in MUST create exactly one default workspace; idempotent on retry.

- Magic-link tokens are signed JWTs (Supabase managed), single-use, TTL 15 minutes.

- A user who accepted a workspace invite skips the personal-workspace auto-create.

---

## Scope

IN SCOPE:

- Email magic-link sign-up (new account creation)

- Email magic-link sign-in (returning user)

- Auto-create personal default workspace on first verified sign-in

- Email validation per RFC 5321 (max 254 chars)

- Magic-link TTL 15 minutes, single-use



OUT OF SCOPE:

- Password-based sign-in (not supported)

- OAuth providers (separate story)

- Workspace invite-accept flow (covered by invite-teammate story)

- Custom email templates beyond Supabase defaults (Phase 2)

---

## Workflow

1. Visitor lands on /login.

2. Enters email, clicks "Send magic link".

3. Supabase Auth dispatches signed email.

4. Visitor opens email client, clicks link.

5. Browser hits /auth/callback?token=...; server validates token via Supabase.

6. On success: user row created/upserted; if first verified login and no pending invite, default workspace created; session cookie set.

7. Redirect to /home (Workspace Home).

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/19/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** auth, mvp, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:57:58.337Z_
