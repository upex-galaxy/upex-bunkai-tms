# BK-443 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-443)

- A saved view belongs to the member who saved it and is visible to no one else, consistent with the owner-only access already defined on `user*view*state`
- A saved view is scoped to one Project and one surface; it never restores onto a different Project or a different surface
- A saved view must have a name, and the name is unique per member, per Project, per surface
- Saving requires at least one filter to be applied; an unfiltered list is not a view worth naming
- Opening a saved view replaces the filters currently applied, rather than merging with them
- Updating a saved view overwrites the filters it held and never creates a second view
- Deleting a saved view removes only the view; it never changes the filters currently applied to the list
- A saved filter value whose target no longer exists or was archived is reported as no longer applicable; the remaining filters still apply and the saved view is not deleted on the member's behalf
- Saving, renaming, updating or deleting a view changes nothing about the data being filtered
- Restoring a saved view never widens what a member can see; a view restores filters, and row visibility stays governed by the member's existing access

---
_Synced from Jira by sync-jira-issues_
