# BK-498 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-498)

# Acceptance Test Plan (ATP) — BK-498

***Story******:*** PAT | Enforce capability scopes on the authoring domain
***Modality******:**** jira-native — this ATP is the Story's `Acceptance Test Plan (ATP)` field. TC outlines below are ****names + 1-line precondition/expected only***; formal Xray `Test` items are not created at this stage (jira-native defers TC creation to Stage 4 `test-documentation`, regression-worthy outlines only).

---

## Phase 1 — Critical Analysis

***Business context.*** The authoring domain (Modules, User Stories, Acceptance Criteria, Environments, Milestones, Imports) is where QA/Dev users build out ATC test content. Before this Story, any leaked or narrowly-scoped Personal Access Token (PAT) could still create, edit, or delete authoring content — the capability model existed (BK-497) but nothing enforced it yet. This Story is the first to actually flip enforcement on for a domain, so the business risk is data-integrity + trust-boundary: a mis-wired handler here means "read-only" tokens silently retain write power, or worse, correctly-scoped tokens get wrongly rejected and block real QA/Dev work.

***Technical context.**** All 22 handlers across 11 route files (`app/api/v1/{modules,user-stories,acceptance-criteria,environments,milestones,imports}**`) call `requireCapability` inside the shared `withApiHandler` gateway (`lib/api/handler.ts:74-101`) before the handler body runs. `requireCapability` (`lib/api/principal.ts:84-88`) throws a `forbidden` `ApiError` (403) on a missing capability. Backend-only — no UI surface in scope (PAT/token management UI is BK-497's already-approved territory).

***Story complexity******:**** Business logic — Low (single well-understood gate, already proven at BK-497). Integration — Medium (22 handlers × 6 resource families, one deliberate split-scope exception in Imports). Data validation — Low. UI — N/A (API-only). Overall: ****Medium*** complexity, driven by breadth (22 handlers) not depth.

***Epic-level inheritance******:*** Inherits BK-497's proven cookie-session PAT-minting flow (`POST /api/v1/auth/signin` → cookie jar → `POST /api/v1/tokens` with explicit `scopes`) and its CRITICAL risk tier (Auth/PAT, `master-test-plan.md`). BK-497 was behavior-neutral (declare posture only); BK-498 is the first Story to make that posture consequential.

---

## Phase 2 — Story Quality Analysis

***Ambiguities******:*** None blocking. The Import dual-scope split (`POST /imports` = `atc:write`, `GET /imports/{id}` = `atc:read`) reads as an inconsistency on first pass, but is a ratified AI Product Owner decision (2026-08-19, `comments.md`) — treated as intentional design in this ATP, not raised as a question.

***Gaps******:*** `EPIC-BK-1-tenancy-identity/module-context.md` still does not exist (same gap left open by BK-497). Not created in this Stage 1 pass — does not block ATP authorship; flagged for a future epic-level session.

***Edge cases not in the 4 formal ACs (added below, Phase 4)******:*** unauthenticated request (no token at all), revoked/expired token, browser-session control (sessions must stay unaffected), workspace-membership 403 vs capability 403 (must not be conflated), default-scope regression control, and the Import split-scope nuance.

***Testability******:*** Yes — all 4 ACs specify exact scope strings, exact HTTP verbs, and exact status codes. No vague language.

---

## Phase 3 — Refined Acceptance Criteria

### AC-01 — Properly-scoped write succeeds

- ***Type******:**** Positive · ****Priority******:*** Critical
- ***Given******:*** PAT scoped exactly `atc:write`, bound to a workspace the user is a member of (`BK264 Defect Triage` / `BK-264 QA Sandbox`)
- ***When******:*** `POST /api/v1/projects/{project_id}/modules` with a valid module payload
- ***Then******:*** `201`, module row exists in `modules` table

### AC-03 — Read-only token rejected on write, no side effect

- ***Type******:**** Negative · ****Priority******:*** Critical
- ***Given******:*** PAT scoped exactly `atc:read`
- ***When******:*** `POST /api/v1/projects/{project_id}/modules`
- ***Then******:**** `403 forbidden`, ****and*** no row inserted into `modules` (DB cross-check required — this is the DoD's "before any change happens" clause)

### AC-07 — Unbound write token still succeeds for a real member

- ***Type******:**** Positive / Boundary · ****Priority******:*** High
- ***Given******:*** PAT scoped `atc:write`, `workspace_id = null` (unbound), underlying user IS an active member of the target project's workspace
- ***When******:*** `POST /api/v1/projects/{project_id}/modules`
- ***Then******:*** `201` — capability check does not depend on token-workspace binding, only on the capability + the user's real membership

### AC-08a — Read-scoped token succeeds on a non-ATC read

- ***Type******:**** Positive · ****Priority******:*** High
- ***Given******:*** PAT scoped `atc:read`
- ***When******:*** `GET /api/v1/modules/{module_id}/user-stories`
- ***Then******:*** `200` with the User Stories list — proves the gate is capability-based, not resource-type-based (a "non-ATC" resource is still gated the same way)

***Collapse note******:*** none of the 4 ACs collapse to fewer scenarios — each is already a single boolean condition with fixed data (trivially atomic in isolation), but per Principle 4 they are the seed for the 1:N explosion in Phase 4, not the ceiling.

---

## Phase 4 — Test Design (Test Outlines)

### Technique-driven derivation

| Trigger | Technique | Applied |
| --- | --- | --- |
| Categorical input (PAT scope) | EP | valid scope / wrong scope / absent-unauth / narrow-mismatch — one partition per AC + risk-beyond-AC |
| Numeric range / length / window | BVA | ***N/A — no ranges, lengths, counts, or date windows anywhere in this AC set.*** |
| Status/lifecycle field | State-Transition | ***N/A for the Story's own ACs*** — PAT revocation/expiry is not an AC this Story asserts (that's PAT-lifecycle territory owned elsewhere). One revoked-token case is still added as an Error-Guessing risk case (R10), not a formal transition table. |
| 2+ interacting conditions | Decision Table | ***REQUIRED — fires.*** Operation (read/write) × PAT-scope-shape × workspace-membership interact on the Modules family (the literal AC-01/03/07/08a subject) → Decision Table below. |
| 3+ combinable factors | Pairwise | Considered and ***explicitly declined, logged here****: family (6) × operation (2) × scope-shape (~5) would explode to 60 combinations, but the family axis does not **interact** with scope/operation — `requireCapability` is the same gate function for all 22 handlers (confirmed by direct code read in Session Start). Full pairwise across family×scope×membership would re-test identical gate logic 6× with no new partition explored — anti-padding (Principle 4) forbids this. Coverage strategy instead: full Decision Table depth on ONE anchor family (Modules, the literal AC subject) + a ****parametrized EP sweep**** (Part 2.5) across the other families to confirm each handler is wired to the **correct* capability (a wiring-correctness check per family, not an interaction check). |
| Experience-based risk | Error Guessing | unauthenticated request, revoked token, membership-403 vs capability-403 conflation, browser-session non-regression |

### Decision Table — Modules family (anchor, full AC-01/03/07/08a depth)

Conditions: ***Operation**** (Write=POST/PATCH/DELETE, Read=GET) × ****PAT scope**** × ****Actor/workspace membership***.

| # | Operation | PAT scope | Membership | Expected | Traces to | Outline |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Write | `atc:write` | bound, member | `201` created | AC-01 | BK-498: TC1: should create module successfully given a PAT scoped exactly atc:write |
| R2 | Write | `atc:read` | bound, member | `403`, no DB row | AC-03 | BK-498: TC2: should reject module creation with 403 and no side effect given a PAT scoped exactly atc:read |
| R3 | Write | `atc:write` | ***unbound***, member | `201` created | AC-07 | BK-498: TC3: should create module successfully given an unbound atc:write PAT held by a real workspace member |
| R4 | Read | `atc:read` | bound, member | `200` + data | AC-08a | BK-498: TC4: should list user stories successfully given a PAT scoped atc:read |
| R5 | Read | `atc:write` | bound, member | `403` | risk-beyond-AC (mirror of R2) | BK-498: TC5: should reject a read request with 403 given a PAT scoped only atc:write |
| R6 | Write | none — no `Authorization` header at all | n/a | `401` unauthenticated (distinct from capability `403`) | risk-beyond-AC (boundary: absent credential ≠ under-scoped credential) | BK-498: TC6: should return 401 unauthenticated when no token is presented, distinct from the 403 capability rejection |
| R7 | Write | `atc:write` | bound, ***non-member*** of the target workspace | `403` membership-denial (distinct failure surface from R2's capability-403) | risk-beyond-AC (explicit instruction: do not conflate membership-403 with capability-403) | BK-498: TC7: should reject module creation with a membership-403 given a correctly-scoped atc:write PAT whose user is not a workspace member |
| R8 | Both | `atc:read`+`atc:write`+`run:execute` (`DEFAULT*PAT*SCOPES`) | bound, member | `201` on write, `200` on read | non-regression control | BK-498: TC8: should continue succeeding on both read and write given a default-scoped PAT (regression control against existing `.auth/tokens.env` role tokens) |
| R9 | Write | none (browser session cookie, no PAT) | bound, member | `201` — sessions are never narrowed, only PATs | non-regression control (explicit instruction: verify cookie sessions unaffected) | BK-498: TC9: should create module successfully via an authenticated browser session regardless of any PAT scope restriction |
| R10 | Write | `atc:write`, but ***revoked*** | bound, member | `401` invalid token (distinct from R2's valid-but-under-scoped `403`) | Error Guessing | BK-498: TC10: should return 401 for a revoked atc:write token, distinct from the 403 an under-scoped-but-valid token receives |

### Parametrized EP sweep — cross-family wiring check (Part 2.5 artifact economy)

One parameterized artifact per partition (write-rejected / write-accepted / read-accepted / read-rejected), data rows = one representative endpoint per remaining resource family. Confirms each handler is wired to the capability the DoD table specifies — same gate logic as the Decision Table above, only the **wiring** varies per family, so this collapses to 4 artifacts instead of ~20 discrete TCs.

***BK-498******:****** TC11******:****** should reject writes across all authoring families given a PAT scoped exactly atc******:******read*** (expected `403`, no DB side effect on each row)

| Family | Endpoint | Row expected |
| --- | --- | --- |
| User Stories | `POST /modules/{id}/user-stories` | 403 |
| Acceptance Criteria | `POST /user-stories/{id}/acceptance-criteria` | 403 |
| Environments | `POST /projects/{id}/environments` | 403 |
| Milestones | `POST /projects/{id}/milestones` | 403 |
| Imports | `POST /imports` | 403 — ***also the Import "expected 403" nuance (see TC15)*** |

***BK-498******:****** TC12******:****** should accept writes across all authoring families given a PAT scoped exactly atc******:******write*** (expected `2xx`, side effect created on each row) — same 5 rows as TC11, `atc:write` PAT.

***BK-498******:****** TC13******:****** should accept reads across all authoring families given a PAT scoped exactly atc******:******read*** (expected `200`)

| Family | Endpoint |
| --- | --- |
| User Stories | `GET /user-stories/{id}` |
| Acceptance Criteria | `GET /acceptance-criteria/{id}` |
| Environments | `GET /projects/{id}/environments` |
| Milestones | `GET /projects/{id}/milestones` |
| Imports | `GET /imports/{id}` — ***also the Import "expected 403" mirror, see TC15*** |

***BK-498******:****** TC14******:****** should reject reads across all authoring families given a PAT scoped exactly atc******:******write (write-only token)*** — same 5 rows as TC13, `atc:write` PAT, expect `403`.

### Import dual-scope nuance — explicit non-defect control

***BK-498******:****** TC15******:****** should complete a full import lifecycle (create then poll) successfully given a PAT scoped both atc******:******write and atc******:******read**** — precondition: PAT with both scopes (or `DEFAULT*PAT*SCOPES`); `POST /imports` → `201`, then `GET /imports/{id}` → `200`. ****This is the positive control for the TC11/TC14 Import rows**** — a write-only token's `403` on `GET /imports/{id}` (TC14 row) and a read-only token's `403` on `POST /imports` (TC11 row) are ****expected behavior per the 2026-08-19 AI Product Owner ruling, NOT a regression*** — Stage 2/3 must classify any Import-family 403 against this ruling before filing a defect.

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 6 | R1, R3, R4, R8(×2 legs), R9, TC12/TC13 rows, TC15 |
| Negative | 4 | R2, R5, R6, R10 |
| Boundary/edge | 2 | R3 (unbound token), R7 (membership vs capability) |
| Parametrized sweep | 4 artifacts / ~20 endpoint-rows | TC11-TC14 |
| Non-regression control | 3 | R8, R9, TC15 |

***Total******:****** 15 outlines/artifacts*** (10 Decision-Table rows on the Modules anchor + 4 parametrized cross-family artifacts + 1 Import positive control), covering all 22 authoring-domain handlers either directly (Modules) or via the representative-row sweep (the other 5 families).

### Parametrization

| Group | Param 1 (endpoint) | Param 2 (PAT scope) | Expected |
| --- | --- | --- | --- |
| TC11 | 5 write endpoints (one per remaining family) | `atc:read` | 403, no side effect |
| TC12 | same 5 | `atc:write` | 2xx, side effect |
| TC13 | 5 read endpoints | `atc:read` | 200 |
| TC14 | same 5 | `atc:write` | 403 |

Benefit: 20 endpoint-level checks execute as 4 artifacts instead of 20 discrete TCs — same coverage, 4× less TMS surface to maintain, per the doctrine's artifact-economy rule (Part 2.5).

---

## Phase 5 — Edge case + Test-data summary

### Edge case table

| Edge case | In original story? | Added to refined AC? | Outline | Priority |
| --- | --- | --- | --- | --- |
| Unauthenticated request (no token) | No | Yes (R6) | TC6 | High |
| Revoked/expired token | No | Yes (R10) | TC10 | Medium |
| Membership-403 vs capability-403 conflation | No | Yes (R7) | TC7 | High |
| Browser-session non-regression | No | Yes (R9) | TC9 | Critical |
| Default-scope regression control | No | Yes (R8) | TC8 | High |
| Import dual-scope "expected 403" | Yes (Team Discussion) | Yes | TC11/TC14 rows + TC15 | High |

### Test-data categories

| Data type | Count | Purpose | Examples |
| --- | --- | --- | --- |
| Narrow-scope PATs (live-minted) | 4 | `atc:write`-only, `atc:read`-only, unbound `atc:write`, revoked `atc:write` | Minted via cookie session, same flow BK-497 proved |
| Default-scope PATs | reuse `.auth/tokens.env` | Non-regression control (R8) | `STAGING*USER*PAT` or equivalent |
| Browser session cookie | 1 | Non-regression control (R9) | `POST /api/v1/auth/signin` cookie jar |
| Non-member actor | 1 | Membership-403 control (R7) | A user account not a member of `BK-264 QA Sandbox` |

### Data generation strategy

- ***Dynamic (live-minted PATs)******:*** `POST /api/v1/auth/signin` (cookie jar) → `POST /api/v1/tokens` with explicit `scopes: ["atc:write"]` / `["atc:read"]`, and one unbound variant (omit `workspace_id`). Reused pattern from BK-497 (`test-session-memory.md` cross-reference).
- ***Static******:*** default-scope PATs already present in `.auth/tokens.env`.
- ***Cleanup******:*** every PAT minted for this ATP's execution is revoked at the end of Stage 2 (same discipline as BK-497); the leftover un-revoked narrow-scoped PATs already observed in `BK-264 QA Sandbox` (dated today, unrelated to this run) are flagged for a Stage 3 cleanup pass, not consumed here since only hashes are stored (unusable as bearer credentials).

---

## Test-Design Checklist (doctrine gate)

- [x] P1 — Went beyond "every AC passes": 11 of 15 outlines are risk-beyond-AC (R5-R10, TC11-TC14 non-Modules rows, TC15).
- [x] P2 — AC treated as floor: the 4 formal ACs map to exactly 4 of the 15 outlines (R1-R4); the rest is coverage above the line.
- [x] P3 — Each outline is a concrete exploration (specific scope string, specific endpoint, specific expected status) — no outline restates an AC verbatim.
- [x] P4 — Every non-trivial AC exploded (4 ACs → 15 outlines); none collapsed to 1 without justification (none needed collapsing — each AC seeded ≥1 additional risk case).
- [x] P5 — Boundary (R3 unbound token), exception (R6 unauthenticated, R10 revoked), unforeseen (R7 membership-vs-capability), anomaly (R9 session control) all present.
- [x] EP — Partitions: valid scope, wrong scope, absent/unauthenticated, revoked-invalid — one outline per distinct partition.
- [x] BVA — ***N/A, stated deliberately***: no ranges/lengths/counts/date-windows in this AC set.
- [x] ST — ***N/A, stated deliberately***: no Story-owned status/lifecycle field; the one lifecycle-adjacent case (revoked token, R10) is handled as Error Guessing, not a formal transition table, since token revocation is not an AC this Story asserts.
- [x] DT — Decision Table built (10 rules, Modules anchor) — 2+ interacting conditions (operation × scope × membership) confirmed firing.
- [x] PW — ***N/A, logged with justification***: family axis does not interact with scope/operation (same gate function for all 22 handlers); full pairwise would re-test identical logic 6× — replaced with a parametrized EP sweep per family instead (Part 2.5).
- [x] PARAM — TC11-TC14 collapse same-behavior endpoint checks into 4 parametrized artifacts (20 rows) instead of 20 discrete TCs.
- [x] RISK — Priorities assigned per outline (Critical: R1/R2/R9; High: R3/R4/R6/R7/R8/TC11-14/TC15; Medium: R5/R10). No cases dropped.

***Result******:****** PASS.*** All checklist items answered YES or a deliberately justified N/A.

---
_Synced from Jira by sync-jira-issues_
