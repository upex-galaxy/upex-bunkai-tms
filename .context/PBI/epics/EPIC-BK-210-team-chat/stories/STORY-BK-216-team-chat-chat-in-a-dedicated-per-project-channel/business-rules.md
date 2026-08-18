# BK-216 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-216)

- ***Visibility = project access***: a project channel is visible only to members who can access that Project; revoking project access removes the channel and its history from that member immediately.
- ***Lifecycle follows the Project***: the channel is created with the Project; archiving or deleting the Project archives its channel (history preserved for members who retain access through the Workspace record).
- ***Write access by role***: same RBAC ladder as the workspace channel — viewers read-only, member and above write, moderation is admin and above.
- ***Message bounds and ordering***: same rules as the workspace general channel (1–4000 characters trimmed, chronological order, history retained).

### Design intent

- The chat panel gains a compact channel switcher at the top: workspace general channel pinned first, then the member's project channels with unread badges.
- Opening a Project (via the [https://jira.upexgalaxy.com/browse/BK-147#icft=BK-147](https://jira.upexgalaxy.com/browse/BK-147#icft=BK-147) tabbed explorer) nudges the chat panel to that project's channel, without losing the member's scroll position elsewhere.
- Channel names inherit the project name and stay in sync when the project is renamed.
- Empty state per project channel invites the first project-scoped message.

---
_Synced from Jira by sync-jira-issues_
