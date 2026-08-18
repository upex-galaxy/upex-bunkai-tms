# BK-215 — Business Rules

> Jira field: `customfield_10054` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-215)

- ***Visibility = membership***: the general channel is visible only to members of its Workspace; leaving the Workspace removes access to the channel and its history.
- ***Write access by role***: viewers are read-only; members, admins, and owners can write. Roles follow the workspace RBAC ladder (viewer, member, admin, owner).
- ***One channel per Workspace***: the general channel is created automatically with the Workspace and cannot be deleted or renamed.
- ***Message bounds***: a message is 1 to 4000 characters after trimming; empty or whitespace-only messages are rejected.
- ***Ordering***: messages display in the order they were sent; history is retained for the life of the Workspace in this iteration (no auto-purge).

### Design intent

- Chat lives in a right-side collapsible panel of the app shell — consistent with the [https://jira.upexgalaxy.com/browse/BK-147#icft=BK-147](https://jira.upexgalaxy.com/browse/BK-147#icft=BK-147) tabbed-explorer patterns — so it can stay open next to ATCs, Tests, and Runs without stealing the main work area.
- The panel holds a channel header, a scrollable message list (newest at the bottom), and a composer pinned to the bottom.
- Presence dots on member avatars show who is currently online.
- An unread separator line marks the first message the member has not seen yet.
- Empty state: a friendly prompt inviting the first message when a channel has no history.

---
_Synced from Jira by sync-jira-issues_
