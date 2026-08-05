# BUG: WorkspaceSwitch: API: POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role)

**Jira Key:** [BK-83](https://jira.upexgalaxy.com/browse/BK-83)
**Priority:** Medium
**Status:** Closed
**Components:** Tenancy & Identity

---

## Description

## Summary

POST /api/v1/me/active-workspace returns a minimal response body `{ ok: true, active*workspace*id }` instead of the workspace details `{ id, slug, name, role }` required by AC1 of BK-6. Any UI consumer that reads workspace name, slug, or role from the switch response will get undefined fields and must make an additional GET /me call to display the new workspace context.

---

## Steps to Reproduce

1. Authenticate as any active workspace member (e.g. staging user with memberships in Bünkāï QA and Extra Test).
2. POST /api/v1/me/active-workspace with body: `{"workspace_id": "9a2c3de7-18af-45e5-a36f-e0ef9377af69"}`
3. Inspect the HTTP response body.

---

## Actual Result

HTTP 200 with body:

```
{ "ok": true, "active*workspace*id": "9a2c3de7-18af-45e5-a36f-e0ef9377af69" }
```

Fields `id`, `slug`, `name`, and `role` are absent from the response.

## Expected Result

HTTP 200 with body containing the new active workspace details:

```
{ "id": "string", "slug": "string", "name": "string", "role": "string" }
```

---

## Technical Analysis

- ***File:*** `/app/api/v1/me/active-workspace/route.ts` (Next.js route handler)
- ***Function:*** POST handler — sets `bk*active*ws` cookie then returns `{ ok: true, active*workspace*id }` without querying workspace details
- ***Network:*** POST /api/v1/me/active-workspace → 200 `{"ok":true,"active*workspace*id":"..."}`
- ***Root cause:*** Route handler does not perform a follow-up query for workspace name/slug/role after updating the active workspace cookie.

---

## Impact

- UI WorkspaceSwitcher must perform a second GET /me call to display the new workspace name — extra round trip on every switch.
- Frontend code consuming the switch response expecting `name`/`slug`/`role` will receive `undefined`.
- Spec (BK-6 AC1) explicitly defines the response contract — implementation is non-compliant.

---

## Related Stories

- Related: BK-6 (AC1 — Successful workspace switch)

---

***Error Type***: Functional
***Severity***: Moderate
***Test Environment***: Staging
***Fix***: bugfix

---

## Related Issues

- blocks: [BK-6](https://jira.upexgalaxy.com/browse/BK-6) - TMS-Workspace | Switch between workspaces
- relates to: [BK-118](https://jira.upexgalaxy.com/browse/BK-118) - TMS-Workspace: API: POST /api/v1/me/active-workspace returns legacy fields {ok, active_workspace_id} alongside fix fields

---

## Metadata

- **Created:** 6/6/2026
- **Updated:** 6/26/2026
- **Reporter:** Luis Eduardo Flores Villarroel
- **Assignee:** Luis Eduardo Flores Villarroel
- **Labels:** api, bug, exploratory-testing, tenancy

---

_Synced from Jira by sync-jira-issues_
