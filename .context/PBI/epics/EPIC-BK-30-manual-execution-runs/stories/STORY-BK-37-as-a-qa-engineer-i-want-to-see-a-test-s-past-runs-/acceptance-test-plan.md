# BK-37 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-37)

# Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37) — TMS-Run History | View a test's past runs, filterable by outcome

***Status***: Refined — Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint, single-Story session)
***Refined on***: 2026-07-21
***Refined by***: QA — Shift-Left session
***Modality***: Xray

---

## Phase 1 — Critical Analysis

### Business context

- ***Primary persona affected***: QA Engineer (Elena) — investigates flaky areas by scanning a Test's execution history.
- ***Secondary personas (if any)***: QA Lead (Mateo) — may consult the same history when reviewing a Test's reliability, though the epic's project-wide reporting ([https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38)) is his primary surface.
- ***Business value proposition***: turns a Test's individual Run log into a comparable trend instead of scattered, unlinked executions — the foundation for spotting flakiness before it becomes a release risk.
- ***KPI(s) influenced***: flaky-test detection rate, mean-time-to-identify-flaky-area.
- ***User journey position***: inside a Test's detail view, one tab/section over from starting a new Run ([https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)).

### Technical context

- ***Frontend***: a Test detail page/section rendering a Run list (outcome, environment, executor mode, ran-at), an outcome filter control, and a "load older" control. No dedicated frontend code found yet for this view (light `fd`/`rg` pass over `../upex-bunkai-tms/app` found no `run-history` or similar component).
- ***Backend****: per `business-api-map.md` + live code read of `../upex-bunkai-tms/app/api/v1/runs/`: `POST /api/v1/runs` (start) and `GET /api/v1/runs/{id`} (single Run) exist. ****No GET endpoint lists/paginates/filters a Test's Runs.*** `runs/route.ts` exports `POST` only.
- ***External services***: none.
- ***Integration points specific to this Story***: `runs` table (status, environment*id, executor*mode, started*at/finished*at per `business-data-map.md`), `project_environments` (environment display name).

### Story complexity

| ***Axis**** | ****Rating**** | ****Why*** |
| --- | --- | --- |
| Business logic | Low-Medium | Filter + pagination + newest-first ordering; no calculations |
| Integration | Medium | Requires a ***new*** read endpoint — not a pure UI task |
| Data validation | Low | Read-only; only query-param validation (outcome enum, cursor) |
| UI | Medium | List + filter control + load-more control + 2 distinct empty states |

***Estimated test effort***: Medium — the current 1-point estimate likely assumed the read endpoint already existed. Flagging for PO re-estimation once the API gap below is resolved.

### Epic-level inheritance ([https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) — Manual Execution & Runs)

- Risks restated at Story level: `runs.status` lifecycle is `running -> {passed | failed | aborted`}, terminal and monotonic (ADR-0004) — directly relevant to this Story's "past runs" framing (see Critical Question 1 below).
- Integration points inherited: `executor_mode` is a plain Run attribute (human/agent/ci) — display-only here, no new logic.
- PO/Dev answers already given at epic level: none cover history listing/filtering specifically — sibling Stories [https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34](https://jira.upexgalaxy.com/browse/BK-34#icft=BK-34)/35/36/39 cover execution, [https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38](https://jira.upexgalaxy.com/browse/BK-38#icft=BK-38) covers project-wide (not per-Test) reporting and is explicitly out-of-scope for [https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37](https://jira.upexgalaxy.com/browse/BK-37#icft=BK-37).
- Test strategy inherited: none specific to history views yet.

---

## Phase 2 — Story Quality Analysis

### Ambiguities

| ***#**** | ****Location in Story**** | ****Question for PO/Dev**** | ****Impact on testing**** | ****Suggested clarification*** |
| --- | --- | --- | --- | --- |
| 1 | AC4 / Business Rules "older runs load on demand" | Is 50 (the number used in the AC4 example: "60 past runs and the first 50 are shown") the actual contract page size, or just illustrative? | Cannot write boundary test cases (49/50/51) without the real number | State the page size explicitly in Business Rules |
| 2 | Business Rules "Filters and ordering compose" | Does pagination also compose with the active filter — does "load older" traverse only the filtered set, or the whole history? | Determines whether load-more query needs the outcome param | Add one line confirming filter+pagination composition |

### Gaps (missing info)

| ***#**** | ****Type**** | ****Why critical**** | ****What to add**** | ****Risk if omitted*** |
| --- | --- | --- | --- | --- |
| 1 | Technical detail | No GET endpoint exists to list a Test's Runs (only `POST /runs` and `GET /runs/{id`} are implemented) | Add the endpoint to the implementation plan before FE work starts | Sprint commitment on a Story that cannot be built as scoped |
| 2 | Business rule | Story never states whether an in-progress ("running") Run appears in "past runs" history | Add an explicit rule: history = terminal Runs only, OR history includes an in-progress row | Wrong list query (filter on status) + wrong empty-state trigger for a Test with only 1 running Run |

### Edge cases not in Story

| ***#**** | ****Scenario**** | ****Expected behavior (best guess)**** | ****Criticality**** | ****Action*** |
| --- | --- | --- | --- | --- |
| 1 | Outcome filter applied but 0 Runs match (e.g. filter "aborted" on a Test with 0 aborted Runs) | A distinct "No {outcome} runs found" message, different from the "never run" empty state | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 2 | Test has exactly 50 Runs (page-size boundary) | No "load more" control shown — everything fits on page 1 | Medium | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 3 | Test has exactly 51 Runs | "Load more" appears; clicking it loads exactly 1 additional Run | Medium | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 4 | Two Runs share the identical "ran at" timestamp | Stable secondary sort key (e.g. `id`) prevents flaky ordering across page loads | Low | Test only — don't add AC |

### Contradictions

No contradictions found. The Story title ("past runs") and the Business Rules ("outcome filter accepts passed, failed, or aborted; a still-running run is not an outcome filter option") are directionally consistent with excluding in-progress Runs, but neither states it explicitly — see Gap #2, not a contradiction.

### Testability validation

***Verdict***: Partial

Issues:

- Missing page-size number (Ambiguity #1) blocks BVA scenario data.
- Missing in-progress-Run inclusion rule (Gap #2) blocks list-query test design.
- Missing 0-match filter empty-state copy (Edge #1) blocks an exact-text assertion.

---

## Phase 3 — Refined Acceptance Criteria

### Original AC1 — View a Test's runs newest first

#### Scenario 1.1: Should list a Test's runs newest first with full metadata per entry (Type: Positive, Priority: Critical)

- ***Given***: the Test "Checkout happy path" has 5 past runs
- ***When***: Elena opens the Test's run history
- ***Then***:

### Original AC2 — Filter history by outcome

#### Scenario 2.1: Should show only failed runs when the outcome filter is set to "failed" (Type: Positive, Priority: Critical)

- ***Given***: the Test "Checkout happy path" has 8 runs: 5 passed, 2 failed, 1 aborted
- ***When***: Elena filters by outcome "failed"
- ***Then***: only the 2 failed runs are shown, newest-first within that subset; passed and aborted rows are hidden

#### Scenario 2.2: Should show a distinct empty message when the outcome filter matches 0 runs (Type: Negative, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: exact copy inferred, not literal in the Story
- ***Given***: the Test "Checkout happy path" has 8 runs, 0 of which are "aborted"
- ***When***: Elena filters by outcome "aborted"
- ***Then***: a message like "No aborted runs found" is shown (distinct from the "never run" empty state) and no rows are listed

### Original AC3 — Empty state for a Test never run

#### Scenario 3.1: Should show the "No runs yet" empty state for a Test with 0 runs (Type: Positive/Edge, Priority: Critical)

- ***Given***: the Test "New regression suite" has 0 past runs
- ***When***: Elena opens its run history
- ***Then***: she sees "No runs yet for this Test" and no run rows are listed

#### Scenario 3.2: Should exclude in-progress runs from the "past runs" history (Type: Edge, Priority: Critical)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred from "past runs" framing + Business Rules, not stated explicitly
- ***Given***: the Test "Checkout happy path" has 1 Run currently `running` and 0 terminal Runs
- ***When***: Elena opens its run history
- ***Then***: she sees the "No runs yet for this Test" empty state (the in-progress Run is not counted as a "past" run)

### Original AC4 — Load older runs beyond the first page

#### Scenario 4.1: Should load older runs beyond the first page, staying newest-first overall (Type: Positive, Priority: High)

- ***Given***: the Test "Checkout happy path" has 60 past runs and the first 50 are shown
- ***When***: Elena chooses to load older runs
- ***Then***: the remaining 10 older runs are appended below, still newest-first overall

#### Scenario 4.2: Should not show a "load more" control when a Test has exactly the page-size number of runs (Type: Boundary, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: page size assumed = 50 pending Ambiguity #1
- ***Given***: the Test "Checkout happy path" has exactly 50 past runs
- ***When***: Elena opens its run history
- ***Then***: all 50 are shown on the first page and no "load more" control is rendered

#### Scenario 4.3: Should load exactly 1 additional run when a Test has one run beyond the page-size boundary (Type: Boundary, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: page size assumed = 50 pending Ambiguity #1
- ***Given***: the Test "Checkout happy path" has exactly 51 past runs
- ***When***: Elena loads older runs
- ***Then***: exactly 1 additional run is appended

#### Scenario 4.4: Should keep the active outcome filter applied when loading older runs (Type: Integration, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: filter+pagination composition inferred from Ambiguity #2
- ***Given***: the Test "Checkout happy path" has 60 failed runs, filtered by outcome "failed", first 50 shown
- ***When***: Elena loads older runs
- ***Then****: the next 10 ****failed*** runs are appended — the load-more action stays scoped to the active filter, not the unfiltered history

### Original AC5 — Clearing the filter restores the full list

#### Scenario 5.1: Should restore the full newest-first list when the outcome filter is cleared (Type: Positive, Priority: High)

- ***Given***: Elena has filtered the history to outcome "aborted" showing 1 run (of 8 total)
- ***When***: she clears the outcome filter
- ***Then***: all 8 runs are shown again, newest first

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| ***Type**** | ****Count**** | ****Notes*** |
| --- | --- | --- |
| Positive | 7 | Happy-path listing, per-outcome filtering, clear-filter, load-more |
| Negative | 1 | 0-match filter empty state |
| Boundary | 3 | 0 runs, exactly page-size, page-size+1 |
| Integration | 2 | Filter+pagination composition, in-progress-Run exclusion |
| API | 1 | The new GET history endpoint itself |
| ***Total**** | ****14*** | Drives PO estimation — note the 1-point Jira estimate likely predates the missing-endpoint discovery |

***Rationale***: the Story reads as a simple list+filter view, but the outcome field is a 3-way enum (BVA-adjacent) and pagination introduces a real numeric boundary (S2/BVA per `test-design-doctrine.md`), so the outline count legitimately exceeds the 5 original AC scenarios 1:N.

### Outline list

#### Positive

- ***Should list a Test's runs newest-first with outcome/environment/executor-mode/ran-at per row*** — Pre: Test has >=1 terminal Run. Expected: rows ordered newest-first, full metadata per row.
- ***Should filter history to passed runs only*** — Pre: Test has a mix of outcomes. Expected: only passed rows shown.
- ***Should filter history to failed runs only*** — Pre: Test has a mix of outcomes. Expected: only failed rows shown.
- ***Should filter history to aborted runs only*** — Pre: Test has a mix of outcomes. Expected: only aborted rows shown.
- ***Should clear the outcome filter and restore the full newest-first list*** — Pre: a filter is active. Expected: all runs shown again, newest-first.
- ***Should load older runs beyond the first page, keeping newest-first order overall*** — Pre: Test has more runs than one page. Expected: older runs appended below.
- ***Should keep the active filter applied across "load more"*** — Pre: filter active + filtered set spans >1 page. Expected: only matching-outcome runs load.

#### Negative

- ***Should show a distinct "no**** ****{outcome} runs" message when the filter matches 0 runs**** — Pre: Test has runs but none matching selected outcome. Expected: outcome-specific empty message, not the "never run" one. **(NEEDS PO/DEV CONFIRMATION)*

#### Boundary

- ***Should show the "No runs yet" empty state for a Test with 0 runs*** — Pre: Test never run. Expected: empty-state message, no rows.
- ***Should hide "load more" when the Test has exactly the page-size number of runs**** — Pre: Test has exactly page-size runs. Expected: no load-more control. **(NEEDS PO/DEV CONFIRMATION — page size)*
- ***Should load exactly 1 run when the Test has page-size+1 runs**** — Pre: Test has page-size+1 runs. Expected: load-more appends exactly 1 row. **(NEEDS PO/DEV CONFIRMATION — page size)*

#### Integration

- ***Should exclude in-progress ("running") Runs from the "past runs" history**** — Pre: Test has only a running Run, 0 terminal Runs. Expected: empty state shown, running Run not counted. **(NEEDS PO/DEV CONFIRMATION)*
- ***Should serve the history via a dedicated GET endpoint (does not exist yet)*** — Pre: endpoint built per Technical Question 1. Expected: `GET` returns paginated, filterable, ordered Run list for a `test_id`.

> ***NOT included here*** (deferred to in-sprint planning by `/sprint-testing` Stage 1): parametrization tables, per-outline test-data JSON, numbered test steps, Faker generation strategies.

---

## Phase 5 — Edge Cases (DRAFT)

| ***#**** | ****Edge case**** | ****In original Story?**** | ****Criticality**** | ****Action*** |
| --- | --- | --- | --- | --- |
| 1 | Outcome filter matches 0 runs | No | High | Add to AC (PO confirm exact copy) |
| 2 | Exactly page-size runs (no load-more shown) | No (page size itself unconfirmed) | Medium | Add to AC once page size confirmed |
| 3 | Page-size + 1 runs (load-more shows exactly 1) | No | Medium | Add to AC once page size confirmed |
| 4 | Test with only an in-progress Run, 0 terminal Runs | No | High | Add to AC (PO confirm inclusion/exclusion) |
| 5 | Two runs with identical "ran at" timestamp | No | Low | Test only — don't add AC |

> Test-data generation strategy + Faker recipes are NOT defined here. They land in `/sprint-testing` Stage 1 when the feature exists.

---

## Story Quality Assessment

***Verdict***: Needs Improvement

***Key findings***:

- The 5 original AC scenarios are well-written (concrete Given/When/Then, real numbers) — the Story author did good work.
- Three real gaps remain: the page-size contract is only implied by an example number, the in-progress-Run inclusion rule is unstated, and pagination-vs-filter composition isn't explicit.
- The Story is not implementable as scoped today — no GET endpoint exists to list/filter/paginate a Test's Runs (`app/api/v1/runs/route.ts` only has `POST`).

---

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***Are in-progress ("running") Runs included in a Test's "past runs" history, or is history strictly terminal (passed/failed/aborted)?***

1. ***What is the actual page-size contract for "load older runs"?***

1. ***Does the outcome filter stay applied when the user loads older runs (i.e. does pagination compose with the active filter)?***

---

## Technical Questions for Dev

1. ***No GET endpoint exists to list/filter/paginate a Test's Runs*** (`runs/route.ts` exports `POST` only; `runs/[id]/route.ts` exports `GET` for a single Run only). Confirm the new endpoint's shape (e.g. `GET /api/v1/runs?test_id=&outcome=&cursor=`) before implementation starts — this Story cannot land without it.
2. What is the tie-break sort key when two Runs share the identical "ran at" timestamp? A stable secondary key (e.g. `id`) avoids flaky pagination ordering across page loads.
3. Is "No runs yet for this Test" the only empty-state string, or does a 0-match filtered result need distinct copy (e.g. "No aborted runs found")? Affects the i18n key count for this view.

---

## Suggested Story Improvements

| ***#**** | ****Current state**** | ****Suggested change**** | ****Benefit*** |
| --- | --- | --- | --- |
| 1 | "Older Runs can be loaded beyond the first page" (no number) | State the page size explicitly, e.g. "beyond the first 50" | Removes the page-size ambiguity; makes AC4 objectively testable |
| 2 | Silent on in-progress Runs | Add an explicit line: "In-progress Runs are excluded from history; only terminal Runs (passed/failed/aborted) appear" | Removes a data-model ambiguity that would otherwise surface as a QA-found bug |

---

## Data feasibility flags

- ***Entity / fixture missing***: none — the `runs` table already carries every field the history view needs (`status`, `environment*id`, `executor*mode`, timestamps).
- ***API contract gap***: confirmed via code read of `../upex-bunkai-tms/app/api/v1/runs/` — no GET endpoint lists/filters/paginates a Test's Runs. Only `POST /api/v1/runs` (start) and `GET /api/v1/runs/{id`} (single Run) exist.
- ***Required pre-work***: a new read endpoint (+ its `route.openapi.ts` schema, following the sibling pattern already used for `abort`/`finish`) must be scoped and built before frontend work on this Story can start.

---

## Recommended testing strategy

### Pre-implementation

- PO answers the 3 Critical Questions above.
- Dev scopes the new GET endpoint (Technical Question 1) and confirms it in the implementation plan.

### During implementation

- Verify the page-size boundary (page-size-1 / page-size / page-size+1) once the number is confirmed.
- Verify in-progress-Run exclusion once confirmed.
- Verify filter+pagination composition once confirmed.

### Post-implementation (in-sprint by /sprint-testing)

- Full ATP with real test-data fixtures (a Test with 60+ Runs spanning all 3 outcomes + 1 in-progress Run).
- Parametrization tables + Faker recipes for Run generation.
- Numbered test steps per outline.

---

## Risks & mitigation

| ***#**** | ****Risk**** | ****Likelihood**** | ****Impact**** | ****Mitigated by which outlines*** |
| --- | --- | --- | --- | --- |
| 1 | GET history endpoint doesn't exist and isn't scoped before sprint commitment | High (confirmed) | High — blocks every outline | Technical Question 1; PO/Dev must resolve before `ready*for*dev` |
| 2 | In-progress-Run inclusion ambiguity ships wrong | Medium | Medium — wrong empty-state trigger, confusing UX | Outline "Should exclude in-progress Runs" |
| 3 | Page-size mismatch between FE and BE (each assumes a different number) | Medium | Medium — silent pagination bugs | Boundary outlines once page size confirmed |

---

## Next steps

- [ ] PO answers Critical Questions before sprint planning
- [ ] Dev answers Technical Questions before estimation
- [ ] Story enters sprint at status `Ready For Dev` once estimated
- [ ] When Story reaches `Ready For QA`, `/sprint-testing` will short-circuit refinement (label `shift-left-reviewed` detected)

---
_Synced from Jira by sync-jira-issues_
