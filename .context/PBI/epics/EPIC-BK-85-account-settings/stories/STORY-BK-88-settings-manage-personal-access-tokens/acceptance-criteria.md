# BK-88 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-88)

```gherkin
Scenario: Issuing a token reveals the secret exactly once
  Given Karim's operator is on the Tokens section with no tokens yet
   When he issues a token named "ci-runner" with scopes ["run:execute"]
    And POST /api/v1/tokens returns 201 with a token of the form "bk*pat*<prefix>.<secret>"
   Then the full secret is shown once with the warning
       "Store this token now — it cannot be retrieved later."
    And a copy-to-clipboard control is offered
    And after he dismisses the dialog the secret is never shown again, only the prefix
```

```gherkin
Scenario: Listing tokens never exposes the secret
  Given Karim's operator has two existing tokens
   When the Tokens section loads from GET /api/v1/tokens
   Then each token shows its name, scopes, and created date
    And no full secret value is rendered for any row
```

```gherkin
Scenario: Revoking a token requires confirmation and updates immediately
  Given Karim's operator is viewing a token named "ci-runner"
   When he selects "Revoke" and confirms the warning
    And DELETE /api/v1/tokens/{id} succeeds
   Then the token row shows a revoked state without a page reload
```

```gherkin
Scenario: Empty token state guides first issuance
  Given Karim's operator opens the Tokens section with zero tokens
   When the list loads
   Then he sees an empty state explaining what tokens are for
    And a primary action to issue his first token
```

---
_Synced from Jira by sync-jira-issues_
