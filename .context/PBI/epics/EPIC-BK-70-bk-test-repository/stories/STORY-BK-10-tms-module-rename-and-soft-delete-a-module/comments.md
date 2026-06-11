# Comments for BK-10

[View in Jira](https://jira.upexgalaxy.com/browse/BK-10)

---

### Ely - 5/19/2026, 9:05:49 PM

🧱 ****Architect Annotation****

**Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.**

1. 

- Routes:
- `PATCH app/api/v1/modules/[id]/route.ts`
- `DELETE app/api/v1/modules/[id]/route.ts`
- Cascade implemented via SQL transaction (`WITH RECURSIVE` to find descendants + UPDATE).

1. 

- Tables: `modules`, `user*stories`, `acceptance*criteria`, `atcs`, `tests`, `bugs`.
- Soft-delete column `archived_at` on every entity table.

1. 

- [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) (need existing modules to rename / delete).

1. 

- (none directly — but quality matters because cascade bugs corrupt downstream data).

1. 

- [ ] All 6 AC scenarios pass on staging.
- [ ] Cascade verified on 4-deep subtree with mixed anchored entities.
- [ ] Path rebuild verified on rename that changes slug.
- [ ] `include_archived` flag returns archived rows without exception.
- [ ] Integration test for transactional rollback on partial failure.

---

### Jorgelina Abdo - 6/1/2026, 1:52:17 AM

1. 

****Story****: [https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) | TMS-Module | Rename and soft-delete a module
****Refined*****: 2026-06-01 | *****Risk level*****: HIGH | *****Modality****: jira-native

—

1. 

****POSITIVE****: rename label in place; rename + description; breadcrumb update; leaf delete; cascade archive parent+child+work; cascade 4-deep (architect DoD); archived excluded from tree.

****NEGATIVE****: name 1 char; name empty; name whitespace-only; name 81 chars; viewer denied rename [NEEDS PO/DEV CONFIRMATION]; viewer denied delete [NEEDS PO/DEV CONFIRMATION]; DELETE non-existent 404; DELETE already-archived 409 [NEEDS PO/DEV CONFIRMATION].

****BOUNDARY****: name = 2 chars (accept); name = 1 char (reject); name = 80 chars (accept) [NEEDS PO/DEV CONFIRMATION]; name = 81 chars (reject) [NEEDS PO/DEV CONFIRMATION].

****INTEGRATION****: cascade rollback on partial DB failure [NEEDS PO/DEV CONFIRMATION]; ATC listing excludes archived; full-text search excludes archived [NEEDS PO/DEV CONFIRMATION]; PAT bearer auth rename [NEEDS PO/DEV CONFIRMATION]; cascade covers all entity types.

****API****: PATCH 200 valid rename; PATCH 422 validation; DELETE 200/204 cascade; DELETE 404 not-found.

—

1. 

1. 

1. 

—

1. 

- [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) (create module) MUST be DONE before [https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) QA fixtures
- archived_at migration not confirmed — DATA-FEASIBILITY-RISK
- tests + bugs table existence unconfirmed — cascade SQL may fail

Full refinement: shift-left-refinement.md in PBI folder

---

### Jorgelina Abdo - 6/1/2026, 2:08:46 AM

1. 

****Status****: PO/Dev answers confirmed — Story is Sprint Plannable
****Refined****: 2026-06-01 · Shift-Left batch session · Label: `shift-left-reviewed`

—

1. 

|  | Question  | Confirmed Answer  |
| --- | --- |
| --- | ---------- | ----------------- |
| 1  | Minimum role to rename or delete?  | `member`+ · `viewer` → HTTP 403 denied  |
| 2  | Validation error messages?  | Empty / whitespace: ***"Module name is required."**** · Too short: ****"Module name must be at least 2 characters."**** · Too long: ****"Module name cannot exceed 80 characters."***  |
| 3  | Navigating directly to an archived module URL?  | HTTP 404 — ***"This module has been archived or does not exist."***  |
| 4  | Sibling name uniqueness within same parent?  | YES — enforced on `(project*id, parent*id, name)` · Collision → HTTP 409 ***"A module with this name already exists in this location."***  |

****Role matrix (confirmed)****

| Action  | viewer  | member  | admin  | owner  |
| --- | --- | --- | --- | --- |
| -------- | -------- | -------- | ------- | ------- |
| Rename Module  | 403 denied  | allowed  | allowed  | allowed  |
| Delete Module  | 403 denied  | allowed  | allowed  | allowed  |

—

1. 

| Type  | Count  | Focus  |
| --- | --- | --- |
| ------ | ------- | ------- |
| Positive  | 7  | Happy path rename, leaf delete, cascade delete, listing exclusion  |
| Negative  | 8  | Validation errors, auth denied (viewer), 404/409 on bad IDs  |
| Boundary  | 4  | Name at exactly 2, 80, 1, 81 characters  |
| Integration  | 5  | 4-deep cascade transaction, rollback, listing/search filter, PAT auth  |
| API  | 4  | PATCH 200/422, DELETE 200/404  |
| ****Total*****  | *****28*****  | *****Risk: HIGH****  |

—

1. 

1. ****Cascade transaction rollback**** — if the SQL transaction fails mid-way, ALL rows across all entity tables must revert. No testable AC exists yet. Dev must add a technical AC before sprint.
2. ****4-deep subtree archive**** (architect DoD requirement) — cascade must atomically archive all 4 levels + all linked work in one committed transaction.
3. ****Viewer role blocked**** — HTTP 403 confirmed for both rename and delete. Auth gate must be verified in middleware before sprint closes.
4. ****Sibling name collision**** — HTTP 409 confirmed. Uniqueness on `(project*id, parent*id, name)` — rename must be rejected cleanly with the exact confirmed message.
5. ****Delete on already-archived module**** — HTTP 409 confirmed. Double-archive must not happen; idempotency behavior must be explicit in the API handler.

—

1. 

1. Does `archived*at` column exist in current migrations for ALL 6 cascade targets: `modules`, `user*stories`, `acceptance_criteria`, `atcs`, `tests`, `bugs`?

***(The `tests` table may not yet exist — cascade SQL must be scoped to what is actually in the DB)***
2. What PAT scope is required for `PATCH /api/v1/modules/{id}` and `DELETE`? (`atc:write` or a new scope?)
3. How is the `include_archived` flag implemented — query param, RLS row filter, or PostgREST header override?
4. Concurrent rename/delete behavior — last-write-wins, or conflict detection with a 409?
5. Is the description field editable on rename, and what is its max length?

—

1. 

- [ ] Dev answers the 5 Technical Questions above before story estimation
- [ ] Dev confirms `archived_at` migration is applied to all cascade target tables in the test environment
- [ ] [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) (create module) must reach ***Ready For Dev**** or ****Done*** before [https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) QA fixture setup can begin

—

***Full shift-left refinement document (18 refined ACs, 28 test outlines, edge cases, risk map) is stored locally at:***
`.context/PBI/epics/EPIC-BK-7-project-module-hierarchy/stories/STORY-BK-10-tms-module-rename-and-soft-delete-a-module/shift-left-refinement.md`

---

### Ely - 6/4/2026, 7:56:04 PM

## Ready For QA — BK-10 (Rename & soft-delete a module)

Merged to `staging` and deployed. Ready for testing on the staging environment.

### Links

- PR: https://github.com/upex-galaxy/upex-bunkai-tms/pull/9 (merged)
- Branch: `feature/BK-10-rename-soft-delete-module` (deleted post-merge)
- Staging: https://staging-upexbunkai.vercel.app — deploy READY
- Merge commit: `5726111`

### What shipped

- `PATCH /api/v1/modules/{id}` — rename a module and/or edit its description. Renaming rebuilds the module path and every descendant path; a sibling name collision is rejected.
- `DELETE /api/v1/modules/{id}` — soft-delete: archives the module, its sub-modules, and the linked user stories, acceptance criteria, and ATCs in one atomic transaction. Returns per-table counts.
- UI: per-node rename (pencil) and delete (trash) actions in the project tree; archived modules disappear from the active tree and listings.

### As-built contract (observable)

- PATCH success: 200 `{ module }`. Name < 2 / empty / > 80 / no-alphanumeric: 422 with `details.reason`. Sibling collision: 409 `module*slug*duplicate`. Missing or archived id: 404. Viewer / non-member: 403. Bad UUID / JSON: 400. Unauthenticated: 401.
- DELETE success: 200 `{ archived: { modules, user*stories, acceptance*criteria, atcs } }`. Already archived: 409 `already_archived`. Missing: 404. Viewer: 403.

### Suggested QA focus

- Rename happy path: tree label + breadcrumbs update; new slug reflected in the path.
- Rename validation: 1 char, empty/whitespace, 80 vs 81 chars, name colliding with a sibling (409).
- Soft-delete a leaf vs a parent with a 2–4 deep subtree: the whole branch leaves the active tree; archived content is excluded from default listings.
- Permissions: a workspace `viewer` is denied rename and delete (403).
- Re-deleting an already-archived module returns 409.

### Known follow-ups (not blocking BK-10)

- Cascade intentionally does NOT touch `tests` / `bugs` — those tables ship with their own epics (Part 2). Extend `bunkai*archive*module_subtree` then.
- The ATC detail deep-link page does not yet filter archived rows (AC-5 targets listings, which are filtered). Worth a small follow-up ticket.
- Integration/E2E coverage of the live cascade, path-rebuild, 409 collision, and 403-viewer paths is deferred to the test-authoring phase.

---

### Jorgelina Abdo - 6/8/2026, 5:04:20 AM

## Acceptance Test Results (ATR)

***Story:*** BK-10 — TMS-Module | Rename and soft-delete a module
***Tested:*** 2026-06-08
***Environment:*** Staging — https://staging-upexbunkai.vercel.app
***Tester:*** Jorgelina Abdo
***Result:*** FAILED (25/28 TCs)

---

### Summary

Tested rename and soft-delete functionality for the TMS Module entity. All core positive, negative, and boundary cases passed. TC-I04 definitively failed: PAT bearer tokens are rejected on module/workspace endpoints despite returning 200 on GET /api/v1/me. TC-I01 and TC-I03 were not testable (require dev DB injection and a search endpoint not yet deployed).

---

### Test Cases

| TC | Type | Name | Expected | Result |
|----|------|------|----------|--------|
| TC-A01 | API | PATCH valid name | 200 | PASS |
| TC-A02 | API | PATCH empty name | 422 | PASS |
| TC-A03 | API | DELETE valid module | 200 | PASS |
| TC-A04 | API | DELETE non-existent UUID | 404 | PASS |
| TC-N01 | Negative | PATCH name=1 char | 422 | PASS |
| TC-N02 | Negative | PATCH name="" | 422 | PASS |
| TC-N03 | Negative | PATCH name=spaces-only | 422 (stripped) | PASS |
| TC-N04 | Negative | PATCH name=81 chars | 422 | PASS |
| TC-N05 | Negative | Viewer PATCH | 403 | PASS |
| TC-N06 | Negative | Viewer DELETE | 403 | PASS |
| TC-N07 | Negative | DELETE non-existent | 404 | PASS |
| TC-N08 | Negative | DELETE already-archived | 409 | PASS |
| TC-B01 | Boundary | PATCH name=2 chars (min) | 200 | PASS |
| TC-B02 | Boundary | PATCH name=1 char (below min) | 422 | PASS |
| TC-B03 | Boundary | PATCH name=80 chars (max) | 200 | PASS |
| TC-B04 | Boundary | PATCH name=81 chars (above max) | 422 | PASS |
| TC-P01 | Positive | Rename happy path | 200 | PASS |
| TC-P02 | Positive | Rename + description simultaneously | 200 | PASS |
| TC-P03 | Positive | Breadcrumb rebuild after parent rename | path updated | PASS |
| TC-P04 | Positive | Soft-delete leaf module | 200 {modules:1} | PASS |
| TC-P05 | Positive | Cascade 2-level delete | 200 {modules:3} | PASS |
| TC-P06 | Positive | 4-deep atomic cascade delete | 200 {modules:4} | PASS |
| TC-P07 | Positive | Archived excluded from active listing | 404/empty | PASS |
| TC-I01 | Integration | Rollback on partial DB failure | all reverted | NOT TESTABLE |
| TC-I02 | Integration | Archived excluded from US listing | [] | PASS |
| TC-I03 | Integration | Archived excluded from search | no results | NOT TESTABLE |
| TC-I04 | Integration | PAT bearer auth for PATCH | 200 | FAIL |
| TC-I05 | Integration | Cascade all entity types | counts verified | PASS |

---

### Test Data

- Workspace: 7049b1a0-2ff9-4309-8754-f99ee7f8f4be
- Project: 696bfcbf-0eb9-4c62-889f-31918493ce3d
- Viewer: bk10-viewer@fenooldeav.resend.app

---

### Bugs Found

[BUG-KEY TBD] — Moderate: PAT bearer token rejected on module/workspace endpoints

---

### Observations

- Viewer 403 returns reason=not*a*member (membership-level, not role-level; functionally correct per AC)
- Sibling name collision PATCH returns 409 module*slug*duplicate (extra coverage confirmed)
- TC-I04 recalibration gate applied: PAT scoped to identity endpoints only — supported by facts; user confirmed BLOCKED verdict (real integration gap)
- TC-I01 requires dev DB injection; TC-I03 requires search endpoint not yet deployed

---

### Recommendations

- Automate TC-A01 through TC-B04 (API layer) — high value, low maintenance
- Automate TC-P04, TC-P05, TC-P06 (cascade logic) — complex but stable
- TC-I01: move to dev integration test suite
- TC-I03: defer until search endpoint ships
- PAT scope: dev team to confirm intended PAT coverage for resource endpoints

---

### Jorgelina Abdo - 6/8/2026, 6:33:01 AM

## QA Testing Complete — BK-10

***Environment:*** Staging — https://staging-upexbunkai.vercel.app
***Result:*** FAILED (25/28 TCs)

---

### Test Data Used

- Workspace: 7049b1a0-2ff9-4309-8754-f99ee7f8f4be
- Project: 696bfcbf-0eb9-4c62-889f-31918493ce3d
- Viewer user: bk10-viewer@fenooldeav.resend.app (invited as viewer)

---

### Verified Behaviors

- Rename module (happy path, 2-char min, 80-char max, simultaneous name+description) — VERIFIED
- Breadcrumb path rebuild after parent rename — VERIFIED
- Soft-delete leaf module → 200 {modules:1} — VERIFIED
- Cascade 2-level and 4-level atomic delete — VERIFIED
- Archived modules excluded from active listing and US listing — VERIFIED
- Validation: empty, whitespace, 1-char, 81-char name → 422 — VERIFIED
- Viewer role denied (403) on rename and delete — VERIFIED
- 404 on non-existent module, 409 on already-archived module — VERIFIED

---

### Failed Verification

***TC-I04: PAT bearer authentication on module endpoints — FAILED***

- Expected: 200 — PAT is the headless auth mechanism; should work on resource endpoints
- Actual: 401 unauthorized — session-cookie auth required; PAT rejected on module and workspace endpoints
- Impact: Agents, CLI tools, and headless integrations cannot perform module operations via PAT

---

### Defect

***BK-93*** — PAT bearer token rejected on module/workspace resource endpoints (401)

---

### Not Testable (2 TCs)

- TC-I01: Rollback on partial DB failure — requires dev DB injection
- TC-I03: Search exclusion — search endpoint not yet deployed

---

### Artifacts

ATP and ATR posted as comments on this story (jira-native modality — fields not on screen).

---

### Ely - 6/11/2026, 9:13:21 AM

## ✅ Blocking defect resolved — story resumed

The defect behind TC-I04 (the only real FAIL in your 25/28 run) is fixed and verifiable:

| Defect | Resolution |
| --- | --- |
| BK-93 — PAT bearer rejected on module/workspace endpoints (401) | Closed as duplicate of BK-84. BK-84 was fixed by the unified auth gateway (ADR-0001) and live-verified on staging 2026-06-10 with an 8-route matrix including module and workspace endpoints — 0×401. BK-84 is ***Ready For QA***. |

This story has been moved back to ***In Test*** so testing can resume. Please re-run TC-I04 (PAT bearer on PATCH/DELETE module endpoints) and continue the story run.

TC-I01 (dev DB injection) and TC-I03 (search endpoint not yet deployed) remain not-testable as you recorded — they are not blockers for this story.

---


_Synced from Jira by sync-jira-issues_
