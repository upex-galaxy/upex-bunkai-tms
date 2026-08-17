# BK-262 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-262)

```gherkin
Scenario: A properly-scoped token succeeds creating a module
  Given Karim holds a valid Personal Access Token scoped exactly atc:write
  When Karim sends a request to create a new module in a project he is a member of
  Then the module is created
  And the response confirms success with 201
```

```gherkin
Scenario: Any authenticated token can bootstrap a new workspace
  Given Karim holds any valid, non-expired, non-revoked Personal Access Token with at least one scope
  When Karim sends a request to create a new workspace
  Then the workspace is created with 201
  And Karim becomes its admin
```

```gherkin
Scenario: A token scoped only for reads is rejected creating a module
  Given Karim holds a valid Personal Access Token scoped exactly atc:read
  When Karim sends a request to create a new module using that token
  Then Karim receives an authorization error with 403
  And no module is created
```

```gherkin
Scenario: A token scoped only for reads is rejected creating an invite
  Given Karim holds a valid Personal Access Token scoped exactly atc:read
  When Karim sends a request to invite a new member to the workspace using that token
  Then Karim receives an authorization error with 403
  And no invite is created
```

```gherkin
Scenario: A token with unrelated scopes is rejected on a workspace-admin action
  Given Karim holds a valid Personal Access Token scoped atc:write and run:execute, without workspace:admin
  When Karim sends a request to revoke a pending invite using that token
  Then Karim receives an authorization error with 403
  And the invite is unchanged
```

```gherkin
Scenario: A token with no resolvable workspace context is rejected on a workspace-admin action
  Given Karim holds a valid Personal Access Token scoped workspace:admin that is not bound to any workspace
  When Karim sends a request to update workspace settings using that token
  Then Karim receives an error indicating the workspace could not be resolved
  And no action is taken
```

```gherkin
Scenario: A token with no workspace binding succeeds on a non-admin action when its user is a real member
  Given Karim holds a valid Personal Access Token scoped atc:write that is not bound to any workspace
  And the underlying user is an active member of the target project's workspace
  When Karim sends a request to create a new module using that token
  Then the module is created
  And the response confirms success with 201
```

```gherkin
Scenario: A properly read-scoped token succeeds reading a non-ATC resource
  Given Karim holds a valid Personal Access Token scoped atc:read
  When Karim sends a request to read a non-ATC resource, such as listing modules
  Then the response returns 200 with the requested data
```

```gherkin
Scenario: A token missing the read scope is rejected reading a non-ATC resource
  Given Karim holds a valid Personal Access Token scoped only run:execute
  When Karim sends a request to read a non-ATC resource, such as listing modules
  Then Karim receives an authorization error with 403
  And no data is returned
```

---
_Synced from Jira by sync-jira-issues_
