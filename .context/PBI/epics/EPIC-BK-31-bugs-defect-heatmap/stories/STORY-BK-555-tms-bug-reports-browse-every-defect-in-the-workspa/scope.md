# BK-555 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-555)

- A `/bugs` route — a workspace-scoped index of defects, sitting at the top level of the app rather than nested under a Project, in the same way the global ATC Library sits at `/atcs`
- The sidebar's ***"Bug Reports"**** entry becomes a live, focusable destination instead of a non-focusable "soon" item, carrying a ****real count*** of the defects the caller can see in the active workspace
- One row ***per defect***, combining defects from every Project of the caller's active workspace into a single list
- Per row: the defect's ***identifier**** and ****title****, its owning ****Project****, the ****full module path**** it was filed against, its ****severity****, its ****status****, its ****assignee****, and whether it came from a ****Run***
- The list is ordered ***most severe first****, and within one severity ****most recently filed first***
- ***Filters*** on Project, status and severity, composing with each other so several can be applied at once, and a way to clear them and return to the full list
- ***Counts by severity and by status*** covering the whole filtered set rather than the visible page, recomputing whenever the filters change
- Every defect in the workspace is reachable from the list — by paging or by scrolling further — with ***no artificial cap*** silently hiding defects that exist
- Defects filed against an archived module are excluded, the same way the Project-scoped list already excludes them
- Opening a row ***navigates to that defect's full record*** inside its owning Project; this screen reads defects, it never files, assigns, advances or edits one
- Screen states: default, filtered, no-match-after-filtering, empty workspace, loading, and a named error with a retry that preserves the filters

---
_Synced from Jira by sync-jira-issues_
