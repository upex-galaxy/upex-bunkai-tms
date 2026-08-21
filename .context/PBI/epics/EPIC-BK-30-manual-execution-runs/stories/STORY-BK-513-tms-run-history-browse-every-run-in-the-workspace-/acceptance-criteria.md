# BK-513 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-513)

## AC-01 — The sidebar entry becomes a live destination

```gherkin
Scenario: "Test Runs" is a real navigation link, not a "soon" placeholder
  Given I am signed in and viewing any screen in the app
  When I look at the sidebar's "Test Runs" entry
  Then it is a real navigation link, not a non-focusable "soon" item
  And I can reach it by keyboard
  And selecting it takes me to the workspace's Test Runs index
```

## AC-02 — The entry carries a real count

```gherkin
Scenario: The count beside "Test Runs" counts the Runs I can actually see
  Given Runs exist across several Projects in my active workspace
  When I look at the sidebar's "Test Runs" entry
  Then it shows a count of the Runs I can see in the active workspace
  And that count matches the number of Runs the unfiltered index lists
  And the count does not change when I apply a filter on the index
```

## AC-03 — The other unbuilt destinations are unchanged

```gherkin
Scenario: Bug Reports and Metrics stay "soon"
  Given the "Test Runs" entry is now live
  When I look at the sidebar's "Bug Reports" and "Metrics" entries
  Then both are still non-focusable "soon" items
  And neither can be reached by keyboard or by selecting it
```

## AC-04 — The index lists Runs from every Project I can see

```gherkin
Scenario: One list across the whole workspace
  Given Runs exist in several different Projects of my active workspace
  When I open the Test Runs index with no filter applied
  Then I see a single list combining Runs from every Project I can access
  And Runs from more than one Project appear together in that one list
```

## AC-05 — Each row carries what is needed to judge it

```gherkin
Scenario: A row is readable without opening the Run
  Given the Test Runs index is showing at least one Run
  When I read one of its rows
  Then it shows the Test that was run and the Project the Run belongs to
  And it shows the environment the Run ran against and its execution mode
  And it shows the Run's outcome, stated in words and not by colour alone
  And it shows when the Run started and, when it has finished, when it finished
  And it shows how many of its steps passed, failed and were blocked
```

## AC-06 — The list is newest first

```gherkin
Scenario: The most recent Run is read first
  Given Runs were started at different times across several Projects
  When I open the Test Runs index
  Then the Runs are ordered from most recently started to least
  And that ordering still holds after I apply a filter
```

## AC-07 — Filtering by Project

```gherkin
Scenario: Narrowing the index to one Project
  Given the index is showing Runs from several Projects
  When I filter by one Project
  Then only Runs belonging to that Project remain in the list
  And the Projects I can choose from are only Projects I can access
```

## AC-08 — Filtering by outcome

```gherkin
Scenario: Narrowing the index to a single outcome
  Given the index is showing Runs with different outcomes
  When I filter by an outcome
  Then only Runs with that outcome remain in the list
```

## AC-09 — A Run still running is listed but is not an outcome to filter by

```gherkin
Scenario: Running is a state passed through, not an outcome to select
  Given a Run in my workspace is still running
  When I open the Test Runs index with no filter applied
  Then that Run appears in the list, shown as still running
  When I look at the outcomes I can filter by
  Then "running" is not one of them
```

## AC-10 — Filtering by environment

```gherkin
Scenario: Narrowing the index to one environment
  Given Runs in my workspace ran against different environments
  When I filter by one environment
  Then only Runs that ran against that environment remain in the list
```

## AC-11 — Filtering by execution mode

```gherkin
Scenario: Separating what a person ran from what an executor ran
  Given my workspace holds both Runs executed by a person and Runs executed automatically
  When I filter by execution mode
  Then only Runs matching that mode remain in the list
```

## AC-12 — Filters compose, and can be cleared

```gherkin
Scenario: Several filters applied at once intersect
  Given the index is showing Runs from several Projects with several outcomes
  When I filter by one Project and by one outcome at the same time
  Then only Runs matching both remain in the list
  When I clear the filters
  Then the full unfiltered list returns
```

## AC-13 — No Run is silently unreachable

```gherkin
Scenario: The index surfaces every Run in the workspace, not a shallow subset
  Given my workspace holds hundreds of Runs across several Projects
  When I open the Test Runs index with no filter applied
  Then I can reach every one of those Runs from the list,
    whether by scrolling further or paging further
  And no artificial cap silently hides Runs that exist
```

## AC-14 — Empty workspace state

```gherkin
Scenario: A workspace that has never run anything says so, and it is not an error
  Given no Run has ever been executed in my workspace
  When I open the Test Runs index
  Then I am told there are no Runs yet
  And nothing on the screen reads as an error
```

## AC-15 — No-match state after filtering

```gherkin
Scenario: A filter combination that matches nothing is distinct from a failure
  Given the index is showing Runs
  When I apply a filter combination that matches no Run
  Then I am told that no Run matches the current filters
  And that state is visually and textually distinct from the error state
  And I can clear the filters from there to get the full list back
```

## AC-16 — Loading state

```gherkin
Scenario: The index reports that it is loading
  Given I open the Test Runs index
  When the Runs have not arrived yet
  Then the screen shows that it is loading
  And it does not present an empty list as though there were no Runs
```

## AC-17 — Error state with a retry that keeps my filters

```gherkin
Scenario: A failed load names the failure and can be retried in place
  Given I have applied filters on the Test Runs index
  When the list fails to load
  Then I see an explicit error state naming what failed
  And I can retry from that error state
  And the retry runs with the filters I had applied still in place
```

## AC-18 — Opening a row lands on that Run in its owning Project

```gherkin
Scenario: The index is a lookup-and-launch surface
  Given the Test Runs index is showing a Run belonging to one of my Projects
  When I open that row
  Then I land on that Run inside its owning Project
  And no Run is opened, edited or executed in place on the index
```

## AC-19 — A Run from another workspace never leaks

```gherkin
Scenario: Isolation holds across the list, the filters and the count
  Given I belong to two workspaces, each holding its own Runs, and one of them is active
  When I open the Test Runs index
  Then only Runs belonging to the active workspace appear in the list
  And no Project of the other workspace appears among the Projects I can filter by
  And the count beside the sidebar entry counts only the active workspace's Runs
```

## AC-20 — A workspace with a single Project renders correctly

```gherkin
Scenario: The cross-project index still works when there is one Project
  Given my workspace has exactly one Project, holding several Runs
  When I open the Test Runs index
  Then every one of those Runs is listed
  And the Project column and the Project filter still behave correctly
```

## AC-21 — The index is operable by keyboard

```gherkin
Scenario: A keyboard-only user can reach, filter and open a Run
  Given I am navigating by keyboard only
  When I reach the sidebar's "Test Runs" entry and activate it
  Then I land on the Test Runs index
  And I can reach and operate every filter without a pointer
  And I can open a row without a pointer
```

---
_Synced from Jira by sync-jira-issues_
