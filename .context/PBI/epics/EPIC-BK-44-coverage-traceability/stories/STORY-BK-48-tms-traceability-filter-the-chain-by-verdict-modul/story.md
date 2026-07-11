# TMS-Traceability | Filter the chain by verdict, module, and date range

**Jira Key:** [BK-48](https://jira.upexgalaxy.com/browse/BK-48)
**Epic:** [BK-44](https://jira.upexgalaxy.com/browse/BK-44) (Coverage & Traceability)
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** 3
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

## User story

As a Senior QA Engineer, I want to filter the evidence chain by result, module and date range so that I can focus on what failed, where, and when without scrolling the whole history.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-06-16

> Refined Acceptance Criteria live in the acceptance_criteria field (Step 1a).

### Edge Cases Identified

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Inverted date range (from after to) | No | Medium | Add to AC (PO confirm) |
| 2 | Filtering by a soft-archived module | No | High | Add to AC (PO confirm) |
| 3 | Date-range inclusive/exclusive boundary | No | Medium | Add to AC (PO confirm) |
| 4 | Verdict filter value with zero matching runs (vs. an invalid/unsupported verdict value) | No | Low | Test only — don't add AC |
| 5 | Cross-workspace data exposure through crafted filter params | No | High | Add to AC (PO confirm) — security-relevant |
| 6 | Filter applied on a chain with zero underlying evidence (BK-45 "no coverage") vs. filter matching zero evidence (BK-48 AC3) — distinguishing the two empty states | No | Medium | Add to AC (PO confirm) |
| 7 | Filter state persistence across reload / navigation / share | No | Medium | Add to AC (PO confirm) |

### Clarified Business Rules

- Filter targets the Run's verdict field (once BK-30 defines it) — not the ATC `status` field — pending PO confirmation.
- Module + date-range filters are assumed AND logic, not OR, pending PO confirmation.
- Date range is assumed to filter on Run `executed_at` as the most natural "when did the evidence happen" anchor, pending PO confirmation.
- Module filter scope (exact-match vs. tree-scoped to include descendant sub-modules) is undefined and must be confirmed before estimation.

### Critical Questions for PO

1. ***Does the result filter prune entire AC/Test branches with no failing descendant, or only filter the Run-level rows while keeping parent AC/Test rows visible?***

1. ***Are module + date-range filters combined with AND or OR logic, and is the module filter exact-match on the selected node or tree-scoped to include sub-modules?***

1. ***Should this Story remain in the current sprint-readiness pipeline given that its data source (BK-45's chain) and BK-45's own upstream dependencies (BK-24 Tests, BK-30 Runs, BK-31 Defects) are all still in "Planificación" with no schema?***

### Technical Questions for Dev

1. ***Will filter predicates be pushed down into the (future) chain-assembly query, or applied client-side after fetching the full unfiltered chain?*** — Context: BK-45's refinement already flags an N+1 / large-chain performance risk at the assembly layer; adding filter logic without server-side predicate push-down compounds that risk for any story with a large ATC/Run count. Testing impact: determines whether performance/boundary outlines test the API layer or only the UI rendering layer.

1. ***What is the persistence mechanism for filter state — URL query params, local component state, or server-side saved view?*** — Context: no AC addresses this. Testing impact: determines whether "share this filtered view" / browser-back-button test outlines are in scope at all.

1. ***Which timestamp column does the date-range filter target — Run ****`executed_at`****, or some other per-layer timestamp — and is the range inclusive or exclusive at the boundaries?*** — Context: boundary test outline cannot be finalized without this.

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the ATP DRAFT custom field and the canonical comment below.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)

---

## Traceability

### Test (1)

- [BK-189](https://jira.upexgalaxy.com/browse/BK-189): Test TMS-Traceability | Filter the chain by verdict, module, and date range _(Draft)_

### Epic (1)

- [BK-30](https://jira.upexgalaxy.com/browse/BK-30): Manual Execution & Runs _(Planning)_

---

## Metadata

- **Created:** 6/1/2026
- **Updated:** 7/9/2026
- **Reporter:** Ely
- **Assignee:** pinto.lucas.nahuel
- **Labels:** new-feature, shift-left-2026-06-16, shift-left-reviewed, sprint-planning-estimated

---

_Synced from Jira by sync-jira-issues_
