# BK-499 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-499)

```gherkin
Scenario: Any authenticated token can bootstrap a new workspace
  Given Karim holds any valid, non-expired, non-revoked Personal Access Token with at least one scope
  When Karim sends a request to create a new workspace
  Then the workspace is created with 201
  And Karim becomes its admin
```

```gherkin
Scenario: A properly read-scoped token succeeds reading a non-ATC resource
  Given Karim holds a valid Personal Access Token scoped atc:read
  When Karim sends a request to read a non-ATC resource, such as listing the Bugs in a project (`GET /api/v1/projects/{id}/bugs`)
  Then the response returns 200 with the requested data
```

```gherkin
Scenario: A token missing the read scope is rejected reading a non-ATC resource
  Given Karim holds a valid Personal Access Token scoped only run:execute
  When Karim sends a request to read a non-ATC resource, such as listing the Bugs in a project (`GET /api/v1/projects/{id}/bugs`)
  Then Karim receives an authorization error with 403
  And no data is returned
```

***Note******:*** the first scenario is AC-02 in BK-262's original numbering, carried verbatim. The second and third are AC-08 and AC-09, carried with their example corrected from a non-existent "listing modules" endpoint to `GET /api/v1/projects/{id}/bugs` — see the AI Product Owner ruling on BK-262, item 5.

---
_Synced from Jira by sync-jira-issues_
