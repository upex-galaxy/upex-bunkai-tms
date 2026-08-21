# BK-513 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-513)

- ***Comparing one Run against another.*** BK-442 owns run-to-run comparison and its comparison view is recorded in the design plan as mockup-gated and unratified. This index is linked to BK-442 as the natural host for that comparison later; it does not build it
- ***Changing the Project-scoped runs surfaces.*** `/projects/[projectSlug]/runs` (BK-38) and a Test's own history (BK-37) keep their routes, their filters and their totals exactly as they are. This screen is a workspace-wide sibling, not a replacement, and neither existing screen is migrated onto it
- ***Making "Bug Reports" or "Metrics" live.*** They stay non-focusable "soon" items exactly as D18 ratified — their destinations still do not exist, so D18's reasoning still holds for them. Only the "Test Runs" entry changes
- ***Starting, resuming, aborting or finishing a Run from this screen.*** Execution stays where it lives, in the Run itself
- ***Cross-workspace browsing.**** The index covers the caller's ****active*** workspace. It never merges Runs from several workspaces, even for someone who belongs to more than one
- ***Workspace-wide pass/fail totals, trends, flakiness scoring or any charting.*** Per-run step counts appear on each row; an aggregate figure recomputed over the filtered set — BK-38's convention at Project level — is not promised here, and rate or trend analysis belongs to the Metrics destination, which remains unbuilt
- ***Filtering by date range or by Module.*** BK-38 offers both at Project level; this slice ships the four filters that make a cross-project list navigable, and leaves the rest to a follow-up
- ***Free-text search over Runs***, saved views, grouping, bulk actions, or exporting the list
- ***A run-detail screen for a finished Run.*** Rows deep-link to the existing Run route; no new detail surface is designed here

---
_Synced from Jira by sync-jira-issues_
