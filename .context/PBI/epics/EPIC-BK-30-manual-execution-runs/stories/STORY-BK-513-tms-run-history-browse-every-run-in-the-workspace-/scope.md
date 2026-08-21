# BK-513 — Scope

> Jira field: `customfield_10055` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-513)

- A `/runs`*** route*** — a workspace-scoped index of Runs, sitting at the top level of the app rather than nested under a Project, in the same way the global ATC Library sits at `/atcs`
- The sidebar's ***"Test Runs"**** entry becomes a live, focusable destination instead of a non-focusable "soon" item, carrying a ****real count*** of the Runs the caller can see in the active workspace
- One row ***per Run***, combining Runs from every Project the caller can see in the active workspace into a single list
- Per row: the ***Test**** that was run, its owning ****Project****, the ****environment**** it ran against, its ****execution mode****, its ****outcome****, when it ****started**** and ****finished***, and how its steps came out — how many passed, failed and were blocked
- The list is ordered ***newest first***
- ***Filters*** on Project, outcome, environment and execution mode, composing with each other so several can be applied at once, and a way to clear them and return to the full list
- Every Run in the workspace is reachable from the list — by paging or by scrolling further — with ***no artificial cap*** silently hiding Runs that exist
- Opening a row ***navigates into the Run*** inside its owning Project, at the existing Run route; this screen reads Runs, it never executes or edits one
- Screen states: default, filtered, no-match-after-filtering, empty workspace, loading, and a named error with a retry that preserves the filters

---
_Synced from Jira by sync-jira-issues_
