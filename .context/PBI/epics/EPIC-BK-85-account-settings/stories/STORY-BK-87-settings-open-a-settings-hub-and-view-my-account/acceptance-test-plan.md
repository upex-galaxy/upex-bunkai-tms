# BK-87 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-87)

## Coverage

| ID | Priority | Type | Status |
| --- | --- | --- | --- |
| TC-AC1 | Critical | Positive | Ready |
| TC-AC2 | Critical | Positive | Ready |
| TC-AC3 | High | Positive | Ready |
| TC-AC4 | Critical | Negative | Ready |
| TC-AC5 | High | Negative | Ready |
| TC-AC6 | High | Boundary | Ready |
| TC-AC7 | Medium | Negative | Ready |

## Gherkin Scenarios

### TC-AC1: Account section muestra identidad del usuario

```gherkin
Feature: Settings - Account section

  @positive @critical
  Scenario: User sees identity card with email and name
    Given user "sara@example.com" with display name "Sara Iglesias" and role "Owner"
    And the user is authenticated with an active session
    When they navigate to Settings → Account
    Then the identity card shows email "sara@example.com" as the primary label
    And the identity card shows display name "Sara Iglesias"
    And the identity card shows role "Owner" in the current workspace

  @edge @positive
  Scenario: User sees identity card with email only when name is absent
    Given user "sara@example.com" with no display name
    When they navigate to Settings → Account
    Then the identity card shows email "sara@example.com"
    But the identity card does not display a display name field

```

### TC-AC2: Workspace list con roles e indicador del actual

```gherkin
Feature: Settings - Workspace list

  @positive @critical
  Scenario: User sees workspace list with role and current indicator
    Given user belongs to 3 workspaces: "Bunkai Core" (Owner, current), "QA Sandbox" (Member), "Docs Team" (Viewer)
    And the user is authenticated with an active session
    When they navigate to Settings → Account
    Then they see a section titled "Workspaces" or "My Workspaces"
    And each workspace row shows its name and role
    And the current workspace "Bunkai Core" is visually indicated

  @edge @boundary
  Scenario: User sees scrollable workspace list with 10+ workspaces
    Given user belongs to 12 workspaces
    When they navigate to Settings → Account
    Then the workspace list container is scrollable

```

### TC-AC3: Settings accesible desde navegación global

```gherkin
Feature: Settings - Navigation

  @positive @high
  Scenario: User opens Settings from Topbar user menu
    Given the user is signed in on any post-login page
    And the Topbar displays a user menu (avatar/initials)
    When they click the user menu and select "Settings"
    Then the URL changes to "/settings"
    And the Account section loads successfully

  @positive @high
  Scenario: User opens Settings via direct URL
    Given the user is signed in
    When they navigate directly to "/settings"
    Then the Account section loads
    And the final URL is "/settings"

```

### TC-AC4: Acceso no autenticado redirige a login

```gherkin
Feature: Settings - Auth guard

  @negative @critical
  Scenario: Anonymous user is redirected to login
    Given the browser has no active session
    When they navigate to "/settings"
    Then they are redirected to "/login"
    And the login URL includes returnUrl="/settings"

```

### TC-AC5: Sesión expirada en Settings

```gherkin
Feature: Settings - Session expiry

  @negative @high
  Scenario: Expired session shows auth message without crash
    Given the user is on "/settings" with an active session
    When the session expires or is revoked
    Then either they are redirected to "/login"
    Or a "Session expired" message is displayed
    And no crash, backend error toast, or blank page occurs

```

### TC-AC6: Estado vacío — usuario sin workspaces

```gherkin
Feature: Settings - Empty state

  @boundary @high
  Scenario: New user with no workspace memberships sees empty state
    Given user "new@example.com" belongs to no workspaces
    And workspace_members returns an empty list
    When they navigate to Settings → Account
    Then the identity card is visible with their email
    And they see a message "You don't belong to any workspaces yet"
    And a call-to-action button is displayed

```

### TC-AC7: Error en workspace_members

```gherkin
Feature: Settings - Error handling

  @negative @medium
  Scenario: Workspace list shows error with retry on network failure
    Given the workspace_members query fails with a network/server error
    When the user navigates to Settings → Account
    Then the identity card is still visible (cached from AuthContext)
    And an error message with a "Retry" button is displayed in the workspace section
    When they click "Retry" and the query succeeds
    Then the workspace list loads normally
```

---
_Synced from Jira by sync-jira-issues_
