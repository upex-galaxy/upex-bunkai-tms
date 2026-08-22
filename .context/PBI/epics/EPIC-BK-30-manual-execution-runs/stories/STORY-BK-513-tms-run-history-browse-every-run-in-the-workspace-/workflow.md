# BK-513 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-513)

A QA Lead opens the app on Monday wanting one thing: what did the team actually execute last week. Today that means opening each Project's runs view in turn and holding the picture in his head. The sidebar has named a "Test Runs" destination all along, but it has been a greyed-out "soon" item he cannot even tab to.

Now it is a real destination, with a count beside it telling him how many Runs the workspace holds. He selects it and lands on a single list of every Run across every Project he can see, newest first. Each row tells him enough to judge it without opening anything: which Test ran, which Project it belongs to, which environment it ran against, whether it was executed by hand or by an automated executor, how it came out, when it started and finished, and how its steps broke down between passed, failed and blocked.

He narrows it. One Project, failures only — and the list intersects both, showing him just the failed Runs of the Project he cares about. He adds the staging environment and the automated executions, and it narrows again. When he wants the whole picture back, he clears the filters and the full list returns.

He finds the failure he was looking for and opens the row. The app takes him to that Run, inside its owning Project, where the execution detail already lives — this screen never opened a Run in place, and never let him change one.

If a filter combination matches nothing, he is told nothing matched, not that something broke. If the workspace has no Runs at all, he is told that plainly, and it reads as an empty workspace rather than a failure. If the list cannot load, he gets a named error and a retry that keeps the filters he had set, rather than dumping him back at the start.

And a Run from a workspace he does not belong to is never on the screen — not in the list, not among the Projects he can filter by, and not in the number beside the sidebar entry.

---
_Synced from Jira by sync-jira-issues_
