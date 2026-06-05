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


_Synced from Jira by sync-jira-issues_
