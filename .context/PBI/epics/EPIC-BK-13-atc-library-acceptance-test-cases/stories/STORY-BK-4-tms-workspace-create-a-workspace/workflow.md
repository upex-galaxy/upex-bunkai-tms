# BK-4 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-4)

1. Authenticated user clicks "Create Workspace".

2. UI shows name input + slug preview computed client-side.

3. User submits.

4. POST /api/v1/workspaces with { name }.

5. Server validates name length + alphanumeric requirement.

6. Server derives slug, checks reserved list + global uniqueness.

7. Insert workspaces row in transaction with workspace_members row (role=owner).

8. Emit workspace.created event.

9. Return 201 with { workspace_id, slug }.

10. UI navigates to new workspace's home.

---
_Synced from Jira by sync-jira-issues_
