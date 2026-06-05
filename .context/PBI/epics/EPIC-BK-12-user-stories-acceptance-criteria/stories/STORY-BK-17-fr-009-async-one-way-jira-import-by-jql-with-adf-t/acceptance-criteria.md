# BK-17 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-17)

```
Feature: Async one-way Jira import by JQL

Scenario: Start an import job with a valid JQL
  Given the Workspace has valid Jira credentials configured
  And the JQL "project = ACME AND issuetype = Story" returns 12 issues
  When the user POSTs /api/imports with project*id=P and jira*jql
  Then the API responds 202 with { import*job*id, status: "queued" }
  And polling /api/imports/{id} eventually returns { status: "completed", imported_count: 12, errors: [] }
```

```
Scenario: Re-running the same import is idempotent
  Given an import previously created User Stories with external_id ACME-1..ACME-12
  When the user starts a new import with the same JQL
  Then the second job completes with imported*count=12, created*count=0, updated_count=12
  And no duplicate user*stories rows exist for external*id ACME-1..ACME-12
```

```
Scenario: Issues whose Jira component matches a Module name route to that Module
  Given Bunkai has Modules named "Auth", "Billing" under Project P
  And Jira issue ACME-5 has component "Auth"
  When the import processes ACME-5
  Then the created User Story has module_id pointing to the "Auth" Module
```

```
Scenario: Issues with no matching component fall into the Inbox Module
  Given Jira issue ACME-9 has no component or a component name not present as Module in P
  When the import processes ACME-9
  Then the User Story is created under a Module named "Inbox" (auto-created under P if missing)
  And errors[] contains no entry for ACME-9 (Inbox routing is not an error)
```

```
Scenario: JQL above the 500-issue ceiling is chunked
  Given a JQL that returns 1200 Jira issues
  When the import job runs
  Then the job processes the issues in chunks of at most 500
  And the final imported_count equals 1200
  And status is "completed"
```

```
Scenario: Invalid Jira credentials fail the job
  Given the Workspace Jira credentials are revoked
  When a user starts an import
  Then the job transitions to status="failed" with errors[] containing { code: "jira_unauthorized" }
```

---
_Synced from Jira by sync-jira-issues_
