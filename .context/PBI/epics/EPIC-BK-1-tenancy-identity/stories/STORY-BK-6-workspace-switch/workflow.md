# BK-6 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-6)

1. User clicks the workspace switcher in the header.

2. Dropdown shows list of workspaces from GET /api/v1/me/workspaces.

3. User clicks Workspace B.

4. UI POSTs /api/v1/me/active-workspace with { workspace_id: "B" }.

5. Server validates membership + status.

6. Server rotates session's active*workspace*id.

7. Returns 200 with the new workspace context.

8. UI navigates to /home (Workspace B's home).

9. All subsequent requests carry the new context.

---
_Synced from Jira by sync-jira-issues_
