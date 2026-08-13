# BK-441 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-441)

## AC-05 — Combined filters (Project + Module + layer)

```gherkin
Scenario: Project, Module, and layer filters narrow the list together
  Given ATCs exist across several Projects, Modules, and layers
  When I set a Project filter, a Module filter, and a layer filter at the same time
  Then only ATCs matching all three active filters remain in the list
```

## AC-06 — Combined search + filter

```gherkin
Scenario: A search term and active filters narrow the list together
  Given I have a Module filter active
  When I also type a search term
  Then the list shows only ATCs that match both the search term and the active filter
```

## AC-07 — Clear all gesture

```gherkin
Scenario: Clearing all active search and filters restores the full list in one gesture
  Given I have an active search term and one or more active filters
  When I trigger "Clear all"
  Then my search term is cleared, every active filter is cleared, and the full unfiltered list is shown
```

---
_Synced from Jira by sync-jira-issues_
