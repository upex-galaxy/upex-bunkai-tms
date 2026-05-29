# BK-22 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-22)

```gherkin
Scenario: See the count of Tests using an ATC
  Given an ATC is chained into four Tests
  When I open the ATC's detail page
  Then it shows "Used in 4 tests"
```

```gherkin
Scenario: Expand the report to list the Tests and the ATC's position in each
  Given an ATC used by four Tests
  When I expand the usage report
  Then I see each Test and the position the ATC holds within it
```

```gherkin
Scenario: An ATC used by no Tests shows zero
  Given an ATC that is not chained into any Test
  When I open its detail page
  Then it shows "Used in 0 tests"
  And the Test list is empty
```

```gherkin
Scenario: The report counts only Tests in the same workspace
  Given an ATC and a Test that lives in a different workspace
  When I open the ATC's usage report
  Then the Test from the other workspace is not counted
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T07:23:47.910Z_
