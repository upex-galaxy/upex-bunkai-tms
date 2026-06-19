# BK-147 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-147)

- Read access is unchanged: Elena only sees, and can only open, items in projects she already has access to.
- Opening an item never mutates it — the workbench tabs are read-and-navigate surfaces; editing remains gated by its own stories.
- An item that no longer exists (deleted) or that the user cannot see shows a safe not-found state inside the workbench, not a separate broken page.
- The same item opened twice focuses the existing tab instead of creating a duplicate.
- A navigation destination the user cannot access, or that does not yet exist, is shown visibly disabled rather than as a dead link.
- The account block always reflects the actual signed-in user; no placeholder identity is ever shown.
- Open tabs belong to a single project; opening another project starts from that project's workbench index.

---
_Synced from Jira by sync-jira-issues_
