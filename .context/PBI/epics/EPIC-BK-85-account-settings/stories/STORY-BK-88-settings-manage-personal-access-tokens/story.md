# Settings | Manage Personal Access Tokens

**Jira Key:** [BK-88](https://jira.upexgalaxy.com/browse/BK-88)
**Epic:** [BK-85](https://jira.upexgalaxy.com/browse/BK-85) (Account & Settings)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** 5

---

## Overview

## User story

As an autonomous AI test agent operator (Karim) I want to issue, list, and revoke Personal Access Tokens from the Settings UI so that I can drive Bunkai non-interactively and rotate or kill credentials the moment they leak.

---

## QA Refinements — Shift-Left Analysis (2026-06-10)

### Edge Cases Identified

- GET /api/v1/tokens returns revoked tokens without server-side filtering — PO must decide on list visibility treatment
- Clipboard API unavailability during secret reveal — no fallback defined in ACs
- Token expiry date display in list — optional issuance parameter not covered by current ACs
- workspace:admin scope privilege escalation by member-role users — enforcement strategy not specified
- Cross-user token deletion attempt — RLS-enforced 404 confirmed at API level

### Clarified Business Rules

- Secret is shown exactly once at mint time only; GET responses and list UI show the 12-char prefix only
- Soft-revoke only — sets `revoked_at` timestamp; no hard-delete path
- RLS enforces per-user isolation — cross-tenant GET/DELETE returns 0 rows (not 403, but 404)
- Scopes validated server-side against AccessTokenScope enum (atc:read, atc:write, run:execute, workspace:admin)
- Token format: `bk*pat*<12-char-prefix>.<base64url-32-bytes-secret>`

### Open Questions for PO / Dev

1. Should revoked tokens appear in the list? If yes, what is the visual treatment (badge, grayed row, sort order)?
2. What is the exact copy for the revocation confirmation dialog?
3. Are expiry date and workspace binding shown in the token list row and issuance form?
4. What is the expected behavior when the Clipboard API is unavailable during the secret reveal?
5. Does workspace:admin scope issuance require the issuing user to have admin or owner role? What is the enforcement response (403)? — NEEDS PO/DEV CONFIRMATION before sprint planning
6. Security Review required: confirm token secret never appears in server logs, client console, or error payloads; confirm mintPat() uses a cryptographically secure random source

**Full ATP DRAFT (29 test outlines, 4 critical PO questions) in the field.**

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Tests (14)

- [BK-120](https://jira.upexgalaxy.com/browse/BK-120): BK-88: TC01: Validate POST /api/v1/tokens issues token and returns full secret exactly once in 201 response _(MANUAL)_
- [BK-121](https://jira.upexgalaxy.com/browse/BK-121): BK-88: TC02: Validate GET /api/v1/tokens lists tokens with prefix only, no secret field, wrapped in {tokens:[...]} _(AUTOMATED)_
- [BK-122](https://jira.upexgalaxy.com/browse/BK-122): BK-88: TC03: Validate DELETE /api/v1/tokens/{id} soft-revokes token returning 200 and setting revoked_at _(MANUAL)_
- [BK-123](https://jira.upexgalaxy.com/browse/BK-123): BK-88: TC04: Validate POST /api/v1/tokens returns 401 for unauthenticated requests _(AUTOMATED)_
- [BK-124](https://jira.upexgalaxy.com/browse/BK-124): BK-88: TC05: Validate GET /api/v1/tokens returns 401 for unauthenticated requests _(AUTOMATED)_
- [BK-125](https://jira.upexgalaxy.com/browse/BK-125): BK-88: TC06: Validate DELETE /api/v1/tokens/{id} returns 401 for unauthenticated requests _(AUTOMATED)_
- [BK-126](https://jira.upexgalaxy.com/browse/BK-126): BK-88: TC07: Validate POST /api/v1/tokens returns 422 when scopes array contains invalid enum value _(MANUAL)_
- [BK-127](https://jira.upexgalaxy.com/browse/BK-127): BK-88: TC08: Validate POST /api/v1/tokens returns 403 when member-role user issues workspace:admin scope _(MANUAL)_
- [BK-128](https://jira.upexgalaxy.com/browse/BK-128): BK-88: TC09: Validate POST /api/v1/tokens accepts token name of exactly 80 characters _(MANUAL)_
- [BK-129](https://jira.upexgalaxy.com/browse/BK-129): BK-88: TC10: Validate POST /api/v1/tokens returns 422 when token name exceeds 80 characters _(MANUAL)_
- [BK-130](https://jira.upexgalaxy.com/browse/BK-130): BK-88: TC11: Validate GET /api/v1/tokens returns only the authenticated user's tokens (RLS isolation) _(Candidate)_
- [BK-131](https://jira.upexgalaxy.com/browse/BK-131): BK-88: TC12: Validate DELETE /api/v1/tokens/{id} returns 404 when targeting another user's token (RLS) _(MANUAL)_
- [BK-132](https://jira.upexgalaxy.com/browse/BK-132): BK-88: TC13: Validate DELETE /api/v1/tokens/{id} returns 404 when revoking an already-revoked token _(MANUAL)_
- [BK-133](https://jira.upexgalaxy.com/browse/BK-133): BK-88: TC14: Validate revoked PAT returns 401 on subsequent API call (revocation reflected immediately) _(MANUAL)_

### Bug (1)

- [BK-135](https://jira.upexgalaxy.com/browse/BK-135): POST /api/v1/tokens issues workspace:admin tokens to member-role users without 403 enforcement _(Closed)_

### Storys (4)

- [BK-87](https://jira.upexgalaxy.com/browse/BK-87): Settings | Open a settings hub and view my account _(Ready For QA)_
- [BK-222](https://jira.upexgalaxy.com/browse/BK-222): TMS-Automation API | Submit an automated run with step results _(Backlog)_
- [BK-223](https://jira.upexgalaxy.com/browse/BK-223): TMS-Automation API | Stream step results during an automated run _(Backlog)_
- [BK-226](https://jira.upexgalaxy.com/browse/BK-226): CI Integration | Upload a CI results file to create a run _(Backlog)_

### Tech Story (1)

- [BK-167](https://jira.upexgalaxy.com/browse/BK-167): Enforce workspace:admin scope on admin endpoints (consumption-side) _(FIXED)_

---

## Metadata

- **Created:** 6/7/2026
- **Updated:** 7/31/2026
- **Reporter:** Ely
- **Assignee:** Carlos Alberto Chiavassa
- **Labels:** shift-left-2026-06-10, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
