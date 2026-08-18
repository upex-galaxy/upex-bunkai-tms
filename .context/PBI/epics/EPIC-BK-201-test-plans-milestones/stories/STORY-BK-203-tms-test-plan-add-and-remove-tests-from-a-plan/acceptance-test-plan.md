# BK-203 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-203)

# ATP DRAFT — Shift-Left (2026-08-16)

***Status****: Refined — Awaiting PO Estimation. ****Verdict***: Needs Improvement — 2 Critical gates (Closed-plan, cross-project isolation) live only in prose, not as testable ACs.

***DATA-FEASIBILITY-RISK******:****** confirmed.*** No `test_plan` entity in target repo yet. Blocked on BK-202 (`Estimation`) + Tests epic. Blocks execution, not design.

Full research narrative (Critical Analysis, Story Quality Analysis, per-scenario detail): local file `.context/PBI/epics/EPIC-BK-201-test-plans-milestones/stories/STORY-BK-203-tms-test-plan-add-and-remove-tests-from-a-plan/shift-left-refinement.md`.

## Coverage estimate

| Type | Count |
| --- | --- |
| Positive | 4 |
| Negative | 6 |
| Boundary | 2 |
| Integration | 2 |
| ***Total**** | ****14*** |

Two archetypes converge: Permissions/RBAC (role x plan-state Decision Table) and List/Table CRUD with a uniqueness constraint (EP + BVA).

## Outline list (names only)

***Positive***

- Add 12 selected tests to an empty plan and reflect the count in the header
- Add a single test and clear the empty state
- Let the same test belong to two different plans independently
- Remove a test from a plan while leaving the test itself unchanged

***Negative***

- Mark an already-included test in the picker and block re-selection (UI)
- Reject a duplicate add via direct API call bypassing the picker (API)
- Hide Add/Remove controls for a viewer (UI)
- Reject a viewer's direct API add/remove attempt (API)
- Reject a membership change on a Closed plan — ***NEEDS PO/DEV CONFIRMATION***
- Reject adding a Test from a different project — ***NEEDS PO/DEV CONFIRMATION***

***Boundary***

- Return to the empty state when the last test is removed
- Transition out of the empty state on the first test added

***Integration***

- Search the project's test library by name and tag (ATC-search interface pattern)
- Propagate a single membership mutation's live count to plan header + plans list

## Critical Questions for PO (BLOCK sprint planning)

1. Is membership editing on a Closed plan hidden from the UI entirely, or shown and then rejected on submit? Suggested: hide controls entirely, enforce server-side too (defense-in-depth).
2. Is cross-project Test isolation enforced only by scoping the picker's search results, or also validated server-side? Suggested: enforce both layers.

## Technical Questions for Dev

1. Exact error shape (status code + error code) for: duplicate add, closed-plan add/remove, cross-project add.
2. Idempotency behavior on rapid double-submit of the add-tests confirm action.
3. Empty-results state copy for the add-tests picker.

## Next steps

- PO answers Critical Questions before sprint planning.
- Dev answers Technical Questions before estimation.
- Story should not enter a sprint until BK-202 has a stable `test_plans` table + detail-view route, and the Tests epic has a queryable library.

---
_Synced from Jira by sync-jira-issues_
