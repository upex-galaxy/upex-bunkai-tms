# BK-45 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-45)

## 3. Refined Acceptance Criteria

### Original AC-01 — Full chain display (covered story)

```gherkin
Scenario: Open the evidence chain for a fully covered user story
  Given a workspace member with at least viewer role
  And a user story in an active module with:
    | acceptance_criteria | 1 or more active ACs |
    | ATCs                | at least 1 ATC bound to each AC |
    | Tests               | at least 1 Test containing each ATC |
    | Runs                | at least 1 completed run for each Test |
    | Defects             | at least 1 defect linked to a run result |
  When the member navigates to the traceability view for that user story
  Then the view renders a single-page chain without additional navigation
  And for each acceptance criterion the view shows: the AC title
  And for each ATC bound to that AC: the ATC title and layer (UI/API/Unit)
  And for each Test containing that ATC: the Test name
  And for each Test: the single latest run result with its status (pass/fail/blocked/skipped)
  And for each run result: any linked defect(s) with their ID, title, and current status
```

### Original AC-02 — Partial coverage (ATCs exist, no run yet)

```gherkin
Scenario: Open the traceability view for a partially covered user story
  Given a workspace member with at least viewer role
  And a user story with at least one AC that has ATCs bound but no Test runs recorded
  When the member navigates to the traceability view for that user story
  Then the chain renders from the User Story down through the ATC layer
  And for the Test layer: a "no data yet" placeholder is shown for each ATC without a linked Test
  And for the Run layer: a "no data yet" placeholder is shown
  And for the Defect layer: a "no data yet" placeholder is shown
  And no broken or null-value cells appear in the rendered chain
```

NEEDS PO/DEV CONFIRMATION — "no data yet" must be confirmed as exact UI copy or replaced with a data-testid.

### Original AC-03 — No coverage

```gherkin
Scenario: Open the traceability view for a user story with no ATCs linked
  Given a workspace member with at least viewer role
  And a user story whose acceptance criteria have no ATCs bound
  When the member navigates to the traceability view for that user story
  Then the view displays a defined empty-state message indicating no coverage
  And zero chain rows are rendered for ATC, Test, Run, or Defect layers
  And no placeholder rows, loading spinners, or null-value cells appear
```

NEEDS PO/DEV CONFIRMATION — exact empty-state copy must be defined.

### Added AC-04 — AC with no ATCs within a partially covered story

```gherkin
Scenario: User story has some ACs covered and some ACs uncovered
  Given a user story with 2 or more active acceptance criteria
  And at least one AC has ATCs bound to it
  And at least one AC has no ATCs bound
  When the member navigates to the traceability view for that user story
  Then each AC with ATCs shows its ATC chain normally
  And each AC without ATCs displays an "uncovered" indicator at the ATC layer
  And no broken chain rows appear for the uncovered AC
```

NEEDS PO/DEV CONFIRMATION — exact "uncovered" indicator copy or component.

### Added AC-05 — Role-based access

```gherkin
Scenario: Unauthenticated user attempts to access a traceability view
  Given a URL for a valid traceability view
  When an unauthenticated user navigates to that URL
  Then the application redirects to the login page
  And no chain data is rendered before the redirect
```

```gherkin
Scenario: Authenticated user from a different workspace attempts to access a traceability view
  Given a valid traceability view URL for Workspace A
  And an authenticated user who is a member only of Workspace B
  When that user navigates to the URL
  Then the application returns a 403 Forbidden response or equivalent access-denied UI
  And no chain data from Workspace A is exposed
```

### Added AC-06 — Archived entities excluded from chain

```gherkin
Scenario: Traceability view excludes archived ACs and ATCs
  Given a user story with one active AC and one archived AC
  And the active AC has one active ATC and the archived AC has one archived ATC
  When the member navigates to the traceability view for that user story
  Then only the active AC appears in the chain
  And only the active ATC appears in the chain
  And the archived AC and its archived ATC are not rendered
```

### Added AC-07 — Story with zero ACs

```gherkin
Scenario: Open the traceability view for a story with no acceptance criteria
  Given a user story in draft status with no acceptance criteria
  When the member navigates to the traceability view for that user story
  Then the view displays a defined empty-state message indicating no acceptance criteria
  And no chain rows are rendered for AC, ATC, Test, Run, or Defect layers
```

NEEDS PO/DEV CONFIRMATION — exact empty-state copy.

---
_Synced from Jira by sync-jira-issues_
