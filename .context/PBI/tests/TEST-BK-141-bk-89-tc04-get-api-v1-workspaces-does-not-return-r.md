# TEST: BK-89: TC04: GET /api/v1/workspaces does not return role field — BLOCKER confirmed

**Jira Key:** [BK-141](https://jira.upexgalaxy.com/browse/BK-141)
**Status:** READY
**Components:** None

---

## Test Description

## TC04 — Role Field Absent From Response — Story Blocker

***Group******:*** A-GET

***Precondition******:***

- Authenticated user (QA bot) with a valid Bearer PAT
- User has at least one workspace membership with a known, non-default role (e.g. admin or owner) in `workspace_members.role`

***Steps******:***

1. GET /api/v1/workspaces with Authorization: Bearer <token>
2. Inspect each workspace object in the response body
3. Check for presence of a `role` field on each object
4. Cross-check the DB: query `workspace_members.role` for the same user/workspace pairing

***Expected******:***

- Each workspace object includes a `role` field reflecting the user's membership role, matching `workspace_members.role` for that user/workspace pairing
- Satisfies AC 1 (role label displayed) and AC 4 (role-based display logic)

***Auth******:*** Bearer PAT

---

## Related Issues

- tests: [BK-89](https://jira.upexgalaxy.com/browse/BK-89) - TMS-Workspace | View the workspaces I belong to

---

## Metadata

- **Created:** 6/12/2026
- **Updated:** 7/14/2026
- **Reporter:** Carlos Alberto Chiavassa
- **Assignee:** Carlos Alberto Chiavassa
- **Labels:** deferred

---

_Synced from Jira by sync-jira-issues_
