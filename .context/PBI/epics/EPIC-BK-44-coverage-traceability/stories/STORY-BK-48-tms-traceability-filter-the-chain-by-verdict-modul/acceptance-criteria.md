# BK-48 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-48)

## Original AC1 — Filter the chain to failures only

### Scenario 1.1: Should show only failed criteria, tests and runs when filtering by result "failed" (Type: Positive, Priority: High)

- ***Given***: a user story with a mix of passing and failing runs across its chain (e.g. AC-1 → Test-A → Run "pass"; AC-2 → Test-B → Run "fail")
- ***When***: the Senior QA Engineer applies the result filter with value `"failed"`
- ***Then***: the chain shows only AC-2 / Test-B / its failing Run (and any linked defect); AC-1 / Test-A are hidden or excluded from the rendered chain

***NEEDS PO/DEV CONFIRMATION*** — whether filtering prunes the tree (hides whole AC/Test branches with no failing descendant) or filters Run rows only while keeping parent rows visible.

### Scenario 1.2: Should leave passing branches visible when not all of a story's tests failed under the same AC (Type: Edge, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred — confirm before sprint planning
- ***Given***: AC-1 has Test-A (passed) and Test-B (failed)
- ***When***: the Senior QA Engineer filters by result "failed"
- ***Then***: TBD pending Ambiguity #2 resolution — either AC-1 disappears entirely, or AC-1 renders showing only Test-B

## Original AC2 — Filter by module and date range

### Scenario 2.1: Should show only evidence for a given module within a given date range (Type: Positive, Priority: High)

- ***Given***: evidence spanning multiple modules (e.g. `Payments`, `Auth/Login`) and multiple dates (e.g. Run executed_at values across several days)
- ***When***: the Senior QA Engineer filters by module `"Payments"` and date range `2026-06-01` to `2026-06-15`
- ***Then***: the chain shows only evidence belonging to the `Payments` module with Run `executed_at` between `2026-06-01T00:00:00` and `2026-06-15T23:59:59` inclusive

***NEEDS PO/DEV CONFIRMATION*** — whether the module filter is exact-match on the selected module node or tree-scoped to include descendant sub-modules.

### Scenario 2.2: Should apply module and date filters as AND logic, not OR (Type: Positive, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred — confirm before sprint planning
- ***Given***: evidence exists for module `Payments` outside the date range, AND evidence exists for module `Auth` inside the date range
- ***When***: the Senior QA Engineer filters by module `Payments` AND date range covering only the `Auth` evidence's dates
- ***Then***: zero results are returned (neither the out-of-range `Payments` evidence nor the wrong-module `Auth` evidence qualifies) — confirms AND, not OR, combination semantics

## Original AC3 — Filter with no matches

### Scenario 3.1: Should show an empty result with active filters clearly stated when a filter combination matches no evidence (Type: Negative, Priority: High)

- ***Given***: a filter combination (e.g. module `"NonexistentModule"` and/or a date range with zero evidence) that matches no chain rows
- ***When***: the Senior QA Engineer applies that filter combination
- ***Then***: the view shows an empty result, and the currently active filter values are displayed in a way distinct from BK-45's "no coverage exists at all" empty state

## New scenarios surfaced from edge-case analysis — NEEDS PO/DEV CONFIRMATION

### Scenario E1: Should reject or auto-correct an inverted date range (from-date after to-date) (Type: Negative, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred — confirm before sprint planning
- ***Given***: the Senior QA Engineer enters a `from` date later than the `to` date
- ***When***: the filter is applied
- ***Then***: TBD — either a validation error blocks the apply action, or the values are auto-swapped

### Scenario E2: Should resolve to the empty-result state when filtering by an archived module (Type: Edge, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred — confirm before sprint planning
- ***Given***: a module that has been soft-archived (cascade-archived per existing `bunkai*archive*module_subtree` behavior)
- ***When***: that module is selected as a filter (if still selectable) or passed via URL param
- ***Then***: TBD — either excluded from the module picker entirely, or resolves to AC3's empty-result state

---
_Synced from Jira by sync-jira-issues_
