# Sign up and sign in via OAuth (GitHub / Google)

**Jira Key:** [BK-3](https://upexgalaxy67.atlassian.net/browse/BK-3)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Priority:** Medium
**Story Points:** 5
**Status:** Estimation

---

## User Story

As a visitor, I want to sign up and sign in via OAuth (GitHub or Google) so that I can join Bunkai with my existing identity provider. Implements FR-001 partially (OAuth side). Email magic-link is a separate story.

---

## Acceptance Criteria

Scenario: GitHub OAuth happy path

  Given a visitor on the Sign-in screen

  When they click "Continue with GitHub" and approve the OAuth consent

  Then Supabase Auth completes the code-exchange with a valid CSRF state token

  And the user row is upserted in auth.users with provider=github

  And the user lands on the Workspace Home with status 201 and a freshly-created default workspace



Scenario: Google OAuth happy path

  Given a visitor on the Sign-in screen

  When they click "Continue with Google" and approve the OAuth consent

  Then Supabase Auth completes the code-exchange and signs in / signs up the user

  And the user lands on the Workspace Home



Scenario: OAuth consent denied

  Given a visitor who clicks "Continue with GitHub"

  When they deny the consent screen on the provider side

  Then Bunkai redirects to /login with error code OAUTH_DENIED and a visible "Try a different method" CTA including magic-link fallback



Scenario: OAuth state CSRF token mismatch

  Given an OAuth callback whose state token does not match the issued one

  When the callback hits /auth/callback

  Then the request is rejected with code OAUTH_STATE_MISMATCH and 403; no session is created



Scenario: OAuth callback blocked by third-party-cookie restrictions

  Given a visitor on a browser blocking third-party cookies

  When the OAuth callback popup fails to set a cookie within 30s

  Then Bunkai surfaces the magic-link fallback within 30s with a clear copy explaining the fallback

---

## Business Rules

- OAuth state token MUST be validated server-side; mismatch → 403 reject.

- An OAuth-only user has NO password and cannot use email magic-link as alternate sign-in unless explicitly linked (Phase 2).

- If a user signs up with both GitHub and Google using the same verified email, the second attempt is rejected with EMAIL_EXISTS (manual linking by support in MVP).

---

## Scope

IN SCOPE:

- OAuth provider: GitHub

- OAuth provider: Google

- CSRF state-token validation

- Auto-create personal default workspace on first verified OAuth sign-in

- Magic-link fallback surfaced when OAuth callback fails within 30s



OUT OF SCOPE:

- Other OAuth providers (GitLab, Apple, Microsoft) — backlog post-MVP

- SSO / SAML — Phase 3 Enterprise

- Linking multiple OAuth providers to the same Bunkai account (Phase 2)

---

## Workflow

1. Visitor clicks "Continue with GitHub" (or Google).

2. Browser is redirected to provider's consent screen with state token attached.

3. User approves on provider.

4. Provider redirects to /auth/callback?code=...&state=...

5. Server validates state, exchanges code with Supabase Auth.

6. On success: user row created/upserted with provider field; if first verified login, default workspace created; session cookie set.

7. Redirect to /home.

8. On any failure: redirect to /login with error code + magic-link fallback CTA.

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
_Last sync: 2026-05-20T00:57:58.641Z_
