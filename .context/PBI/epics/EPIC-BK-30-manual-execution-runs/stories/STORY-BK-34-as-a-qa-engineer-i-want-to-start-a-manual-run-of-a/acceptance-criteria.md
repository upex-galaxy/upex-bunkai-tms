# BK-34 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-34)

```
Scenario: Start a run with every step pending
  Given the Test "Checkout happy path" chains 3 ATCs totaling 9 steps
  And the Project "Checkout v2" has the environment "Staging" configured
  When Elena starts a run of "Checkout happy path" against "Staging"
  Then a new run opens with status "running"
  And all 9 steps are shown in chain order, each marked "pending"
  And the run progress reads "0% complete"
```

```
Scenario: Cannot start a run for a Test with no ATCs
  Given the Test "Empty draft" chains 0 ATCs
  And the Project "Checkout v2" has the environment "Staging" configured
  When Elena tries to start a run of "Empty draft" against "Staging"
  Then no run is created
  And she sees the message "Add at least one ATC to this Test before starting a run"
```

```
Scenario: Cannot start a run against an environment not configured for the Project
  Given the Project "Checkout v2" has only "Staging" and "Production" configured
  When Elena tries to start a run of "Checkout happy path" against "QA-Sandbox"
  Then no run is created
  And she sees the message "QA-Sandbox is not a configured environment for this Project"
```

```
Scenario: Re-starting with the same token within 24 hours returns the same run
  Given Elena started a run of "Checkout happy path" against "Staging" 2 hours ago using the start token "2026-05-28-smoke"
  When she starts a run of the same Test with the same token "2026-05-28-smoke"
  Then no second run is created
  And she is taken to the run she already started 2 hours ago
```

```
Scenario: Run records who executed it
  Given the Test "Checkout happy path" is started against "Staging" by an AI Test Agent
  When the run opens
  Then the run shows its executor mode as "agent"
  And it appears in the Test's run history alongside human-started runs
```

## Scenario (design fidelity): ATC run surfaces in the Projects screen

Given the Projects explorer tree and the ATC detail pane
When the runs domain exists
Then ATC rows expose run-selection checkboxes
And the ATC detail pane shows the last-run result banner and a Run action
And this matches the Projects screen per master-design-plan §4.3 and mockup screens/project.jsx

---
_Synced from Jira by sync-jira-issues_
