# BK-87 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-87)

```gherkin
Scenario: Reaching Settings from the account menu
  Given Sara is signed in
   When she opens the account menu and selects "Settings"
   Then she lands on the Settings area with the Account section selected
    And she can navigate to the Tokens and Workspaces sections from a visible nav
```

```gherkin
Scenario: Account section shows identity with a loading state
  Given Sara opens the Account section
   When her account data is still loading
   Then she sees a loading indicator rather than an empty page
    And once loaded she sees her signed-in email
```

```gherkin
Scenario: Account data fails to load
  Given Sara opens the Account section
   When her account data cannot be loaded
   Then she sees an error message with a way to retry
    And the Settings navigation remains usable
```

---
_Synced from Jira by sync-jira-issues_
