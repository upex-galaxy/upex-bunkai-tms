# BK-398 — Workflow

> Jira field: `customfield_10104` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

1. The QA Engineer is anywhere inside the app shell — a Project's tree view, an open ATC tab, the sidebar itself.
2. They press ⌘K, or click the sidebar's search control.
3. The command palette opens as an overlay, input focused, empty.
4. They type part of a name — an ATC, a Test, a Project, a Module, a Bug, or a Run.
5. Results appear grouped under a heading per entity type, scoped to the workspace they are currently in.
6. They move between results with the arrow keys, or point at one with the mouse.
7. They press Enter, or select a result directly.
8. The palette closes and they land on that entity's own screen, ready to keep working.

If they open the palette and type nothing, they see a guiding empty state instead of a blank box. If they type a query that matches nothing, they see an explicit "no results" state rather than an empty list that looks broken. If they press Esc at any point, the palette closes and they stay exactly where they were.

---
_Synced from Jira by sync-jira-issues_
