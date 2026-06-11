# BK-109 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-109)

# ATP DRAFT — [https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88](https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88): Settings | Manage Personal Access Tokens

***Status***: Shift-Left DRAFT — Awaiting PO Estimation
***Refined****: 2026-06-10 | ****Story quality***: Needs Improvement
***Outlines***: 29 total (Positive 9, Negative 11, Boundary 3, Integration 3, API 3)

---

## Coverage summary

| ***Type**** | ****Count*** |
| --- | --- |
| Positive | 9 |
| Negative | 11 |
| Boundary | 3 |
| Integration | 3 |
| API | 3 |
| ***Total**** | ****29*** |

---

## Critical Questions for PO (BLOCK sprint planning)

1. Should revoked tokens appear in the list? If yes, what is the visual treatment (badge, grayed row, sort order)?
2. What is the exact copy for the revocation confirmation dialog?
3. Are expiry date and workspace binding shown in the token list row and issuance form?
4. What is the expected behavior when the Clipboard API is unavailable during the secret reveal?

---

## Technical Questions for Dev (block implementation)

1. Will GET /api/v1/tokens be updated to filter revoked tokens server-side, or is filtering purely client-side?
2. Is there a maximum number of active tokens per user enforced at DB/API level?
3. Is POST /api/v1/tokens rate-limited?
4. What is the token prefix display format in the list (bk*pat*prefix or prefix only)?
5. Is the Tokens section a tab within [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) Settings Hub or a standalone route?
6. Security review required: confirm token secret never appears in server logs, client console, or error payloads; confirm mintPat() uses cryptographically secure randomness.

---

## Test outline names

### Positive

- Should issue a token and display the full secret exactly once in the reveal dialog
- Should hide the secret and show only the prefix after the reveal dialog is dismissed
- Should copy the full token to clipboard when the copy control is activated
- Should display name, scopes, and created date for each token in the list
- Should show a revoked visual state for revoked tokens in the list
- Should revoke a token and update the row to revoked state without page reload
- Should cancel revocation and keep the token active when the confirmation dialog is dismissed
- Should display an empty state with explanation and a primary issue CTA when no tokens exist
- Should transition from empty state to token list after the first token is issued

### Negative

- Should reject token issuance when no scopes are selected
- Should reject token issuance when the token name exceeds 80 characters
- Should reject an unauthenticated request to issue a token
- Should reject an unauthenticated request to list tokens
- Should reject an unauthenticated request to revoke a token
- Should return 404 (not 403) when User B attempts to DELETE User A token
- Should reject a POST with an invalid scope value not in the AccessTokenScope enum
- Should reject issuance of workspace:admin scope by a user without admin/owner role
- Should handle a 404 gracefully when revoking an already-revoked token
- Should handle a 5xx error gracefully when revocation fails
- Should reject cross-tenant GET — User B cannot see User A tokens

### Boundary

- Should accept a token name of exactly 80 characters
- Should reject a token name of exactly 81 characters
- Should accept token issuance with expires*in*days = 365

### Integration

- Should enforce session authentication on all three token management endpoints
- Should enforce RLS so that User B cannot see User A tokens
- Should reflect revocation immediately in subsequent API authentication attempts

### API

- POST /api/v1/tokens — issues token, returns full secret once
- GET /api/v1/tokens — lists tokens with prefix only, no secret
- DELETE /api/v1/tokens/{id} — soft-revoke, RLS-enforced 404 for cross-tenant

---

## Key risks

| ***#**** | ****Risk**** | ****Impact*** |
| --- | --- | --- |
| 1 | Secret inadvertently rendered in DOM after dialog dismiss | Critical |
| 2 | Revoked tokens appear without visual distinction | High |
| 3 | [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) Settings Hub slips — [https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88](https://jira.upexgalaxy.com/browse/BK-88#icft=BK-88) UI QA blocked | High |
| 4 | Clipboard copy silently fails in staging (HTTP or permission) | Medium |
| 5 | workspace:admin scope issued to member-role user — privilege escalation | Critical |
| 6 | Full token secret lands in server logs or client console | Critical |

---

## Story quality verdict

***Needs Improvement*** — 6 AC-level gaps identified (error paths for POST, revoked token visibility, expiry display, workspace UI, confirmation dialog copy, clipboard fallback). Security-critical gap: GET /api/v1/tokens does not filter revoked tokens; AC is silent on list visibility. Entire UI surface blocked on [https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87](https://jira.upexgalaxy.com/browse/BK-87#icft=BK-87) (Ready For Dev). API-level testing can proceed independently.

**Full refinement detail (526 lines):** **.context/PBI/epics/EPIC-BK-85-account-settings/stories/STORY-BK-88-settings-manage-personal-access-tokens/shift-left-refinement.md**

---
_Synced from Jira by sync-jira-issues_
