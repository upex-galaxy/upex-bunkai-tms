# TMS-Run Reporting | Filter project runs with pass/fail totals

**Jira Key:** [BK-38](https://jira.upexgalaxy.com/browse/BK-38)
**Epic:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** QA Approved
**Priority:** Medium
**Story Points:** 3
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

# TMS-Run Reporting | Filter project runs with pass/fail totals

 ***Shift-Left Reviewed*** — expert panel applied · ready for estimation

> ***SUCCESS:**** This Story has been refined through the shift-left workflow with the expert-panel decisions below applied. Expert story point recommendation: ****3 points***.

## Source

- ***Source spec******:*** [BK-023](https://jira.upexgalaxy.com/browse/BK-023)
- ***Parent/module******:*** [BK-70](https://jira.upexgalaxy.com/browse/BK-70) — Test Repository / Run Reporting
- ***Dependencies******:*** [BK-34](https://jira.upexgalaxy.com/browse/BK-34) Start manual run; [BK-39](https://jira.upexgalaxy.com/browse/BK-39) final run verdict semantics

## User Story

As a QA Lead, I want to filter and review all Runs across the Project by date range, module, status, and executor type, with pass and fail totals, so that I can answer "what did we execute and how did it go?" in under a minute.

## Key Contract Decisions

| Decision | Contract |
| --- | --- |
| Reporting scope | Project-scoped Runs only. Cross-project and cross-workspace Runs never appear in rows or totals. |
| Reporting endpoint | `GET /api/v1/projects/{projectId}/runs/report` returns rows, totals, applied filters, and pagination from the same query contract. |
| Date filter | Filter by `started_at`. Date range is inclusive for start and end dates. Store timestamps in UTC; interpret date inputs in the Project timezone. |
| Module filter | Each Run stores a `module_id` snapshot at creation time for reporting. This avoids ambiguous reports when a Test chain spans multiple ATC modules or changes later. |
| Status / outcome model | Run status supports at least `running`, `passed`, `failed`, `blocked`, `skipped`, and `aborted`. Pass/fail totals count only final passed and failed Runs. |
| Executor type | Executor type enum is `human`, `agent`, `ci`, aligned with [BK-34](https://jira.upexgalaxy.com/browse/BK-34). |
| Empty states | No Runs and no matching filters use distinct empty states, both with pass and fail totals set to 0. |
| Access | Active members with Project access may read the report. Future PAT/API access requires `run:read` or equivalent read scope. |

## Scope

### In Scope

- View all Runs for a selected Project in one filterable reporting list.
- Filter Runs by date range, module, status, and executor type, in combination.
- Recompute pass/fail totals from the currently filtered result set.
- Show row-level details: Test, module, environment, executor type, status/outcome, and started date.
- Show no-runs and no-matches empty states with zeroed totals.
- Clear filters and restore full Project-wide rows and totals.
- Enforce Project/workspace data isolation.

### Out of Scope

- Starting a Run; covered by [BK-34](https://jira.upexgalaxy.com/browse/BK-34).
- Updating step results; covered by the Run execution/update story.
- Aborting or cancelling Runs; covered outside [BK-38](https://jira.upexgalaxy.com/browse/BK-38).
- Final run verdict rules beyond consuming final passed or failed; covered by [BK-39](https://jira.upexgalaxy.com/browse/BK-39).
- Defect filing, listing, heatmap, or sync; covered by [BK-40](https://jira.upexgalaxy.com/browse/BK-40) through [BK-43](https://jira.upexgalaxy.com/browse/BK-43).
- Exports, charts, dashboards, saved report views, or formal Jira/Xray test cases.

## Acceptance Criteria

```gherkin
Background:
  Given an authenticated workspace member with access to the Project
    And Runs exist as execution instances of Tests in that Project
    And each Run stores test*id, module*id, environment, executor*type, status, started*at, and Project scope

Scenario: QA Lead views all project Runs with totals
  Given the Project has Runs with mixed passed and failed outcomes
  When the QA Lead opens the Run Reporting view for the Project
  Then the view lists every Run the QA Lead is authorized to see
    And each row shows Test, module, environment, executor type, status or outcome, and started date
    And the pass total equals the number of visible Runs with status "passed"
    And the fail total equals the number of visible Runs with status "failed"

Scenario: Combined filters narrow the Run list and recompute totals
  Given the Project has Runs across multiple dates, modules, statuses, and executor types
  When the QA Lead applies date range, module, status, and executor type filters together
  Then only Runs matching every selected filter are shown
    And pass and fail totals are recalculated from the filtered result set

Scenario: Date range boundaries are inclusive by started_at
  Given Runs exist before the start date, on the start date, inside the range, on the end date, and after the end date
  When the QA Lead filters by that date range
  Then Runs on the start and end dates are included
    And Runs outside the range are excluded
    And totals match the included Runs

Scenario: Empty filter result shows zeroed totals
  Given the Project has Runs
  When the QA Lead applies filters that match no Runs
  Then a no-matches empty state is shown
    And pass total is 0
    And fail total is 0
    And no stale totals remain visible

Scenario: Clearing filters restores the full project report
  Given the QA Lead has active filters applied
  When the QA Lead clears all filters
  Then the full Project Run list is restored
    And pass and fail totals return to the unfiltered Project totals

Scenario: Project with no Runs shows first-use empty state
  Given the Project has no Runs
  When the QA Lead opens the Run Reporting view
  Then a no-runs empty state is shown
    And pass total is 0
    And fail total is 0
    And no filter error is shown

Scenario: Unauthorized or cross-project Runs are not exposed
  Given Runs exist in another Project or workspace
  When the QA Lead opens the Run Reporting view for the current Project
  Then only Runs from the current authorized Project are returned
    And no cross-project Run data is visible in rows or totals
```

## Business Rules

- Reporting scope is one Project.
- Rows and totals are calculated from the same filtered query.
- Date range filters Run `started_at` inclusively; timestamps are stored in UTC and interpreted from Project timezone date inputs.
- Pass/fail totals count only final passed and failed Runs.
- `running`, `blocked`, `skipped`, and `aborted` Runs may appear in rows/status filters but are excluded from pass/fail totals.
- Each Run stores a `module_id` snapshot at creation time for reporting.
- Executor type enum is `human`, `agent`, `ci`.
- No-runs and no-matches empty states both show pass total 0 and fail total 0.
- Report reads enforce Project/workspace access boundaries.

## ATP Draft

| ID | Type | Scenario | Coverage target | Priority | Automation hint |
| --- | --- | --- | --- | --- | --- |
| BK-38-ATC-01 | Happy | View all project Runs with row details and totals | Project report baseline | High | UI/API/DB |
| BK-38-ATC-02 | Integration | Combined filters narrow rows and recompute totals | Filter contract | High | UI/API/DB |
| BK-38-ATC-03 | Negative | Empty filter result shows zero rows and zero totals | Empty state and stale totals | High | UI/API |
| BK-38-ATC-04 | Boundary | `started_at` date range includes start/end dates and excludes outside dates | Date semantics | Medium | API/DB |
| BK-38-ATC-05 | Happy | Clear filters restores full list and totals | Reset behavior | Medium | UI/API |
| BK-38-ATC-06 | Negative | Project with no Runs shows first-use empty state | No-runs state | Medium | UI |
| BK-38-ATC-07 | Security | Cross-project Runs are excluded from rows and totals | Data isolation | High | API/DB |
| BK-38-ATC-08 | Performance | Large Run set returns paginated/performant report | Scalability | Low | API/DB |

## Readiness Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| PO contract | Pass | Expert panel resolved status totals, date semantics, and empty-state rules. |
| Dev feasibility | Pass with dependency | Requires Runs schema/API implementation in this Story or prerequisite branch. |
| QA testability | Pass | AC and ATP draft cover happy, negative, boundary, integration, and security paths. |
| Data/API | Pass with dependency | Contract defined; current repo has Tests only, so Runs tables/API must be added. |
| UX | Pass | Empty-state and clear-filter behavior defined at contract level. |
| Security/Ops | Pass | Cross-project data isolation included as high-priority coverage. |

## Publication Notes

AC, ATP, and Business Rules are included in this description because the Jira custom-field REST edit path returned 404 in this session while acli edits succeeded. If REST access is fixed later, these sections can be copied into their dedicated custom fields without changing the contract.

## References

- [BK-34](https://jira.upexgalaxy.com/browse/BK-34) Start manual run: creates the Run source this report consumes.
- [BK-70](https://jira.upexgalaxy.com/browse/BK-70) Test Repository: Test foundation; current repo has tests and test_steps but not Run reporting tables yet.
- Repo evidence: `supabase/migrations/0024_tests.sql`, `app/api/v1/tests/route.ts`.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Implementation Plan (Dev)](./implementation-plan.md)

---

## Traceability

### Test Execution (1)

- [BK-319](https://jira.upexgalaxy.com/browse/BK-319): [ATR] BK-38 — TMS-Run Reporting | Filter project runs with pass/fail totals _(Close)_

### Storys (2)

- [BK-225](https://jira.upexgalaxy.com/browse/BK-225): TMS-Run Reporting | Filter runs by manual or automated execution mode _(Backlog)_
- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Ready For Release)_

### Test Plan (1)

- [BK-318](https://jira.upexgalaxy.com/browse/BK-318): [ATP] BK-38 — TMS-Run Reporting | Filter project runs with pass/fail totals _(READY)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 8/9/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** implementation-plan-ready, shift-left-2026-06-15, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
