# BK-441 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-441)

- Active filters (Project, Module, layer, User Story / Acceptance Criterion) combine with AND semantics — they narrow the list together, never as alternatives (OR)
- The layer signal (UI / API / Unit) always pairs its color with a text label; color is never the only signal for layer, or for any other state on this screen
- "Clear all" clears the search term and every active filter in the same gesture, restoring the full unfiltered list
- Every active filter is carried in the URL query string under the same replace semantics the search slice established, so filtering never adds a Back stop

---
_Synced from Jira by sync-jira-issues_
