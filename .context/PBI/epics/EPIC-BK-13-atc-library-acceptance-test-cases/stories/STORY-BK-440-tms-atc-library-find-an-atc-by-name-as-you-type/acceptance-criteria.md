# BK-440 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-440)

## AC-03 — Incremental search

```gherkin
Scenario: Search narrows the list incrementally as I type
  Given the full unfiltered list is showing
  When I type part of an ATC's name into the search field
  Then the list narrows to matching ATCs after each character I type, without requiring me to submit the search
```

## AC-04 — Keyboard shortcuts (/ and Esc only — Cmd+K retired, see Out of Scope)

```gherkin
Scenario: The "/" key focuses the search field from anywhere on the screen
  Given I am viewing the ATC Library with focus outside the search field
  When I press "/"
  Then focus moves to the search field
```

```gherkin
Scenario: Esc clears an active search term
  Given I have typed a search term into the search field
  When I press Esc while the search field is focused
  Then the search term is cleared
  And the list returns to reflect only the remaining active filters
```

## AC-08 — No-match state

```gherkin
Scenario: A search or filter combination that matches nothing reads as "nothing found," not an error
  Given no ATC matches my current search term and active filters
  When the list finishes narrowing
  Then I see an explicit "nothing found" empty state
  And nothing on the screen suggests something went wrong
```

---
_Synced from Jira by sync-jira-issues_
