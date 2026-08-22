# BK-209 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-209)

- A notification is personal: each recipient has their own copy with its own read/unread state.
- Notifications respect workspace membership and entity visibility — a user never sees a notification about an entity they cannot access, and losing access also hides the related notifications.
- A user's own actions never generate a notification to themselves.
- Retention window: notifications older than 90 days are removed automatically.
- The unread badge shows the exact count up to 99, then "99+".

## Design intent

- Bell icon sits in the top bar next to the account menu, following the placement pattern established by the account entry ([https://jira.upexgalaxy.com/browse/BK-86#icft=BK-86](https://jira.upexgalaxy.com/browse/BK-86#icft=BK-86)).
- Panel is anchored to the bell, items grouped by day (Today, Yesterday, then dates), each row showing an entity icon, one-line summary, and relative time.
- Mark-all-as-read is a quiet text action in the panel header; a "view all" footer can grow into a full page later.
- Empty state shows a friendly illustration and one line of copy, consistent with the app's existing empty states.

---
_Synced from Jira by sync-jira-issues_
