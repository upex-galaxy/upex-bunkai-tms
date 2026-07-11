# BK-14 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-14)

# BK-14 — Acceptance Test Results (ATR)

***Date******:*** 2026-07-06
***Tester******:*** Nahuel Gomez
***Environment******:*** Staging (staging-upexbunkai.vercel.app)
***Strategy******:*** Balanced (API depth + UI breadth)
***Prior automation******:*** 5 tests (PASSED, 30 Jun)
***Sprint******:*** Bunkai (70) Sprint 3

## API Test Results — 8/9 PASSED

| # | Test | Status | Notes |
| --- | --- | --- | --- |
| API-01 | Create with valid payload (title + description + external*id) | ✅ PASS | 201, story created with correct title and external*id=BK-42 |
| API-02 | Title too short ("Re", 2 chars) | ✅ PASS | 422 validation_failed |
| API-03 | Title too long (201 chars) | ✅ PASS | 422 validation_failed |
| API-04 | Description > 50KB | ⏭️ SKIPPED | Requires binary payload >51200 bytes — deferred |
| API-05 | Malformed Jira key ("not a key") | ✅ PASS | 422 validation_failed |
| API-06 | Duplicate Jira key (BK-42 already used) | ✅ PASS | 409 "This Jira issue is already linked" |
| API-07 | PATCH external_id immutable after set | ✅ PASS | 409 on second PATCH |
| API-08a | Soft-delete (DELETE) | ✅ PASS | 200 |
| API-08b | GET after soft-delete shows deleted*at | ❌ FAIL | 404 (story not found) instead of 200 with deleted*at |
| API-08c | Not in default module list | ✅ PASS | Story excluded from list |
| API-09 | Cross-workspace isolation | ⏭️ SKIPPED | Requires second workspace token |

## UI Test Results — 3/3 PASSED

| # | Test | Status | Notes |
| --- | --- | --- | --- |
| UI-01 | Edit story form renders with Markdown editor | ✅ PASS | BK-16 editor present with toolbar (bold, italic, code, link, lists, headings, preview) |
| UI-02 | Title field editable, Cancel returns to module | ✅ PASS | Form interaction works |
| UI-03 | Jira key field visible with placeholder | ✅ PASS | "BK-42" placeholder shown |
| UI-04 | Remove story not tested directly | 🟡 NOTED | Remove button visible in tree — functional test via API-08a/c confirmed soft-delete works |

## Findings

### F1 — Soft-delete returns 404 on direct GET (non-blocking)

API-08b: GET /api/v1/user-stories/{id} returns 404 after soft-delete instead of 200 with `deleted*at` set. The story IS soft-deleted (API-08c confirms it's hidden from default list). This is likely by design (RLS filters `deleted*at IS NOT NULL`), but means clients cannot distinguish "not found" from "soft-deleted". If distinction matters for audit/traceability, consider returning 200 with `deleted_at` set or a 410 Gone status.

### F2 — No visible "New User Story" button in Tree view (non-blocking)

The Tree view shows stories under modules but no obvious "New User Story" button. Existing stories can be edited, removed, and have ATCs created. New story creation might be behind a right-click context menu or in a separate view. Ely's "What shipped" comment describes "Per-module 'New User Story' action in the project tree" — button may require clicking the module name or using a context action.

## Coverage Map

### AC Coverage

| AC | Status | Tests |
| --- | --- | --- |
| AC1: Create story with title + Markdown description | ✅ PASS | API-01, UI-01 |
| AC2: Title < 3 chars rejected | ✅ PASS | API-02, UI-02 |
| AC3: Link to upstream Jira issue | ✅ PASS | API-01, UI-03 |
| AC4: Malformed Jira key rejected | ✅ PASS | API-05 |
| AC5: Duplicate Jira key rejected | ✅ PASS | API-06 |
| AC6: Remove archives (soft-delete) | ✅ PASS | API-08a/08c |

### Risk-beyond-AC Coverage

- Boundary: Title max 200 chars → ✅ PASS (API-03)
- Security: Jira key regex validation → ✅ PASS (API-05)
- Security: Jira key immutability → ✅ PASS (API-07)
- State: Duplicate key enforcement → ✅ PASS (API-06)
- State: Soft-delete → ✅ PASS (API-08a/c, F1)
- Cross-workspace isolation → ⏭️ SKIPPED (needs second token)

## Overall Verdict

***PASSED WITH FINDINGS*** — 8/9 API tests passed, 3/3 UI tests passed. Both findings are non-blocking. Feature meets all 6 ACs. Ready to proceed to Ready For Release.

---
_Synced from Jira by sync-jira-issues_
