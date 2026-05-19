# Invite a teammate to a Workspace with role assignment

**Jira Key:** BK-5
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-5
**Epic:** EPIC-BK-1 (Tenancy & Identity)
**Priority:** Medium
**Story Points:** (unset)
**Status:** Backlog
**Assignee:** Ely
**Labels:** mvp, wave-1, tenancy

---

## User Story

**As a** Workspace owner or admin
**I want to** invite a teammate by email and assign them a role (owner / admin / member / viewer)
**So that** access is controlled

Implements **FR-003**.

---

## Scope

### In Scope

- `POST /api/v1/workspaces/{id}/invites` (create invite)
- `POST /api/v1/invites/{token}/accept` (accept invite)
- Role hierarchy enforcement: caller can only invite at role ≤ their own
- Email dispatch with signed token (HMAC, 24h TTL)
- 409 on duplicate (existing member)
- 403 on insufficient role / role-above-caller
- `GET /api/v1/workspaces/{id}/invites` (list pending invites)

### Out of Scope

- Invite revocation / resend (post-MVP — design-partners will request this)
- Bulk invite (CSV upload) — Phase 2
- Custom invite email template — Phase 2
- Role changes after acceptance (separate story, post-MVP)

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Owner invites a member successfully

- **Given** an authenticated owner of Workspace W
- **When** they POST `/api/v1/workspaces/W/invites` with `{ email: "alice@example.com", role: "member" }`
- **Then** the system inserts a `workspace_invites` row with a signed token, `expires_at = now + 24h`
- **And** dispatches an invitation email to alice@example.com
- **And** returns 201 with `{ invite_id, expires_at }`

### Scenario 2: Admin invites a viewer

- **Given** an authenticated admin of Workspace W
- **When** they POST an invite with role `"viewer"`
- **Then** the invite is created successfully (admin can invite anyone with role ≤ admin)

### Scenario 3: Member cannot invite

- **Given** an authenticated member (not admin) of Workspace W
- **When** they POST an invite
- **Then** the system returns 403 with code `INSUFFICIENT_ROLE`

### Scenario 4: Admin cannot invite an owner

- **Given** an authenticated admin of Workspace W
- **When** they POST an invite with role `"owner"`
- **Then** the system returns 403 with code `ROLE_ABOVE_CALLER` (role must be ≤ caller's role)

### Scenario 5: Inviting an existing member rejected

- **Given** `alice@example.com` is already a member of Workspace W
- **When** the owner POSTs an invite to that email
- **Then** the system returns 409 with code `ALREADY_A_MEMBER`

### Scenario 6: Invite accepted within TTL

- **Given** a valid invite with a signed token
- **When** the invitee clicks the link within 24h and signs in
- **Then** the system promotes them to `workspace_members` with the assigned role
- **And** marks the invite as accepted
- **And** redirects to the workspace home

### Scenario 7: Invite expired

- **Given** an invite older than 24h
- **When** the invitee clicks the link
- **Then** the system rejects with code `INVITE_EXPIRED` and shows "Ask {inviter_email} for a new invite"

---

## Business Rules

- Caller's role MUST be ≥ admin to create an invite.
- Invited role MUST be ≤ caller's role (admin cannot invite an owner).
- Email MUST be unique among active workspace members.
- Invite token: HMAC-signed, includes `workspace_id` + `email` + `role` + `expiry`, single-use.
- Acceptance idempotent: re-clicking accepted invite returns 200 with current membership, not a new row.

---

## Workflow

### Inviter

1. Owner / Admin clicks "Invite teammate".
2. UI shows email + role dropdown (filtered to ≤ caller's role).
3. POST `/api/v1/workspaces/{id}/invites` with `{ email, role }`.
4. Server validates caller role + role-hierarchy + uniqueness.
5. Server generates signed token + inserts `workspace_invites` row.
6. Server dispatches email with link `/accept-invite?token=...`.
7. Returns 201.

### Invitee

1. Receives email, clicks link.
2. If not signed in: lands on `/login`, then redirected back to `/accept-invite?token=...`.
3. POST `/api/v1/invites/{token}/accept`.
4. Server validates token signature + expiry + email-match.
5. Inserts `workspace_members` row with role from token.
6. Marks invite accepted.
7. Redirects to `/home`.

---

## Technical Notes

### Frontend

- Settings page: `<MembersTab />` with invite form + pending-invites list.
- Page: `app/accept-invite/page.tsx`.

### Backend

- Routes:
  - `POST app/api/v1/workspaces/[id]/invites/route.ts`
  - `POST app/api/v1/invites/[token]/accept/route.ts`
  - `GET  app/api/v1/workspaces/[id]/invites/route.ts`
- Token signing: HMAC-SHA256 with secret from env.
- Email dispatch: Supabase Auth's `inviteUserByEmail` OR custom Resend integration.

### Database

- Tables: `workspace_invites`, `workspace_members`.
- Index: `(workspace_id, lower(email))` unique pending.

---

## Dependencies

### Blocked By

- BK-4 (workspace creation).

### Related

- BK-2 / BK-3 (sign-in flows — invitee must be able to sign in).

---

## Definition of Done

- [ ] All 7 AC scenarios pass on staging.
- [ ] HMAC token-signing unit tests.
- [ ] Email actually arrives in invitee's inbox (smoke test on staging).
- [ ] Role-hierarchy enforced server-side (NOT only client-side filter).
- [ ] RLS policy verifies caller membership before listing pending invites.

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-BK-1-tenancy-identity/epic.md`
- **PRD:** `.context/PRD/mvp-scope.md` (US 1.3)
- **SRS:** `.context/SRS/functional-specs.md` (FR-003)
- **API Contracts:** `.context/SRS/api-contracts.yaml`
