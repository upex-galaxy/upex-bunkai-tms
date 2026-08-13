# BK-439 — Out Of Scope

> Jira field: `customfield_10101` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-439)

- Search — narrowing the list by typing an ATC's name; delivered by `TMS-ATC Library | Find an ATC by name as you type`, which depends on this slice
- Facet filters — narrowing by Project, Module, layer, or anchor; delivered by `TMS-ATC Library | Narrow the index by Project, Module, layer and anchor`, which depends on the search slice
- Editing, creating, duplicating, or deleting an ATC from this screen — those actions remain inside the ATC's owning Project (TMS-ATC Builder, TMS-ATC API, TMS-ATC Duplicate)
- The Project-scoped ATC search/autocomplete toolbar inside a single Project's explorer — that stays the separately-scoped TMS-ATC Search story (BK-20), which remains independently blocked and is not resolved by this story
- Changing the "Test Runs", "Bug Reports", or "Metrics" sidebar destinations — they stay "Coming soon" by deliberate decision, not oversight
- Any grouping, bulk action, or export capability on the ATC list — this is a lookup surface, not a management surface

---
_Synced from Jira by sync-jira-issues_
