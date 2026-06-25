# Comments for BK-22

[View in Jira](https://jira.upexgalaxy.com/browse/BK-22)

---

### Ely - 5/19/2026, 9:57:34 PM

1. 🧱 Architect Annotation

1. 

- DB tables touched: READ-ONLY against `test*steps` and `tests`. Existing index `test*steps(atc_id)` is required for performant queries (verify in [https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20](https://jira.upexgalaxy.com/browse/BK-20#icft=BK-20)/[https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) — likely already added).
- API surface: `GET /atcs/{id}/usage` returns 200 `{ used*in: [...] }`. Returns 404 with error code `atc*not_found` when the ATC belongs to a different workspace (avoids existence leak).
- Query shape: `SELECT ts.test*id, t.slug, t.title, ts.position AS position*in*test FROM test*steps ts JOIN tests t ON t.id = ts.test*id WHERE ts.atc*id = $1 AND t.workspace*id = $session.workspace*id ORDER BY t.slug ASC, ts.position ASC`.
- Multi-position entries: when the same Test references the ATC at multiple positions, the JOIN naturally returns multiple rows. No deduplication.
- Workspace scoping enforced at service layer via WHERE clause. The ATC existence check (`SELECT 1 FROM atcs WHERE id = $1 AND workspace*id = $session.workspace*id`) runs first to decide 404 vs 200.
- No caching in MVP — the query is cheap (indexed FK lookup) and the response is small. Add cache only if profiling shows hot endpoint.

1. 

- Upstream: [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) (atcs table exists). EPIC-BK-5 must define `test*steps` and `tests` tables with `atc*id`, `position`, and `slug` columns. Without `test*steps` this endpoint returns empty `used*in[]` always.
- Downstream: ATC detail page UI renders "Used in N tests" widget and deep links to each Test. Delete-ATC flow (future story) will call this endpoint to display a confirmation modal with the impact list.
- External: PostgreSQL only.

1. 

- [ ] OpenAPI entry for `GET /atcs/{id}/usage` with response schema
- [ ] `bun run api:sync` passes
- [ ] Unit tests: empty result, single Test single position, single Test multi-position, multi-Test ordering by slug
- [ ] Integration test: workspace scoping returns 404 (not 403) for cross-workspace lookup
- [ ] Performance budget: < 50ms p95 on ATCs referenced in ≤ 100 Tests
- [ ] Lint + typecheck pass
- [ ] Manual smoke: curl returns expected shape on an ATC with known usage
- [ ] PR description references each AC by Gherkin scenario name

1. 

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 (US 4.5)
- SRS: `.context/SRS/functional-specs.md` § FR-013
- Business map: `.context/business/business-data-map.md` § test_steps (FK to atcs.id)
- API contract: `.context/SRS/api-contracts.yaml` § paths./atcs/{id}/usage

---

### Ely - 5/20/2026, 5:24:49 AM

# 🧱 Architect Annotation (rich-format test)

## Technical Notes

- DB tables: `atcs`, `test_steps` (join), `tests`
- API: `GET /atcs/{id}/usage` returns {{{ used*in: [{ test*id, slug, title, position*in*test }] }}}
- Pure read endpoint — caller role ≥ viewer

## Dependencies

- Upstream: ***BK-18*** (ATC API) creates the atcs table this query reads from
- Upstream: ***BK-21*** (edit propagation) emits `atc.updated` with `affected*test*ids` — this widget hydrates from that payload optimistically
- Downstream: powers the **impact preview** in BK-21's edit UI

## Definition of Done

1. Query returns `position*in*test` correctly when the same ATC appears multiple times in one Test
2. Empty result returns {{{ used_in: [] }}} not 404
3. Performance: index on `test*steps(atc*id)` exists; benchmark <50ms p95 with 10k Tests in fixture

## Related

- PRD: `.context/PRD/mvp-scope.md` § EPIC-BK-004 US 4.5
- SRS: `.context/SRS/functional-specs.md` § FR-013

```sql
-- The query this story implements
SELECT t.id, t.slug, t.title, ts.position
FROM test_steps ts
JOIN tests t ON t.id = ts.test_id
WHERE ts.atc_id = $1
ORDER BY t.created_at;
```

> Note: this is a comment ADF rich-format round-trip test. Snake*case identifiers like `atc*id` and `test_steps` must survive unchanged.

---

### Andrés Daniel Cumare Morales - 6/2/2026, 6:24:33 AM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

---

## Shift-Left Refinement: [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) — TMS-ATC Usage | See a "Used in N tests" report

***Status***: Refined — Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint, batch grooming)
***Refined on***: 2026-06-02
***Refined by***: QA — Shift-Left batch session
***Modality***: Jira-native

---

## Phase 1 — Critical Analysis

### Business context

- ***Primary persona affected***: Senior QA Engineer (Elena) — needs blast-radius awareness before editing or removing an ATC to avoid unknowingly breaking tests that reference it
- ***Secondary personas (if any)***: QA Team Lead reviewing coverage impact; Dev implementing ATC removal (future story) who depends on the impact modal
- ***Business value proposition***: Prevents silent regressions caused by ATC modifications without awareness of downstream test dependencies; completes the IQL (Integrated Quality Lifecycle) traceability chain from ATC back to Tests
- ***KPI(s) influenced***: Reduction in unintentional test-coverage gaps caused by ATC edits; time-to-detect blast radius before a change is made
- ***User journey position***: Step 3 of the ATC detail flow — after opening the ATC and before deciding to edit or remove it (per workflow.md)

### Technical context

- ***Frontend***: ATC detail page (app/(app)/projects/[projectSlug]/atcs/[atcId]/) — a read-only reporting widget that shows the "Used in N tests" count and an expandable list of Tests with their `position*in*test` values. Deep links to each Test page. No state mutation, no form submission.
- ***Backend***: GET /atcs/{id}/usage — greenfield endpoint (not yet scaffolded; no app/api/v1/atcs/ directory exists). Returns {{{ used*in: [{ test*id, slug, title, position*in*test }] }}}. Workspace scoping enforced at service layer. ATC existence check runs first to decide 404 vs 200.
- ***External services***: None (PostgreSQL only — confirmed by Architect Annotation)
- ***Integration points specific to this Story***:

- test*steps table (upstream: EPIC-BK-5) — must exist with atc*id, position columns for the JOIN query to work
- tests table (upstream: EPIC-BK-5) — must exist with workspace_id, slug, title columns
- atcs table (upstream: [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18)) — already confirmed present in 0004_atcs.sql
- [https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) (atc.updated event) — this endpoint is also called optimistically when [https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21) emits the update event; hydration contract is downstream

### Story complexity

| Axis  | Rating  | Why  |
| --- | --- | --- |
| ------ | -------- | ----- |
| Business logic  | Low  | Read-only query with workspace scoping; no write path, no state machine  |
| Integration  | Medium  | Depends on test_steps + tests tables from EPIC-BK-5, which do NOT yet exist in the schema; greenfield API route with workspace-scoped 404 semantics  |
| Data validation  | Low  | No user inputs; the only validation is ATC existence + workspace membership  |
| UI  | Low  | Read-only widget — count label + expandable list + deep links; no interactive mutation  |

***Estimated test effort***: Medium (3–4 outlines for the API layer; 2–3 UI outlines). Multi-position edge case and workspace isolation are the highest-complexity scenarios. Confidence is limited until EPIC-BK-5 lands `test*steps` and `tests` — without those tables this endpoint always returns {{{ used*in: [] }}}.

---

## Phase 2 — Story Quality Analysis

### Ambiguities

|  | Location in Story  | Question for PO/Dev  | Impact on testing  | Suggested clarification  |
| --- | --- | --- | --- |
| --- | ------------------- | --------------------- | ------------------- | ------------------------ |
| 1  | AC2: "I see each Test and the position the ATC holds within it"  | When the same ATC appears at positions 2 AND 5 within Test-A, does the list show Test-A once (collapsed) or twice (one row per position)? The Architect Annotation says "no deduplication" (multiple rows), but the UI copy "each Test" implies one row per Test.  | Cannot write a correct assertion for the expanded list count  | Specify whether the list is grouped by Test (with comma-separated positions) or is a flat row-per-position list. Architect Annotation multi-position is the source of truth — confirm it drives UI row count too.  |
| 2  | AC1 + AC2: "Used in N tests" count  | Does N count distinct Tests or total row count? If ATC is at positions 2 and 5 in Test-A and position 1 in Test-B, is N = 2 (distinct Tests) or N = 3 (rows)? The query in Architect Annotation returns multiple rows without deduplication — but the count label says "tests", implying distinct.  | The assertion for the count label will be wrong if the counting rule is not specified  | Clarify count semantics: DISTINCT test_id count vs raw row count. Business phrasing "N tests" strongly implies distinct.  |
| 3  | AC4: "Tests in the same workspace are not counted"  | The current AC describes the outcome for a cross-workspace Test but does not specify what the user sees. Is the ATC detail page still rendered with { used_in: [] } (empty, no error), or does the page show a different state?  | Cannot design the negative UI scenario — is it "empty list" or an error message?  | Clarify: cross-workspace Tests are silently excluded from the count (ATC renders normally with an accurate lower count), distinct from the 404 scenario where the ATC itself is from another workspace.  |
| 4  | workflow.md: "She uses this to judge impact before editing or removing the ATC"  | Scope says "Use the report as an impact preview before editing or removing the ATC" — but editing and removing are covered by different stories ([https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21](https://jira.upexgalaxy.com/browse/BK-21#icft=BK-21), future delete story). Is the widget interactive during editing (live update as steps are moved) or only on the read-only detail page?  | Determines whether the widget needs a loading/stale state during ATC mutation  | Confirm: widget is read-only on detail page only, not embedded in the editor.  |

### Gaps (missing info)

|  | Type  | Why critical  | What to add  | Risk if omitted  |
| --- | --- | --- | --- |
| --- | ------ | -------------- | ------------- | ----------------- |
| 1  | AC  | No AC covers the 404 behavior when the ATC ID belongs to a different workspace. Architect Annotation specifies 404 with atc*not*found code — but no AC validates this.  | Add explicit AC: "Given an ATC ID that belongs to a different workspace, when I call GET /atcs/{id}/usage, then I receive 404 with error code atc*not*found"  | Security regression — without this AC a Dev might accidentally implement 403 (which leaks ATC existence) or 200 with empty result (different semantics)  |
| 2  | AC  | No AC covers the { used*in: [] } vs 404 distinction for an ATC with zero usage. AC3 covers the UI ("empty list") but not the API shape. Architect Annotation explicitly says empty → { used*in: [] } NOT 404.  | Add API-level AC: "Given a valid ATC with no test*steps references, GET /atcs/{id}/usage returns 200 { used*in: [] }"  | Developer may return 404 for unused ATCs, breaking the UI widget when it expects a 200 with an empty array  |
| 3  | Technical detail  | Performance budget (< 50ms p95, <= 100 Tests per Annotation; < 50ms p95 with 10k Tests per second Annotation) is contradictory across the two Architect Annotations.  | Reconcile and document the authoritative performance target in AC or DoD.  | Cannot write a valid performance test — the two Annotations give conflicting fixture sizes (100 Tests vs 10k Tests).  |
| 4  | Business rule  | No business rule covers the minimum role required to call this endpoint. Architect Annotation says "caller role >= viewer" — but the ACs and Business Rules table are silent on authorization.  | Add to Business Rules: "Viewer-role workspace members can read ATC usage reports."  | Risk: Dev implements a member-or-higher gate, blocking viewer-role users from seeing reports; or leaves it open to unauthenticated callers.  |
| 5  | AC  | No AC covers the list ordering. Architect Annotation defines ORDER BY t.slug ASC, ts.position ASC — but the ACs do not specify sort order.  | Add to Business Rules or AC: "Tests are listed ordered by slug ascending; within the same Test, positions are listed ascending."  | In-sprint QA cannot write a deterministic order assertion; flaky tests in automation  |

### Edge cases not in Story

|  | Scenario  | Expected behavior (best guess)  | Criticality  | Action  |
| --- | --- | --- | --- |
| --- | ---------- | ------------------------------- | ------------- | -------- |
| 1  | Same ATC referenced at two positions in the same Test (e.g. position 2 and position 5)  | Per Architect Annotation: two rows in the API response. UI behavior (one row or two) is unspecified.  | High  | Add to AC — NEEDS PO/DEV CONFIRMATION  |
| 2  | ATC referenced in 100+ Tests (at or above the documented performance boundary)  | API returns 200 with full list; response time stays within the p95 budget  | Medium  | Test only — performance boundary case  |
| 3  | ATC referenced in exactly 1 Test at exactly position 1  | API returns { used*in: [{ test*id, slug, title, position*in*test: 1 }] } with count showing "Used in 1 test" (singular vs plural)  | Medium  | Add to AC — plural/singular copy is not addressed in current ACs — NEEDS PO/DEV CONFIRMATION  |
| 4  | ATC not yet referenced by any test (fresh ATC, zero usage) — called immediately after creation  | Returns 200 { used_in: [] }, UI shows "Used in 0 tests". Already partially in AC3 but the API shape is missing.  | High  | Add to AC (API shape) — NEEDS PO/DEV CONFIRMATION  |
| 5  | ATC ID is a valid UUID but does not exist in the atcs table at all (not just cross-workspace)  | Should return 404 atc*not*found — same code as cross-workspace case to avoid differentiating existence vs access  | Medium  | Test only (security case) — NEEDS PO/DEV CONFIRMATION  |
| 6  | Unauthenticated caller (no session, no PAT) calls GET /atcs/{id}/usage  | Should return 401 — standard Supabase Auth middleware behavior, but not documented in AC  | Medium  | Test only — NEEDS PO/DEV CONFIRMATION  |
| 7  | Test is deleted after being referenced in test*steps — the JOIN returns a missing tests row  | Depends on FK cascade behavior from EPIC-BK-5 tests table definition. If no CASCADE DELETE on test*steps.test*id, the JOIN may return orphaned test*steps rows.  | High  | Technical question for Dev — NEEDS PO/DEV CONFIRMATION  |
| 8  | test*steps table does not exist yet (EPIC-BK-5 not merged) — endpoint called  | Endpoint should return 200 { used*in: [] } or 503 depending on implementation. Behavior when the dependency table is absent must be defined.  | Medium  | Technical question for Dev  |

### Contradictions

- ***Architect Annotation 1 (5/20 00:57) vs Annotation 2 (5/20 08:24) — performance budget***: Annotation 1 states "< 50ms p95 on ATCs referenced in <= 100 Tests". Annotation 2 states "< 50ms p95 with 10k Tests in fixture". These are contradictory fixture sizes for the same metric. The authoritative target must be resolved before Dev writes the index-validation unit test and before QA can write a performance outline.
- ***Architect Annotation 2 (second SQL block) vs Annotation 1***: Annotation 2 contains a simplified SQL without the `workspace*id` WHERE clause (ORDER BY t.created*at instead of ORDER BY t.slug ASC, ts.position ASC). This appears to be a simplified illustration for the rich-format test comment, NOT the authoritative query. Annotation 1's query (with workspace scoping and explicit sort) should be treated as authoritative. Dev must confirm which query shape is implemented.
- ***AC2 "each Test" vs "no deduplication"***: AC2 says "I see each Test" (implying one entry per Test), while Architect Annotation says the JOIN returns multiple rows without deduplication. These are consistent only if "each Test" is interpreted as "each Test-position pair". PO must clarify the list rendering model.

### Testability validation

***Verdict***: Partial

Issues:

- ***Missing performance criteria***: Contradictory fixture sizes (100 vs 10k Tests) in the two Architect Annotations. Cannot write a deterministic performance outline until reconciled.
- ***Missing ordering specification in ACs***: Architect Annotation defines ORDER BY but ACs don't. Automated assertions against list order will be fragile until ordering is official.
- ***Upstream table dependency***: tests and test*steps tables are from EPIC-BK-5, which does not yet exist in the schema (confirmed — no migration creates them). The entire positive path (AC1, AC2) cannot be executed until EPIC-BK-5 lands. Current state: the endpoint, if built now, would always return { used*in: [] }.
- ***No error message copy***: ACs do not specify exact UI message for the cross-workspace or not-found cases. Cannot assert exact text strings.

---

## Phase 3 — Refined Acceptance Criteria

(Full refined ACs are published to the acceptance_criteria field.)

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| Type  | Count  | Notes  |
| --- | --- | --- |
| ------ | ------- | ------- |
| Positive  | 3  | Happy path: count display, expanded list, zero-usage state  |
| Negative  | 4  | Cross-workspace ATC (404), non-existent ATC (404), unauthenticated (401), wrong scope PAT  |
| Boundary  | 3  | Singular count (1 test), multi-position same Test, ATC at 100+ Tests  |
| Integration  | 2  | API-DB workspace scoping; UI-API empty-array-not-404 contract  |
| API  | 3  | Response shape validation (used_in array), 200 vs 404 distinction, ordering contract  |
| ***Total****  | ****15***  | (drives PO estimation)  |

***Rationale***: The story is a read-only reporting widget (low UI complexity) but has two high-stakes correctness requirements: workspace isolation (security) and the 200-vs-404 semantics for zero-usage and cross-workspace cases.

### Outline list

#### Positive

- ***Should display "Used in N tests" count for an ATC referenced in multiple Tests*** — Pre: authenticated user in W1, ATC with 4 Test references. Expected: widget shows "Used in 4 tests"; API 200 with 4 entries in used_in.
- ***Should list each Test with position when usage report is expanded*** — Pre: ATC referenced in 3 Tests at known positions; user authenticated. Expected: expanded list shows 3 entries with correct Test titles and position*in*test values, ordered by slug then position.
- ***Should show "Used in 0 tests" and empty list for a new ATC with no test*steps*** — Pre: ATC exists in workspace with zero test*steps references. Expected: widget shows "Used in 0 tests"; expand shows empty state; API returns 200 { used_in: [] }.

#### Negative

- ***Should return 404 with atc*not*found when ATC belongs to a different workspace*** — Pre: valid ATC ID from workspace W2; caller is authenticated in workspace W1. Expected: HTTP 404 { "error": "atc*not*found" }, NOT 403.
- ***Should return 404 for a UUID that does not exist in the atcs table*** — Pre: syntactically valid UUID absent from atcs. Expected: HTTP 404 atc*not*found; same response shape as cross-workspace case.
- ***Should return 401 for an unauthenticated GET /atcs/{id}/usage request*** — Pre: no session cookie, no Authorization header. Expected: HTTP 401; no data returned.
- ***Should return 403 when PAT lacks atc:read scope*** — Pre: valid PAT with only run:execute scope. Expected: HTTP 403; endpoint reachable but scope gate rejects.

#### Boundary

- ***Should display "Used in 1 test" in singular when ATC is referenced in exactly one Test*** — Pre: ATC with exactly 1 test_steps reference; user authenticated. Expected: label reads "Used in 1 test" (singular).
- ***Should return multiple rows for an ATC referenced at two positions within the same Test*** — Pre: ATC referenced at positions 2 and 5 in Test-X. Expected: API returns at least 2 entries for Test-X with distinct position*in*test values; count label behavior confirmed by PO.
- ***Should return a complete list and 200 for an ATC referenced in 100+ Tests*** — Pre: ATC with >= 100 test*steps references in the same workspace. Expected: HTTP 200 with full used*in array; no truncation; response within performance budget.

#### Integration

- ***Should validate workspace*id scoping in the SQL JOIN — Tests from W2 must not appear when caller is in W1*** — Pre: test*steps rows in W1 and W2 both referencing the same atc*id; caller in W1. Expected: only W1 Test entries in used*in; W2 entries silently excluded.
- ***Should confirm that GET /atcs/{id}/usage returns 200 with empty array (not 404) for an ATC with zero usage*** — Pre: ATC with no test*steps references. Expected: HTTP 200 { "used*in": [] } — API shape contract aligned with Architect Annotation.

#### API

- ***Should validate response schema shape — each item has test*id, slug, title, position*in*test*** — Pre: ATC with known usage. Expected: each object in used*in array contains all four required fields with correct types.
- ***Should validate list ordering — Tests ordered by slug ASC, positions within same Test by position ASC*** — Pre: ATC referenced in Tests with slugs out of alphabetical order; one Test with multiple positions. Expected: response array follows the defined sort order.
- ***Should return OpenAPI-compliant response for GET /atcs/{id}/usage*** — Pre: OpenAPI spec generated via bun run api:sync. Expected: response shape matches the documented schema; no undocumented fields.

---

## Phase 5 — Edge Cases (DRAFT)

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

---

## Story Quality Assessment

***Verdict***: Needs Improvement

***Key findings***:

- The Story's ACs cover the primary happy-path and workspace-isolation requirement, but leave three security-critical behaviors entirely to the Architect Annotation: the 404-not-403 pattern for cross-workspace ATCs, the { used_in: [] } API contract for zero-usage ATCs, and the minimum role required to call the endpoint. These must be formalized in the ACs before sprint planning — they directly affect what Dev implements and what QA verifies.
- The multi-position edge case (same ATC at two positions in one Test) is documented in the Architect Annotation but the UI rendering rule (one row per Test vs one row per Test-position pair) is unresolved. This ambiguity creates contradictory assertions depending on which interpretation is implemented.
- The Story has a hard upstream dependency on EPIC-BK-5 (tests and test_steps tables) which does not yet exist in the DB schema. Building [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) before EPIC-BK-5 is complete is technically possible (shell + empty response) but functional QA is blocked until both tables exist.

---

## Critical Questions for PO

These BLOCK sprint planning until answered.

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

---

## Technical Questions for Dev

These do not block PO but block implementation.

1. ***What is the FK cascade behavior on**** `test*steps.test*id` ****when a Test is deleted? If no CASCADE DELETE, orphaned**** `test*steps` ****rows will pollute the usage report with references to deleted Tests.*** — The cascade rule is set by EPIC-BK-5. Confirm whether the usage query's JOIN will naturally exclude orphaned rows (via the INNER JOIN) or whether orphaned test*steps rows need a cleanup guard.

1. ***If**** `test*steps` ****and**** `tests` ****tables do not yet exist (EPIC-BK-5 not merged), what does the endpoint return? 200 with**** {{{ used*in: [] }}} ****, 503 Service Unavailable, or a migration gate error?*** — This defines the behavior during the window between [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) landing and EPIC-BK-5 landing, which matters for CI integration tests.

1. ***Which SQL query shape is authoritative — Annotation 1 (with**** `t.workspace*id = $session.workspace*id` ****WHERE clause and**** `ORDER BY t.slug ASC, ts.position ASC` ****) or Annotation 2 (simplified, no workspace WHERE,**** `ORDER BY t.created_at` ****)?*** — QA will write ordering assertions against the authoritative query.

---

## Suggested Story Improvements

|  | Current state  | Suggested change  | Benefit  |
| --- | --- | --- |
| --- | --------------- | ------------------ | --------- |
| 1  | ACs cover UI behavior only; API contract (200 vs 404 for zero-usage, 404 vs 403 for cross-workspace) is only in Architect Annotation  | Add two explicit API-contract ACs: (a) empty ATC → 200 { used*in: [] }; (b) cross-workspace ATC → 404 atc*not_found  | Security and correctness requirements become verifiable AC items; Dev and QA share the same contract  |
| 2  | Business Rules table is silent on minimum required role  | Add rule: "Caller must be an active workspace member (role >= viewer) — 401 if unauthenticated, 404 if ATC is outside caller's workspace"  | Removes ambiguity about auth gate; QA can write an authorization negative scenario  |
| 3  | No ordering specification in ACs or Business Rules  | Add to Business Rules: "Tests are listed ordered by slug ascending; within the same Test, positions are listed ascending"  | Deterministic assertions; prevents non-deterministic UI ordering surprises  |
| 4  | "Used in N tests" copy without singular case  | Specify: "Used in 1 test" (singular) / "Used in N tests" (N != 1)  | Prevents grammatically incorrect UI copy; enables text assertions in automation  |
| 5  | Performance target contradictory across two Annotations  | Document a single authoritative budget in a Business Rule or the DoD  | Enables a valid performance test outline; aligns Dev unit test fixture size with QA expectations  |

---

## Data feasibility flags

- ***Entity / fixture missing***: tests and test*steps tables are from EPIC-BK-5. Neither table exists in any current migration (0001*tenancy.sql through 0008*access*tokens.sql confirmed). Without these tables, the GET /atcs/{id}/usage query cannot be executed and will always return an empty result.
- ***API contract gap***: GET /atcs/{id}/usage route does not exist — no app/api/v1/atcs/ directory found in the backend repo. This is a greenfield endpoint. The API surface confirmed in business-data-map.md §9 does not include any ATC data endpoints (all ATC mutations go through Next.js Server Actions + Supabase RPC).
- ***Required pre-work***: EPIC-BK-5 must land (creates tests + test*steps tables with correct columns and the test*steps(atc_id) index) before any functional QA on [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) positive scenarios is possible. [https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18](https://jira.upexgalaxy.com/browse/BK-18#icft=BK-18) (atcs table) is confirmed present — not a blocker.
- ***Index dependency***: Architect Annotation references test*steps(atc*id) index as a performance requirement. The existing 0004*atcs.sql creates atc*steps*atc*id*idx on public.atc*steps (atc*id) — this is the atc*steps table (ATC internal steps), NOT the test_steps table (Test→ATC associations from EPIC-BK-5). The required index is a different table and does not yet exist.

---

## Recommended testing strategy

### Pre-implementation

- Confirm EPIC-BK-5 delivery order with Dev lead — [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) must be queued after EPIC-BK-5 ships the tests + test_steps tables
- PO answers the 3 Critical Questions (multi-position display model, singular copy, performance budget) before Dev writes a line of code
- Dev answers the 3 Technical Questions (FK cascade, pre-EPIC-BK-5 behavior, authoritative SQL) before QA writes API outlines

### During implementation

- API-first: verify GET /atcs/{id}/usage response shape with curl against staging before any UI work (bun run api:sync must pass first)
- Unit test workspace scoping with two workspace fixtures in isolation — the security invariant is the highest-risk behavior
- Verify 404-not-403 explicitly for cross-workspace case via integration test (as specified in DoD)

### Post-implementation (in-sprint by /sprint-testing)

- Stage 1: expand outlines with parametrization (Test counts: 0, 1, 4, multi-position), per-outline test-data JSON, numbered steps
- Execute API outlines first (curl or Playwright API context) — faster feedback, no UI dependency
- Execute UI outlines after API is confirmed passing — use data-testid selectors established during /adapt-framework
- Run workspace isolation negative scenario as a mandatory smoke test before every regression cycle (security regression gate)
- Performance outline deferred until authoritative fixture size is confirmed

---

## Risks & mitigation

|  | Risk  | Likelihood  | Impact  | Mitigated by which outlines  |
| --- | --- | --- | --- |
| --- | ------ | ----------- | -------- | ----------------------------- |
| 1  | EPIC-BK-5 (tests + test_steps) not landed before [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) enters sprint  | High (separate epic, no explicit dependency gate)  | High — all positive test scenarios blocked  | Data feasibility flag; recommend sprint sequencing gate  |
| 2  | Dev implements 403 instead of 404 for cross-workspace ATC (existence leak)  | Medium (easy mistake)  | High — security vulnerability  | Scenario 4.2; Outline "Should return 404 with atc*not*found when ATC belongs to different workspace"  |
| 3  | Dev returns 404 for zero-usage ATC instead of 200 + empty array (breaks UI widget)  | Medium (non-obvious contract)  | Medium — UI widget fails on unused ATCs  | Scenario 3.2; Outline "Should confirm that GET /atcs/{id}/usage returns 200 with empty array"  |
| 4  | Multi-position display model unresolved — Dev and QA implement contradictory behavior  | Medium (ambiguity in current ACs)  | Medium — incorrect blast-radius count  | Scenario 2.2; Critical Question #1 must be answered before sprint  |
| 5  | Performance regression if test*steps(atc*id) index is missing from EPIC-BK-5 migration  | Low (Architect Annotation calls it out explicitly)  | Medium — slow queries under load  | Outline "Should return complete list and 200 for ATC referenced in 100+ Tests"  |

---

## Next steps

- PO answers Critical Questions before sprint planning (multi-position display, singular copy, performance budget)
- Dev answers Technical Questions before estimation (FK cascade, pre-EPIC-BK-5 behavior, authoritative SQL)
- Confirm EPIC-BK-5 sprint sequencing — [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) should not enter dev until tests + test_steps tables exist in staging
- Story enters sprint at status Ready For Dev once estimated and Critical Questions are answered
- When Story reaches Ready For QA, /sprint-testing will short-circuit refinement (label shift-left-reviewed detected) and go directly to Phase 4 with parametrization + test-data JSON

---

Refined on: 2026-06-02 — QA Shift-Left batch session
Local working copy: .context/PBI/epics/EPIC-BK-13-atc-library-atomic-test-components/stories/STORY-BK-22-atc-usage-report-used-in-n-tests/shift-left-refinement.md

---

### Andrés Daniel Cumare Morales - 6/2/2026, 6:34:05 AM

## Role-Play Simulation: Product Owner Input — Shift-Left QA Practice

> Note: This comment is written by QA simulating the Product Owner role as part of the Shift-Left QA methodology. The answers below represent the expected PO decisions based on product vision, user persona (Elena — Senior QA Engineer), and IQL principles. This is a training exercise, not a real PO response.

---

## Answers to Critical Questions for PO

### Q1 — Multi-position display and count semantics

Decision: the usage list shows one row per Test. When the same ATC appears at multiple positions within a single Test, all positions are listed as metadata inside that row in a compact format (for example: "positions: 2, 5").

The count N in "Used in N tests" counts distinct Tests, not total occurrences or JOIN rows.

Rationale: the purpose of this feature is blast-radius awareness — Elena needs to know "how many Tests will I affect if I edit this ATC?" The answer must be "N distinct Tests." Showing duplicate rows for the same Test would inflate the apparent impact and cause Elena to overestimate her blast radius. One row per Test, positions as inline metadata.

This resolves Ambiguity 1 and Ambiguity 2 from the QA refinement. The Architect Annotation "no deduplication" refers to the API response shape (multiple rows per Test when multiple positions exist) — the UI layer groups those rows into a single entry per Test.

### Q2 — Singular vs plural copy

Decision: use the singular form when the count is exactly 1.

- Count = 0: "Used in 0 tests"
- Count = 1: "Used in 1 test"
- Count >= 2: "Used in N tests"

Zero uses the plural form for consistency and to avoid the grammatically awkward "Used in 0 test." Standard English grammar rule applies.

### Q3 — Authoritative performance target

Decision: the authoritative benchmark fixture is 10,000 Tests. The performance budget is less than 50ms p95 measured against a fixture of 10k Tests.

The 100-Test figure from Architect Annotation 1 is a minimum smoke threshold — acceptable for a quick dev unit test but not the production bar. Bunkai is designed for QA teams managing hundreds of ATCs per project. A workspace with 10k Tests is a realistic production scenario, not an extreme edge case.

The p95 latency budget of less than 50ms applies regardless of fixture size up to the 10k ceiling. This resolves the contradiction between Annotation 1 and Annotation 2 in favor of Annotation 2's fixture size with Annotation 1's latency target.

---

## PO Decisions on Suggested Story Improvements

The following improvements proposed by QA Shift-Left refinement are all approved. The Story should be updated before entering sprint planning:

1. Add two explicit API-contract ACs: (a) valid ATC with zero usage returns 200 with empty array, not 404; (b) ATC belonging to a different workspace returns 404 with error code atc*not*found, not 403 or 200.

1. Add minimum role to Business Rules: "Caller must be an active workspace member (role >= viewer) — 401 if unauthenticated, 404 if ATC is outside caller's workspace."

1. Add ordering spec to Business Rules: "Tests are listed ordered by slug ascending; within the same Test, positions are listed ascending."

1. Add singular/plural copy specification: "Used in 1 test" (singular) for exactly one Test; "Used in N tests" for all other counts.

1. Resolve the performance target contradiction by documenting the single authoritative budget: less than 50ms p95 with a 10k-Test fixture. Both the Dev unit test and the QA performance outline must use this fixture size.

---

> Shift-Left QA simulation — [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) — 2026-06-02

---

### Andrés Daniel Cumare Morales - 6/2/2026, 6:34:51 AM

## Role-Play Simulation: Developer Input — Shift-Left QA Practice

> Note: This comment is written by QA simulating the Developer role as part of the Shift-Left QA methodology. The answers below represent the expected technical decisions based on the Architect Annotations, the existing schema, and standard backend patterns for this codebase. This is a training exercise, not a real Dev response.

---

## Answers to Technical Questions for Dev

### Q1 — FK cascade on test*steps.test*id

The EPIC-BK-5 migration will define test*steps.test*id with ON DELETE CASCADE referencing tests.id. When a Test is deleted, all its test_steps rows are automatically removed — no orphaned rows will exist.

The INNER JOIN in the usage query handles this naturally: once test_steps rows are cleaned up by cascade, they will not appear in any query result. QA does not need to test for orphaned row pollution — the cascade is the database-level guard.

Implication for QA: the edge case "Test deleted after being referenced in test_steps" resolves cleanly. The INNER JOIN combined with CASCADE DELETE means the join will never surface a reference to a deleted Test.

### Q2 — Behavior when test_steps does not exist yet (EPIC-BK-5 not merged)

The endpoint will be guarded at the service layer by a try/catch that catches the Postgres error code 42P01 ("relation does not exist"). In that case the endpoint returns 200 with body { "used_in": [] } — identical to a valid ATC with zero usage.

This prevents a 500 during the deployment window between [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) shipping and EPIC-BK-5 merging into staging. An INFO-level log entry will be emitted so monitoring can detect the pre-migration state without surfacing it as an error to the caller.

This guard will be removed once EPIC-BK-5 is confirmed stable in all environments.

Implication for QA: if CI runs [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) integration tests before EPIC-BK-5 tables exist, the endpoint will return 200 { "used_in": [] } — not 500. Tests that assert the presence of data in an empty-table environment should be skipped or use a setup guard that verifies EPIC-BK-5 migrations have run.

### Q3 — Authoritative SQL query

Annotation 1 is the authoritative query. The implementation target is:

```sql
SELECT ts.test*id, t.slug, t.title, ts.position AS position*in_test
FROM test_steps ts
JOIN tests t ON t.id = ts.test_id
WHERE ts.atc_id = $1
AND t.workspace*id = $session*workspace_id
ORDER BY t.slug ASC, ts.position ASC
```

Annotation 2 contained a simplified SQL query — it was posted as a rich-format round-trip test to verify ADF rendering of snake*case identifiers, not as the implementation target. That query lacks the workspace*id WHERE clause and uses ORDER BY t.created_at, both of which are incorrect for the actual implementation.

The workspace_id WHERE clause is mandatory (workspace scoping security requirement). ORDER BY t.slug ASC, ts.position ASC is the canonical ordering per PO confirmation above.

---

## Additional Clarification: ATC existence check and 404 semantics

The ATC existence check runs first:

```sql
SELECT 1 FROM atcs WHERE id = $1 AND workspace*id = $session*workspace_id
```

If this check returns no row, the endpoint returns 404 with error code atc*not*found. This applies to both cases: the ATC truly does not exist, and the ATC exists but belongs to a different workspace. The response is identical in both cases — intentional, to prevent existence leaks across workspace boundaries.

The usage query only runs after the existence check passes. If the ATC exists in the caller's workspace and has no test*steps references, the usage query returns an empty result set and the endpoint responds 200 { "used*in": [] }.

---

> Shift-Left QA simulation — [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) — 2026-06-02

---

### Andrés Daniel Cumare Morales - 6/2/2026, 6:36:03 AM

## Role-Play Simulation: Designer Input — Shift-Left QA Practice

> Note: This comment is written by QA simulating the Designer role as part of the Shift-Left QA methodology. The design decisions below are derived from DESIGN.md — Bunkai's canonical design system (color tokens, typography, component vocabulary, motion spec). This is a training exercise, not a real Design response.

---

## UI/UX Design Specification for the "Used in N tests" Widget

### Collapsed state (default)

The widget renders on the ATC detail page as a single inline line inside a `.card` component. Surface color: `--bg-2`.

Layout from left to right:

- Label "Used in" rendered in Inter 12.5px `--fg-2`
- Count N rendered in Inter 12.5px weight-600 `--fg-0` (strongest text tier — scannable at a glance)
- Word "test" or "tests" rendered in Inter 12.5px `--fg-2`
- `ChevronDown` Lucide icon 14px `--fg-3` at the right edge

On hover: card background transitions to `--bg-4` at 120ms ease (per the default motion spec in DESIGN.md §8).

This matches Bunkai's density-first principle — no dedicated card header, just inline data. The count number is in `--fg-0` to allow Elena to read the blast radius at a glance from a detail page with many other fields.

### Expanded state

Expanding the widget reveals a flat list of rows inside the same `.card`. The `ChevronDown` icon rotates 180 degrees at 120ms ease when expanded.

Each row displays:

- Test slug in JetBrains Mono 11.5px `--fg-1` (IDs always monospace per DESIGN.md §2 and §4)
- Test title in Inter 12.5px `--fg-2` (secondary text, truncated at one line with ellipsis)
- Position chips: each position value rendered as a `.chip` element — JetBrains Mono 11px, `--r-1` radius (3px), `--bg-5` background, `--fg-2` text. When the same Test has multiple positions, chips are stacked inline within the same row.

Row hover: background transitions to `--bg-4` at 120ms ease. Rows are not interactive except for the deep-link action to the Test detail page.

### Zero state (count = 0)

When the ATC has no test_steps references:

- "Used in 0 tests" displays with the number 0 in `--fg-3` (muted — signals inactive or no-data state)
- A secondary line below in `--fg-3` Inter 11.5px: "This ATC has not been added to any test yet."
- No expand trigger is shown — the caret icon is hidden entirely
- No caret animation. The animated `.caret` component from DESIGN.md §6 is reserved for CLI-hint empty states. Data-empty states use static muted text only.

### Singular/plural copy (Designer confirms PO decision)

- Count = 1: "Used in 1 test" (singular)
- All other counts: "Used in N tests"

The number N is always rendered in `--fg-0` regardless of count, to maintain scanability. This is consistent with Bunkai's principle that status information must be readable at a glance (DESIGN.md §2).

### Accessibility

The expand trigger must include these attributes:

- `aria-expanded="true"` or `aria-expanded="false"` reflecting current state
- `aria-controls` pointing to the id of the expandable list element

The expandable list receives `role="list"`. Each row is `role="listitem"`.

Screen reader announcement when expanded: "Used in 4 tests, expanded, list: [slug] [title] positions 2 5, [slug] [title] position 1..."

Color is never the sole signal. The muted zero state uses both color (`--fg-3`) and the secondary explanatory text — not color alone. Per DESIGN.md §10, all interactive elements show `:focus-visible` as a 1px solid `--accent` outline with 1px offset.

---

> Shift-Left QA simulation — [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) — 2026-06-02

---

### Andrés Daniel Cumare Morales - 6/2/2026, 6:39:41 AM

## Sprint Planning — Team Estimation: 3 Story Points

> **Shift-Left QA simulation — team role-play exercise. Estimation based on full shift-left refinement context, PO/Dev/Design answers (comments 12570–12572), and Architect Annotations.**

### Final estimate: 3 Story Points

### Deliberation summary

- Backend (Medium): greenfield GET /atcs/{id}/usage route, two-step service layer (ATC existence check + usage JOIN), workspace scoping WHERE clause, pre-EPIC-BK-5 Postgres 42P01 guard, OpenAPI entry.
- Frontend (Low-Medium): read-only widget on existing ATC detail page, collapsed/expanded states, singular/plural copy, position chips (JetBrains Mono), zero state, full accessibility spec (aria-expanded, role=list).
- Testing (Medium): 15 outlines (3 positive, 4 negative, 3 boundary, 2 integration, 3 API), workspace isolation negative scenario, performance outline at 10k Test fixture / 50ms p95.
- Risk mitigated: all PO/Dev/Design questions answered before estimation. SQL, security semantics, design tokens, and performance target are fully specified. No open blockers.

### Why not 5: feature is read-only with no state machine and no mutations. Spec is complete and implementation path is clear.

### Why not 2: new API route + workspace security semantics + performance fixture + 15 test outlines exceeds a trivial scope.

### Pre-conditions for dev to start

- EPIC-BK-5 (tests + test_steps tables) must be in staging before [https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22](https://jira.upexgalaxy.com/browse/BK-22#icft=BK-22) can be fully verified. The pre-EPIC-BK-5 guard allows the shell to ship safely, but functional QA is blocked until the tables exist.
- Story Points set: 3. Status: Ready For Dev.

**Sprint Planning simulation — BK-22 — 2026-06-02**

---

### Automation for Jira - 6/20/2026, 12:27:22 PM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 6/20/2026, 12:27:29 PM

✅ Pull Request is successfully MERGED. Task is Done.

---

### Andrés Daniel Cumare Morales - 6/23/2026, 5:35:56 AM

## QA Sprint-Testing — Session Start Report

***Ticket***: BK-22 — TMS-ATC Usage | See a "Used in N tests" report
***Date***: 2026-06-23
***Environment***: staging (`staging-upexbunkai.vercel.app`)
***QA Engineer***: Andrés Daniel Cumare Morales

---

## Finding: Feature NOT Deployed to Staging

> ***ERROR:**** Sprint-testing session started on BK-22 but the feature has ****not been implemented*** in the codebase. QA cannot proceed with Stage 1 Planning, Stage 2 Execution, or Stage 3 Reporting.

### Evidence

| Expected artifact | Status | Detail |
| --- | --- | --- |
| `GET /atcs/{id}/usage` API endpoint | ***Missing*** | No route exists under `app/api/v1/atcs/` for the usage endpoint |
| "Used in N tests" UI widget | ***Missing**** | `atc-detail-pane.tsx` displays placeholder text: **"Run history, 'Used by tests' and the Run action arrive with the test runner."* |
| ATC Editor page (`/atcs/[atcId]`) | ***No usage section*** | Page renders steps, assertions, linked story — no usage widget |
| Git history for BK-22 | ***No implementation commits*** | Only `docs(pbi): seed Wave 2 backlog` references BK-22 |

### Upstream Dependency Status

| Dependency | Status | Notes |
| --- | --- | --- |
| `tests` + `test*steps` tables (EPIC-BK-5 / BK-27) | ***Deployed*** | Migration `0024*tests.sql` exists and includes `test*steps*atc*id*idx` index |
| BK-18 (atcs table) | ***QA Approved*** | Not a blocker |
| BK-27 (Test Builder) | ***QA Approved*** | PR #40 merged 2026-06-20 |

### Root Cause Hypothesis

The Jira automation comments ("PR merged" on 2026-06-20) were triggered by ***BK-27*** (Test Builder), not BK-22. BK-22 is linked to BK-27 in the traceability section, which likely caused the automation to update BK-22's status. The actual BK-22 feature (usage endpoint + UI widget) was never developed.

### Impact on QA

- ***Stage 1 (Planning)***: ATP outlines exist from the shift-left session (2026-06-02) — no immediate loss, but parametrization cannot be verified without an endpoint to test against.
- ***Stage 2 (Execution)***: Completely blocked — no endpoint, no widget, no feature to smoke test.
- ***Stage 3 (Reporting)***: Cannot produce an ATR without execution results.

### Recommendation

The ticket status should be reviewed by the dev team. The feature needs implementation before QA can resume sprint-testing. Shift-left refinement (15 test outlines, PO/Dev/Design answers) remains valid and will be used when the feature is ready.

---

**Sprint-testing session paused — awaiting feature deployment.**

---


_Synced from Jira by sync-jira-issues_
