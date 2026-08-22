# BK-513 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-513)

- ***The access boundary is the workspace and nothing narrower.*** The index shows Runs from every Project of the caller's active workspace, for any caller holding an active membership at any role — Viewer included. This is the same boundary every shipped cross-project read already applies, and this screen must not invent a second, contradictory answer to "what can this user see"
- ***A Run belonging to a workspace the caller is not an active member of never appears*** — not in the list, not in a filter option, and not in the count on the sidebar entry. Cross-workspace isolation is absolute
- ***The count on the sidebar entry counts the same Runs the unfiltered list shows.*** It is not narrowed by the filters currently applied, and it never counts a Run the caller could not open
- ***The list is ordered newest first***, so the most recent execution is the first thing read. Recency is the ordering, not an option among several
- ***Filters compose as an intersection.*** Applying a Project filter and an outcome filter shows only Runs matching both, and clearing filters restores the full list
- ***A Run that is still running appears in the unfiltered list but is not a selectable outcome to filter by.*** This is the convention BK-38 already set for the Project-scoped list: "running" is a state a Run is passing through, not an outcome to select for
- ***Every Run in the workspace must be reachable from the list.*** A page size is a paging mechanism, never a cap: no Run that exists may be permanently unreachable because the list stopped early
- ***A workspace with no Runs is not an error.*** The empty state is visually and textually distinct from the failure state, and so is the no-match state that a filter combination can produce
- ***A failed load names what failed and offers a retry***, and the retry re-runs the same query with the filters the caller had applied still in place
- ***The screen never mutates a Run.*** Opening a row is a navigation, and it lands the caller on that Run inside its owning Project
- ***Outcome is stated in words, never by colour alone***, and the same is true of execution mode and every other state signal on the row

---
_Synced from Jira by sync-jira-issues_
