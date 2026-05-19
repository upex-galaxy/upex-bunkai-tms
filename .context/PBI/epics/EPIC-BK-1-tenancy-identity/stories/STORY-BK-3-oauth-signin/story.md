# Sign up and sign in via OAuth (GitHub / Google)

**Jira Key:** BK-3
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-3
**Epic:** EPIC-BK-1 (Tenancy & Identity)
**Priority:** Medium
**Story Points:** (unset)
**Status:** Backlog
**Assignee:** Ely
**Labels:** mvp, wave-1, auth

---

## User Story

**As a** visitor
**I want to** sign up and sign in via OAuth (GitHub or Google)
**So that** I can join Bunkai with my existing identity provider

Implements **FR-001 (OAuth side)**. Email magic-link is BK-2.

---

## Scope

### In Scope

- OAuth provider: GitHub
- OAuth provider: Google
- CSRF state-token validation
- Auto-create personal default workspace on first verified OAuth sign-in
- Magic-link fallback surfaced when OAuth callback fails within 30s

### Out of Scope

- Other OAuth providers (GitLab, Apple, Microsoft) — backlog post-MVP
- SSO / SAML — Phase 3 Enterprise
- Linking multiple OAuth providers to the same Bunkai account (Phase 2)

---

## Acceptance Criteria (Gherkin)

### Scenario 1: GitHub OAuth happy path

- **Given** a visitor on the Sign-in screen
- **When** they click "Continue with GitHub" and approve the OAuth consent
- **Then** Supabase Auth completes the code-exchange with a valid CSRF state token
- **And** the user row is upserted in `auth.users` with `provider=github`
- **And** the user lands on the Workspace Home with status 201 and a freshly-created default workspace

### Scenario 2: Google OAuth happy path

- **Given** a visitor on the Sign-in screen
- **When** they click "Continue with Google" and approve the OAuth consent
- **Then** Supabase Auth completes the code-exchange and signs in / signs up the user
- **And** the user lands on the Workspace Home

### Scenario 3: OAuth consent denied

- **Given** a visitor who clicks "Continue with GitHub"
- **When** they deny the consent screen on the provider side
- **Then** Bunkai redirects to `/login` with error code `OAUTH_DENIED` and a visible "Try a different method" CTA including magic-link fallback

### Scenario 4: OAuth state CSRF token mismatch

- **Given** an OAuth callback whose state token does not match the issued one
- **When** the callback hits `/auth/callback`
- **Then** the request is rejected with code `OAUTH_STATE_MISMATCH` and 403; no session is created

### Scenario 5: OAuth callback blocked by third-party-cookie restrictions

- **Given** a visitor on a browser blocking third-party cookies
- **When** the OAuth callback popup fails to set a cookie within 30s
- **Then** Bunkai surfaces the magic-link fallback within 30s with a clear copy explaining the fallback

---

## Business Rules

- OAuth state token MUST be validated server-side; mismatch → 403 reject.
- An OAuth-only user has NO password and cannot use email magic-link as alternate sign-in unless explicitly linked (Phase 2).
- If a user signs up with both GitHub and Google using the same verified email, the second attempt is rejected with `EMAIL_EXISTS` (manual linking by support in MVP).

---

## Workflow

1. Visitor clicks "Continue with GitHub" (or Google).
2. Browser is redirected to provider's consent screen with state token attached.
3. User approves on provider.
4. Provider redirects to `/auth/callback?code=...&state=...`.
5. Server validates state, exchanges code with Supabase Auth.
6. On success: user row created/upserted with provider field; if first verified login, default workspace created; session cookie set.
7. Redirect to `/home`.
8. On any failure: redirect to `/login` with error code + magic-link fallback CTA.

---

## Technical Notes

### Frontend

- Buttons on `/login` page: `<OAuthButton provider="github" />`, `<OAuthButton provider="google" />`.
- Callback: `app/auth/callback/route.ts` (shared with magic-link callback).

### Backend

- `supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })`.
- Validate `state` query param.

### External Services

- GitHub OAuth app (client_id, client_secret in env).
- Google OAuth client (client_id, client_secret in env).

---

## Dependencies

### Blocked By

- Supabase OAuth providers configured (GitHub + Google apps registered in Supabase dashboard).

### Related

- BK-2 (email magic-link) — same FR-001.

---

## Definition of Done

- [ ] Both providers (GitHub + Google) tested in staging.
- [ ] CSRF state-mismatch path tested.
- [ ] Magic-link fallback surfaced when OAuth blocked.
- [ ] E2E Playwright test for at least one provider happy-path.
- [ ] Documentation: README "Getting Started" mentions OAuth.

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-BK-1-tenancy-identity/epic.md`
- **PRD:** `.context/PRD/user-journeys.md` (Journey 1, Step 1)
- **SRS:** `.context/SRS/functional-specs.md` (FR-001)
- **API Contracts:** `.context/SRS/api-contracts.yaml`
