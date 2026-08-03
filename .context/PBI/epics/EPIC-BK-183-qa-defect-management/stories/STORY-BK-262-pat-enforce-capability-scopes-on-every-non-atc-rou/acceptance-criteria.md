# BK-262 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-262)

```gherkin
Scenario: A properly-scoped token succeeds on a non-ATC route
  Given Karim holds a Personal Access Token scoped to manage workspace modules
  When Karim sends a request to create a new module using that token
  Then the module is created
  And the response confirms success
```

```gherkin
Scenario: An under-scoped token is rejected before any change happens
  Given Karim holds a Personal Access Token scoped only for read-only ATC access
  When Karim sends a request to invite a new member to the workspace using that token
  Then Karim receives an authorization error
  And no invite is created
```

```gherkin
Scenario: A token with no resolvable workspace context is rejected
  Given Karim holds a valid Personal Access Token that is not bound to any workspace
  When Karim sends a request to a non-ATC route that requires workspace context
  Then Karim receives an error indicating the workspace could not be resolved
  And no action is taken
```

---
_Synced from Jira by sync-jira-issues_
