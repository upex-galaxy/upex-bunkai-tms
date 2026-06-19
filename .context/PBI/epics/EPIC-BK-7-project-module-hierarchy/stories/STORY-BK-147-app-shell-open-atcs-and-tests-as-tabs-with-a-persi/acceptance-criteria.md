# BK-147 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-147)

```gherkin
Scenario: The application shell stays visible after sign-in
  Given Elena has signed in
  When she moves between a project, an open ATC, and an open Test
  Then the left navigation, workspace switcher, global search entry, and account block stay visible the whole time
    And the account block shows her own signed-in identity, never a placeholder
```

```gherkin
Scenario: Explorer stays visible when opening an item
  Given Elena is in a project with modules, ATCs and Tests
  When she clicks an ATC or a Test in the explorer
  Then it opens as a tab in the workbench
    And the explorer tree remains visible beside it
    And the opened item is highlighted in the tree
```

```gherkin
Scenario: Multiple tabs open at once
  Given Elena has one item open
  When she opens a second and a third item
  Then each opens in its own tab
    And she can switch between tabs without losing the others
```

```gherkin
Scenario: Re-opening a focused item does not duplicate the tab
  Given an ATC is already open in a tab
  When Elena clicks that same ATC in the explorer
  Then its existing tab is focused instead of opening a duplicate
```

```gherkin
Scenario: Closing a tab
  Given Elena has several tabs open
  When she closes the active tab
  Then it is removed and an adjacent tab becomes active
    And the explorer stays visible
```

```gherkin
Scenario: Closing the last tab returns to the workbench index
  Given Elena has exactly one tab open
  When she closes it
  Then the workbench shows its empty index state
    And the explorer stays visible
```

```gherkin
Scenario: The project toolbar is reachable from any open tab
  Given Elena has a Test open in a tab
  When she looks for project actions
  Then New ATC, New Test, the view switch, and search are reachable without closing the tab
```

```gherkin
Scenario: Deep link opens directly as a tab
  Given Elena pastes a direct link to a Test
  When the page loads
  Then the Test opens as a tab within the workbench with the explorer visible
    And the Test is highlighted in the explorer
```

```gherkin
Scenario: Opening an item that is no longer available
  Given Elena follows a link to an ATC or Test that was deleted or that she cannot see
  When the workbench tries to open it
  Then a safe not-found state is shown inside the workbench
    And the explorer and navigation stay visible, with no broken full-page error
```

```gherkin
Scenario: Switching projects does not carry tabs across
  Given Elena has tabs open in one project
  When she opens a different project from the navigation
  Then she starts on that project's workbench index
    And tabs from the previous project are not shown
```

---
_Synced from Jira by sync-jira-issues_
