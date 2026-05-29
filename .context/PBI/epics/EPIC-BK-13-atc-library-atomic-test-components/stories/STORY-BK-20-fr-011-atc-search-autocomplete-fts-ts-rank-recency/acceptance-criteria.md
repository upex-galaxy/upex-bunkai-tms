# BK-20 — Acceptance Criteria

> Jira field: `customfield_10141` · [View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-20)

```gherkin
Scenario: Find an ATC by a word in its title
  Given an ATC titled "Login with expired token" exists in my workspace
  When I search for "expired"
  Then "Login with expired token" appears in the results
```

```gherkin
Scenario: Find an ATC by one of its tags
  Given an ATC tagged "smoke" exists in my workspace
  When I search for "smoke"
  Then that ATC appears in the results
```

```gherkin
Scenario: Narrow results to a Module subtree
  Given matching ATCs exist in the "Payment" Module and the "Login" Module
  When I search and filter to the "Payment" Module
  Then only matches within "Payment" and its sub-modules are shown
```

```gherkin
Scenario: More recently updated ATCs rank higher among equal matches
  Given two equally relevant ATCs match my query
  When the results are shown
  Then the more recently updated ATC appears above the other
```

```gherkin
Scenario: An empty query runs no search
  Given the search box is empty
  When no characters are entered
  Then no search is performed and no results are shown
```

```gherkin
Scenario: Results never include ATCs from another workspace
  Given a matching ATC exists in a different workspace
  When I search in my workspace
  Then that ATC does not appear in my results
```

---
_Synced from Jira by sync-jira-issues · 2026-05-29T01:06:50.125Z_
