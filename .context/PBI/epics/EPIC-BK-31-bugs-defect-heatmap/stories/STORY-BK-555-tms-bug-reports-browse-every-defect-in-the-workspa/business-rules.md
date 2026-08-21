# BK-555 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-555)

- ***The access boundary is the workspace and nothing narrower.*** The index shows defects from every Project of the caller's active workspace, for any caller holding an active membership at any role — Viewer included. This is the same boundary every shipped cross-project read already applies, and this screen must not invent a second, contradictory answer to "what can this user see"
- ***A defect belonging to a workspace the caller is not an active member of never appears*** — not in the list, not in a filter option, not in the counts, and not in the count on the sidebar entry. Cross-workspace isolation is absolute
- ***The count on the sidebar entry counts the same defects the unfiltered list shows.*** It spans every status rather than only the open ones, it is not narrowed by the filters currently applied, and it never counts a defect the caller could not open. A count that means one thing beside "Bug Reports" and another beside "Projects" or "ATC Library" is a worse product than a slightly less interesting number
- ***Severity is the primary ordering and recency is the tie-breaker.*** The most severe defect in the workspace is the first thing read; within one severity the most recently filed comes first. This is the ordering the Project-scoped list already uses for the same entity, and it is not an option among several
- ***Filters compose as an intersection.*** Applying a Project filter and a status filter shows only defects matching both, and clearing filters restores the full list
- ***The counts describe the filtered set, never the loaded page.*** A caller who has paged twice and a caller who has just arrived read the same totals for the same filters
- ***A defect filed against an archived module is excluded here exactly as it is excluded from the Project-scoped list.*** Archiving a module is how a team retires an area; a workspace-wide index that resurrected its defects would make archiving meaningless
- ***A defect cannot outlive the Project it names.*** Projects have no soft-delete in this product and a defect is removed with its Project, so this index never has to render a defect whose Project is gone, and it must not invent a state for one
- ***Every defect in the workspace must be reachable from the list.*** A page size is a paging mechanism, never a cap: no defect that exists may be permanently unreachable because the list stopped early
- ***A workspace with no defects is not an error.*** The empty state is visually and textually distinct from the failure state, and so is the no-match state that a filter combination can produce
- ***A failed load names what failed and offers a retry***, and the retry re-runs the same query with the filters the caller had applied still in place
- ***The screen never mutates a defect.*** Opening a row is a navigation, and it lands the caller on that defect's full record inside its owning Project
- ***Severity and status are stated in words, never by colour alone***, and the same is true of every other state signal on the row

---
_Synced from Jira by sync-jira-issues_
