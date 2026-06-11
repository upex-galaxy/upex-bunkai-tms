# BK-27 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-27)

# Shift-Left Refinement: BK-27 — TMS-Test Builder | Assemble a test by chaining ATCs

***Status***: Refined — Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint, batch grooming)
***Refined on***: 2026-06-06
***Refined by***: QA — Shift-Left batch session
***Modality***: Jira-native

---

## Phase 1 — Critical Analysis

### Business context

- ***Primary persona affected***: QA Engineer (Elena persona) — assembles a Test from ATCs to run chained validations against a User Story.
- ***Secondary personas (if any)***: AI agent / CI client (Karim persona) — same operation via the headless Bunkai surface; workspace `owner` — audits creation events in the activity log.
- ***Business value proposition****: A ****Test*** is the executable unit one rung above the ATC — the first epic (BK-24) deliverable that turns a library of atomic ATCs into ordered, runnable suites. Without it, ATCs cannot be grouped or executed together, so the whole "Tests (chains of ATCs)" epic and the downstream Runs epic (BK-006) are blocked.
- ***KPI(s) influenced***: traceability completeness (a Test ties a chain of ATCs to a User Story), agent-readiness (one rulebook / three executors), audit coverage (every creation logged).
- ***User journey position****: a NEW journey not present in any current business flow. It sits between Flow B (ATC authoring) and the not-yet-built Runs epic. It introduces the first ****Test*** entity into the product.

### Technical context

- ***Frontend****: a "New Test" form (title input + ordered ATC picker with search/browse) + a Test list. No such surface exists today — `business-feature-map`/`data-map` list "New Test" only as an ****unwired stub button***.
- ***Backend****: requires a `tests` table (+ a `test*atcs` ordered join), a create/save path (`/api/v1/tests` route or a server action + RPC analogous to `bunkai*save*atc`), RLS policies scoping Tests to the workspace, and a write into `activity*log`. ****None of these exist in source*** (migrations through 0020, route inventory). See feasibility flags below.
- ***External services***: Supabase (Auth + Postgres + RLS) — the spine, as for every flow.
- ***Integration points specific to this Story***: RBAC (`workspace*members.role` + `bunkai*can*write*workspace` helper); cross-workspace RLS isolation (INV-3) applied to a brand-new entity AND to the referenced ATCs; `activity*log` write (0009 table); `idempotency*keys` (0009 table) for the double-submit guard; the dual UI/headless surface (`requireAuth` Bearer-first precedence).

### Story complexity

| Axis | Rating | Why |
|------|--------|-----|
| Business logic | High | New entity + ordered M:N chain (duplicates allowed = sequence not set) + permanent workspace binding + idempotency window. |
| Integration | High | RBAC + RLS + activity_log + idempotency + dual UI/headless surface, several of which are schema-only or unwired today. |
| Data validation | Medium | Title required / ≤200 chars / whitespace-only rejected; ≥1 ATC; ATCs same-workspace; non-disclosing rejection on foreign ATC. |
| UI | Medium | New form (ordered picker is non-trivial UX) + new list view. |

***Estimated test effort***: High (story is 3 SP per Jira, but the test surface is large because the entity is net-new and three supporting subsystems — Test schema, activity_log write, idempotency — are not yet built). The 3-SP estimate likely assumes the supporting infrastructure is in-scope or pre-built; that assumption must be settled with the PO (Q1).

### Epic-level inheritance (if applicable)

- Risks restated at Story level: tenant isolation (INV-3) now extends to the new `tests` entity and to the ATC references it holds; the same-workspace ATC rule is a direct INV-3 application.
- Integration points inherited: RBAC role gate (`viewer` read-only) is a system-wide invariant (INV-4-adjacent / `bunkai*can*write_workspace`).
- PO/Dev answers already given at epic level: none recorded — BK-24 epic comments not supplied; `comments.md` on BK-27 is empty.
- Test strategy inherited: data-integrity invariants treated with banking-grade rigor (per master-test-plan meta-point).

---

## Phase 2 — Story Quality Analysis

> Overall: the Story is unusually well-specified for shift-left — business-rules, scope, out-of-scope, and workflow each answer questions that would normally be PO gaps (title rule, duplicate-ATC-allowed, permanent binding, role matrix, retry responsibility). The HIGH risk is NOT spec ambiguity; it is ***feasibility***: the entity and three supporting subsystems this Story depends on do not exist in source. Most open questions below are therefore Dev/feasibility, not AC-clarity.

### Ambiguities

| # | Location in Story | Question for PO/Dev | Impact on testing | Suggested clarification |
|---|-------------------|---------------------|-------------------|------------------------|
| 1 | business-rules "short window" (retry/double-click) | What is the concrete idempotency window (seconds? per the 24h `idempotency_keys` TTL?) and what is the ***retry-safe identifier*** — who generates it (UI auto-generates vs agent must supply)? | Cannot assert the dedupe boundary or design the AC3 / agent double-submit test without knowing the key source + window. | Define window + state whether the client supplies an idempotency key or the server derives one from (user, endpoint, payload-hash). |
| 2 | AC4 "message that does not reveal whether the foreign ATC exists" | Exact HTTP status + error copy for the cross-workspace rejection — is it a generic 404/422 (non-disclosing) or 403? | Non-disclosure is a security assertion; wrong status (403 vs 404) leaks existence. | Specify the exact status code and verbatim message; confirm it is identical for "ATC does not exist at all" vs "exists in another workspace". |
| 3 | AC2 message "A Test must include at least one ATC" | Is this copy final/verbatim, and is the same validation re-enforced server-side (not just in the form)? | Negative assertion must match exact copy; client-only validation is bypassable via the headless surface. | Confirm verbatim copy + server-side re-validation (mirrors the `bunkai*save*atc` "re-validate in server action" pattern). |

### Gaps (missing info)

| # | Type | Why critical | What to add | Risk if omitted |
|---|------|--------------|-------------|-----------------|
| 1 | Business rule | ATC ***eligibility*** for selection is undefined: may any ATC be chained, or only `published`/non-draft ATCs? `atcs.status` has no `published` state (enum is run-lifecycle: unrun/running/pass/fail/blocked/skipped). The AC text says "three published ATCs" but the schema has no "published" concept. | Define what "selectable ATC" means (any ATC in workspace? exclude soft-deleted? a status filter?). | QA cannot build the selection precondition; AC1's "published ATCs" is untestable against the current schema. |
| 2 | Non-functional | No ***max ATC count per Test*** / chain-length ceiling, and no performance budget for the picker over a large ATC library. | Add an upper bound (or explicitly "no cap in MVP") + a picker performance note. | Unbounded chain or slow picker ships untested; boundary tests have no target. |
| 3 | Data integrity | Behavior when a ***referenced ATC is deleted/soft-deleted after*** being added to a Test is undefined (out-of-scope excludes editing the chain, but deletion of an underlying ATC is a different vector). | State whether ATC deletion is blocked while referenced by a Test (RESTRICT, like `atcs.user*story*id`) or cascades/nulls. | Orphaned chain references or silent data loss. |
| 4 | Audit scope | DoD says "activity log records who created the Test" but the `activity*log` table (0009) has ***no runtime write path in code*** (verified). Who writes the entry, and what is the visibility scope (owner-only? all members?) | Confirm the activity*log write is in-scope for this Story and define read visibility. | DoD criterion is unverifiable/untestable; audit guarantee silently absent. |

### Edge cases not in Story

| # | Scenario | Expected behavior (best guess) | Criticality | Action |
|---|----------|-------------------------------|-------------|--------|
| 1 | `viewer` attempts create via the ***headless API*** (not just the UI button hidden) | Rejected with 403 server-side regardless of UI | High | Add to AC (NEEDS PO/DEV CONFIRMATION) — UI-hidden ≠ API-blocked (master-test-plan §7 permission-boundary). |
| 2 | Title at exactly 200 chars vs 201 chars | 200 accepted, 201 rejected | Medium | Test only — business-rules already states the 200 limit. |
| 3 | Title with leading/trailing whitespace around real text (e.g. "  Cart  ") | Trimmed then validated; not treated as whitespace-only | Medium | Test only — confirm trim behavior (NEEDS PO/DEV CONFIRMATION on trim vs preserve). |
| 4 | Two members concurrently create Tests with the same title in the same workspace | Both succeed (no title-uniqueness rule stated) → two Tests | Low | Test only — confirm no uniqueness constraint is intended. |
| 5 | Active-workspace switched mid-form, then Save | Test binds to the workspace active ***at the moment of creation*** (business-rules) — define which moment: form-open vs Save | Medium | Ask PO — binding instant is permanent and ambiguous under workspace-switch. |
| 6 | Chain references the same ATC twice | Allowed (business-rules: sequence not set) — both positions persisted in order | High | Test only — explicitly confirmed in spec; verify it actually persists both. |

### Contradictions

- ***AC1 vs schema****: AC1 says Elena has "three ****published**** ATCs". The `atcs.status` enum (unrun/running/pass/fail/blocked/skipped) has ****no ****`published`**** state***, and there is no separate publish flag in the schema. Either "published" is loose wording for "exists in the library" or a publish concept is assumed but unbuilt. Surfaced as Gap #1 — must be reconciled before the AC1 precondition is testable.

### Testability validation

***Verdict***: Partial

Issues:

- AC1 precondition ("published ATCs") references a state that does not exist in the schema (Gap #1 / contradiction).
- Idempotency window + retry-safe-identifier undefined (Ambiguity #1) — AC3 and the agent double-submit path are not concretely assertable.
- Activity-log write has no code path today (Gap #4) — the DoD audit criterion cannot be verified until built.
- Cross-workspace rejection status/copy unspecified (Ambiguity #2) — the non-disclosure security assertion is underspecified.
- ***Feasibility blocker (dominant)***: the `tests` entity, its create path, RLS, the activity_log write, and idempotency wiring do not exist in source — the Story is largely greenfield, so most ACs are not executable until the implementation lands. This is expected for shift-left (we refine BEFORE build) but it means QA cannot dry-run any AC against staging today.

---

## Phase 3 — Refined Acceptance Criteria

### Original AC1 — Elena assembles a Test from three ATCs (chain order preserved + activity log)

#### Scenario 1.1: Should create a Test with three ATCs in the selected order (Type: Positive, Priority: High)

- ***Given***: Elena is an `active` `member` (or above) of workspace "Acme QA" which has ≥3 selectable ATCs in its library (ATC-A, ATC-B, ATC-C).
- ***When***: she opens "New Test", enters title `"Add to Cart from Empty State"`, selects ATC-A, ATC-B, ATC-C in that order, and clicks "Save".
- ***Then***:

  - UI: redirects to the new Test (or shows it in the Test list) with the entered title.
  - Persistence: one `tests` row created, bound to "Acme QA"; the ordered chain persists positions 1=ATC-A, 2=ATC-B, 3=ATC-C exactly.
  - Audit: one `activity*log` entry recording actor, action "test created", target Test title, timestamp. ***NEEDS PO/DEV CONFIRMATION*** — activity*log write path not yet built (Gap #4).
  - System state: opening the Test shows the three ATCs in the exact selected order.

#### Scenario 1.2: Should preserve a chain that references the same ATC twice (Type: Edge, Priority: High)

- ***Given***: Elena (member) in "Acme QA" with ATC-A available.
- ***When***: she builds chain [ATC-A, ATC-B, ATC-A] and saves.
- ***Then***: the Test persists three positions with ATC-A at positions 1 and 3 (sequence, not set — business-rules explicit). No de-duplication occurs.

### Original AC2 — Saving a Test without any ATC is blocked

#### Scenario 2.1: Should block save when no ATC is selected (Type: Negative, Priority: High)

- ***Given***: Elena (member) on "New Test" with title `"Add to Cart from Empty State"` and zero ATCs selected.
- ***When***: she clicks "Save".
- ***Then****: save is blocked; message `"A Test must include at least one ATC"` (verbatim — confirm Ambiguity #3); no `tests` row created; form stays open. Re-validated server-side, not only in the form. ****NEEDS PO/DEV CONFIRMATION*** on server-side enforcement.

#### Scenario 2.2: Should reject empty/whitespace-only title (Type: Negative, Priority: High)

- ***Given***: Elena (member) on "New Test" with a whitespace-only title `"   "` and ≥1 ATC selected.
- ***When***: she clicks "Save".
- ***Then***: save blocked; clear validation message; no row created. (business-rules: whitespace-only titles rejected.)

#### Scenario 2.3: Should reject a title over 200 characters (Type: Boundary, Priority: Medium)

- ***Given***: Elena (member) with a 201-character title and ≥1 ATC.
- ***When***: she saves.
- ***Then***: rejected; a 200-character title is accepted. (business-rules: 200-char limit.)

### Original AC3 — Accidentally clicking Save twice does not create duplicates

#### Scenario 3.1: Should create exactly one Test on a double-submit (Type: Edge, Priority: High)

- ***Given***: Elena (member) with a valid title + three ATCs, on a slow connection.
- ***When***: she clicks "Save", then clicks "Save" again before the first response returns (same retry-safe identifier / idempotency key).
- ***Then****: exactly one `tests` row titled `"Add to Cart from Empty State"`; the Test appears once in the list, not duplicated. ****NEEDS PO/DEV CONFIRMATION*** — depends on the idempotency window + key source (Ambiguity #1); `idempotency_keys` table exists (0009) but is NOT wired in any handler today (feasibility flag).

#### Scenario 3.2: Should dedupe a headless agent retry with the same idempotency key (Type: Edge, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred from workflow "agent provides a retry-safe identifier".
- ***Given***: an agent (PAT-authed, write scope) submits a create with idempotency key `K`.
- ***When***: the same request with key `K` is retried (network retry).
- ***Then***: one Test created; the second call returns the cached prior response (per `idempotency_keys` semantics), not a second Test.

### Original AC4 — Elena cannot use ATCs from a workspace she does not belong to

#### Scenario 4.1: Should reject a chain referencing a foreign-workspace ATC without disclosing existence (Type: Negative/Security, Priority: Critical)

- ***Given***: Elena belongs to "Acme QA" but not "Other Co"; an ATC `ATC-X` is owned by "Other Co".
- ***When***: she attempts (via UI or headless API) to create a Test referencing `ATC-X`.
- ***Then****: rejected; no `tests` row in "Acme QA"; error does NOT reveal whether `ATC-X` exists. ****NEEDS PO/DEV CONFIRMATION*** on exact status + verbatim copy (Ambiguity #2) — must be identical to the response for a wholly-nonexistent ATC id (non-disclosure, INV-3).

### New scenarios surfaced from Phase 2 edge cases — NEEDS PO/DEV CONFIRMATION

#### Scenario E1: Should reject Test creation by a viewer via the headless API (Type: Negative/Security, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: confirm server-side 403 regardless of UI affordance.
- ***Given***: a `viewer` of "Acme QA" with a valid PAT.
- ***When***: they POST a valid Test-create to the headless surface.
- ***Then***: 403; no Test created. (UI hides the button for viewers, but the API must enforce — master-test-plan §7.)

#### Scenario E2: Should bind the Test to the workspace active at the creation instant (Type: Edge, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: define the binding instant (form-open vs Save click) under a mid-form workspace switch.
- ***Given***: Elena opens "New Test" while active in "Acme QA", then switches active workspace before clicking Save.
- ***Then***: the Test binds permanently to the workspace defined by the agreed instant; binding is immutable thereafter.

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| Type | Count | Notes |
|------|-------|-------|
| Positive | 3 | Happy-path create + order preservation + duplicate-ATC chain. |
| Negative | 5 | Empty chain, whitespace title, foreign-ATC non-disclosure, viewer-via-API, server-side re-validation bypass. |
| Boundary | 4 | Title at 200/201, chain length min(1)/max(cap?), idempotency window edge. |
| Integration | 4 | RLS isolation, activity_log write, idempotency dedupe, dual UI/headless parity. |
| API | 3 | POST create (member), POST create (viewer→403), POST create (foreign ATC→non-disclosing reject). |
| ***Total**** | ****19*** | (drives PO estimation) |

***Rationale***: HIGH business-logic + HIGH integration on a net-new entity warrants broad coverage, but several outlines are blocked on unbuilt infrastructure (activity_log write, idempotency wiring, the `tests` entity itself), so the executable count at first QA pass will be lower than 19 until those land. The security/non-disclosure and viewer-via-API outlines are the highest-value because they protect INV-3 on a brand-new surface.

### Outline list (NAMES ONLY — preconditions in 1 line, expected in 1 line)

#### Positive

- ***Should create a Test with three ATCs in selected order*** — Pre: member with ≥3 selectable ATCs. Expected: one `tests` row, positions 1-2-3 preserved, appears in list.
- ***Should preserve chain order exactly as selected*** — Pre: member selects ATCs in a deliberate non-alphabetical order. Expected: opening Test shows the exact order.
- ***Should persist a chain that references the same ATC twice*** — Pre: member, one ATC reused. Expected: both positions stored (sequence, not set).

#### Negative

- ***Should block save when no ATC is selected*** — Pre: valid title, zero ATCs. Expected: blocked + "A Test must include at least one ATC" + no row.
- ***Should reject a whitespace-only title*** — Pre: title "   ", ≥1 ATC. Expected: validation error + no row.
- ***Should reject a foreign-workspace ATC without disclosing existence*** — Pre: ATC owned by another workspace. Expected: non-disclosing reject (status TBD) + no row.
- ***Should reject Test creation by a viewer via the headless API*** — Pre: viewer PAT. Expected: 403 + no row.
- ***Should re-validate empty chain server-side (not UI-only)*** — Pre: headless POST with zero ATCs bypassing the form. Expected: server rejects + no row.

#### Boundary

- ***Should accept a 200-character title and reject 201*** — Pre: titles at the limit. Expected: 200 ok / 201 rejected.
- ***Should accept a single-ATC chain (minimum)*** — Pre: exactly one ATC. Expected: Test created.
- ***Should enforce the max-ATC chain ceiling*** — Pre: chain at cap+1 (cap TBD — Gap #2). Expected: rejected at the boundary (or documented "no cap").
- ***Should dedupe a double-submit within the idempotency window*** — Pre: two submits with one key inside the window. Expected: exactly one Test.

#### Integration

- ***Should isolate Tests across workspaces (RLS)*** — Pre: member of WS-X queries/creates against WS-Y. Expected: no cross-tenant read/write (INV-3).
- ***Should write an activity*************log entry on Test creation*** — Pre: activity*log write path built. Expected: one entry (actor, action, target, timestamp).
- ***Should produce identical results from UI and headless surfaces*** — Pre: same payload via form and via PAT. Expected: same Test, same validations, same activity entry (one rulebook / three executors).
- ***Should dedupe a headless agent retry with the same idempotency key*** — Pre: PAT agent retries with key K. Expected: one Test + cached response on retry.

> ***NOT included here*** (deferred to in-sprint planning by `/sprint-testing` Stage 1): parametrization tables, per-outline test-data JSON, numbered test steps, Faker generation strategies. Coverage estimate IS included because PO uses it for estimation.

---

## Phase 5 — Edge Cases (DRAFT)

| # | Edge case | In original Story? | Criticality | Action |
|---|-----------|-------------------|-------------|--------|
| 1 | Viewer creates via headless API (UI button hidden ≠ API blocked) | No | High | Add to AC (PO confirm) |
| 2 | Same ATC referenced twice in one chain | Yes (business-rules) | High | Test only |
| 3 | Title at exactly 200 vs 201 chars | Partly (limit stated) | Medium | Test only |
| 4 | Title with surrounding whitespace around real text (trim behavior) | No | Medium | Test only (PO confirm trim) |
| 5 | Active-workspace switched mid-form before Save (binding instant) | No | Medium | Ask PO |
| 6 | Double-submit within / outside the idempotency window | Yes (business-rules) | High | Test only (window TBD) |
| 7 | Referenced ATC deleted/soft-deleted after being chained | No | Medium | Ask PO/Dev |
| 8 | Two Tests with identical title in same workspace | No | Low | Test only (no uniqueness rule stated) |
| 9 | Max chain length / picker over large ATC library | No | Medium | Ask PO (Gap #2) |

> Test-data generation strategy + Faker recipes are NOT defined here. They land in `/sprint-testing` Stage 1 when the feature exists.

---

## Story Quality Assessment

***Verdict***: Good (requirements) / Significant Issues (feasibility)

***Key findings***:

- The Story's requirements are unusually complete — business-rules, scope, and workflow pre-answer most AC-clarity questions (title rule, duplicate-ATC-allowed, permanent binding, role matrix, retry responsibility). Few genuine AC ambiguities remain.
- The dominant risk is ***feasibility, not clarity***: the `tests` entity and its create path do not exist in source (migrations through 0020; no `/api/v1/tests` route; "New Test" is an unwired stub), and three supporting subsystems it relies on — the `activity*log` write path and the `idempotency*keys` wiring (both 0009 tables) — are schema-only/unwired today.
- The 3-SP estimate appears to assume the Test schema + activity-log + idempotency are either in scope or already built; that assumption should be reconciled with the PO before sprint commit.

---

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***Is building the ****`tests`**** entity (table + ordered ATC join + create path + RLS) part of THIS Story, or a prerequisite assumed to exist?***

   - ***Context***: no `tests`/`runs` table exists in migrations 0001-0020; no `/api/v1/tests` route; "New Test" is an unwired stub. The Story reads as greenfield.
   - ***Impact if unanswered***: the 3-SP estimate and the QA executable surface are both wrong; QA cannot dry-run any AC against staging.
   - ***Suggested answer (if you have one)***: scope the schema + RPC (mirroring `bunkai*save*atc`'s server-action + full-replace pattern) into this Story or split it into a predecessor.

1. ***What does a "selectable / published ATC" mean for chaining?***

   - ***Context***: AC1 says "three published ATCs", but `atcs.status` has no `published` state and there is no publish flag in the schema.
   - ***Impact if unanswered***: AC1's precondition is untestable; ambiguous which ATCs appear in the picker.
   - ***Suggested answer***: "any non-soft-deleted ATC in the active workspace" unless a publish concept is intended.

1. ***Define the idempotency window + the retry-safe identifier source.***

   - ***Context***: business-rules says "short window"; the `idempotency_keys` table has a 24h TTL but is NOT wired into any handler today.
   - ***Impact if unanswered***: AC3 and the agent retry path (Scenarios 3.1/3.2) are not concretely assertable.
   - ***Suggested answer***: client supplies an `idempotency-key` header (agent) / UI auto-generates one per form session; server dedupes on (user, endpoint, key) within the window.

1. ***Is the ****`activity_log`**** write part of this Story's scope?***

   - ***Context***: DoD requires an activity-log entry, but `activity_log` (0009) has no runtime write path in code (only generated types reference it).
   - ***Impact if unanswered***: the DoD audit criterion is unverifiable; the audit guarantee is silently absent.
   - ***Suggested answer***: include the activity*log write (service*role-side, as the table is service-role-write-only) and define read visibility (owner audit).

---

## Technical Questions for Dev

> These do not block PO but block implementation.

1. ***Exact status code + verbatim copy for the cross-workspace ATC rejection (AC4)*** — must be byte-identical for "ATC in another workspace" and "ATC does not exist", or it leaks existence (INV-3 non-disclosure). 403 vs 404/422 matters.
2. ***Server-side re-validation of empty chain + title rules*** — confirm the headless surface re-checks ≥1 ATC, title ≤200, whitespace-only, mirroring the `bunkai*save*atc` "re-validate in the server action" pattern (UI validation is not a boundary).
3. ***What happens to a Test's chain when a referenced ATC is deleted/soft-deleted?*** — RESTRICT (block delete, like `atcs.user*story*id`), cascade, or null-out? Defines the orphan-reference test.
4. ***Binding instant under mid-form workspace switch*** — does the Test bind to the workspace active at form-open or at Save? The binding is permanent, so the instant must be deterministic.

---

## Suggested Story Improvements

| # | Current state | Suggested change | Benefit |
|---|---------------|------------------|---------|
| 1 | AC1 "three published ATCs" | "three ATCs from her workspace's library" (or define publish) | Removes the schema contradiction; makes the precondition buildable. |
| 2 | business-rules "short window" | "within N seconds, deduped on idempotency key K" | Turns AC3 into a measurable assertion. |
| 3 | DoD "activity log records who created the Test" | Add an explicit AC scenario for the activity_log entry + visibility scope | Makes the audit DoD verifiable. |
| 4 | No chain-length / picker-scale limit | "max N ATCs per Test (or no cap in MVP); picker performs over ≥M ATCs" | Gives boundary + performance tests a target. |

---

## Data feasibility flags

***FEASIBILITY RISK — HIGH.*** This Story is largely greenfield; multiple dependencies are absent or schema-only (verified against the sibling repo `../upex-bunkai-tms`, migrations through 0020 + the `/api/v1` route inventory on 2026-06-06):

- ***Entity missing***: no `tests` table (and no ordered `test*atcs` join), no `bunkai*save_test`-style RPC, no `/api/v1/tests` route, no Test list/builder UI. "New Test" is an unwired stub. The core entity this Story creates does not exist yet.
- ***Audit path missing***: `activity_log` table exists (migration 0009) but has NO runtime write path in code — DoD "activity log records who created the Test" cannot be satisfied without building the writer.
- ***Idempotency unwired***: `idempotency_keys` table exists (0009) but no handler imports/invokes the idempotency lib; the header is only advertised in CORS. AC3's dedupe guarantee has no backing mechanism today.
- ***Required pre-work***: Test schema + RLS + create path, the activity_log writer, and idempotency wiring must land before any AC is executable against staging. Until then, QA can plan (this file) but cannot dry-run.
- ***Carried-forward environment blockers*** (master-test-plan §10): target `package.json` ↔ `bun.lock` desync and no provisioned test users in target Supabase Auth — both block live E2E once the feature is built.

---

## Recommended testing strategy

### Pre-implementation

- Resolve Critical Questions 1-4 (entity scope, "published" definition, idempotency window/key, activity_log scope) — these gate whether the 3-SP estimate is realistic.
- Confirm whether the Test schema + activity_log writer + idempotency wiring are in this Story or predecessors; re-estimate accordingly.

### During implementation

- Enforce the security pair early: cross-workspace non-disclosure (AC4) and viewer-via-API 403 (E1) — both protect INV-3 on a brand-new surface and are the highest-value outlines.
- Re-validate all input rules server-side, not just in the form (headless surface is a real client).

### Post-implementation (in-sprint by /sprint-testing)

- Run the 19 outlines with full parametrization + test-data JSON; verify the activity_log entry and idempotency dedupe behave per the agreed window/key.
- Verify UI/headless parity (one Test, same validations, same audit entry from both surfaces).

---

## Risks & mitigation

| # | Risk | Likelihood | Impact | Mitigated by which outlines |
|---|------|-----------|--------|-----------------------------|
| 1 | Test entity / create path not built → Story not executable as estimated | High | High | None (feasibility flag) — resolve via PO Q1 before commit |
| 2 | Cross-workspace ATC reference leaks existence (INV-3) | Medium | High | "Should reject a foreign-workspace ATC without disclosing existence", RLS-isolation outline |
| 3 | Viewer creates via headless API despite hidden UI button | Medium | High | "Should reject Test creation by a viewer via the headless API" |
| 4 | Double-submit creates duplicate Tests (idempotency unwired) | High (today) | Medium | "Should dedupe a double-submit within the idempotency window", agent-retry outline |
| 5 | Activity-log entry never written (DoD silently unmet) | High (today) | Medium | "Should write an activity_log entry on Test creation" |
| 6 | Unbounded chain / slow picker over large ATC library | Low | Medium | "Should enforce the max-ATC chain ceiling" (pending cap definition) |

---

## Next steps

- [ ] PO answers Critical Questions 1-4 before sprint planning (especially Q1 — entity scope vs the 3-SP estimate).
- [ ] Dev answers Technical Questions 1-4 before estimation.
- [ ] Story enters sprint at status Ready For Dev once estimated and feasibility resolved.
- [ ] When Story reaches Ready For QA, `/sprint-testing` will short-circuit refinement (label `shift-left-reviewed` detected).

---
_Synced from Jira by sync-jira-issues_
