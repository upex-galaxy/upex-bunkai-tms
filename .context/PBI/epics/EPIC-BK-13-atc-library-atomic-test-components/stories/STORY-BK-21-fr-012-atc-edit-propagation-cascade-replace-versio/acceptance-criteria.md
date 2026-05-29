# BK-21 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-21)

```gherkin
Scenario: Editing an ATC updates every Test that chains it
  Given an ATC is chained into three Tests
  When I edit one of the ATC's steps and save
  Then all three Tests show the updated step
  And I did not edit any Test directly
```

```gherkin
Scenario: Saving an edit creates a new version of the ATC
  Given an ATC at version 1
  When I edit it and save
  Then the ATC is now at version 2
```

```gherkin
Scenario: The save confirmation reports how many Tests were affected
  Given an ATC chained into seven Tests
  When I save an edit
  Then I see a confirmation that the change affects seven Tests
```

```gherkin
Scenario: Re-anchoring an ATC to an invalid Module is rejected
  Given I am editing an ATC
  When I move it to a Module outside its Story's Project
  Then the edit is rejected
  And I see a message explaining the Module is not valid for this ATC
```

```gherkin
Scenario: Editing an ATC used by no Tests still saves and reports zero affected
  Given an ATC that is not chained into any Test
  When I edit it and save
  Then the ATC is updated to a new version
  And the confirmation reports zero affected Tests
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:50.126Z_
