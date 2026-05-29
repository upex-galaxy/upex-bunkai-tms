# Invite a teammate to a Workspace with role assignment

**Jira Key:** [BK-5](https://upexgalaxy67.atlassian.net/browse/BK-5)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

***Source spec:*** FR-003 — Invite teammate

## User story

As a Workspace `owner` or `admin`, I want to invite a teammate by email and assign them a role (`owner` / `admin` / `member` / `viewer`) so that access is controlled.

Implements ***FR-003***.

## Business rules

- Caller's role MUST be `admin` or higher to create an invite.
- Invited role MUST be less than or equal to caller's role (`admin` cannot invite an `owner`).
- `email` MUST be unique among active workspace members.
- Invite token: HMAC-signed; includes `workspace_id` + `email` + `role` + expiry; single-use.
- Acceptance is idempotent: re-clicking an accepted invite returns 200 with current membership, not a new row.

## Workflow

***Inviter***

1. Owner or admin clicks "Invite teammate".
2. UI shows email + role dropdown (filtered to ≤ caller's role).
3. `POST /api/v1/workspaces/{id}/invites` with `{ email, role }`.
4. Server validates caller role + role-hierarchy + uniqueness.
5. Server generates signed token + inserts `workspace_invites` row.
6. Server dispatches email with link `/accept-invite?token=...`.
7. Returns 201.

***Invitee***

1. Receives email, clicks link.
2. If not signed in: lands on `/login`, then redirected back to `/accept-invite?token=...`.
3. `POST /api/v1/invites/{token}/accept`.
4. Server validates token signature + expiry + email-match.
5. Inserts `workspace_members` row with role from token.
6. Marks invite accepted.
7. Redirects to `/home`.

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

## Labels

`mvp`, `tenancy`, `wave-1`

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/27/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, shift-left-2026-05-27, shift-left-reviewed, tenancy, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:46.123Z_
