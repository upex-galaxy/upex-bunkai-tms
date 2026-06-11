# BK-98 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-98)

## Scenario: View switcher offers Tree, Table and Mind map

Given a project is open in the workbench
When I look at the project toolbar
Then I see a Tree / Table / Mind map toggle
And selecting ***Tree*** shows the explorer next to a read-only ATC detail pane (NOT the ATC table)
And selecting ***Table*** shows a full-width ATC table
And selecting ***Mind map*** shows an SVG topology (module -> US -> ATC)

## Scenario: Tree view opens ATCs in a detail pane with tabs

Given the Tree view is active
When I click an ATC in the explorer
Then it opens in a read-only detail pane on the right (not a full-page navigation)
And an open-ATC tab appears for it; opening more ATCs adds more tabs
And each tab is closeable and the active tab's row is highlighted in the tree
And the detail pane shows the slug, status, layer, module path, title, the linked user story with its acceptance-criteria checkboxes (bound ACs checked), the Steps and Assertions (read-only) and tags
And an ***Edit*** action opens the full ATC editor at /atcs/{id}
And a modifier-click or middle-click on an ATC still opens the full editor in a new tab

## Scenario: Mind map modes degrade gracefully without run/bug data

Given the Mind map view is active
When I inspect the available modes
Then ***Topology*** mode is interactive
And ***Coverage**** and ****Bug-density*** modes are visibly disabled and labelled "soon"

## Scenario: Run history and coverage surfaces are deferred

Given the Tree detail pane or the Mind map
When run/test data does not exist yet
Then the run-result banner, the Run action and "Used by N tests" are omitted with a note that they arrive with the test runner

## Scenario: Explorer status filter chips with live counts

Given a project that has at least one ATC
When I view the explorer header
Then I see filter chips all / fail / blocked / unrun each showing a live count
And the chips are hidden when the project has 0 ATCs
And selecting a chip filters the tree to matching ATCs

## Scenario: User-story rows behave as accordions with nested ATCs

Given a module containing user stories with ACs and ATCs
When I view the explorer tree
Then each user-story row is collapsed by default
And toggling it reveals its AC and ATC children
And each ATC nests under its user story showing the ATC slug (not a UUID)
And the user-story issue key renders on a single line without wrapping

## Scenario: Create an ATC from a story or acceptance criterion

Given a user story (or one of its ACs) in the explorer
When I use the "Create ATC" shortcut on that row
Then I am taken to /atcs/new with story and ac query params
And the editor opens with module, story and AC pre-anchored

## Scenario: Right-click context menu on tree rows

Given a module, story or ATC row in the explorer
When I right-click the row
Then a context menu appears with Open, New sub-module, New story, Rename, Move, Copy ID and Delete
And Duplicate is present but disabled ("soon")

## Scenario: Collapse and resize the explorer panel

Given the explorer panel is visible
When I drag the divider between the explorer and the content
Then the panel resizes within a 220-520px range
And I can collapse the panel to a rail and restore it

## Scenario: Design fidelity to the master design plan

Given the Projects screen implementation
When it is reviewed against the design contract
Then it renders into the Projects screen per master-design-plan §4.3 and mockup `screens/project.jsx`
And it matches the frozen design contract (master-design-plan §2)
And every departure from the mockup is ratified in §5 (see divergence D8)

---
_Synced from Jira by sync-jira-issues_
