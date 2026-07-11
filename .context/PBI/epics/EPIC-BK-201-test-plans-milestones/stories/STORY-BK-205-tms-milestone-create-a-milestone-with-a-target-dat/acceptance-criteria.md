# BK-205 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-205)

```gherkin
Scenario: Create a milestone with a name and target date
  Given Mateo is a member of the project "Bunkai Web"
  When he creates a milestone named "Release 2.4" with target date 2026-08-15 and description "Second summer cut"
  Then the milestone appears in the project's milestones list
  And the list shows its target date and the days remaining until it
```

```gherkin
Scenario: Create a milestone without a description
  Given Mateo is viewing the Milestones section
  When he creates a milestone named "Hotfix window 2.4.1" with target date 2026-09-01 and no description
  Then the milestone is created and listed
```

```gherkin
Scenario: Target date in the past is rejected
  Given today is 2026-07-11
  When Mateo tries to create a milestone named "Retro goal" with target date 2026-07-01
  Then the milestone is not created
  And he sees a message that the target date must be today or later
```

```gherkin
Scenario: Duplicate milestone name in the same project is rejected
  Given a milestone named "Release 2.4" already exists in the project
  When Mateo tries to create another milestone named "release 2.4"
  Then the milestone is not created and he sees a duplicate-name message
```

```gherkin
Scenario: Viewer cannot create a milestone
  Given Lucia has the viewer role in the workspace
  When she opens the Milestones section of the project
  Then the option to create a milestone is not available to her
```

---
_Synced from Jira by sync-jira-issues_
