# BUG: TMS-Workspace: API: POST /api/v1/me/active-workspace returns legacy fields {ok, active_workspace_id} alongside fix fields

**Jira Key:** [BK-118](https://jira.upexgalaxy.com/browse/BK-118)
**Priority:** Low
**Status:** Closed
**Components:** Account & Settings, Project & Module Hierarchy
**Severity:** Menor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Summary

The fix for [https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83](https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83) added the required fields `{id, slug, name, role`} to the `POST /api/v1/me/active-workspace` response, but the legacy fields `ok: true` and `active*workspace*id` were not removed.

---

## Current response shape on staging (2026-06-12)

```json
{
  "ok": true,
  "active*workspace*id": "<workspace_id>",
  "id": "<workspace_id>",
  "slug": "<workspace_slug>",
  "name": "<workspace_name>",
  "role": "member|owner"
}
```

---

## Expected response shape after cleanup

```json
{
  "id": "<workspace_id>",
  "slug": "<workspace_slug>",
  "name": "<workspace_name>",
  "role": "member|owner"
}
```

---

## Impact

Additive — no current consumer is broken. Cleanup to keep the API contract clean and avoid confusion for future consumers who may rely on the legacy fields being present.

---

## File to change

`upex-bunkai-tms/app/api/v1/me/active-workspace/route.ts`

Remove `ok: true` and `active*workspace*id` from the `jsonResponse` call.

---

## Related

- [https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83](https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83) — original bug, now closed (fix verified on staging 2026-06-12)

---

## 🔍 Root Cause

**Category:** Code Error

---

## Related Issues

- relates to: [BK-83](https://jira.upexgalaxy.com/browse/BK-83) - WorkspaceSwitch: API: POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role)
- relates to: [BK-262](https://jira.upexgalaxy.com/browse/BK-262) - PAT | Enforce capability scopes on every non-ATC route

---

## Metadata

- **Created:** 6/11/2026
- **Updated:** 8/2/2026
- **Reporter:** Luis Eduardo Flores Villarroel
- **Assignee:** Luis Eduardo Flores Villarroel
- **Labels:** tech-debt

---

_Synced from Jira by sync-jira-issues_
