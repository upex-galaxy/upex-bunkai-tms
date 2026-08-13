# BK-267 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-267)

A QA Engineer or QA Lead opens the sidebar and selects "ATC Library," now a live destination instead of a disabled "Coming soon" item. They land on a dense, unfiltered index of every ATC across every Project they can see, communicating the real scale of the workspace rather than a shallow preview.

They type a few characters (or press `/` or Cmd+K to jump straight to the search field) to narrow the list by name; the list narrows incrementally as they type, with no need to submit a search. They add a Project, Module, layer, or User Story / Acceptance Criterion filter, and the list narrows further, combining every active facet together. When they want a clean slate, they trigger "Clear all" and the list returns to its full unfiltered state in one gesture.

Once they find the ATC they were looking for, they open its row. The app takes them into that ATC's owning Project, with a toast confirming which Project they landed in — this screen never opens an in-place editor. If their search or filter combination matches nothing (including a brand-new workspace with no ATCs yet), the screen shows an explicit "nothing found" state, not an error. If the underlying ATC index fails to load, the screen shows a named error with a retry action.

---
_Synced from Jira by sync-jira-issues_
