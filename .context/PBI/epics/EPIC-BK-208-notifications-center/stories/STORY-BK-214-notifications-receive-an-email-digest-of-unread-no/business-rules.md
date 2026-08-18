# BK-214 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-214)

- At most one digest email per user per day, sent only when at least one eligible unread notification exists at send time.
- Eligibility: the item is unread AND its event type has the email channel enabled in the user's preferences.
- Grouping is by project; items the user can no longer access (membership or visibility lost) are excluded at send time.
- The digest never changes read state — receiving or opening the email leaves every item unread until the user reads it in the app.
- Digest content honors the same visibility rules as the inbox; it never leaks entities the user cannot open.

## Design intent

- Email is a clean single-column summary: workspace greeting, then one section per project with its count and up to a handful of one-line items, then a single prominent open-inbox button.
- Overflow beyond the per-project item cap collapses into "and N more" lines to keep the email scannable.
- Visual language (logo, accent color, chip-like verdict labels) mirrors the app so the email is recognizably Bunkai.

---
_Synced from Jira by sync-jira-issues_
