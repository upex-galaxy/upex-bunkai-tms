# Comments for BK-6

[View in Jira](https://jira.upexgalaxy.com/browse/BK-6)

---

### Ely - 5/19/2026, 9:05:45 PM

🧱 ****Architect Annotation****

**Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.**

1. 

- Component: `<WorkspaceSwitcher />` in `app/layout.tsx` header.
- Hook: `useActiveWorkspace()` consuming `AuthContext`.

1. 

- Routes:
- `GET app/api/v1/me/workspaces/route.ts`
- `POST app/api/v1/me/active-workspace/route.ts`
- Middleware updated to read `active*workspace*id` from session on every request.

1. 

- Tables: `workspace_members` (status field).
- Session: stored in Supabase cookie + read by `lib/supabase/server.ts`.

1. 

- [https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4](https://jira.upexgalaxy.com/browse/BK-4#icft=BK-4) (workspace creation) — need ≥2 workspaces to switch between.

1. 

- API middleware tenancy scoping (relied upon by every subsequent epic).

1. 

- [ ] All 4 AC scenarios pass on staging.
- [ ] API middleware verified — every protected route reads active*workspace*id.
- [ ] UI switcher renders correctly when user has 1, 2, and 10+ workspaces.
- [ ] Suspended-membership path returns 403 (not 404 / not silent success).

---

### Ely - 5/27/2026, 8:50:24 PM

Implementado este sprint.

Code on main:

- f0d36d0 feat(workspaces): active-workspace switch via cookie + /me introspection (bk-6)

Surfaces ready for QA:

- GET /api/v1/me — returns user + workspaces[] + active*workspace*id (resolved from bk*active*ws cookie; falls back to oldest workspace).
- POST /api/v1/me/active-workspace — membership-validated workspace selection; sets httpOnly cookie bk*active*ws (sameSite=lax, 90d).
- WorkspaceSwitcher (Topbar dropdown) fetches /api/v1/me lazily, calls switch endpoint on selection, router.refresh on success. Footer link to members page.

Cross-tenant guard: RLS continues to filter every query; switching the cookie does not grant access — only narrows the active scope in the UI. Verify by signing in as a second user and querying the first user's workspace_id directly — expect 0 rows.

Testability guide: /qa + Jira Epic [https://jira.upexgalaxy.com/browse/BK-29#icft=BK-29](https://jira.upexgalaxy.com/browse/BK-29#icft=BK-29).

---

### Luis Eduardo Flores Villarroel - 6/6/2026, 6:32:38 PM

## Acceptance Test Plan (ATP) — BK-6

***Stage 1 Planning completed:*** 2026-06-06
***Risk Score:*** 13/15 — HIGH
***TCS Planned:*** 4
***Surface Coverage:*** UI + API + DB

> Full ATP stored in field: 🧪 Acceptance Test Plan (ATP)
This comment is the diff-history mirror per jira-native modality.

---

### Risk Summary

Score 13/15 — HIGH. Veto override: auth + data integrity → Full ATP mandatory.

***Top risks:***

1. ***DEF-001 (to file in Stage 2):*** API response schema mismatch — spec requires `{ id, slug, name, role }` but implementation returns `{ ok: true, active*workspace*id }`. TC1 will fail this assertion.
2. ***DISC-003 (test and report):*** AC3 suspended error code may not be `MEMBERSHIP_SUSPENDED` — RLS-based rejection may return generic code. TC3 captures actual code.
3. ***Session data leak risk:*** If tenancy scoping fails, data from the wrong workspace could leak. TC1 verifies scoping post-switch.

***Accepted discrepancies:***

- DISC-002: Navigation to `/projects` instead of `/home` — ACCEPTED (no `/home` route; spec stale).

---

### TC Outlines

| TC | AC | Type | Priority | Test Data |
|----|----|------|----------|-----------|
| TC1 | AC1 | Positive — API + DB | Critical | FROM: Bünkāï QA → TO: Extra Test |
| TC2 | AC2 | Negative — API | Critical | Non-member workspace `bd947203` |
| TC3 | AC3 | Negative — API + DB | Critical | Suspended membership `c828d131` (BK5 Test Workspace) |
| TC4 | AC4 | Positive — UI + Integration | High | Switcher + reload persistence |

---

### Pre-test DB Check for TC3

```sql
SELECT status FROM workspace_members
WHERE user_id = '0cdfea29-cbf7-4762-b4aa-f6d152492f43'
AND workspace_id = 'c828d131-f1c7-413c-9ba4-723fa1c45c00';
-- Expected: status = 'suspended'
```

***Post-TC3 cleanup (mandatory):***

```sql
UPDATE workspace_members SET status = 'active'
WHERE user_id = '0cdfea29-cbf7-4762-b4aa-f6d152492f43'
AND workspace_id = 'c828d131-f1c7-413c-9ba4-723fa1c45c00';
```

---

### Execution Order

TC2 → TC3 → TC1 → TC4 (negatives first to avoid state contamination; reset active workspace between TC1 and TC4)

---

**ATP posted by QA Engineering — Stage 1 Planning | 2026-06-06**

---

### Luis Eduardo Flores Villarroel - 6/6/2026, 6:43:02 PM

Bug found during exploratory testing (Stage 2 Execution, TC1): BK-83 — WorkspaceSwitch: API: POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role). Severity: Moderate | Env: Staging | Error Type: Functional

---

### Luis Eduardo Flores Villarroel - 6/6/2026, 6:58:13 PM

## Acceptance Test Results (ATR)

BK-6 TEST RESULTS
Tested: 2026-06-06
Environment: Staging (https://staging-upexbunkai.vercel.app)
Tester: Luis Flores
Result: FAILED (3/4 TCs passed, 1 blocking defect)

SUMMARY
  Tested workspace switching feature: API endpoint for active workspace mutation, membership validation (non-member, suspended), and UI switcher persistence. Switch mechanism works correctly (cookie rotation, tenancy scope, UI persistence). Blocked on BK-83 until the switch endpoint returns the full workspace payload per AC1 spec.

TEST CASES
  TC1: Successful workspace switch updates context ... FAILED
  TC2: Switch to non-member workspace returns 403 ... PASSED
  TC3: Switch with suspended membership returns 403 ... PASSED
  TC4: UI switcher reflects correct workspace after switch + reload ... PASSED

TEST DATA
  User: bunkai-staging-userlf@ambuusteln.resend.app (user_id: 2742da39-e0ff-4f0c-a0a1-88dae804e14f)
  Workspace From: Bunkai QA (a808499e-f437-43b8-9fdb-8cee7dcceb3e)
  Workspace To: Extra Test (9a2c3de7-18af-45e5-a36f-e0ef9377af69)
  Workspace Non-Member: bd947203-5318-4724-9608-7676c7af83c0
  Workspace Suspended: BK5 Test Workspace (c828d131-f1c7-413c-9ba4-723fa1c45c00)

BUGS FOUND
  BK-83 - MODERATE: POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role)

OBSERVATIONS
  OBS-001: 403 error codes use generic 'forbidden' instead of NOT*A*MEMBER / MEMBERSHIP_SUSPENDED. API relies on RLS, not explicit status enum. Spec uses custom codes not implemented. Per PO decision: non-blocking.
  OBS-002: Workspace switcher only visible when workspace has at least 1 project (expected UX, not a bug).
  DB-CLEANUP: Suspended membership row for BK5 Test Workspace restored to active after TC3.

RECOMMENDATIONS
  Fix BK-83 (return full workspace payload from switch endpoint), then re-run TC1.
  TC2, TC3, TC4 are automation candidates for regression suite.

---

### Luis Eduardo Flores Villarroel - 6/6/2026, 6:58:16 PM

## QA Result: BLOCKED

QA Testing Complete - BK-6

Environment: Staging (https://staging-upexbunkai.vercel.app)
Result: FAILED (3/4 TCs passed, 1 blocking defect)

TEST DATA USED:
  User: bunkai-staging-userlf@ambuusteln.resend.app
  Workspace From: Bunkai QA (a808499e-f437-43b8-9fdb-8cee7dcceb3e)
  Workspace To: Extra Test (9a2c3de7-18af-45e5-a36f-e0ef9377af69)

VERIFIED BEHAVIORS:
  TC2 - Switch to non-member workspace: 403 returned, session unchanged - VERIFIED
  TC3 - Switch with suspended membership: 403 returned, session unchanged - VERIFIED
  TC4 - UI switcher persistence after reload: Correct workspace shown before and after reload - VERIFIED

FAILED VERIFICATION:
  TC1 - Successful workspace switch updates context - FAILED
    Expected: 200 with response body containing id, slug, name, role per AC1 spec
    Actual: 200 with response body {ok: true, active*workspace*id} only - fields id/slug/name/role missing
    Impact: Any consumer reading workspace fields from switch response gets undefined values

DEFECT: BK-83 - POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role)

NON-BLOCKING OBSERVATIONS:
  OBS-001: 403 error codes use generic forbidden instead of NOT*A*MEMBER / MEMBERSHIP_SUSPENDED - API relies on RLS. Per PO decision: non-blocking.
  OBS-002: Workspace switcher requires at least 1 project to render (expected UX, not a bug).

NEXT STEPS:
  Fix BK-83, then re-run TC1, re-evaluate for QA Approved.

Artifacts: ATP posted on BK-6, ATR posted on BK-6, BK-83 filed and linked as blocker.

---

### Ely - 6/10/2026, 6:48:07 PM

## ✅ Blocking defect resolved — story resumed

The defect blocking this story is fixed, merged to staging, and now in ***Ready For QA***:

| Bug | Status | Fix evidence |
| --- | --- | --- |
| BK-83 — POST /api/v1/me/active-workspace response missing workspace fields (id, slug, name, role) | Ready For QA | PR #32 merged to staging · verification details in the bug's fix comment |

This story has been moved back to ***In Test*** so testing can resume. Please re-test the defect and continue the story run.

---


_Synced from Jira by sync-jira-issues_
