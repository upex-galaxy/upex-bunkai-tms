# BK-555 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-555)

## AC-01 — The sidebar entry becomes a live destination

```gherkin
Scenario: "Bug Reports" is a real navigation link, not a "soon" placeholder
  Given I am signed in and viewing any screen in the app
  When I look at the sidebar's "Bug Reports" entry
  Then it is a real navigation link, not a non-focusable "soon" item
  And I can reach it by keyboard
  And selecting it takes me to the workspace's Bug Reports index
```

## AC-02 — The entry carries a real count

```gherkin
Scenario: The count beside "Bug Reports" counts the defects I can actually see
  Given defects exist across several Projects in my active workspace
  When I look at the sidebar's "Bug Reports" entry
  Then it shows a count of the defects I can see in the active workspace
  And that count matches the number of defects the unfiltered index lists
  And the count counts defects of every status, not only the open ones
  And the count does not change when I apply a filter on the index
```

## AC-03 — No other sidebar destination changes

```gherkin
Scenario: Metrics stays "soon" and nothing else moves
  Given the "Bug Reports" entry is now live
  When I look at the sidebar's "Metrics" entry
  Then it is still a non-focusable "soon" item
  And it cannot be reached by keyboard or by selecting it
  And no sidebar entry other than "Bug Reports" changed its state because of this work
```

## AC-04 — The index lists defects from every Project I can see

```gherkin
Scenario: One list across the whole workspace
  Given defects exist in several different Projects of my active workspace
  When I open the Bug Reports index with no filter applied
  Then I see a single list combining defects from every Project in the workspace
  And defects from more than one Project appear together in that one list
```

## AC-05 — Each row carries what a triage decision needs

```gherkin
Scenario: A row is readable without opening the defect
  Given the Bug Reports index is showing at least one defect
  When I read one of its rows
  Then it shows the defect's identifier and its title
  And it shows the Project the defect belongs to
  And it shows the full module path of the module it was filed against
  And it shows its severity in words, not by colour alone
  And it shows its status in words, not by colour alone
  And it shows who it is assigned to, or that it is unassigned
  And it shows whether it came from a Run
```

## AC-06 — Two Projects with same-named modules stay distinguishable

```gherkin
Scenario: Identical module names in different Projects do not blur together
  Given two Projects in my workspace each hold a module named "Payments"
  And a defect is filed against each of them
  When I open the Bug Reports index
  Then each of the two rows names its own Project
  And each shows its own full module path
  And I can tell the two defects apart without opening either
```

## AC-07 — Most severe first, then most recently filed

```gherkin
Scenario: The worst defect in the workspace is read first
  Given defects of different severities were filed at different times across several Projects
  When I open the Bug Reports index
  Then the defects are ordered from most severe to least severe
  And defects of the same severity are ordered from most recently filed to least
  And that ordering still holds after I apply a filter
```

## AC-08 — Filtering by Project

```gherkin
Scenario: Narrowing the index to one Project
  Given the index is showing defects from several Projects
  When I filter by one Project
  Then only defects belonging to that Project remain in the list
  And the Projects I can choose from are only Projects of my active workspace
```

## AC-09 — Filtering by status

```gherkin
Scenario: Narrowing the index to one or more statuses
  Given the index is showing defects that are open, in progress, resolved and closed
  When I filter by a status
  Then only defects in that status remain in the list
```

## AC-10 — Filtering by severity

```gherkin
Scenario: Narrowing the index to one or more severities
  Given the index is showing defects of several severities
  When I filter by a severity
  Then only defects of that severity remain in the list
```

## AC-11 — Filters compose, and can be cleared

```gherkin
Scenario: Several filters applied at once intersect
  Given the index is showing defects from several Projects with several statuses
  When I filter by one Project and by one status at the same time
  Then only defects matching both remain in the list
  When I clear the filters
  Then the full unfiltered list returns
```

## AC-12 — Counts cover the whole filtered set, not the visible page

```gherkin
Scenario: The counts answer "how much is broken", not "how much is on screen"
  Given the Bug Reports index is showing defects across several Projects
  When I read the counts on the screen
  Then I see how many defects there are of each severity
  And I see how many defects there are in each status
  And those counts cover every defect matching the current filters,
    not only the rows currently loaded
  When I apply a filter
  Then the counts recompute over the newly filtered set
```

## AC-13 — No defect is silently unreachable

```gherkin
Scenario: The index surfaces every defect in the workspace, not a shallow subset
  Given my workspace holds hundreds of defects across several Projects
  When I open the Bug Reports index with no filter applied
  Then I can reach every one of those defects from the list,
    whether by scrolling further or paging further
  And no artificial cap silently hides defects that exist
```

## AC-14 — Empty workspace state

```gherkin
Scenario: A workspace with no defects says so, and it is not an error
  Given no defect has ever been filed in my workspace
  When I open the Bug Reports index
  Then I am told there are no defects yet
  And nothing on the screen reads as an error
```

## AC-15 — No-match state after filtering

```gherkin
Scenario: A filter combination that matches nothing is distinct from a failure
  Given the index is showing defects
  When I apply a filter combination that matches no defect
  Then I am told that no defect matches the current filters
  And that state is visually and textually distinct from the error state
  And the counts read as zero rather than disappearing
  And I can clear the filters from there to get the full list back
```

## AC-16 — Loading state

```gherkin
Scenario: The index reports that it is loading
  Given I open the Bug Reports index
  When the defects have not arrived yet
  Then the screen shows that it is loading
  And it does not present an empty list as though there were no defects
```

## AC-17 — Error state with a retry that keeps my filters

```gherkin
Scenario: A failed load names the failure and can be retried in place
  Given I have applied filters on the Bug Reports index
  When the list fails to load
  Then I see an explicit error state naming what failed
  And I can retry from that error state
  And the retry runs with the filters I had applied still in place
```

## AC-18 — Run-linked and manually filed defects both appear

```gherkin
Scenario: A defect with no Run is a quiet state, not a broken one
  Given my workspace holds defects filed from a failing Run step
  And it also holds defects filed manually, with no Run behind them
  When I open the Bug Reports index
  Then both kinds appear in the same list
  And a defect that came from a Run shows that it did
  And a defect with no Run reads as filed manually, not as an error or a missing value
```

## AC-19 — Defects on archived modules stay hidden here too

```gherkin
Scenario: The workspace index is not a back door to what the Project list hides
  Given a defect was filed against a module that has since been archived
  When I open the Bug Reports index with no filter applied
  Then that defect does not appear in the list
  And it is not counted in the severity or status counts
  And it is not counted beside the sidebar entry
```

## AC-20 — A defect from another workspace never leaks

```gherkin
Scenario: Isolation holds across the list, the filters and the count
  Given I belong to two workspaces, each holding its own defects, and one of them is active
  When I open the Bug Reports index
  Then only defects belonging to the active workspace appear in the list
  And no Project of the other workspace appears among the Projects I can filter by
  And the count beside the sidebar entry counts only the active workspace's defects
```

## AC-21 — A workspace with a single Project renders correctly

```gherkin
Scenario: The cross-project index still works when there is one Project
  Given my workspace has exactly one Project, holding several defects
  When I open the Bug Reports index
  Then every one of those defects is listed
  And the Project column and the Project filter still behave correctly
```

## AC-22 — Every active member reaches the same index

```gherkin
Scenario: The access boundary is the workspace and nothing narrower
  Given I hold an active membership of the workspace at the Viewer role
  When I open the Bug Reports index
  Then I see defects from every Project of that workspace
  And no Project of my own workspace is withheld from me because of my role
```

## AC-23 — Opening a row lands on that defect in its owning Project

```gherkin
Scenario: The index is a lookup-and-launch surface
  Given the Bug Reports index is showing a defect
  When I open that row
  Then I land on that defect's full record inside its owning Project
  And no defect is assigned, reassigned, advanced or edited in place on the index
```

## AC-24 — The index is operable by keyboard

```gherkin
Scenario: A keyboard-only user can reach, filter and open a defect
  Given I am navigating by keyboard only
  When I reach the sidebar's "Bug Reports" entry and activate it
  Then I land on the Bug Reports index
  And I can reach and operate every filter without a pointer
  And I can open a row without a pointer
```

---
_Synced from Jira by sync-jira-issues_
