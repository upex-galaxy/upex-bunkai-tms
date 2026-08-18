# BK-212 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-212)

- Audiences: assignment events notify the new assignee only; status-change events notify the reporter and the current assignee, always excluding the user who made the change.
- Reassignment notifies the newly assigned user; the previously assigned user receives no removal notification in this story.
- The bug status vocabulary is owned by the Bugs epic ([https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31)); notifications display whatever status names that lifecycle defines, without inventing their own.
- Visibility follows the inbox rules: a user who loses access to the bug's project no longer sees its notifications.
- One status change produces at most one notification per recipient, even when reporter and assignee are the same person.

## Design intent

- Notification row shows a bug icon, the bug title, and a compact status transition ("open → in progress") or an "assigned to you" tag.
- Severity chip reuses the bug views' chip styles once [https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) defines them.

---
_Synced from Jira by sync-jira-issues_
