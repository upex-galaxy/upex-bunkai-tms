# Invite a teammate to a Workspace with role assignment

**Jira Key:** [BK-5](https://upexgalaxy67.atlassian.net/browse/BK-5)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Priority:** Medium
**Story Points:** 1
**Status:** Estimation

---

## User Story

As a Workspace owner or admin, I want to invite a teammate by email and assign them a role (owner / admin / member / viewer) so that access is controlled. Implements FR-003.

---

## Acceptance Criteria

Scenario: Owner invites a member successfully

  Given an authenticated owner of Workspace W

  When they POST /api/v1/workspaces/W/invites with { email: "alice@example.com", role: "member" }

  Then the system inserts a workspace_invites row with a signed token, expires_at = now + 24h

  And dispatches an invitation email to alice@example.com

  And returns 201 with { invite_id, expires_at }



Scenario: Admin invites a viewer

  Given an authenticated admin of Workspace W

  When they POST an invite with role "viewer"

  Then the invite is created successfully (admin can invite anyone with role ≤ admin)



Scenario: Member cannot invite

  Given an authenticated member (not admin) of Workspace W

  When they POST an invite

  Then the system returns 403 with code INSUFFICIENT_ROLE



Scenario: Admin cannot invite an owner

  Given an authenticated admin of Workspace W

  When they POST an invite with role "owner"

  Then the system returns 403 with code ROLE_ABOVE_CALLER (role must be ≤ caller's role)



Scenario: Inviting an existing member rejected

  Given alice@example.com is already a member of Workspace W

  When the owner POSTs an invite to that email

  Then the system returns 409 with code ALREADY_A_MEMBER



Scenario: Invite accepted within TTL

  Given a valid invite with a signed token

  When the invitee clicks the link within 24h and signs in

  Then the system promotes them to workspace_members with the assigned role

  And marks the invite as accepted

  And redirects to the workspace home



Scenario: Invite expired

  Given an invite older than 24h

  When the invitee clicks the link

  Then the system rejects with code INVITE_EXPIRED and shows "Ask {inviter_email} for a new invite"

---

## Business Rules

- Caller's role MUST be ≥ admin to create an invite.

- Invited role MUST be ≤ caller's role (admin cannot invite an owner).

- email MUST be unique among active workspace members.

- Invite token: HMAC-signed, includes workspace_id + email + role + expiry, single-use.

- Acceptance idempotent: re-clicking accepted invite returns 200 with current membership, not a new row.

---

## Scope

IN SCOPE:

- POST /api/v1/workspaces/{id}/invites endpoint (create invite)

- POST /api/v1/invites/{token}/accept endpoint (accept invite)

- Role hierarchy enforcement: caller can only invite at role ≤ their own

- Email dispatch with signed token (HMAC, 24h TTL)

- 409 on duplicate (existing member)

- 403 on insufficient role / role-above-caller

- Invite list endpoint GET /api/v1/workspaces/{id}/invites (pending invites)



OUT OF SCOPE:

- Invite revocation / resend (post-MVP — design-partners will request this)

- Bulk invite (CSV upload) — Phase 2

- Custom invite email template — Phase 2

- Role changes after acceptance (separate story, post-MVP)

---

## Workflow

Inviter:

1. Owner / Admin clicks "Invite teammate".

2. UI shows email + role dropdown (filtered to ≤ caller's role).

3. POST /api/v1/workspaces/{id}/invites with { email, role }.

4. Server validates caller role + role-hierarchy + uniqueness.

5. Server generates signed token + inserts workspace_invites row.

6. Server dispatches email with link /accept-invite?token=...

7. Returns 201.



Invitee:

1. Receives email, clicks link.

2. If not signed in: lands on /login, then redirected back to /accept-invite?token=...

3. POST /api/v1/invites/{token}/accept.

4. Server validates token signature + expiry + email-match.

5. Inserts workspace_members row with role from token.

6. Marks invite accepted.

7. Redirects to /home.

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
- **Labels:** mvp, tenancy, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:57:59.717Z_
