# BK-32 — Business Rules

> Jira field: `customfield_10116` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-32)

- The expanded view is read-only; it never offers any control to change, add, remove, or reorder content
- ATCs are always shown in the Test's saved running order, never alphabetically or by creation date
- Each ATC occupies exactly one position in the chain — positions are sequential with no gaps and no duplicates
- Within each ATC, steps are shown in their own order, followed by that ATC's assertions
- The view always reflects the latest saved version of each ATC, because a Test references its ATCs rather than keeping its own copies
- A Test with zero ATCs is valid to open and shows an empty state rather than an error
- Requesting a Test that does not exist returns a clear not-found message, not a blank or broken screen
- Any workspace member who can see the Test can open this view; no extra permission is required beyond viewing the Test

---
_Synced from Jira by sync-jira-issues_
