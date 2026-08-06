# BK-6 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-6)

# Acceptance Test Plan — BK-6

***Story:*** TMS-Workspace | Switch between workspaces
***Jira:*** https://upexgalaxy69.atlassian.net/browse/BK-6
***Date:*** 2026-06-06
***Environment:*** Staging (https://staging-upexbunkai.vercel.app)
***TMS Modality:*** jira-native
***Authored by:*** QA Engineering

---

## Story Summary

Multi-tenant workspace switcher. An authenticated user belonging to multiple workspaces can change which workspace is "active" without logging out. The API validates membership status, rotates the `bk*active*ws` httpOnly cookie, and all subsequent API responses scope data to the new workspace. The UI header reflects the active workspace immediately and after page reload.

***Key implementation detail:*** The API sets a `bk*active*ws` cookie (httpOnly, sameSite: lax, maxAge: 90 days). The JWT session is never invalidated — only the scope cookie changes. RLS on the `workspaces` table enforces membership: non-members get a 403 because RLS returns empty results, not because a separate membership check rejects them explicitly.

---

## Scope

***In scope:***

- POST /api/v1/me/active-workspace endpoint
- Session `active*workspace*id` rotation via `bk*active*ws` cookie
- Membership status check (only `status = "active"` members can switch)
- UI workspace switcher in header (workspace list, active indicator)
- GET /api/v1/me/workspaces endpoint (membership list)

***Out of scope:***

- Workspace context in URL path (architecture decision deferred)
- Recent / favorite workspaces UI (Phase 2)
- Cross-workspace search (Phase 3)

---

## Risk Assessment

- ***Score:*** 13/15 — HIGH
- ***Veto override:*** Auth + data integrity = REQUIRE TESTING (Full ATP mandatory)
- ***Surface coverage:*** UI + API + DB (triforce)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Response schema mismatch: API returns `{ok, active*workspace*id}` but AC1 spec requires `{id, slug, name, role}` | High | Confirmed | TC1 captures defect during execution; PO decision = file defect |
| AC3 suspended error code: RLS-based rejection may return generic `forbidden` instead of `MEMBERSHIP_SUSPENDED` | High | High | TC3 tests and reports exact error code; PO decision = file defect if code differs |
| Session data leak: scoped data from Workspace A served after switch to Workspace B | High | Medium | TC1 verifies GET /api/v1/me reflects new workspace after switch |
| RLS bypass: non-member or suspended member gains access via direct cookie manipulation | High | Low | TC2 + TC3 cover both authorization enforcement paths |
| UI staleness: workspace switcher shows wrong active workspace after switch or after reload | Medium | Medium | TC4 covers post-switch display and reload persistence |
| Cookie security: `bk*active*ws` not httpOnly in development; could be read/manipulated by XSS in staging | Medium | Low | Note only — not in test scope for this sprint |

---

## Data Feasibility Check

| AC | Precondition | Data found? | Pattern | Notes |
|----|--------------|-------------|---------|-------|
| AC1 | User active in ≥2 workspaces | Yes | Discover | Test user (0cdfea29) active in 12 workspaces |
| AC2 | User NOT a member of target workspace | Yes | Discover | `bd947203-5318-4724-9608-7676c7af83c0` (Bunkaiqa) — confirmed non-member |
| AC3 | User has `status="suspended"` membership for target workspace | Yes | Modify | Inserted 2026-06-06 via RW API: workspace `c828d131` (BK5 Test Workspace), status=suspended |
| AC4 | Same as AC1 — post-switch UI state | Yes | Discover | Reuses AC1 switch result |

---

## Known Issues / Pre-existing Discrepancies

### DEF-001 (to file during execution)

***Defect description:*** POST /api/v1/me/active-workspace response schema mismatch

- ***Spec (AC1):*** `{ id, slug, name, role }` — returns the new workspace context
- ***Actual implementation:*** `{ ok: true, active*workspace*id: "<uuid>" }` — omits workspace name, slug, and role
- ***PO Decision:*** Report as defect. Spec is correct; implementation missing fields.
- ***Impact:*** TC1 will FAIL on response body assertion; defect to be filed during Stage 2 execution.

### DISC-002 (accepted — skip test)

***Navigation discrepancy:*** AC implicit behavior says `/home` (from workflow spec step 8)

- ***Actual implementation:*** `router.replace('/projects')` — no `/home` route exists
- ***PO Decision:*** SKIP / ACCEPTED — `/projects` is correct behavior; spec is stale.
- ***Impact:*** TC4 asserts navigation to `/projects`, not `/home`.

### DISC-003 (TEST AND REPORT)

***AC3 error code:*** Spec requires `MEMBERSHIP_SUSPENDED`

- ***Actual implementation:*** RLS-based check — if `workspace*members.status` affects RLS filtering, the response may be generic `403` or `NOT*A*MEMBER` rather than `MEMBERSHIP*SUSPENDED`
- ***PO Decision:*** Test and report if error code doesn't match.
- ***Impact:*** TC3 captures actual error code; file defect if it differs from `MEMBERSHIP_SUSPENDED`.

---

## Test Cases

### TC1: BK-6: TC1: Validate successful workspace switch updates active workspace context

***Type:*** Positive — API + DB
***Priority:*** Critical
***AC:*** AC1 — Successful workspace switch

***Preconditions:***

- Test user (`STAGING*USER*EMAIL`) is authenticated in staging
- User is active member of both source workspace (Bünkāï QA) and target workspace (Extra Test)
- Current active workspace: `a808499e-f437-43b8-9fdb-8cee7dcceb3e` (Bünkāï QA)

***Test data:***

```json
{
  "user_id": "0cdfea29-cbf7-4762-b4aa-f6d152492f43",
  "from*workspace*id": "a808499e-f437-43b8-9fdb-8cee7dcceb3e",
  "from*workspace*name": "Bünkāï QA",
  "to*workspace*id": "9a2c3de7-18af-45e5-a36f-e0ef9377af69",
  "to*workspace*name": "Extra Test",
  "endpoint": "POST /api/v1/me/active-workspace"
}
```

***Steps:***

1. Authenticate via POST /api/v1/auth/login with `STAGING*USER*EMAIL` / `STAGING*USER*PASSWORD`
2. Verify: GET /api/v1/me → confirms `active*workspace*id = a808499e-f437-43b8-9fdb-8cee7dcceb3e` (current workspace is Bünkāï QA)
3. POST /api/v1/me/active-workspace with body `{ "workspace_id": "9a2c3de7-18af-45e5-a36f-e0ef9377af69" }`
4. Verify: HTTP status code = 200
5. Verify: Response body — ***note: DEF-001 expected here*** — actual response is `{ "ok": true, "active*workspace*id": "9a2c3de7-18af-45e5-a36f-e0ef9377af69" }` (spec requires `{ id, slug, name, role }`)
6. Verify: `bk*active*ws` cookie is present in the response and contains the new workspace ID
7. GET /api/v1/me (with the same session/cookies from step 3)
8. Verify: `active*workspace*id` in GET /api/v1/me response = `9a2c3de7-18af-45e5-a36f-e0ef9377af69`
9. Verify (DB): Query `SELECT active*workspace*id FROM user*sessions WHERE user*id = '0cdfea29-cbf7-4762-b4aa-f6d152492f43'` confirms the new workspace is persisted

***Expected result:***

- HTTP 200 on POST
- Cookie `bk*active*ws` updated to new workspace UUID
- GET /api/v1/me reflects new `active*workspace*id`
- Subsequent calls scoped to Workspace "Extra Test"

***Notes:***

- ***DEF-001 will be filed during execution:*** response body is `{ ok, active*workspace*id }`, NOT `{ id, slug, name, role }` as AC1 specifies. TC1 will fail this assertion and trigger defect filing.
- Steps 7-8 verify tenancy scoping (BR2 + BR4).

***Post-conditions:*** Active workspace is now `9a2c3de7` (Extra Test). Reset via another switch back to `a808499e` if needed for subsequent tests.

---

### TC2: BK-6: TC2: Validate switch to non-member workspace returns 403 NOT*A*MEMBER

***Type:*** Negative — API
***Priority:*** Critical
***AC:*** AC2 — Switch to non-member workspace rejected

***Preconditions:***

- Test user is authenticated
- User has NO membership row for workspace `bd947203-5318-4724-9608-7676c7af83c0` (Bunkaiqa)
- Current active workspace: `a808499e-f437-43b8-9fdb-8cee7dcceb3e` (Bünkāï QA) — to verify no change after rejection

***Test data:***

```json
{
  "non*member*workspace_id": "bd947203-5318-4724-9608-7676c7af83c0",
  "non*member*workspace_name": "Bunkaiqa",
  "endpoint": "POST /api/v1/me/active-workspace"
}
```

***Steps:***

1. Authenticate as `STAGING*USER*EMAIL`
2. Record current `active*workspace*id` via GET /api/v1/me → `a808499e-f437-43b8-9fdb-8cee7dcceb3e`
3. POST /api/v1/me/active-workspace with body `{ "workspace_id": "bd947203-5318-4724-9608-7676c7af83c0" }`
4. Verify: HTTP status code = 403
5. Verify: Response body contains error code `NOT*A*MEMBER`
6. GET /api/v1/me
7. Verify: `active*workspace*id` is still `a808499e-f437-43b8-9fdb-8cee7dcceb3e` (session NOT changed)
8. Verify (DB): `bk*active*ws` cookie was NOT updated

***Expected result:***

- HTTP 403
- Error code `NOT*A*MEMBER` in response body
- Session unchanged (active workspace remains Bünkāï QA)
- No cookie mutation

***Notes:***

- Validates BR1 (active membership required) and AC2 (session not modified on rejection).
- The rejection mechanism is RLS-based: non-member workspaces return nothing from the `workspaces` select, causing the 403. The error code `NOT*A*MEMBER` depends on the API's error mapping from an empty RLS result.

***Post-conditions:*** No state change. Active workspace unchanged.

---

### TC3: BK-6: TC3: Validate switch with suspended membership returns 403

***Type:*** Negative — API + DB
***Priority:*** Critical
***AC:*** AC3 — Switch to workspace where membership is suspended

***Preconditions:***

- Test user is authenticated
- User has `workspace_members` row for workspace `c828d131-f1c7-413c-9ba4-723fa1c45c00` (BK5 Test Workspace) with `status = "suspended"` — ***inserted 2026-06-06, READY***
- Current active workspace: `a808499e-f437-43b8-9fdb-8cee7dcceb3e` (Bünkāï QA)

***Test data:***

```json
{
  "suspended*workspace*id": "c828d131-f1c7-413c-9ba4-723fa1c45c00",
  "suspended*workspace*name": "BK5 Test Workspace",
  "suspended*workspace*slug": "bk5-test-ws",
  "user*membership*status": "suspended",
  "endpoint": "POST /api/v1/me/active-workspace"
}
```

***DB verification (pre-test):***

```sql
SELECT status FROM workspace_members
WHERE user_id = '0cdfea29-cbf7-4762-b4aa-f6d152492f43'
AND workspace_id = 'c828d131-f1c7-413c-9ba4-723fa1c45c00';
-- Expected: status = 'suspended'
```

***Steps:***

1. Authenticate as `STAGING*USER*EMAIL`
2. Record current `active*workspace*id` via GET /api/v1/me → `a808499e-f437-43b8-9fdb-8cee7dcceb3e`
3. POST /api/v1/me/active-workspace with body `{ "workspace_id": "c828d131-f1c7-413c-9ba4-723fa1c45c00" }`
4. Verify: HTTP status code = 403
5. Verify: Response body error code — ***DISC-003 applies here:***

   - ***Expected per spec:*** `MEMBERSHIP_SUSPENDED`
   - ***Actual:*** Capture and document exact code returned
   - If code ≠ `MEMBERSHIP_SUSPENDED` → document as defect

1. GET /api/v1/me
2. Verify: `active*workspace*id` is still `a808499e-f437-43b8-9fdb-8cee7dcceb3e` (session NOT changed)

***Expected result:***

- HTTP 403
- Error code `MEMBERSHIP_SUSPENDED` (spec — report if differs)
- Session unchanged
- No cookie mutation

***Notes:***

- ***DISC-003 risk:*** RLS may not distinguish `suspended` from non-member; both could return `NOT*A*MEMBER` or a generic 403. The implementation does NOT explicitly check `workspace_members.status` — it relies on RLS filtering. If RLS does not filter on `status`, suspended members may appear as valid members and the switch may actually succeed (a critical security defect).
- ***Post-test cleanup (MANDATORY):*** Restore membership status:

  `sql
  UPDATE workspace_members SET status = 'active'
  WHERE user_id = '0cdfea29-cbf7-4762-b4aa-f6d152492f43'
  AND workspace_id = 'c828d131-f1c7-413c-9ba4-723fa1c45c00';
  `

***Post-conditions:*** Restore `workspace_members.status` to `active` for `c828d131` after test completes.

---

### TC4: BK-6: TC4: Validate UI workspace switcher reflects active workspace after switch and reload

***Type:*** Positive — UI + Integration
***Priority:*** High
***AC:*** AC4 — UI switcher reflects current active workspace

***Preconditions:***

- Test user is authenticated in staging (browser session)
- User is active member of both Bünkāï QA and Extra Test workspaces
- Browser: Chromium / Chrome (staging environment)

***Test data:***

```json
{
  "from*workspace*name": "Bünkāï QA",
  "to*workspace*id": "9a2c3de7-18af-45e5-a36f-e0ef9377af69",
  "to*workspace*name": "Extra Test",
  "expected_redirect": "/projects"
}
```

***Steps:***

1. Navigate to `https://staging-upexbunkai.vercel.app` and authenticate
2. Verify: Workspace switcher in header displays current active workspace (Bünkāï QA)
3. Click the workspace switcher dropdown in the header
4. Verify: Dropdown lists available workspaces including "Extra Test"
5. Click "Extra Test" in the dropdown
6. Verify: POST /api/v1/me/active-workspace fires with `{ workspace_id: "9a2c3de7-18af-45e5-a36f-e0ef9377af69" }` (check Network tab or observe response)
7. Verify: App navigates to `/projects` — ***DISC-002:*** spec says `/home`; actual is `/projects` — ACCEPTED behavior
8. Verify: Workspace switcher in header now displays "Extra Test" as the active workspace
9. Reload the page (F5 / Ctrl+R)
10. Verify: After full reload, workspace switcher still shows "Extra Test" as the active workspace
11. Verify: Page content (project list) reflects data scoped to "Extra Test" workspace (not Bünkāï QA)

***Expected result:***

- Switcher updates immediately to show "Extra Test" after the POST
- Navigation goes to `/projects` (accepted — spec stale re: `/home`)
- After reload: switcher still shows "Extra Test" (cookie persists correctly)
- Content is scoped to Extra Test workspace

***Notes:***

- DISC-002 is accepted: `/home` route does not exist; `/projects` is the correct post-switch destination.
- Cookie persistence after reload validates that `bk*active*ws` is properly set with a sufficient maxAge.
- GET /api/v1/me/workspaces is called lazily on dropdown open — verify it loads the correct list.

***Post-conditions:*** Active workspace is "Extra Test". Reset via switcher back to "Bünkāï QA" if needed.

---

## Handoff to Stage 2

***Triforce:*** UI + API + DB
***Smoke targets before full execution:***

1. GET /api/v1/health (or equivalent) — confirm staging API is up
2. POST /api/v1/auth/login with `STAGING*USER*EMAIL` — confirm auth works
3. GET /api/v1/me — confirm active*workspace*id is readable
4. Workspace switcher loads in header (GET /api/v1/me/workspaces returns list)

***Execution order:*** TC2 → TC3 → TC1 → TC4 (negatives first to avoid state side effects; reset active workspace between TC1 and TC4 if run in same session)

***Pre-test DB check for TC3:***

```sql
SELECT status FROM workspace_members
WHERE user_id = '0cdfea29-cbf7-4762-b4aa-f6d152492f43'
AND workspace_id = 'c828d131-f1c7-413c-9ba4-723fa1c45c00';
```

***Defect tracking:***

- DEF-001: File during TC1 execution — response schema mismatch (missing id, slug, name, role)
- DISC-003: File if TC3 returns wrong error code (not `MEMBERSHIP_SUSPENDED`)

---
_Synced from Jira by sync-jira-issues_
