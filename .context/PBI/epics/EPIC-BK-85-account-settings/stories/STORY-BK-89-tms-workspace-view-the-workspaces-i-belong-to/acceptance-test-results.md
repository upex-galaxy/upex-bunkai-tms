# BK-89 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-89)

# ATR — BK-89: TMS-Workspace | View the workspaces I belong to

***Status******:*** PARTIAL PASS — API-only surface tested; UI surface and role-dependent ACs blocked
***Session date******:*** 2026-06-12
***Tester******:*** Carlos Chiavassa
***Environment******:*** staging (https://staging-upexbunkai.vercel.app)

---

## Execution Scope

| Surface | Status | Reason |
| --- | --- | --- |
| API — GET /api/v1/workspaces (Bearer PAT) | Tested — 3 passed, 1 blocked | Bearer PAT available; 4 TCs executed |
| API — Cookie session path | Deferred | Cookie session requires Playwright magic-link flow |
| UI — Workspaces section | Deferred | BK-87 Settings Hub not shipped |

---

## TC Results

| TC | Key | Outline | Result |
| --- | --- | --- | --- |
| TC01 | BK-136 | GET /api/v1/workspaces returns HTTP 200 with correct workspace list shape | PASSED |
| TC02 | BK-139 | GET /api/v1/workspaces unauthenticated returns 401 | PASSED |
| TC03 | BK-140 | GET /api/v1/workspaces returns only active memberships — DB cross-validation | PASSED |
| TC04 | BK-141 | GET /api/v1/workspaces does not return role field — BLOCKER confirmed | BLOCKED |

### TC01 — GET happy path (PASSED)

GET https://staging-upexbunkai.vercel.app/api/v1/workspaces — HTTP 200
Response shape: `{"workspaces": [{id, slug, name, owner*user*id, plan, created_at}]}` — correct wrapped object. 1 workspace returned for QA bot. Fields confirmed present.

### TC02 — Unauthenticated (PASSED)

GET without Authorization header — HTTP 401. Error envelope: `"Authentication required."` — auth gate functioning correctly.

### TC03 — Active filter DB cross-validation (PASSED)

DB query: `workspace*members WHERE user*id = QA_bot AND status = 'active'` — count = 1.
API response: 1 workspace returned.
Match confirmed — `status = 'active'` filter is enforced server-side.

### TC04 — Role field absent (BLOCKED)

`role` field is NOT present in the GET /api/v1/workspaces response. Story blocker BLOCKER 1 confirmed: the endpoint returns `{id, slug, name, owner*user*id, plan, created*at}` only. The `role` field exists in the `workspace*members` table in DB but is not joined/exposed by the API.

***Impact******:*** AC 1 and AC 4 cannot be verified until Dev extends the endpoint with role data.

---

## Story Blockers (block QA sign-off)

| # | Blocker | Severity | Status |
| --- | --- | --- | --- |
| 1 | GET /api/v1/workspaces does not return `role` field | CRITICAL | Confirmed via TC04 + live API probe |
| 2 | "Active workspace" has no data contract (no DB column, no API field) | MEDIUM | Confirmed via DB schema inspection |
| 3 | BK-87 Settings Hub not shipped — UI/navigation blocked | LOW | Confirmed (Ready For Dev) |

---

## Deferred Outlines

All 11 remaining shift-left outlines are deferred pending blockers resolution:

- Role label tests (P-01, P-02, P-05, AC 4) — BLOCKER 1
- Active workspace indicator (P-03, P-04) — BLOCKER 2
- Multi-workspace test data — QA bot has 1 workspace only
- Suspended/invited filter (N-01, N-02) — no test data with QA bot
- Cookie-session auth path (I-01) — no session available
- Empty state (B-01), Loading (B-03), Navigation (I-03) — UI/data dependency

---

## Verdict

***PARTIAL PASS — API security and auth gates confirmed.*** BK-89 cannot receive QA sign-off until:

1. BLOCKER 1 resolved: Dev extends GET /api/v1/workspaces to return `role` per workspace
2. BLOCKER 2 resolved: PO defines the data contract for "active workspace"
3. BK-87 ships: UI/navigation path confirmed, UI outlines executable
4. Full API session: cookie-session path tested, multi-workspace test data available

Story remains in ***Shift-Left QA***. No ticket transition.

---
_Synced from Jira by sync-jira-issues_
