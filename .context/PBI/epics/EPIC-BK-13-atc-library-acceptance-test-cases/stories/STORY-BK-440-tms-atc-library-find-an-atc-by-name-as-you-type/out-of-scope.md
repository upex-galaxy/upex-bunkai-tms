# BK-440 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-440)

- Facet filters (Project, Module, layer, anchor) — delivered by `TMS-ATC Library | Narrow the index by Project, Module, layer and anchor`, which depends on this slice
- The browse surface itself (route, sidebar entry, badge, row content, navigation, screen states) — delivered by `TMS-ATC Library | Browse every ATC in the workspace from one index`, which this slice depends on
- ***The Cmd+K / Ctrl+K keyboard shortcut — retired from this story.*** BK-267's AC-04 named it, but Cmd+K is the command-palette binding and BK-398 (`Command palette: search and jump across the workspace`) already delivers an app-shell overlay spanning six entity types including ATCs on that same chord. Two different behaviours on one chord is a defect waiting to be filed, so it is retired here by decision, not oversight. "/" and Esc are the shortcuts this screen owns.
- Matching on ATC id — this slice matches name only; id matching is a small, additive follow-up if anyone asks for it later
- Semantic or AI-assisted search — only fast, incremental name-based search, matching how search already behaves elsewhere in the product
- Editing, creating, duplicating, or deleting an ATC from this screen
- The Project-scoped ATC search/autocomplete toolbar inside a single Project's explorer (BK-20)

---
_Synced from Jira by sync-jira-issues_
