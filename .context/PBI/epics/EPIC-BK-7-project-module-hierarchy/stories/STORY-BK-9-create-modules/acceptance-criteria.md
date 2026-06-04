# BK-9 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-9)

```
Scenario: Create a top-level Module inside a Project
  Given I am a Senior QA Engineer viewing a Project's empty Module tree
  When I create a Module named "Payment" at the Project root
  Then the "Payment" Module appears at the top level of the tree
  And it is selectable as a parent for new sub-modules
```

```
Scenario: Create a nested sub-module under an existing Module
  Given a Module "Payment" exists in the Project
  When I add a sub-module named "Refunds" under "Payment"
  Then "Refunds" appears nested beneath "Payment" in the tree
  And its breadcrumb reads "Payment / Refunds"
```

```
Scenario: A Module name shorter than the minimum is rejected
  Given I am creating a new Module
  When I submit the name "P"
  Then the Module is not created
  And I see a message that the name must be at least 2 characters
```

```
Scenario: Nesting beyond 4 levels shows a soft warning but is allowed
  Given a chain of Modules already nested 4 levels deep
  When I add a sub-module at the 5th level
  Then the sub-module is created
  And I see a non-blocking warning that the tree is getting deep
```

```
Scenario: Nesting beyond the maximum depth is blocked
  Given a chain of Modules already nested 6 levels deep
  When I try to add a sub-module at the 7th level
  Then the sub-module is not created
  And I see a message that the maximum nesting depth is 6 levels
```

---
_Synced from Jira by sync-jira-issues_
