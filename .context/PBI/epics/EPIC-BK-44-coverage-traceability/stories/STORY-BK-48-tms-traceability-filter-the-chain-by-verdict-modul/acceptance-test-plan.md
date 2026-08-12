# BK-48 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-48)

# Shift-Left Refinement: BK-48 — TMS-Traceability | Filter the chain by verdict, module, and date range

***Status***: Final — All open items resolved by PO
***Mode***: Shift-Left (pre-sprint, batch grooming)
***Refreshed on***: 2026-08-10
***PO Decisions Applied***: 2026-08-11
***Modality***: Jira-native
***Supersedes***: 2026-06-16 refinement

---

## Phase 1 — Critical Analysis

### Business context

- ***Primary persona affected***: Senior QA Engineer — needs to narrow the evidence chain to "what failed, where, and when" without scrolling full history.
- ***Business value proposition***: Removes manual spreadsheet assembly when answering "what's broken in module X this sprint."
- ***User journey position***: Refinement layer ON TOP OF the BK-45 evidence-chain view.

### Technical context

- ***Frontend***: Traceability chain view exists (BK-45 shipped). Filter bar at `filter-bar`, `applyFilters()` JS at lines 914-974.
- ***Backend***: `GET /api/v1/projects/{id}/traceability` endpoint is LIVE (BK-45 shipped). Filter is CLIENT-SIDE only in the mockup.
- ***Dependencies***: BK-45 SHIPPED, BK-50 SHIPPED (2026-08-08), BK-24/BK-30/BK-31 all SHIPPED.

### Story complexity

| Axis | Rating | Why |
| --- | --- | --- |
| Business logic | Low-Medium | Filter predicate logic straightforward per ratified mockup |
| Integration | Low | Client-side filtering over already-assembled chain |
| Data validation | Medium | Date-range boundary handling, inverted range rejection, missing attribute handling |
| UI | Medium | Filter bar with result toggles, module select, date range, active-filter chips |

***Estimated test effort***: Medium (18 outlines)

---

## Phase 2 — Story Quality Analysis

### Ambiguities — ALL RESOLVED

| # | Ambiguity | Resolution | Source |
| --- | --- | --- | --- |
| 1 | Result filter target | RESOLVED: Chain row's `data-status` (latest-run outcome). Six-value set. | HTML lines 559-563; D27 |
| 2 | Tree-pruning vs row-level | RESOLVED: ROW-LEVEL. AC card hidden only when ALL rows filtered out. | HTML lines 939-949 |
| 3 | Module filter scope | RESOLVED: Exact-match on `data-module`. NOT tree-scoped. | HTML line 926 |
| 4 | Date range anchor | RESOLVED: Filters `data-date` (latest-run date). INCLUSIVE bounds. | HTML lines 928-933 |
| 5 | AND vs OR | RESOLVED: AND across result + module + date. | HTML lines 914-936 |
| 6 | Active filter display | RESOLVED: "Active filters:" + chips + Clear all button + aria-live count. | HTML lines 588-595 |
| 7 | Empty states | RESOLVED: THREE distinct states (filter-empty / zero-coverage / zero-AC). | HTML lines 805-812 |
| 8 | Filter-state persistence | RESOLVED: URL query params. Back button, shareability, zero implementation cost. | PO Decision 2026-08-11 |
| 9 | Archived-module behavior | RESOLVED: Excluded from dropdown. Archived = inactive = not shown. | PO Decision 2026-08-11 |
| 10 | Shipped-chain alignment | RESOLVED: Assume fields exist. Frontend defensive validation for missing attrs. | PO Decision 2026-08-11 |

### Gaps — NONE

All originally open items have been resolved by PO decisions.

### Edge cases — ALL RESOLVED

| # | Scenario | Resolution |
| --- | --- | --- |
| E1 | Inverted date range | Inline rejection, filter ignored while invalid |
| E2 | Archived module in picker | Excluded from dropdown |
| E3 | Zero matching runs | "Filters excluded everything" panel |
| E4 | Date-range boundary | Inclusive on both ends |
| E5 | Missing data attributes | Frontend defensive: exclude from filtered, show in full view |
| E6 | Filter-state persistence | URL query params with back/forward support |
| E7 | Invalid URL params | Silently ignored, show full chain |

---

## Phase 3 — Refined Acceptance Criteria

6 ACs, 18 scenarios:

- ***AC1***: Result filter (4 scenarios) — single/multi verdict, six values, missing data-status
- ***AC2***: Module filter + date range (7 scenarios) — exact-match, archived exclusion, date inclusive, AND logic, inverted date, AC card hide, missing data-module
- ***AC3***: Zero-match state (1 scenario) — "Filters excluded everything" panel
- ***AC4***: Active-filter summary + Clear-all (2 scenarios) — chip display, clear all + URL reset
- ***AC5***: Filter-state persistence via URL (4 scenarios) — persist, restore, back/forward, invalid params
- ***AC6***: Frontend defensive validation (3 scenarios) — missing data-status, data-date, data-module

---

## Phase 4 — ATP DRAFT (outline names only)

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 9 | Single/multi verdict, six values, module, archived exclusion, date, AND, URL persist, URL restore |
| Negative | 3 | Inverted date, zero-match, invalid URL params |
| Boundary | 5 | Date inclusive edges, empty-date exclusion, AC card hide rule, missing data-status, missing data-date |
| Integration | 1 | Real BK-45 chain data alignment |
| ***Total**** | ****18*** | Drives PO estimation |

### Outline list

#### Positive

- Should filter chain to single verdict when one result toggle is pressed
- Should filter chain by multiple verdict values when multiple toggles are pressed
- Should support all six verdict values (pass/fail/blocked/skipped/aborted/running)
- Should filter chain by exact module value
- Should exclude archived modules from the module dropdown
- Should filter chain by inclusive date range on latest-run date
- Should apply AND logic across result + module + date filters
- Should persist filter state in URL query params
- Should restore filter state from URL query params on page load

#### Negative

- Should reject inverted date range with inline error without breaking other filters
- Should show "Filters excluded everything" panel when filter matches no rows
- Should handle invalid URL params gracefully (silently ignored)

#### Boundary

- Should include rows exactly at date-range inclusive boundaries (from and to)
- Should exclude rows with empty date when date filter is active
- Should hide AC card only when ALL its rows are filtered out
- Should exclude rows with missing data-status from filtered results
- Should exclude rows with missing data-module from filtered results

#### Integration

- Should filter over real BK-45 chain data without client-side divergence

---

## Phase 5 — Edge Cases

| # | Edge case | Resolved? | Criticality | Action |
| --- | --- | --- | --- | --- |
| E1 | Inverted date range | YES | N/A | Covered in AC2 Scenario 2.5 |
| E2 | Archived-module behavior | YES | N/A | Covered in AC2 Scenario 2.2 |
| E3 | Zero matching runs | YES | N/A | Covered in AC3 Scenario 3.1 |
| E4 | Date-range boundary | YES | N/A | Covered in Phase 4 Boundary outlines |
| E5 | Missing data attributes | YES | N/A | Covered in AC6 + AC1.4 + AC2.7 |
| E6 | Filter-state persistence | YES | N/A | Covered in AC5 (URL query params) |
| E7 | Invalid URL params | YES | N/A | Covered in AC5 Scenario 5.4 |

---

## Story Quality Assessment

***Verdict***: Good (all ambiguities resolved)

Key findings:

- All dependencies (BK-45, BK-24, BK-30, BK-31, BK-50) now SHIPPED
- Mockup contract resolves 7 of 9 original ambiguities
- PO decisions resolve remaining 3 items (URL persistence, archived module, chain alignment)
- Frontend defensive validation covers missing data attributes
- Story is fully testable against real chain data
- Coverage estimate: 18 outlines (up from 14)

---

## PO Decisions (2026-08-11)

### 1. Filter-state persistence: URL query params

***Decision***: Filters persist in URL query params.

***Justification***:

- Shareability: QA can share filtered views via URL
- Back button: Browser navigation preserves filter state
- Zero cost: No backend, no storage, no sync needed
- No saved views: This is exploration, not a dashboard

***Format***: `?result=fail&module=MOD-001&from=2026-07-20&to=2026-07-25`

### 2. Archived-module behavior: Exclude from dropdown

***Decision***: Archived modules do not appear in the module dropdown.

***Justification***:

- Archived = inactive = not relevant for current exploration
- Consistency with system-wide module status
- Avoids user confusion (select module → see nothing → think it's broken)
- Future improvement: "Include archived" checkbox if needed

### 3. Shipped-chain alignment: Assume fields exist + defensive frontend

***Decision***: Assume BK-45 exposes data-status, data-date, data-module. Add frontend defensive validation.

***Justification***:

- Mockup defines these fields; BK-45 was built against the mockup
- Endpoint is already shipped and rendering correctly
- Defensive validation: missing attrs → exclude from filtered, show in full view
- No blocking: resolved via integration testing against real endpoint

---

## Open Items

***NONE*** — All items resolved by PO decisions.

## Coverage Estimate

18 outlines: Positive (9), Negative (3), Boundary (5), Integration (1).

---
_Synced from Jira by sync-jira-issues_
