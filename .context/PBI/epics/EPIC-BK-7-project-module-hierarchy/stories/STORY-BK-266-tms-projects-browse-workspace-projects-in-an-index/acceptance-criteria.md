# BK-266 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-266)

```gherkin
Scenario: A workspace that already has projects lists them all
  Given Mateo belongs to a Workspace holding the Projects "Checkout flow", "Mobile app" and "Billing"
    And that Workspace is his active one
  When he opens the Projects index
  Then all three Projects are listed, oldest first
    And each entry shows the Project name and its URL slug
    And the create-project form is not what greets him
```

```gherkin
Scenario: Every project on the index leads to that project
  Given the Projects index is showing "Checkout flow"
  When Mateo activates the "Checkout flow" entry
  Then he arrives on that Project's own screen
    And the Project he arrived at is the one he activated
```

```gherkin
Scenario: A project description is shown when the author wrote one
  Given "Checkout flow" was created with the description "Guest and returning-customer purchase paths"
    And "Billing" was created without a description
  When Mateo opens the Projects index
  Then the "Checkout flow" entry shows its description
    And the "Billing" entry shows name and slug with no empty description line
```

```gherkin
Scenario: A workspace with no projects gets an empty state, not a bare form
  Given Mateo's active Workspace has no Projects yet
  When he opens the Projects index
  Then he sees an empty state explaining what a Project is for
    And it offers a single clear way to create the first Project
    And the create-project form is not rendered inline on the index
```

```gherkin
Scenario: Creating a project from the dedicated route lands on that project
  Given Mateo is on the dedicated create-project route
  When he names the Project "Checkout flow" and confirms
  Then the Project is created in his active Workspace
    And he arrives on that new Project's own screen
    And returning to the Projects index shows "Checkout flow" listed
```

```gherkin
Scenario: Rejected input still explains itself on the dedicated route
  Given Mateo is on the dedicated create-project route
  When he submits a name of two characters
  Then he is told the name must be at least three characters
    And no Project is created
    And he stays on the create route with what he typed intact
```

```gherkin
Scenario: A duplicate name is refused the same way it is today
  Given Mateo's active Workspace already holds a Project named "Checkout flow"
  When he tries to create a second Project with that same name
  Then he is told a Project with this name already exists here
    And no second Project is created
```

```gherkin
Scenario: The index is scoped to the active workspace
  Given Mateo belongs to the Workspaces "Acme QA" and "Contoso QA"
    And "Acme QA" holds "Checkout flow" while "Contoso QA" holds "Billing"
    And "Acme QA" is his active Workspace
  When he opens the Projects index
  Then he sees "Checkout flow"
    And he does not see "Billing"
```

```gherkin
Scenario: Switching workspace re-scopes the index
  Given Mateo is on the Projects index with "Acme QA" active
  When he switches his active Workspace to "Contoso QA"
  Then the index lists "Contoso QA"'s Projects
    And no Project from "Acme QA" remains on screen
```

```gherkin
Scenario: The create affordance in the left navigation opens the create route
  Given Mateo is anywhere inside the application shell
  When he activates the "New project" control in the left navigation
  Then he arrives on the dedicated create-project route
    And he is not sent to the Projects index
```

```gherkin
Scenario: Both routes are operable by keyboard alone
  Given Mateo is navigating with the keyboard only
  When he moves through the Projects index and then through the create route
  Then every interactive element can be reached and activated in a predictable order
    And whichever element holds focus shows a visible focus indicator
    And that indicator uses the frozen design contract, matching the rest of the application
```

---
_Synced from Jira by sync-jira-issues_
