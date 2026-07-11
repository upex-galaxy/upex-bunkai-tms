# BK-202 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-202)

```gherkin
Scenario: Create a test plan with full details
  Given Mateo is a member of the project "Bunkai Web"
  When he creates a test plan named "Release 2.4 regression" with description "Full regression before the 2.4 cut" and goal "Release 2.4"
  Then the plan appears in the project's test plan list with status "Open"
  And opening the plan shows its name, description, goal, creator, and an empty test list
```

```gherkin
Scenario: Create a minimal test plan with only a name
  Given Mateo is viewing the Test Plans section of a project
  When he creates a plan named "Smoke pass" leaving description and goal empty
  Then the plan is created and listed with status "Open" and zero tests
```

```gherkin
Scenario: Duplicate plan name in the same project is rejected
  Given a plan named "Release 2.4 regression" already exists in the project
  When Mateo tries to create another plan named "release 2.4 regression"
  Then the plan is not created
  And he sees a message that a plan with that name already exists in the project
```

```gherkin
Scenario: Blank name is rejected
  Given Mateo is creating a test plan
  When he submits a name consisting only of spaces
  Then the plan is not created and he sees a validation message asking for a name
```

```gherkin
Scenario: Viewer cannot create a plan
  Given Lucia has the viewer role in the workspace
  When she opens the Test Plans section of the project
  Then the option to create a plan is not available to her
```

---
_Synced from Jira by sync-jira-issues_
