# Sign up and sign in with email (magic-link)

**Jira Key:** BK-2
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-2
**Epic:** EPIC-BK-1 (Tenancy & Identity)
**Priority:** Medium
**Story Points:** (unset — refined in 3-amigos)
**Status:** Backlog
**Assignee:** Ely
**Labels:** mvp, wave-1, auth

---

## User Story

**As a** visitor
**I want to** sign up and sign in with email using a magic-link flow
**So that** I can access Bunkai without managing a password

Implements **FR-001 (email side)**. OAuth side is BK-3.

---

## Scope

<!-- Jira Field: customfield_10142 (Scope ⛳) + customfield_10135 (Out Of Scope 🏴) -->

### In Scope

- Email magic-link sign-up (new account creation)
- Email magic-link sign-in (returning user)
- Auto-create personal default workspace on first verified sign-in
- Email validation per RFC 5321 (max 254 chars)
- Magic-link TTL 15 minutes, single-use

### Out of Scope

- Password-based sign-in (not supported anywhere in Bunkai)
- OAuth providers (BK-3)
- Workspace invite-accept flow (covered by BK-5)
- Custom email templates beyond Supabase defaults (Phase 2)

---

## Acceptance Criteria (Gherkin)

<!-- Jira Field: customfield_10141 (✅ Acceptance Criteria) -->

### Scenario 1: Successful email magic-link sign-up

- **Given** a visitor on the Sign-in screen
- **When** they enter a valid RFC 5321 email and click "Send magic link"
- **Then** the system sends a one-time signed link to that email within 30s
- **And** on click, the user lands on the Workspace Home with status 201 and a freshly-created default workspace named `"{display_name}'s workspace"`

### Scenario 2: Invalid email format rejected

- **Given** a visitor on the Sign-in screen
- **When** they enter `"notanemail"` and submit
- **Then** the form returns error code `INVALID_EMAIL` and no email is dispatched

### Scenario 3: Magic-link token replay blocked

- **Given** a user who clicked their magic link once and is signed in
- **When** they click the same link a second time
- **Then** the system rejects the second click with code `TOKEN_USED` and does not create a new session

### Scenario 4: Magic-link expiry

- **Given** a magic link generated more than 15 minutes ago
- **When** the visitor clicks it
- **Then** the system rejects with code `TOKEN_EXPIRED` and offers "Send a new link"

---

## Business Rules

<!-- Jira Field: customfield_10134 (🚩 Business Rules Specification) -->

- Email must be unique in `auth.users` (Supabase enforces).
- First verified sign-in MUST create exactly one default workspace; idempotent on retry.
- Magic-link tokens are signed JWTs (Supabase managed), single-use, TTL 15 minutes.
- A user who accepted a workspace invite skips the personal-workspace auto-create.

---

## Workflow

<!-- Jira Field: customfield_10161 (🧬 WORKFLOW) -->

1. Visitor lands on `/login`.
2. Enters email, clicks "Send magic link".
3. Supabase Auth dispatches signed email.
4. Visitor opens email client, clicks link.
5. Browser hits `/auth/callback?token=...`; server validates token via Supabase.
6. On success: user row created/upserted; if first verified login and no pending invite, default workspace created; session cookie set.
7. Redirect to `/home` (Workspace Home).

---

## Mockups / Wireframes

<!-- Jira Field: customfield_10186 (Mockup 🎴) -->

Defer to design — Sign-in screen is referenced in `.context/designs/bunkai-test-management-tool/project/` source mockups (locate auth-state screens). Add Figma URL here once produced.

---

## Technical Notes

### Frontend

- Page: `app/(auth)/login/page.tsx` (already exists in scaffold).
- Component: `<MagicLinkForm />` — input + submit + post-submit state ("Check your email").
- Callback page: `app/auth/callback/route.ts` (route handler).

### Backend

- Wraps Supabase Auth `signInWithOtp({ email })`.
- Token validation on callback via `supabase.auth.exchangeCodeForSession()`.

### Database

- `auth.users` (Supabase managed).
- `workspaces`, `workspace_members` (on first sign-in path).

### External Services

- Supabase Auth managed email dispatcher.

---

## Dependencies

### Blocked By

- Phase C plumbing done already (see prior session: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `middleware.ts`, `AuthContext`).

### Blocks

- BK-4 (workspace create) is unblocked once any sign-in story ships.
- BK-5 (invite teammate) needs a signed-in owner.

### Related

- BK-3 (OAuth sign-in) — same FR-001 with different provider surface.

---

## Definition of Done

- [ ] Magic-link sign-up + sign-in working end-to-end on staging.
- [ ] Unit tests for token-expiry + replay rejection paths.
- [ ] Integration test for default-workspace auto-create on first verified login.
- [ ] E2E Playwright happy-path test (uses Supabase test inbox).
- [ ] Code review approved.
- [ ] Documentation: README "Getting Started" mentions magic-link as default.

---

## Testing Strategy

See `.context/PBI/epics/EPIC-BK-1-tenancy-identity/stories/STORY-BK-2-email-magic-link/edge-cases.md` (to be created via `/product-management` → `edge-cases-enumeration.md` reference when story moves into refinement).

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-BK-1-tenancy-identity/epic.md`
- **PRD:** `.context/PRD/user-journeys.md` (Journey 1, Step 1)
- **SRS:** `.context/SRS/functional-specs.md` (FR-001)
- **API Contracts:** `.context/SRS/api-contracts.yaml`
