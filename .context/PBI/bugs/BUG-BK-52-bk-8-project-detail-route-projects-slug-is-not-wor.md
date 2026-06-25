# BUG: BK-8: Project detail route /projects/{slug} is not workspace-scoped

**Jira Key:** [BK-52](https://jira.upexgalaxy.com/browse/BK-52)
**Priority:** Medium
**Status:** Closed
**Components:** None
**Fix Type:** Bugfix

---

## Description

## Summary

The project detail route `/projects/{slug}` is not scoped by workspace. Project slugs are unique only **per workspace**, but the detail URL omits the workspace, so slug resolution crosses workspace boundaries. When the same slug exists in two of the user's workspaces, one project becomes unreachable.

## Environment

Staging — https://staging-upexbunkai.vercel.app · 2026-06-04 · cookie-session auth as `bunkai-staging-user` (member of two workspaces).

## Severity / Type

Severity: ***Major**** · Error type: ****functional*** (navigation / data addressability).

## Steps to Reproduce

1. As one user, create two workspaces: WS1 (`qa-bk8…`, set active) and WS2 (`qa-bk8b…`).
2. Create a project `Checkout v2` (slug `checkout-v2`) in BOTH workspaces — both succeed 201 (per-workspace uniqueness, correct).
3. With WS1 active, navigate to `/projects/checkout-v2`.
4. Separately, create a project that exists ONLY in WS2 (slug `hi-project`) and, with WS1 still active, navigate to `/projects/hi-project`.

## Expected Result

Detail navigation is scoped to the active workspace (per Workflow AC step 9: `/workspaces/{ws-slug}/projects/{project-slug}`). A slug present in another workspace should not resolve under the active workspace; both same-named projects must remain independently addressable.

## Actual Result

- `/projects/checkout-v2` loads the ***WS2**** project (breadcrumb "QA BK-8 Second WS / Checkout v2") even though WS1 is active — the WS1 `checkout-v2` is ****unreachable***.
- `/projects/hi-project` loads the WS2 project while WS1 is active — the route ***crosses the active-workspace boundary***.

## Impact

Per-workspace slug uniqueness (a core design rule, and an explicit AC: "same slug valid across different workspaces") is undermined at the navigation layer. A multi-workspace user cannot reach all of their projects. Not a cross-tenant leak (RLS still limits to member workspaces), but a real addressability/navigation defect and a deviation from Workflow AC step 9.

## Evidence

`test-session-memory.md` (UI-3 row) + screenshot `evidence/bug-crossworkspace-checkout-v2.png`.

---

## 🔍 Root Cause

**Category:** Code Error

---

## Related Issues

- is duplicated by: [BK-55](https://jira.upexgalaxy.com/browse/BK-55) - BK-8: Project detail route /projects/{slug} is not workspace-scoped

---

## Metadata

- **Created:** 6/3/2026
- **Updated:** 6/15/2026
- **Reporter:** Ely
- **Assignee:** Nahuel Gomez
- **Labels:** bk-8, sprint-defect, wave-1

---

_Synced from Jira by sync-jira-issues_
