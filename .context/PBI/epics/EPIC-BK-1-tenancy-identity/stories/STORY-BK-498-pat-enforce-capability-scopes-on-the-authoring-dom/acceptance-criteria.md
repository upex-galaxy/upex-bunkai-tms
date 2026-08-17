# BK-498 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-498)

```gherkin
Scenario: A properly-scoped token succeeds creating a module
  Given Karim holds a valid Personal Access Token scoped exactly atc:write
  When Karim sends a request to create a new module in a project he is a member of
  Then the module is created
  And the response confirms success with 201
```

```gherkin
Scenario: A token scoped only for reads is rejected creating a module
  Given Karim holds a valid Personal Access Token scoped exactly atc:read
  When Karim sends a request to create a new module using that token
  Then Karim receives an authorization error with 403
  And no module is created
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
  When Karim sends a request to read a non-ATC resource, such as listing the User Stories in a module (`GET /api/v1/modules/{id}/user-stories`)
  Then the response returns 200 with the requested data
```

***Note******:**** the first three scenarios above are AC-01, AC-03 and AC-07 in BK-262's original numbering, carried verbatim. The fourth is ****AC-08a*** — a partition of AC-08's ratified read-scope intent for the authoring domain, pointed at `GET /api/v1/modules/{id}/user-stories`. This is a partition of already-ratified intent, not new refinement — see the AI Product Owner ruling on BK-262, item 7.

---
_Synced from Jira by sync-jira-issues_
