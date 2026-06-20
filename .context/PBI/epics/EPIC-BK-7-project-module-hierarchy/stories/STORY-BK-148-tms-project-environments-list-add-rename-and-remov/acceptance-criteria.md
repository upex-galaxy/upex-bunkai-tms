# BK-148 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-148)

```gherkin
Background:
  Given an authenticated workspace member with role member or higher
    And a Project exists in the active workspace
    And the Project was seeded with the environments "Staging" and "Production"
```

```gherkin
Scenario: List the environments of a project
  Given the Senior QA Engineer is viewing the project's environment settings
  When the environment list loads
  Then the environments "Staging" and "Production" are shown
    And they appear in a stable, predictable order
```

```gherkin
Scenario: Add a new environment with a unique name
  Given the Senior QA Engineer is viewing the project's environment list
  When she adds an environment named "UAT"
  Then "UAT" appears in the project's environment list
    And it is available to select when starting a run
```

```gherkin
Scenario: Trim surrounding whitespace when adding an environment
  Given the Senior QA Engineer is adding an environment
  When she enters the name "  QA Sandbox  "
  Then the environment is saved as "QA Sandbox" with no leading or trailing spaces
```

```gherkin
Scenario: Reject a duplicate environment name in the same project
  Given the project already has an environment named "Staging"
  When the Senior QA Engineer tries to add an environment named "staging"
  Then the environment is not added
    And she sees the message "An environment with this name already exists"
```

```gherkin
Scenario: Reject an empty environment name
  Given the Senior QA Engineer is adding an environment
  When she submits the name as blank or only spaces
  Then the environment is not added
    And she sees the message "Name is required"
```

```gherkin
Scenario: Reject a name longer than the allowed length
  Given the Senior QA Engineer is adding an environment
  When she submits a name of 51 characters
  Then the environment is not added
    And she sees the message "Name must be 50 characters or fewer"
```

```gherkin
Scenario: Rename an existing environment
  Given the project has an environment named "UAT"
  When the Senior QA Engineer renames it to "Pre-Prod"
  Then the environment list shows "Pre-Prod" and no longer shows "UAT"
    And runs already linked to that environment still reference it
```

```gherkin
Scenario: Reject a rename that collides with another environment name
  Given the project has environments named "Staging" and "Production"
  When the Senior QA Engineer renames "Staging" to "production"
  Then the rename is rejected
    And she sees the message "An environment with this name already exists"
```

```gherkin
Scenario: Remove an unused environment
  Given the project has an environment named "Pre-Prod" that no run references
  When the Senior QA Engineer removes "Pre-Prod" and confirms
  Then "Pre-Prod" no longer appears in the project's environment list
```

```gherkin
Scenario: Block removal of an environment that a run references (delete guard, PO-confirm default)
  Given the project has an environment named "Staging" referenced by at least one run
  When the Senior QA Engineer tries to remove "Staging"
  Then the environment is not removed
    And she sees a message explaining the environment is in use by existing runs
    And the message tells her how many runs reference it
```

---
_Synced from Jira by sync-jira-issues_
