# BK-49 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-49)

```gherkin
Scenario: View the workspace activity feed
  Given activity has been recorded across the workspace
  When the QA Lead opens the activity feed
  Then the feed lists each event newest-first with who did it, what they did, the item, and when
```

```gherkin
Scenario: Page through older activity
  Given more activity than fits on one page
  When the QA Lead scrolls to the end of the feed
  Then older events load in order without losing position
```

```gherkin
Scenario: Empty workspace
  Given a workspace with no recorded activity yet
  When the QA Lead opens the activity feed
  Then the feed shows a clear empty state
```

---
_Synced from Jira by sync-jira-issues_
