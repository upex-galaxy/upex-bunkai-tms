# BK-88 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

## Acceptance Criteria — BK-88 (Shift-Left Refined 2026-06-10)

***Scenario 1******:****** Issuing a token reveals the secret exactly once***

Given an authenticated user is on the Tokens section
 When they issue a token named "ci-runner" with scope `run:execute`
  And POST /api/v1/tokens returns 201 with `bk*pat*<prefix>.<secret>`
 Then the full secret is shown once with the warning "Store this token now — it cannot be retrieved later."
  And a copy-to-clipboard control is offered
  And after the dialog is dismissed, only the prefix `bk*pat*<prefix>` is visible in the list — the secret is never shown again

***Scenario 2******:****** Issuing a token with no scopes is rejected***

Given an authenticated user is on the token issuance form
 When they submit without selecting any scopes
 Then an inline validation error is shown ("At least one scope is required.")
  And no token is created (no POST sent, or server returns 422)

***Scenario 3******:****** Invalid scope enum values are rejected server-side***

Given an authenticated API request to POST /api/v1/tokens
 When scopes includes a value not in the AccessTokenScope enum (atc:read, atc:write, run:execute, workspace:admin)
 Then the server returns 422 Unprocessable Entity
  And no token is created in the database

***Scenario 4******:****** workspace******:******admin scope requires admin or owner role — NEEDS PO/DEV CONFIRMATION***

Given a user with `member` role in a workspace
 When they attempt to issue a workspace-scoped token with `scopes: ["workspace:admin"]`
 Then the server returns 403 Forbidden (or documented enforcement alternative)
  And no privilege escalation occurs
 Note: Confirm enforcement strategy (role-gate vs scope-downgrade) before sprint planning

***Scenario 5******:****** Listing tokens never exposes the secret***

Given an authenticated user has existing tokens
 When GET /api/v1/tokens is called
 Then each token row shows name, scopes, and created date — the prefix `bk*pat*<prefix>` only, no secret
  And no full secret string is present in the API response or rendered in the DOM
  And revoked tokens are visually distinct from active ones — NEEDS PO/DEV CONFIRMATION: confirm visual treatment

***Scenario 6******:****** Cross-user token deletion is rejected***

Given User B knows the ID of a token belonging to User A
 When User B sends `DELETE /api/v1/tokens/{User*A*token_id}`
 Then the server returns 404 (RLS returns 0 rows for User B — no confirmation of token existence)
  And User A's token remains completely unmodified in the database (`revoked_at` stays null)

***Scenario 7******:****** Revoking a token requires confirmation and updates immediately***

Given an authenticated user is viewing an active token named "ci-runner"
 When they click Revoke and confirm the warning dialog
  And DELETE /api/v1/tokens/{id} succeeds
 Then the token row shows a revoked state without a full page reload
  And a subsequent API call using the revoked token returns 401

***Scenario 8******:****** Empty token state guides first issuance***

Given an authenticated user has zero tokens
 When the Tokens section loads (GET /api/v1/tokens returns empty array)
 Then an empty state explains what Personal Access Tokens are for
  And a primary action to issue the first token is visible

---
_Synced from Jira by sync-jira-issues_
