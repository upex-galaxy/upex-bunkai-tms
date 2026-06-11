# TEST EXECUTION: Acceptance Test Result: BK-109: 🚀 Settings | Manage Personal Access Tokens

**Jira Key:** [BK-111](https://jira.upexgalaxy.com/browse/BK-111)
**Status:** ACTIVE
**Components:** None

> Run results / coverage are NOT synced — read those via xray-cli. This file mirrors the issue description.

---

## Description

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

## Metadata

- **Created:** 6/10/2026
- **Updated:** 6/10/2026
- **Reporter:** Carlos Alberto Chiavassa
- **Assignee:** Carlos Alberto Chiavassa
- **Labels:** QA, TestExecutionReport

---

_Synced from Jira by sync-jira-issues_
