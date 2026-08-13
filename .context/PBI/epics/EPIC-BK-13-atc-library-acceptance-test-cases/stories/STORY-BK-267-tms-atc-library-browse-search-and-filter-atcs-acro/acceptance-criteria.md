# BK-267 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-267)

## AC-01 — Sidebar navigation

```
Scenario: The ATC Library is a live, reachable sidebar destination
  Given I am signed in and viewing any screen in the app
  When I look at the sidebar's "ATC Library" entry
  Then it is a real navigation link, not a disabled "Coming soon" item
  And selecting it takes me to the ATC Library
```

---

## AC-02 — Full unfiltered list

```
Scenario: The full unfiltered list shows every ATC across every Project I can see
  Given ATCs exist across several Projects in my workspace
  When I open the ATC Library with no search term or filter active
  Then I see a single dense list combining ATCs from every Project I can access
```

```
Scenario: The full list surfaces every ATC in the workspace, not just a shallow subset
  Given my workspace holds hundreds of ATCs across multiple Projects
  When I open the ATC Library with no search term or filter active
  Then I can reach every one of those ATCs from the list, whether by scrolling further or paging further
  And no artificial cap silently hides ATCs that exist
```

---

## AC-03 — Incremental search

```
Scenario: Search narrows the list incrementally as I type
  Given the full unfiltered list is showing
  When I type part of an ATC's name into the search field
  Then the list narrows to matching ATCs after each character I type, without requiring me to submit the search
```

---

## AC-04 — Keyboard shortcuts

```
Scenario: The "/" key focuses the search field from anywhere on the screen
  Given I am viewing the ATC Library with focus outside the search field
  When I press "/"
  Then focus moves to the search field
```

```
Scenario: Cmd+K (or Ctrl+K) focuses the search field
  Given I am viewing the ATC Library
  When I press Cmd+K (or Ctrl+K on non-Mac)
  Then focus moves to the search field
```

```
Scenario: Esc clears an active search term
  Given I have typed a search term into the search field
  When I press Esc while the search field is focused
  Then the search term is cleared
  And the list returns to reflect only the remaining active filters
```

---

## AC-05 — Combined filters (Project + Module + layer)

```
Scenario: Project, Module, and layer filters narrow the list together
  Given ATCs exist across several Projects, Modules, and layers
  When I set a Project filter, a Module filter, and a layer filter at the same time
  Then only ATCs matching all three active filters remain in the list
```

---

## AC-06 — Combined search + filter

```
Scenario: A search term and active filters narrow the list together
  Given I have a Module filter active
  When I also type a search term
  Then the list shows only ATCs that match both the search term and the active filter
```

---

## AC-07 — Clear all gesture

```
Scenario: Clearing all active search and filters restores the full list in one gesture
  Given I have an active search term and one or more active filters
  When I trigger "Clear all"
  Then my search term is cleared, every active filter is cleared, and the full unfiltered list is shown
```

---

## AC-08 — Empty states

```
Scenario: A search or filter combination that matches nothing reads as "nothing found," not an error
  Given no ATC matches my current search term and active filters
  When the list finishes narrowing
  Then I see an explicit "nothing found" empty state
  And nothing on the screen suggests something went wrong
```

```
Scenario: A workspace with no ATCs anywhere shows the same explicit not-an-error empty state
  Given my workspace has not created any ATC yet
  When I open the ATC Library
  Then I see the same "nothing found" empty state used for a no-match search or filter
  And nothing on the screen reads as an error
```

---

## AC-09 — Error + loading states

```
Scenario: A failed ATC query shows a named error with a retry path
  Given the ATC index fails to load
  When I open or refresh the ATC Library
  Then I see an explicit error state naming what failed
  And I can retry the same query from that error state
```

```
Scenario: The list shows a loading state while ATCs are still being fetched
  Given I just opened the ATC Library
  When the ATCs have not finished loading yet
  Then I see a loading state in place of the list
  And no partial or stale row data is shown as if it were final
```

---

## AC-10 — Row content

```
Scenario: Each row surfaces what I need to evaluate reuse without opening the ATC
  Given an ATC exists in the workspace
  When I see its row in the list
  Then I can read its ATC id, its name, its owning Project, its Module, its layer (paired with a text label, never color alone), its anchored User Story and Acceptance Criterion, and how many Tests reference it
```

---

## AC-11 — Navigation to owning project

```
Scenario: Opening an ATC launches into its owning Project, not an inline editor
  Given the list shows an ATC named "Login with expired token" that belongs to Project "Checkout"
  When I open that ATC's row
  Then I land inside the "Checkout" Project's context where that ATC lives
  And a toast confirms I was taken to the "Checkout" Project
  And no in-place edit surface opens on this screen
```

---

## AC-12 — Access control

```
Scenario: An ATC in a Project I cannot access never appears in the index
  Given an ATC exists in a Project I am not a member of
  When I open or search the ATC Library
  Then that ATC never appears in the list, in any filter facet, or in any search result
```

---

## AC-13 — Single-project workspace

```
Scenario: A workspace with a single Project still renders the cross-project list and filters correctly
  Given my workspace has exactly one Project
  When I open the ATC Library
  Then the list and the Project filter behave the same as with multiple Projects, just with one Project available to filter by
```

---

## AC-14 — Other sidebar items unaffected

```
Scenario: The other undecided sidebar destinations are unaffected
  Given I am viewing the sidebar
  When I look at "Test Runs", "Bug Reports", and "Metrics"
  Then they remain disabled "Coming soon" items, unchanged by this story
```

---
_Synced from Jira by sync-jira-issues_
