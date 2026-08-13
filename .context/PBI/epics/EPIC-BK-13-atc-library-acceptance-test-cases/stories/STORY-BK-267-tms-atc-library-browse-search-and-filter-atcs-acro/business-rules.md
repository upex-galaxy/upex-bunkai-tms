# BK-267 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-267)

- Active filters (Project, Module, layer, User Story / Acceptance Criterion) combine with AND semantics — they narrow the list together, never as alternatives (OR)
- The layer signal (UI / API / Unit) always pairs its color with a text label; color is never the only signal for layer, or for any other state on this screen
- The list only ever shows ATCs belonging to a Project the caller can access — an ATC in a Project the caller cannot read never appears in the index, in a filter facet, or in a search result
- Opening a row is lookup-and-launch only: it never mutates the ATC, and it always names the destination Project the caller is being taken to
- The "nothing found" state (no search/filter matches, or a workspace with no ATCs yet) is explicitly not an error — it is visually and textually distinct from the query-failure error state
- The full unfiltered list must let the caller reach every ATC that exists in the workspace; no artificial cap silently hides ATCs that are really there

---
_Synced from Jira by sync-jira-issues_
