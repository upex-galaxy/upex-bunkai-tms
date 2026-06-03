# BK-8 — Workflow

> Jira field: `customfield_10082` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-8)

1. Workspace member navigates to Workspace Home, clicks "Create Project".

2. UI shows name input + optional description textarea + slug preview.

3. User submits.

4. POST /api/v1/workspaces/{id}/projects with { name, description }.

5. Server validates membership.

6. Server derives slug, checks per-workspace uniqueness.

7. Insert projects row.

8. Return 201 with { project_id, slug }.

9. UI navigates to /workspaces/{ws-slug}/projects/{project-slug}.

---
_Synced from Jira by sync-jira-issues_
