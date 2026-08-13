# BK-440 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-440)

- Search matches the ATC's name only, never its id
- Typing into the search field narrows the list after each character, without a submit step
- The search term is carried in the URL under replace semantics, so it never adds a Back stop; opening an ATC row is a real navigation, so Back from the ATC restores the exact term that was active
- The "nothing found" state for a no-match search is explicitly not an error — visually and textually distinct from the query-failure error state
- "/" and Esc are the only keyboard shortcuts this screen owns; Cmd+K / Ctrl+K is deliberately not wired here, reserved for BK-398's command palette

---
_Synced from Jira by sync-jira-issues_
