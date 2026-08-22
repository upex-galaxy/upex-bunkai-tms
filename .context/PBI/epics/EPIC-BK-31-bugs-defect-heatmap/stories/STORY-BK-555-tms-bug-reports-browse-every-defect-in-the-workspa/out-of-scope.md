# BK-555 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-555)

- ***Everything BK-41 already does at Project scope.*** `/projects/[projectSlug]/bugs` keeps its route, its module-subtree rollup, its status and severity filters, its counts and its heatmap view exactly as they are. This screen is a workspace-wide sibling, not a replacement, and BK-41 is not migrated onto it
- ***A module filter.*** Module names repeat across Projects and a module is only meaningful inside its own Project's tree, so a workspace-wide module picker would need a cross-project, project-qualified module list that nothing in the product has today. Module-tree triage stays where it belongs, on BK-41's Project-scoped list; see the AI Product Owner ruling on this ticket
- ***A workspace-wide defect heatmap.*** BK-42 owns the per-module heatmap and it is Project-scoped by construction, since its cells are modules of one Project's tree. A workspace-level heat view is a separate question for the Metrics destination, which remains unbuilt
- ***Making "Metrics" live.*** It stays a non-focusable "soon" item exactly as D18 ratified — its destination still does not exist, so D18's reasoning still holds for it. Only the "Bug Reports" entry changes here. "Test Runs" is BK-513's to change, on the same path, and this story neither depends on nor blocks it
- ***Assigning a defect, advancing its status, or editing it from this screen.*** BK-264 owns triage actions and they stay on the Project-scoped list and the defect record. This index is a lookup-and-launch surface
- ***Filing a defect from this screen.*** Filing stays where the failing context is, in the Test Runner's Report-bug drawer (BK-40) and the Project-scoped form
- ***Cross-workspace browsing.**** The index covers the caller's ****active*** workspace. It never merges defects from several workspaces, even for someone who belongs to more than one
- ***Filtering by assignee, by reporter, by date range, or by whether a defect came from a Run.*** This slice ships the three filters that make a cross-project list navigable and leaves the rest to a follow-up
- ***Free-text search over defect titles or descriptions***, saved views, grouping, bulk actions, or exporting the list
- ***Trend, rate, ageing or time-to-resolve analysis.*** Counts on this screen are point-in-time totals; anything derivative belongs to the Metrics destination
- ***A new defect-record screen.*** Rows deep-link to BK-337's existing record route; no new detail surface is designed here
- ***Syncing anything to an external tracker.*** BK-371, BK-372 and BK-373 own defect sync and none of it is touched

---
_Synced from Jira by sync-jira-issues_
