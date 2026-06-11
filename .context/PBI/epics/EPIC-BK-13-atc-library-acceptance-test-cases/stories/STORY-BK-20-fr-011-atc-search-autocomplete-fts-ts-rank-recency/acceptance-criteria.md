# BK-20 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-20)

```
Scenario: Find an ATC by a word in its title
  Given an ATC titled "Login with expired token" exists in my workspace
  When I search for "expired"
  Then "Login with expired token" appears in the results
```

```
Scenario: Find an ATC by one of its tags
  Given an ATC tagged "smoke" exists in my workspace
  When I search for "smoke"
  Then that ATC appears in the results
```

```
Scenario: Narrow results to a Module subtree
  Given matching ATCs exist in the "Payment" Module and the "Login" Module
  When I search and filter to the "Payment" Module
  Then only matches within "Payment" and its sub-modules are shown
```

```
Scenario: More recently updated ATCs rank higher among equal matches
  Given two equally relevant ATCs match my query
  When the results are shown
  Then the more recently updated ATC appears above the other
```

```
Scenario: An empty query runs no search
  Given the search box is empty
  When no characters are entered
  Then no search is performed and no results are shown
```

```
Scenario: Results never include ATCs from another workspace
  Given a matching ATC exists in a different workspace
  When I search in my workspace
  Then that ATC does not appear in my results
```

## Scenario (design fidelity): Projects toolbar inline filter

Given any Projects view (Tree, Table or Mind map)
When I type in the toolbar filter by name, ATC ID or tag
Then the visible ATCs narrow to those matching
And this matches the Projects screen per master-design-plan §4.3 and mockup screens/project.jsx (toolbar inline filter)

---
_Synced from Jira by sync-jira-issues_
