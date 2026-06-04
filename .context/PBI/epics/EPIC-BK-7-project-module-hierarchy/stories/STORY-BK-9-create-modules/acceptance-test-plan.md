# BK-9 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-9)

# ATP DRAFT — BK-9: TMS-Module | Create modules with nested sub-modules

***Status***: DRAFT — Shift-Left pre-sprint refinement
***Refined on***: 2026-06-02
***Total outline count***: 25 (6 Positive, 8 Negative, 4 Boundary, 4 Integration, 3 API)

---

## Refined Acceptance Criteria

### AC1 — Create a top-level Module

***Scenario 1.1 — Should create a root module and display it at the top level (Positive, Critical)***

- Given: member user, project "E-Commerce" with empty module tree
- When: triggers "New Module", enters name "Payment" (no parent), submits
- Then: "Payment" appears at tree depth 1; API returns HTTP 201 with {{{ name, path: "/Payment", depth: 1, position: 1 }}}; DB row created

***Scenario 1.2 — Should make a newly created root module immediately selectable as parent (Positive, High)***

- Given: "Payment" root module just created
- When: user triggers "Add sub-module", opens parent-selection UI
- Then: "Payment" appears as selectable parent without page reload

---

### AC2 — Create a nested sub-module

***Scenario 2.1 — Should create a sub-module nested under its parent with correct breadcrumb (Positive, Critical)***

- Given: Module "Payment" (depth 1) exists in "E-Commerce"
- When: user adds "Refunds" under "Payment"
- Then: UI shows "Refunds" at depth 2; breadcrumb "Payment / Refunds"; API 201 with `path: "/Payment/Refunds", depth: 2`; DB row correct

***Scenario 2.2 — Should correctly compute path for a deeply nested module (Positive, High)***

- Given: chain "Payment" > "Refunds" > "International" (depth 3)
- When: user adds "EU-Zone" under "International"
- Then: DB `path = "/Payment/Refunds/International/EU-Zone"`, `depth = 4`

---

### AC3 — Name validation

***Scenario 3.1 — Should reject a 1-character name (Negative, Critical)***

- Given: "New Module" form open
- When: user enters "P" (1 char) and submits
- Then: not created; inline error "name must be at least 2 characters"; API 422; no DB row

***Scenario 3.2 — Should reject empty name (Negative, High)***

- Given: "New Module" form open
- When: user submits empty name
- Then: not created; validation message; API 400/422; no DB row

***Scenario 3.3 — Should accept name of exactly 2 characters (Boundary, High)***

- Given: form open
- When: user enters "AB" and submits
- Then: module created successfully

---

### AC4 — Depth warning (non-blocking)

***Scenario 4.1 — Should show non-blocking warning at depth 5 (parent at depth 4) (Positive, High)***

- Given: 4-level chain L1>L2>L3>L4 (L4 at depth 4)
- When: user adds "Level-5" under L4
- Then: HTTP 201; module created at depth 5; non-blocking warning toast shown; dismissable

***Scenario 4.2 — Should show warning at depth 6, last valid level (Positive, Medium)***

- Given: 5-level chain (L5 at depth 5)
- When: user adds "Level-6" under L5
- Then: HTTP 201; module created at depth 6; warning shown (PO confirmed: warning fires at both depth 5 and 6)

---

### AC5 — Depth hard block

***Scenario 5.1 — Should block creation at depth 7 (Negative, Critical)***

- Given: 6-level chain L1>…>L6 (L6 at max depth)
- When: user attempts sub-module under L6
- Then: not created; blocking error "maximum nesting depth is 6 levels"; API 422 `MODULE*DEPTH*EXCEEDED`; no DB row; L6 not selectable as parent (or submit disabled)

---

### New scenarios (PO-confirmed, 2026-06-02)

***Scenario E1 — Should accept name of exactly 80 chars (Boundary, High)***

- Pre: form open. Expected: module created. (NEEDS DEV CONFIRMATION on exact error message)

***Scenario E2 — Should reject name of 81 chars (Boundary, High)***

- Pre: form open. Expected: rejected, "name must be at most 80 characters", no DB row.

***Scenario E3 — Should reject whitespace-only name (Negative, High)***

- Pre: form open. Expected: rejected, treated as empty/invalid.

***Scenario E4 — Should reject creation by viewer-role user (Negative, High)***

- Pre: viewer-role user. Expected: HTTP 403; UI button disabled/hidden.

***Scenario E5 — Should reject parent module from different project (Negative, High)***

- Pre: Projects A and B, parent from A. Expected: HTTP 400/422; no DB row.

***Scenario E6 — Should set correct position for appended sibling (Positive, Medium)***

- Pre: 2 existing root modules. Expected: new module gets position 3; sidebar order preserved.

---

## Test Outlines (25 total — names only)

### Positive (6)

1. Should create a root module in an empty project tree
2. Should create a root module when the project already has sibling modules
3. Should create a sub-module nested one level under an existing module
4. Should create a sub-module at depth 5 with a non-blocking warning
5. Should create a sub-module at depth 6 (last valid level) with a non-blocking warning
6. Should create a module with an optional description in Markdown

### Negative (8)

1. Should reject module creation when name is 1 character long
2. Should reject module creation when name field is empty
3. Should reject module creation when name contains only whitespace
4. Should reject module creation when name is 81 characters
5. Should reject sub-module creation when it would exceed depth 6
6. Should reject module creation when caller is a viewer-role workspace member
7. Should reject module creation when `parent*module*id` belongs to a different project
8. Should reject unauthenticated module creation

### Boundary (4)

1. Should accept a module name of exactly 2 characters (minimum boundary)
2. Should accept a module name of exactly 80 characters (maximum boundary)
3. Should create at depth 5 (first soft-warn depth) and confirm module IS created
4. Should create at depth 6 (last valid depth before hard block)

### Integration (4)

1. Should verify `path` column is correctly materialized on root module creation
2. Should verify `path` column is correctly materialized for a 3-level nested module
3. Should verify RLS prevents cross-workspace module creation
4. Should verify Supabase Realtime refreshes the sidebar tree after module creation

### API (3)

1. Should return HTTP 201 with complete module payload on successful POST /api/v1/modules
2. Should return HTTP 422 with `VALIDATION_ERROR` code on POST with invalid name
3. Should return HTTP 401 on POST /api/v1/modules without Authorization header

---

## Open Questions for Dev (non-blocking for PO)

1. Module creation pattern: REST endpoint (`POST /api/v1/modules`) or Server Action / Supabase RPC?
2. Position assignment strategy on concurrent sibling creates?
3. Does `POST /api/v1/modules` support `Idempotency-Key` header?
4. Does module creation write to `activity_log`?
5. Does Supabase Realtime broadcast on `modules` INSERT?
6. Exact error message text for AC3 (min name) and AC5 (depth exceeded)?

---

**Full shift-left analysis (Phases 1-5, risk matrix, story improvements) mirrored in the BK-9 Jira comment.**

---
_Synced from Jira by sync-jira-issues_
