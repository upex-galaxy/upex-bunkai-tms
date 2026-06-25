# TMS-ATC Usage | See a "Used in N tests" report

**Jira Key:** [BK-22](https://jira.upexgalaxy.com/browse/BK-22)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** 3
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

***Source spec:*** FR-013

## User story

***As a*** Senior QA Engineer
***I want to*** see a "Used in N tests" report on an ATC
***So that*** I can understand the blast radius of a change before I make it.

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

---

## QA Refinements (Shift-Left Analysis) — Added 2026-06-02

Refined Acceptance Criteria live in the acceptance_criteria field.

### Edge Cases Identified

|  | Edge case  | In original Story?  | Criticality  | Action  |
| --- | --- | --- | --- |
| --- | ----------- | ------------------- | ------------- | -------- |
| 1  | Same ATC at multiple positions within one Test (multi-position JOIN rows)  | No (only in Architect Annotation)  | High  | Add to AC (PO confirm)  |
| 2  | ATC with zero usage — API returns { used_in: [] } NOT 404  | Partially (AC3 covers UI; API shape missing)  | High  | Add API-level AC (PO confirm)  |
| 3  | Cross-workspace ATC request returns 404, NOT 403 or 200  | No (only in Architect Annotation)  | High  | Add to AC (PO confirm)  |
| 4  | "Used in 1 test" singular copy  | No  | Medium  | Add to AC (PO confirm)  |
| 5  | Unauthenticated caller gets 401  | No  | High  | Test only (NEEDS PO/DEV CONFIRMATION)  |
| 6  | PAT with wrong scope gets 403  | No  | Medium  | Test only (NEEDS PO/DEV CONFIRMATION)  |
| 7  | ATC UUID does not exist at all (not cross-workspace, just absent)  | No  | Medium  | Test only (NEEDS PO/DEV CONFIRMATION)  |
| 8  | ATC referenced in 100+ Tests — performance boundary  | No (only in Architect Annotation, contradictory fixture sizes)  | Medium  | Test only after performance target reconciled  |
| 9  | test_steps table absent (EPIC-BK-5 not merged) — endpoint behavior  | No  | High  | Technical question for Dev  |
| 10  | Test deleted after being referenced in test_steps — orphan rows  | No  | High  | Technical question for Dev (FK cascade rule from EPIC-BK-5)  |
| 11  | ATC referenced in 0 Tests AND test_steps table doesn't exist yet  | No  | Medium  | Technical question for Dev  |

### Clarified Business Rules

The following rules were extracted from analysis but are NOT stated explicitly in the original Story:

- Workspace scoping: cross-workspace ATC access returns 404 (not 403 or 200) — existence-leak prevention pattern inherited from BK-13/BK-18
- Empty result shape: a valid ATC with zero usage returns HTTP 200 { "used_in": [] }, NOT 404
- Minimum caller role: caller must be an active workspace member (role >= viewer) — 401 if unauthenticated
- List ordering: Tests ordered by slug ascending; within the same Test, positions ordered ascending (per Architect Annotation)

### Critical Questions for PO

1. ***When the same ATC appears at two positions within one Test, does the usage list show one row (Test-A, positions: 2, 5) or two rows (Test-A at position 2; Test-A at position 5)?***

- Context: AC2 says "each Test"; Architect Annotation says JOIN returns multiple rows without deduplication. These are consistent only if "each Test" means "each Test-position pair". The count label (N = distinct Tests or N = total rows) depends on the same answer.
- Impact if unanswered: Dev implements one model; QA tests the other. The count assertion in AC1 will either pass or fail based on which interpretation Dev chose, with no way to tell which is correct.
- Suggested answer: Display one row per Test with all positions listed (comma-separated), and count = distinct Tests. This matches the business phrasing "Used in N tests" and is the most user-readable format for the blast-radius use case.

1. ***Does "Used in 1 test" show the singular form, or is it always "Used in N tests"?***

- Context: No AC addresses singular vs plural. Standard UX convention requires it but the exact copy is undefined.
- Impact if unanswered: UI copy will be inconsistent ("Used in 1 tests" is grammatically wrong); no way to write a deterministic text assertion.
- Suggested answer: Singular form: "Used in 1 test". Plural form: "Used in N tests" (N >= 2 or N = 0).

1. ***What is the authoritative performance target for the GET /atcs/{id}/usage endpoint — <= 100 Tests or 10k Tests in the benchmark fixture?***

- Context: Architect Annotation 1 says "< 50ms p95 on ATCs referenced in <= 100 Tests"; Annotation 2 says "< 50ms p95 with 10k Tests in fixture". These are contradictory.
- Impact if unanswered: Dev writes a unit test against the wrong fixture size; QA cannot write a valid performance outline; the DoD performance check is untestable.
- Suggested answer: Clarify which fixture size is the production baseline expectation. 10k is more realistic for a mature TMS; 100 may be an MVP shortcut.

### Technical Questions for Dev

1. ***What is the FK cascade behavior on test*steps.test*id when a Test is deleted? If no CASCADE DELETE, orphaned test*steps rows will pollute the usage report with references to deleted Tests.*** — The cascade rule is set by EPIC-BK-5. Confirm whether the usage query's JOIN will naturally exclude orphaned rows (via the INNER JOIN) or whether orphaned test*steps rows need a cleanup guard.

1. ***If test*steps and tests tables do not yet exist (EPIC-BK-5 not merged), what does the endpoint return? 200 with { used*in:**** ****[****] }, 503 Service Unavailable, or a migration gate error?*** — This defines the behavior during the window between BK-22 landing and EPIC-BK-5 landing, which matters for CI integration tests.

1. ***Which SQL query shape is authoritative — Annotation 1 (with t.workspace*id = $session.workspace*id WHERE clause and ORDER BY t.slug ASC, ts.position ASC) or Annotation 2 (simplified, no workspace WHERE, ORDER BY t.created_at)?*** — QA will write ordering assertions against the authoritative query.

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the ATP DRAFT comment below.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Storys (2)

- [BK-18](https://jira.upexgalaxy.com/browse/BK-18): TMS-ATC API | Create and edit ATCs with steps and assertions _(QA Approved)_
- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(QA Approved)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 6/23/2026
- **Reporter:** Ely
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** atc, mvp, reporting, shift-left-2026-06-02, shift-left-reviewed, wave-2

---

_Synced from Jira by sync-jira-issues_
