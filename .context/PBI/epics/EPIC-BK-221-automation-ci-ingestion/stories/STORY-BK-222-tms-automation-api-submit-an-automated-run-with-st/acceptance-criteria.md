# BK-222 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-222)

```
Scenario: Submit a completed automated run in one call
  Given Karim holds a valid Personal Access Token for the "Acme QA" workspace
  And the Test "Checkout happy path" exists with 4 chained ATC steps
  When Karim submits a run for that Test with a result for each of the 4 steps (pass, pass, pass, pass), final verdict "passed", duration 92 seconds, environment "Staging", and two evidence URLs
  Then the response confirms creation and returns the new run identifier in the standard success/data/error envelope
  And the run appears in the Test's run history as a finished run with verdict "passed" and an automated executor
```

```
Scenario: Idempotent resubmission never doubles state
  Given Karim submitted a run with idempotency key "ci-2026-07-11-checkout-01" and received a successful response
  When Karim retries the identical submission with the same idempotency key after a network timeout
  Then no second run is created
  And the response returns the identifier of the originally created run
```

```
Scenario: Incomplete step coverage is rejected
  Given the Test "Checkout happy path" has 4 chained ATC steps
  When Karim submits a run reporting results for only 2 of the 4 steps
  Then the submission is rejected with a validation message naming the step positions that are missing a result
  And no run is recorded
```

```
Scenario: Verdict vocabulary is enforced
  Given Karim prepares a submission for the Test "Checkout happy path"
  When Karim submits the run with final verdict "success"
  Then the submission is rejected
  And the validation message lists the accepted verdicts: "passed" and "failed"
```

```
Scenario: A viewer-role token cannot submit runs
  Given Karim holds a Personal Access Token whose owner has the "viewer" role in the workspace
  When Karim submits an automated run
  Then the submission is refused for insufficient permissions
  And no run is recorded
```

---
_Synced from Jira by sync-jira-issues_
