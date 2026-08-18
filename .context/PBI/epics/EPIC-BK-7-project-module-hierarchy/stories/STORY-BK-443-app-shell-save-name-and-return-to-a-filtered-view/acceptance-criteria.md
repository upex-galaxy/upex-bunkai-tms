# BK-443 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-443)

## AC-01 — Save the current filter combination under a name

```gherkin
Scenario: Save a filtered view
  Given I have narrowed a list with one or more filters
  When I save the current view and give it a name
  Then the view is saved under that name
  And it appears in my list of saved views for this surface
```

---

## AC-02 — Return to a saved view restores every filter it held

```gherkin
Scenario: Reopening a saved view restores the exact filter combination
  Given I saved a view with several filters set
  And I have since cleared or changed those filters
  When I open the saved view
  Then every filter it held is restored exactly as it was saved
  And the list shows the same narrowed results
```

---

## AC-03 — A saved view survives navigating away and back

```gherkin
Scenario: A saved view outlives the session that created it
  Given I saved a filtered view
  When I navigate away, reload the application, and return to that surface
  Then the saved view is still listed
  And opening it restores its filters
```

---

## AC-04 — Saved views are listed per surface

```gherkin
Scenario: Each surface offers only its own saved views
  Given I saved views on more than one filtered surface
  When I open the saved-view list on one of them
  Then I see only the views saved for that surface
```

---

## AC-05 — Rename a saved view

```gherkin
Scenario: Rename a saved view
  Given I have a saved view
  When I rename it
  Then it appears under the new name
  And the filters it holds are unchanged
```

---

## AC-06 — Update a saved view with the filters currently applied

```gherkin
Scenario: Overwrite a saved view with the current filters
  Given I opened a saved view and then changed its filters
  When I choose to update that saved view
  Then the saved view holds the filters I have applied now
  And no second view is created
```

---

## AC-07 — Delete a saved view

```gherkin
Scenario: Delete a saved view
  Given I have a saved view
  When I delete it and confirm
  Then it is no longer listed
  And the list I was viewing keeps the filters that were applied, unchanged
```

---

## AC-08 — A name must be given and must be unique for that surface

```gherkin
Scenario: Saving a view with a name already in use is refused
  Given I already have a saved view named "Failing payments"
  When I try to save another view on the same surface with that same name
  Then I am told the name is already used on this surface
  And no second view is created
```

---

## AC-09 — Saved views are private to the person who saved them

```gherkin
Scenario: One member's saved views are not visible to another
  Given another member of the same workspace saved a view
  When I open the saved-view list on that surface
  Then I do not see their saved view
```

---

## AC-10 — Saving with no filters set is refused

```gherkin
Scenario: An unfiltered list cannot be saved as a view
  Given no filter is applied to the list
  When I try to save the current view
  Then I am told there is nothing to save
  And no view is created
```

---

## AC-11 — No saved views yet reads as empty, not broken

```gherkin
Scenario: A surface with no saved views shows an explicit empty state
  Given I have never saved a view on this surface
  When I open its saved-view list
  Then I see an explicit "no saved views yet" state
  And an option to save the current one
```

---

## AC-12 — A saved view referring to something that no longer exists degrades cleanly

```gherkin
Scenario: A saved view whose module was archived still opens
  Given I saved a view filtered to a module
  And that module was archived afterwards
  When I open the saved view
  Then the view opens with the filters it can still apply
  And I am told which part of the saved filter no longer applies
  And the saved view is not silently deleted
```

---

## AC-13 — Opening a saved view leaves the list shareable by link

```gherkin
Scenario: Opening a saved view keeps the surface's link-shareable filter state consistent
  Given I am on a surface whose filters are reflected in its address
  When I open a saved view
  Then the address reflects the filters that view restored
  And copying it reproduces the same narrowed list for anyone who can already see that data
```

---
_Synced from Jira by sync-jira-issues_
