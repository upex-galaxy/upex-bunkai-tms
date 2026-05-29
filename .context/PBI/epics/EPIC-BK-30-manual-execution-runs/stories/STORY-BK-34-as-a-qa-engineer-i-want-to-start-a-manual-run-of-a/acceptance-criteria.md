# BK-34 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-34)

```gherkin
Scenario: Start a run with every step pending
  Given the Test "Checkout happy path" chains 3 ATCs totaling 9 steps
  And the Project "Checkout v2" has the environment "Staging" configured
  When Elena starts a run of "Checkout happy path" against "Staging"
  Then a new run opens with status "running"
  And all 9 steps are shown in chain order, each marked "pending"
  And the run progress reads "0% complete"
```

```gherkin
Scenario: Cannot start a run for a Test with no ATCs
  Given the Test "Empty draft" chains 0 ATCs
  And the Project "Checkout v2" has the environment "Staging" configured
  When Elena tries to start a run of "Empty draft" against "Staging"
  Then no run is created
  And she sees the message "Add at least one ATC to this Test before starting a run"
```

```gherkin
Scenario: Cannot start a run against an environment not configured for the Project
  Given the Project "Checkout v2" has only "Staging" and "Production" configured
  When Elena tries to start a run of "Checkout happy path" against "QA-Sandbox"
  Then no run is created
  And she sees the message "QA-Sandbox is not a configured environment for this Project"
```

```gherkin
Scenario: Re-starting with the same token within 24 hours returns the same run
  Given Elena started a run of "Checkout happy path" against "Staging" 2 hours ago using the start token "2026-05-28-smoke"
  When she starts a run of the same Test with the same token "2026-05-28-smoke"
  Then no second run is created
  And she is taken to the run she already started 2 hours ago
```

```gherkin
Scenario: Run records who executed it
  Given the Test "Checkout happy path" is started against "Staging" by an AI Test Agent
  When the run opens
  Then the run shows its executor mode as "agent"
  And it appears in the Test's run history alongside human-started runs
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:51.466Z_
