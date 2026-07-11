# BK-41 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-41)

```gherkin
# BK-41 - TMS-Defect List | List and filter defects by module, status, severity
# Endpoint under test: GET /api/v1/bugs
# Auth: PAT scope bugs:read; RLS via project_membership

Feature: Defect List and Filter

  Scenario: List defects scoped to a chosen module
    Given a project P with module M and at least one filed bug whose module_id = M
    When the QA calls GET /api/v1/bugs?project*id=P&module*id=M with a PAT that is a member of P
    Then the response is 200 with data containing every bug of M
    And aggregates.by*severity and aggregates.by*status are present and consistent with data

  Scenario: Module filter includes nested sub-modules recursively
    Given a module M with descendant sub-module M2 at depth 2 and M3 at depth 6
    And bugs filed against M2 and M3
    When the QA calls GET /api/v1/bugs?project*id=P&module*id=M
    Then data contains the bugs of M, M2 and M3
    And no bug of any sibling or unrelated module is present in data

  Scenario: Filter by status only
    Given bugs with statuses open, in_progress, resolved and closed for project P
    When the QA calls GET /api/v1/bugs?project*id=P&status=in*progress
    Then data contains only the in_progress bugs
    And aggregates.by*status reflects the in*progress subset size

  Scenario: Filter by severity only
    Given bugs with severities P1, P2, P3 and P4 for project P
    When the QA calls GET /api/v1/bugs?project_id=P&severity=P2
    Then data contains only P2 bugs
    And aggregates.by_severity reflects the P2 subset size

  Scenario: Combined status and severity filter
    Given a mix of bugs across all statuses and severities for project P
    When the QA calls GET /api/v1/bugs?project_id=P&status=open&severity=P1
    Then data contains only bugs where status is open AND severity is P1
    And both aggregates reflect the same combined subset

  Scenario: Aggregates reflect the filtered set, not only the current page
    Given 150 bugs match the active filter
    When the QA calls GET /api/v1/bugs?project_id=P&limit=100
    Then the response data page may contain 100 bugs
    And aggregates.by*status and aggregates.by*severity count the full 150 matching bugs

  Scenario: Empty result shows a clear no-defects-match state
    Given a filter that matches zero bugs
    When the QA calls GET /api/v1/bugs?project_id=P&status=closed and no closed bug exists
    Then the response is 200
    And data is an empty array
    And aggregates.by*severity and aggregates.by*status are all zero
    And the UI can render a clear "no defects match" state instead of a blank screen

  Scenario: Archived module defects are hidden by default
    Given module M is archived or soft-deleted
    And bugs exist under module M or its descendants
    When the QA calls GET /api/v1/bugs?project*id=P&module*id=M without include_archived=true
    Then archived-module bugs are not included in data
    And aggregates.by*severity and aggregates.by*status do not count archived-module bugs
    And a future include_archived=true option may opt in to archived-module reporting if PO and Dev approve it
```

---
_Synced from Jira by sync-jira-issues_
