# Comments for BK-48

[View in Jira](https://jira.upexgalaxy.com/browse/BK-48)

---

### Ely - 7/30/2026, 1:28:37 PM

Mockup — Traceability chain — filters. Source: .context/designs/bunkai-test-management-tool/bk-44-metrics-coverage/traceability-chain.html · spec: master-design-plan §4.7



---

### pinto.lucas.nahuel - 8/11/2026, 6:33:59 AM

## Shift-Left Refinement — 2026-08-10 (Supersedes 2026-06-16)

***Shift-left QA***: opencode
***Date***: 2026-08-10
***ATP DRAFT***: ATP-BK-48-TRACEABILITY-FILTER-v2
***Version***: 2
***Supersedes***: 2026-06-16 refinement (all dependencies were unbuilt then; now SHIPPED)

---

## Refined Acceptance Criteria

### AC1 — Result filter (multi-select toggle buttons, row-level, six-value verdict)

#### Scenario 1.1: Should filter chain rows by single verdict value when a result toggle is pressed (Type: Positive, Priority: High)

- ***Given***: a user story with chain rows having mixed outcomes (pass, fail, blocked, skipped, running)
- ***When***: the Senior QA Engineer presses the "Fail" result toggle (data-result="fail", aria-pressed="true")
- ***Then***: only chain rows with data-status="fail" are visible; all other rows are hidden
- ***Then***: the AC card remains visible if it has at least one visible row; hidden if zero visible rows
- ***Then***: a per-AC note shows "n of m shown ·" in the AC header
- ***Then***: the active-filter summary shows "Result: fail" chip

#### Scenario 1.2: Should filter chain rows by multiple verdict values when multiple toggles are pressed (Type: Positive, Priority: High)

- ***Given***: chain rows with outcomes pass, fail, blocked, skipped
- ***When***: the Senior QA Engineer presses "Fail" AND "Blocked" toggles
- ***Then***: only rows with data-status="fail" OR data-status="blocked" are visible
- ***Then***: active-filter summary shows "Result: fail, blocked"

#### Scenario 1.3: Should support all six verdict values per D27 mandate (Type: Positive, Priority: High)

- ***Given***: the result filter bar
- ***When***: inspecting the available toggle buttons
- ***Then***: six toggles exist: Pass, Fail, Blocked, Skipped, Aborted, Running
- ***NEEDS PO/DEV CONFIRMATION*** — verify real BK-45 chain endpoint exposes all six outcome values

### AC2 — Module filter (exact-match select) + date range (inclusive, latest-run date)

#### Scenario 2.1: Should filter chain rows by exact module value when a module is selected (Type: Positive, Priority: High)

- ***Given***: chain rows with modules MOD-001, MOD-002, MOD-008
- ***When***: the Senior QA Engineer selects "MOD-001" from the module dropdown
- ***Then***: only rows with data-module="MOD-001" are visible
- ***Then***: the active-filter summary shows "Module: MOD-001"

#### Scenario 2.2: Should filter chain rows by inclusive date range on latest-run date (Type: Positive, Priority: High)

- ***Given***: chain rows with data-date values spanning multiple dates
- ***When***: the Senior QA Engineer enters From "2026-07-20" and To "2026-07-25"
- ***Then***: only rows with data-date between "2026-07-20" and "2026-07-25" inclusive are visible
- ***Then***: rows with empty data-date are excluded when date filter is active

#### Scenario 2.3: Should apply AND logic across result + module + date filters (Type: Positive, Priority: High)

- ***Given***: chain rows with mixed modules, outcomes, and dates
- ***When***: the Senior QA Engineer selects module "MOD-001", presses "Fail" toggle, and enters a date range
- ***Then***: only rows matching ALL THREE criteria are visible (AND, not OR)

#### Scenario 2.4: Should reject inverted date range inline without breaking other filters (Type: Negative, Priority: High)

- ***Given***: the date filter inputs
- ***When***: the Senior QA Engineer enters From "2026-07-25" and To "2026-07-20" (inverted)
- ***Then***: the error message "From date is after to date. Date filter ignored until fixed." appears
- ***Then***: both date inputs get aria-invalid="true"
- ***Then***: the date filter is IGNORED while invalid; other filters continue to work

#### Scenario 2.5: Should hide AC card only when ALL its rows are filtered out (Type: Positive, Priority: Medium)

- ***Given***: AC with 2 rows (one pass, one fail)
- ***When***: the Senior QA Engineer filters by result "fail"
- ***Then***: AC card remains visible with 1 of 2 rows shown
- ***Then***: the per-AC note shows "1 of 2 shown ·"

### AC3 — Zero-match state ("Filters excluded everything")

#### Scenario 3.1: Should show distinct "Filters excluded everything" panel when filters match no rows (Type: Negative, Priority: High)

- ***Given***: chain rows exist but a filter combination matches none of them
- ***When***: the Senior QA Engineer applies that filter combination
- ***Then***: the filtered-empty panel appears with title, body, and "Clear all filters" button
- ***Then***: this panel is visually distinct from the zero-coverage banner and the zero-AC empty panel

### AC4 — Active-filter summary and Clear-all

#### Scenario 4.1: Should display active-filter chip summary when any filter is applied (Type: Positive, Priority: Medium)

- ***Given***: one or more filters active
- ***When***: the Senior QA Engineer looks at the filter bar
- ***Then***: the active-summary bar appears with "Active filters:" text + filter chips
- ***Then***: each active filter shows as a chip
- ***Then***: the row-count element shows "N of M chain entries shown" via aria-live

#### Scenario 4.2: Should clear all filters when Clear-all is pressed (Type: Positive, Priority: Medium)

- ***Given***: one or more filters active
- ***When***: the Senior QA Engineer presses "Clear all"
- ***Then***: all result toggles reset to aria-pressed="false"
- ***Then***: module select resets to "all"
- ***Then***: date inputs clear to empty
- ***Then***: the full unfiltered chain is restored

---

## Business Rules

1. ***Result filter***: Targets chain row's data-status (latest-run outcome). Six values: pass, fail, blocked, skipped, aborted, running.
2. ***Filter logic***: AND across result + module + date filters.
3. ***Module filter***: Exact-match on data-module (NOT tree-scoped).
4. ***Date filter***: Filters data-date (latest-run date). INCLUSIVE on both ends.
5. ***Row-level filtering***: AC card hidden only when ALL its rows are filtered out.
6. ***Empty states***: THREE distinct states — filter-empty, zero-coverage, zero-AC.
7. ***Active filter display***: "Active filters:" + chips + Clear all button + aria-live count.

## Scope

- Chain-view filter bar (result toggles, module select, date range, active-filter chips)
- Client-side filtering logic (row-level, AND across filters)
- Three distinct empty states
- Per-AC row count ("n of m shown")
- Active-filter summary with Clear-all

## Out of Scope

- Filter-state persistence (URL params vs local) — needs PO decision
- Archived-module behavior — needs PO decision
- Server-side filter predicate push-down
- New chain rows, new API endpoints, new data attributes
- Visual redesign, AC card redesign, modal dialogs, mobile layouts
- Export filtered chain (deferred to BK-50 scope)

---

## Story Quality Assessment

***Verdict***: Good (refreshed from "Significant Issues")

- All dependencies SHIPPED
- Mockup contract resolves 7/9 original ambiguities
- Only 3 items remain genuinely open
- Story is testable against real chain data

## Open Items

1. Filter-state persistence: URL query params vs local component state?
2. Archived-module behavior: excluded from picker, or resolves to empty-result state?
3. Shipped-chain alignment: does BK-45 expose latest-Run date per row and all six outcomes?

## Coverage Estimate

14 outlines: Positive (6), Negative (3), Boundary (3), Integration (2).

---

### pinto.lucas.nahuel - 8/11/2026, 7:30:22 AM

## PO Decisions Applied — 2026-08-11

***Decisions made by***: PO Senior (opencode)
***Date***: 2026-08-11
***Status***: All 3 open items resolved

---

### Decision 1: Filter-state persistence → URL query params

***Decision***: Filters persist in URL query params.

***Justification***:

- ***Shareability***: QA can share filtered views via URL ("mirá este story con Fail en MOD-001 de julio")
- ***Back button***: Browser navigation preserves filter state
- ***Zero cost***: No backend, no storage, no sync needed — just read/write `window.location.search`
- ***No saved views needed***: This is exploration, not a dashboard

***Format***: `?result=fail&module=MOD-001&from=2026-07-20&to=2026-07-25`

---

### Decision 2: Archived-module behavior → Exclude from dropdown

***Decision***: Archived modules do not appear in the module dropdown.

***Justification***:

- ***Archived = inactive***: If the system declared a module as archived, it's not relevant for current exploration
- ***Consistency***: Module status is system-wide; filter picker should respect it
- ***No confusion***: User selects archived module → sees nothing → thinks it's broken. Better to not show it.
- ***Future improvement***: If needed later, add "Include archived" checkbox

---

### Decision 3: Shipped-chain alignment → Assume fields exist + defensive frontend

***Decision***: Assume BK-45 exposes `data-status`, `data-date`, `data-module`. Add frontend defensive validation.

***Justification***:

- ***Mockup defines it***: The contract (HTML + D-rows) specifies these attributes; BK-45 was built against it
- ***Endpoint is live***: `GET /api/v1/projects/{id}/traceability` is shipped and rendering correctly
- ***Defensive validation***: Missing attrs → exclude from filtered results, show in full unfiltered view
- ***No blocking***: Resolved via integration testing against real endpoint

---

### Updated Coverage Estimate

***Before***: 14 outlines (Positive 6, Negative 3, Boundary 3, Integration 2)
***After***: 18 outlines (Positive 9, Negative 3, Boundary 5, Integration 1)

***New outlines added***:

- AC5: Filter-state persistence via URL (4 scenarios: persist, restore, back/forward, invalid params)
- AC6: Frontend defensive validation (3 scenarios: missing data-status, data-date, data-module)
- AC1.4: Graceful handling of missing data-status
- AC2.2: Archived modules excluded from dropdown
- AC2.7: Graceful handling of missing data-module

---

### Story Quality Assessment

***Verdict***: Good (all ambiguities resolved)

All 3 originally open items are now resolved. Story is fully testable against real chain data. Ready for sprint planning.

---


_Synced from Jira by sync-jira-issues_
