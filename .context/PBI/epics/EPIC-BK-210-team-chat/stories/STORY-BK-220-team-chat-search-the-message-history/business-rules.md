# BK-220 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-220)

- ***Visibility parity***: search sees exactly what the member sees — accessible channels only; no result counts, snippets, or hints may leak from inaccessible channels.
- ***Tombstones excluded***: deleted messages are not searchable; edited messages are searchable by their current text only.
- ***Scope***: search covers the member's current Workspace (general channel + accessible project channels); cross-workspace search is out.
- ***Filters are conjunctive***: channel + author + date filters combine with AND semantics.
- ***Result order***: newest first by default.

### Design intent

- Search opens from a search icon in the chat panel header and expands into a results view inside the panel (list stays keyboard-navigable), consistent with the app's existing search patterns.
- Filter chips (channel, author, date) sit under the search input; active chips are removable in one click.
- Result rows: channel badge, author, date, and the snippet with the match highlighted.
- Selecting a result transitions the panel back to the channel, scrolled to the message with a short highlight pulse.

---
_Synced from Jira by sync-jira-issues_
