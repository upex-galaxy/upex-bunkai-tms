# BK-226 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-226)

```
Scenario: Upload a JUnit XML report and create a run
  Given Sara opens "Upload CI results" from the project runs view
  And selects the Test "Checkout happy path" and the environment "Staging"
  When she uploads a JUnit XML report whose 4 entries match the Test's 4 steps
  Then the mapping preview shows each report entry mapped to its corresponding step
  And after she confirms, a finished automated run is created with per-step results and a verdict derived from the results
```

```
Scenario: Unmapped report entries are surfaced, never dropped
  Given the uploaded report contains 6 entries and only 4 of them map to the Test's steps
  When Sara reviews the mapping preview
  Then the 2 unmapped entries are listed by name under "Not mapped"
  And she must acknowledge them before the run can be created
  And the created run records that 2 report entries were left unmapped
```

```
Scenario: Steps missing from the report are made visible
  Given the uploaded report covers only 2 of the Test's 4 steps
  When Sara reviews the mapping preview
  Then the 2 uncovered steps are flagged in the preview
  And on confirmation they are recorded as blocked so the coverage gap stays visible in the run
```

```
Scenario: Unsupported or oversized file is rejected with guidance
  Given Sara selects a 40 MB PDF instead of a results report
  When she attempts the upload
  Then the upload is rejected with a message naming the supported format (JUnit XML) and the size limit
  And no run is created
```

```
Scenario: A failing entry drives the verdict
  Given the uploaded report maps fully onto the Test's steps and one entry is a failure
  When Sara confirms the mapping
  Then the created run's steps show the failure on the matching step
  And the run's final verdict is "failed"
```

---
_Synced from Jira by sync-jira-issues_
