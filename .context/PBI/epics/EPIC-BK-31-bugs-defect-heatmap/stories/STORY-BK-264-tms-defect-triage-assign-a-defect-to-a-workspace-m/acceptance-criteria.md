# BK-264 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-264)

```gherkin
Scenario: QA Lead assigns an open defect to a workspace member

  Given Mateo Silva is viewing an open defect titled "Checkout button unresponsive on Safari" with no assignee
    And Sara Iglesias is an active workspace member with Member-level access
   When Mateo assigns the defect to Sara Iglesias
   Then the defect shows "Sara Iglesias" as its assignee
    And the defect's activity shows "Mateo Silva assigned this defect to Sara Iglesias"
```

```gherkin
Scenario: Assignee moves a defect from open to in progress

  Given a defect titled "Checkout button unresponsive on Safari" is assigned to Sara Iglesias with status "open"
   When Sara moves the defect's status to "in progress"
   Then the defect's status shows "in progress"
    And the defect's activity shows "Sara Iglesias moved this defect to in progress"
```

```gherkin
Scenario: Assignee moves a defect from in progress to resolved

  Given the defect is assigned to Sara Iglesias with status "in progress"
   When Sara moves the defect's status to "resolved"
   Then the defect's status shows "resolved"
    And the defect's activity shows "Sara Iglesias moved this defect to resolved"
```

```gherkin
Scenario: QA closes a resolved defect after verifying the fix

  Given the defect has status "resolved"
   When Elena Vargas moves the defect's status to "closed"
   Then the defect's status shows "closed"
    And the defect's activity shows "Elena Vargas closed this defect"
```

```gherkin
Scenario: Skipping a lifecycle stage is rejected

  Given a defect has status "open"
   When Sara attempts to move the defect's status directly to "resolved"
   Then the status move is rejected
    And a message explains that the defect must move to "in progress" first
    And the defect's status still shows "open"
```

```gherkin
Scenario: Moving a defect's status backward is rejected

  Given a defect has status "resolved"
   When Sara attempts to move the defect's status back to "open"
   Then the status move is rejected
    And a message explains that this defect cannot move backward in its lifecycle
    And the defect's status still shows "resolved"
```

```gherkin
Scenario: Assigning a defect to someone outside the workspace is rejected

  Given Mateo Silva is viewing an open defect
    And "unknown@example.com" is not a member of the workspace
   When Mateo attempts to assign the defect to "unknown@example.com"
   Then the assignment is rejected
    And a message explains that only workspace members can be assigned a defect
    And the defect still shows no assignee
```

```gherkin
Scenario: Assigning a defect to a view-only member is rejected

  Given Mateo Silva is viewing an open defect
    And "Priya Nair" is a workspace member with Viewer-only access
   When Mateo attempts to assign the defect to Priya Nair
   Then the assignment is rejected
    And a message explains that Priya Nair does not have write access in this workspace
    And the defect still shows no assignee
```

```gherkin
Scenario: Reassigning a defect to a different member

  Given a defect is assigned to Sara Iglesias
   When Mateo reassigns the defect to Elena Vargas
   Then the defect shows "Elena Vargas" as its assignee
    And "Sara Iglesias" is no longer shown as the assignee
```

```gherkin
Scenario: Unassigning a defect

  Given a defect is assigned to Elena Vargas
   When Mateo unassigns the defect
   Then the defect shows no assignee
    And the defect's activity shows "Mateo Silva unassigned this defect"
```

---
_Synced from Jira by sync-jira-issues_
