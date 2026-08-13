# BK-439 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-439)

A QA Engineer or QA Lead opens the sidebar and selects "ATC Library," now a live destination instead of a disabled "Coming soon" item, with a badge showing how many ATCs they can read in the workspace. They land on a dense, unfiltered index of every ATC across every Project they can see, communicating the real scale of the workspace rather than a shallow preview.

Each row carries enough detail — ATC id, name, owning Project, Module, layer, anchored User Story / Acceptance Criterion, and usage count — to judge whether the ATC is reusable without opening anything. Once they find the ATC they were looking for, they open its row. The app takes them into that ATC's owning Project, with a toast confirming which Project they landed in — this screen never opens an in-place editor.

If the workspace has no ATCs yet, the screen shows an explicit "nothing found" state, not an error. If the underlying ATC index fails to load, the screen shows a named error with a retry action.

Search and filtering are not part of this slice — they arrive in the two stories that depend on it.

---
_Synced from Jira by sync-jira-issues_
