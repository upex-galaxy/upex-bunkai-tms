# BK-499 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-499)

# Shift-Left Refinement: BK-499 — PAT | Enforce capability scopes on read, identity and notification routes

***Status***: Refined — Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint, single-Story session)
***Refined on***: 2026-08-21
***Refined by***: QA — Shift-Left session
***Modality***: Jira-native (no Xray on Jira; ATP DRAFT lives on the Story field + comment mirror)

---

## Phase 1 — Critical Analysis

### Business context

- ***Primary persona affected***: Karim — the autonomous AI test agent / Machine-Agentic Operator persona that authenticates to Bunkai with a Personal Access Token (per `.context/PRD/user-personas.md`).
- ***Secondary personas (if any)***: any human or service that authenticates via browser session (cookie) — Business Rule 2 explicitly carves out session callers as always-full-access, so every other persona is a secondary observer of this Story's behavior even though it does not change their experience.
- ***Business value proposition***: reduces the blast radius of a leaked or over-issued PAT — a token minted for one narrow job (e.g. read-only reporting) can no longer reach unrelated capability-gated surface, whether by caller mistake or credential leak.
- ***KPI(s) influenced***: security posture / least-privilege compliance for the PAT system. No user-facing product KPI (no UI, no new feature).
- ***User journey position***: not a single journey step — this Story is a cross-cutting authorization control applied to 24 existing handlers across 4 functional groups (reporting reads, runs/tests reads, identity/notifications, workspaces/membership).

### Technical context

- ***Frontend***: none. No UI change of any kind.
- ***Backend****: 24 handlers across 21 route files under `app/api/v1/***` in `upex-bunkai-tms`. All currently carry `auth: 'authenticated', why: 'BK-499 pending — <category>.'` — a structured placeholder added by the BK-497 Foundation Story (every route must declare a capability posture) and left "pending" for this Story to resolve.
- ***External services***: none new. Existing Supabase RLS + SECURITY DEFINER/INVOKER RPCs already enforce workspace-membership visibility independently of this Story's capability-scope layer.
- ***Integration points specific to this Story***: the capability-check middleware inside `withApiHandler`'s `requires: [...]` config (established by BK-497); the PAT scope catalog (`atc:read`, `atc:write`, `workspace:admin` — confirmed to already exist as a distinct scope on `PATCH /workspaces/{id}`, `app/api/v1/workspaces/[id]/route.ts:79`).

### Story complexity

| Axis | Rating | Why |
| --- | --- | --- |
| Business logic | Medium | The enforcement rule itself is simple (declare `requires: ['atc:read']` or leave capability-free), but two exception patterns exist (session-only routes, mixed read/write treatment in one category) that must not be conflated. |
| Integration | Medium | 24 handlers across 21 files, but all reuse the same `withApiHandler` config pattern already proven by BK-497/BK-498 — no new middleware to build. |
| Data validation | Low | No new request/response schemas. |
| UI | None | Backend-only. |

***Estimated test effort***: Medium-High — not because any single case is hard, but because of breadth (24 handlers × up to 4 distinct posture types) and two genuine ambiguities that block full outline design until answered (see Phase 2).

### Epic-level inheritance

- ***Risks restated at Story level***: the BK-497 Foundation Story's invariant ("every route declares a posture") already holds across the codebase — confirmed empirically via `grep -rl "BK-499 pending" app/api/v1/` (21 files). This Story is pure enforcement of already-declared-but-inert postures, not new declaration work.
- ***Integration points inherited***: the capability-check middleware and PAT scope catalog, both delivered by BK-497.
- ***PO/Dev answers already given at epic level****: the AI Product Owner / AI Tech Lead ruling on BK-262 already decided `POST /workspaces` and `DELETE /workspaces/{id}/membership` stay outside the `atc:read` enforcement (reused here, not re-asked). What is newly surfaced by this refinement is that the **wording* "capability-free" may not accurately describe `DELETE /workspaces/{id}/membership`'s actual mechanism (see Ambiguity #2 below) — that specific point was NOT settled by the BK-262 ruling and is a genuine new question.
- ***Test strategy inherited***: none — Story enters Backlog with two AC examples already corrected by PO (non-existent endpoint → `GET /api/v1/projects/{id}/bugs`), which this refinement builds on.

---

## Phase 2 — Story Quality Analysis

### Ambiguities

| # | Location in Story / code | Question for PO/Dev | Impact on testing | Suggested clarification |
| --- | --- | --- | --- | --- |
| 1 | `app/api/v1/workspaces/[id]/notifications/route.ts:9-16` vs `:68` | The route's own doc comment says it "mirrors GET /api/v1/activity" (which requires `atc:read`, category "reporting reads"), but its `why:` marker classifies it under "identity and notifications" (no-capability). Which is correct? | Cannot write the AC or the outline for this route until resolved — the expected status code for a read-scope-missing PAT is either 200 or 403 depending on the answer. | Confirm final category explicitly in the AC; if "identity and notifications" wins, update the stale doc comment in the same PR. |
| 2 | `scope.md` / DoD text vs `app/api/v1/workspaces/[id]/membership/response.ts:17-21` and `app/api/v1/me/active-workspace/route.ts:24` | The DoD calls `DELETE /workspaces/{id}/membership` "capability-free" — but the code rejects EVERY Bearer PAT outright (`assertSessionOnly`, 403 "…Use a browser session"), regardless of scope. `POST /me/active-workspace` does the same. This is a stronger restriction than "capability-free" (which implies a PAT **can** call it, just without a scope check). | Determines whether the negative test case is "PAT missing the right scope → 403" (capability-free framing) or "ANY PAT, any scope → 403, only session works" (session-only framing) — these are different assertions. | Reword the AC to state "session-only" explicitly for these two routes, distinct from the bootstrap route's genuine capability-free posture. |
| 3 | `app/api/v1/workspaces/route.ts` (GET), `app/api/v1/workspaces/[id]/route.ts` (GET) | No AC states these two reads require `atc:read`. Inferred by pattern only. | Cannot mark these Positive/Negative outlines as AC-derived (vs. inferred) without confirmation. | Confirm `atc:read` applies here exactly as it does to the other 12 read routes. |
| 4 | DoD text ("27 of the remaining 28 handlers") vs `grep -rl "BK-499 pending" app/api/v1/` (24 handlers across 21 files found) | The two numbers don't reconcile. Either the DoD counts something the grep didn't catch (e.g. a handler with a different placeholder wording, or one already resolved without a "pending" trace), or the DoD figure is stale. | Affects whether QA's execution checklist (24 handlers) is complete or under-counts the real scope. | Dev confirms the authoritative handler list before implementation starts — recommend using the grep output above as the checklist baseline until reconciled. |

### Gaps (missing info)

| # | Type | Why critical | What to add | Risk if omitted |
| --- | --- | --- | --- | --- |
| 1 | AC | `POST /workspaces/{id}/projects` (`app/api/v1/workspaces/[id]/projects/route.ts:100-103`) is a WRITE inside the "workspaces and membership" category, but neither the DoD's 2-route "capability-free" list nor any AC mentions it. It already has an independent RLS role check (`role >= member`). | Add an AC (or an explicit "out of scope for BK-499" note) defining its posture. | Handler ships with an accidental default (`auth: 'authenticated'` = no capability check ever added) or a Dev guess that later needs rework. |
| 2 | AC | Business Rule 1 ("capability rejection happens regardless of workspace role") has no AC exercising it — no scenario pairs a privileged role (owner/admin) with an under-scoped PAT. | Add a Positive/Negative pair: owner-role PAT missing the required scope still gets 403; viewer-role PAT with the right scope still gets 200. | A dev or reviewer could reasonably assume "admin bypasses scope checks," which the business rule explicitly forbids. |
| 3 | AC | Business Rule 2 ("browser session always carries the full capability set") has no AC — every existing AC talks only about PATs. | Add a scenario: browser-session caller reads a capability-gated route successfully regardless of any scope concept. | A future implementation could mistakenly try to apply scope checks to session callers, breaking normal UI usage. |
| 4 | AC | The "identity and notifications" category mixes 3 read handlers and 4 write handlers, and the DoD's "justified no-capability posture" language does not explicitly confirm it applies to writes too. | One explicit AC confirming the no-capability posture is uniform across both HTTP verbs in this category. | A dev could reasonably require `atc:write` on the 4 write handlers by analogy with the read/write split used elsewhere in the Story, which would be an over-restriction versus intent. |

### Edge cases not in Story

| # | Scenario | Expected behavior (best guess) | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | PAT minted with a completely empty scope array attempts `POST /workspaces` (bootstrap) | AC-1 requires "at least one scope" — a zero-scope token should be rejected, but no status code / message is specified | Medium | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 2 | PAT holding `atc:write` only (no `atc:read`) attempts a read-gated route | Unclear whether `atc:write` alone satisfies a read requirement, or only `atc:read` does | Medium | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 3 | Expired or revoked PAT attempts any of the 24 routes | Should fail at authentication (401) before capability is ever evaluated — not this Story's new behavior, but worth a smoke check that the ordering (auth before capability) still holds after this change | Low | Test only — don't add AC (regression check, not new scope) |
| 4 | Browser-session caller hits a session-only route (`DELETE .../membership`, `POST /me/active-workspace`) | Should succeed normally — sessions are the intended channel for these routes | High | Add to AC (ties to Gap #3 / Business Rule 2) |

### Contradictions

***Yes — one confirmed contradiction found in code, not inferred***: `app/api/v1/workspaces/[id]/notifications/route.ts` — the doc comment (lines 9-16) states the route "mirrors GET /api/v1/activity" (a route requiring `atc:read`), while the route's own `why:` marker (line 68) classifies it under "identity and notifications" (a category the DoD says gets NO capability requirement). Both cannot be true at once. See Ambiguity #1.

### Testability validation

***Verdict***: Partial

Issues:

- Cannot design a final outline for `GET /workspaces/{id}/notifications` until Ambiguity #1 is resolved (expected status code is binary-unknown: 200-without-scope-check or 403-without-scope).
- Cannot design any outline for `POST /workspaces/{id}/projects` until Gap #1 is resolved — no baseline exists to assert against.
- Every other route (22 of 24 handlers) is fully testable today from the code + business rules already read.

---

## Phase 3 — Refined Acceptance Criteria

### Original AC1 — Bootstrap workspace with any-scope PAT (carried verbatim, AC-02 in BK-262's numbering)

#### Scenario 1.1: Should create a workspace for any authenticated PAT holding at least one scope (Type: Positive, Priority: High)

- ***Given***: Karim holds a valid, non-expired, non-revoked PAT with exactly one scope (e.g. `atc:read` only)
- ***When***: Karim sends `POST /api/v1/workspaces` with a valid name + slug
- ***Then***: 201, workspace created, Karim is `owner`

#### Scenario 1.2: Should reject workspace creation for a PAT with zero scopes (Type: Boundary, Priority: Medium) — NEEDS PO/DEV CONFIRMATION

- ***Given***: Karim holds a valid PAT minted with an empty scope array
- ***When***: Karim sends `POST /api/v1/workspaces`
- ***Then***: rejected — exact status code and message NOT YET SPECIFIED (candidate: 403, consistent with every other capability rejection in this Story)

### Original AC2/AC3 — Capability-gated reads (AC-08/AC-09, generalized to all 12 `atc:read`-gated routes)

Applies uniformly to: `GET /api/v1/activity`, `GET /api/v1/bugs`, `GET /api/v1/bugs/{id}`, `GET /api/v1/projects/{id}/bugs`, `GET /api/v1/projects/{id}/bugs/heatmap`, `GET /api/v1/projects/{id}/coverage`, `GET /api/v1/projects/{id}/runs/report`, `GET /api/v1/projects/{id}/traceability`, `GET /api/v1/projects/{id}/metrics/recovery-cycles` (reporting reads, 9), `GET /api/v1/runs/{id}`, `GET /api/v1/tests/{id}`, `GET /api/v1/tests/{id}/runs` (runs/tests reads, 3).

#### Scenario 2.1: Should return data for a PAT scoped `atc:read` (Type: Positive, Priority: High)

- ***Given***: Karim holds a PAT scoped `atc:read`
- ***When***: Karim sends a GET request to any of the 12 routes above
- ***Then***: 200 with the requested data

#### Scenario 2.2: Should reject a PAT missing `atc:read` (Type: Negative, Priority: High)

- ***Given***: Karim holds a PAT scoped only `run:execute` (or any scope set excluding `atc:read`)
- ***When***: Karim sends a GET request to any of the 12 routes above
- ***Then***: 403, no data returned

### New AC4 — Identity/notification routes accept any authenticated PAT regardless of scope, uniformly across reads and writes — NEEDS PO/DEV CONFIRMATION (Gap #4)

Applies to: `GET /api/v1/me`, `GET /api/v1/notification-preferences`, `PATCH /api/v1/notification-preferences`, `POST /api/v1/notifications/{id}/read`, `POST /api/v1/workspaces/{id}/notifications/read-all` (5 confirmed; excludes the 2 ambiguous/session-only routes below).

#### Scenario 4.1: Should succeed for any authenticated PAT regardless of its scope set (Type: Positive, Priority: Medium)

- ***Given***: Karim holds a PAT scoped only `run:execute` (a scope unrelated to identity/notifications)
- ***When***: Karim calls any of the 5 routes above with its normal request shape
- ***Then***: 200/201 as normal — no 403 for lacking a specific capability

### New AC5 — Session-only routes reject every PAT regardless of scope; only a browser session succeeds (Ambiguity #2) — NEEDS PO/DEV CONFIRMATION

Applies to: `DELETE /api/v1/workspaces/{id}/membership`, `POST /api/v1/me/active-workspace`.

#### Scenario 5.1: Should reject any Bearer PAT, regardless of scope (Type: Negative, Priority: High)

- ***Given***: Karim holds a valid PAT with every scope in the catalog
- ***When***: Karim sends the request via `Authorization: Bearer`
- ***Then***: 403 "…cannot… Use a browser session." — NOT a scope-insufficiency message

#### Scenario 5.2: Should succeed for a browser session, unconditionally (Type: Positive, Priority: High)

- ***Given***: Karim is authenticated via browser session (cookie)
- ***When***: Karim sends the same request
- ***Then***: 200/204 as normal

### New AC6 — Browser session is never scope-restricted (Business Rule 2, Gap #3) — NEEDS PO/DEV CONFIRMATION

#### Scenario 6.1: Should serve a capability-gated route to a browser session with no scope check at all (Type: Positive, Priority: High)

- ***Given***: Karim is authenticated via browser session (no PAT, no scope concept applies)
- ***When***: Karim sends a GET request to any `atc:read`-gated route (e.g. `GET /api/v1/activity`)
- ***Then***: 200 with data — capability check does not apply to session callers

### New AC7 — Workspace role never substitutes for a missing capability (Business Rule 1, Gap #2) — NEEDS PO/DEV CONFIRMATION

#### Scenario 7.1: Should reject a workspace-owner-role PAT missing the required capability (Type: Negative, Priority: High)

- ***Given***: Karim is the `owner` of the target workspace, and holds a PAT scoped only `run:execute`
- ***When***: Karim sends a GET request to any `atc:read`-gated route inside that workspace
- ***Then***: 403 — the owner role does NOT substitute for the missing `atc:read` scope

#### Scenario 7.2: Should accept a viewer-role PAT holding the required capability (Type: Positive, Priority: Medium)

- ***Given***: Karim is a `viewer` in the target workspace, and holds a PAT scoped `atc:read`
- ***When***: Karim sends a GET request to any `atc:read`-gated route inside that workspace
- ***Then***: 200 — viewer role is sufficient once the capability is present (confirms existing RLS behavior is unaffected by this Story)

### Unresolved — no AC possible yet (Gap #1)

`POST /api/v1/workspaces/{id}/projects` has no defined capability posture in any source (Story, DoD, scope.md). No Scenario can be written until PO/Dev answers whether it requires `atc:write`, stays capability-free, or something else.

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 6 | Bootstrap, atc:read-gated reads (12-route bucket), identity/notifications (5-route bucket), session-only-via-session (2-route bucket), browser-session-full-access, viewer-role-sufficiency |
| Negative | 3 | atc:read-missing (12-route bucket), session-only-via-PAT (2-route bucket), owner-role-does-not-substitute |
| Boundary | 3 | Zero-scope bootstrap, scope-precision (`atc:write`-only vs `atc:read`-gated route), extra-irrelevant-scope-still-passes |
| Integration / Blocked | 2 | `workspaces/[id]/notifications` contradiction resolution, `POST .../projects` undefined posture |
| ***Total**** | ****14*** | Grouped by category rather than exploded per-route (24 routes) — shift-left mode; `/sprint-testing` will decide whether to keep the grouping or explode per-route during in-sprint planning. |

***Rationale****: this Story is architecturally simple (one config flag per route) but high-breadth (24 handlers) and carries a VETO classification (auth/security) per the shift-left risk rubric, so outlines are grouped by **behavioral pattern* (4 categories + 2 session-only + 2 business rules) rather than named once per route — that keeps the count proportionate to actual distinct behaviors, not file count, while the 2 "Integration/Blocked" outlines flag real code-verified ambiguities that must resolve before Dev estimation.

### Outline list

#### Positive

- ***Should create a workspace for a PAT holding at least one scope*** — Pre: valid PAT, 1 scope. Expected: 201.
- ***Should return data for ****`atc:read`****-scoped PAT on any of the 12 read-gated routes*** — Pre: valid PAT scoped `atc:read`. Expected: 200 + data, per route.
- ***Should succeed for any-scope PAT on identity/notification routes*** — Pre: valid PAT, unrelated scope. Expected: 200/201, per route (5 confirmed routes).
- ***Should succeed via browser session on session-only routes*** — Pre: browser session. Expected: 200/204.
- ***Should serve a capability-gated route to a browser session unconditionally*** — Pre: browser session, any capability-gated route. Expected: 200, no scope check applied.
- ***Should accept a viewer-role PAT holding the required capability*** — Pre: viewer role + `atc:read` PAT. Expected: 200.

#### Negative

- ***Should reject a PAT missing ****`atc:read`**** on any of the 12 read-gated routes*** — Pre: PAT scoped `run:execute` only. Expected: 403, no data, per route.
- ***Should reject any Bearer PAT on session-only routes, regardless of scope*** — Pre: PAT with full scope set. Expected: 403 "…Use a browser session."
- ***Should reject an owner-role PAT missing the required capability*** — Pre: owner role + PAT missing `atc:read`. Expected: 403 — role does not substitute.

#### Boundary

- ***Should reject workspace creation for a zero-scope PAT*** — Pre: PAT minted with empty scope array. Expected: rejection (status TBD — NEEDS PO/DEV CONFIRMATION).
- ***Should confirm whether ****`atc:write`****-only satisfies a read-gated route*** — Pre: PAT scoped `atc:write` only. Expected: TBD — NEEDS PO/DEV CONFIRMATION.
- ***Should pass with an extra, irrelevant scope present alongside the required one*** — Pre: PAT scoped `atc:read` + `run:execute`. Expected: 200, unaffected by the extra scope.

#### Integration

- ***Should resolve ****`GET /workspaces/{id}/notifications`****'s capability requirement*** — Pre: N/A, blocked on Ambiguity #1. Expected: N/A until answered.
- ***Should resolve ****`POST /workspaces/{id}/projects`****'s capability requirement*** — Pre: N/A, blocked on Gap #1. Expected: N/A until answered.

> ***NOT included here*** (deferred to in-sprint planning by `/sprint-testing` Stage 1): parametrization tables, per-outline test-data JSON, numbered test steps, Faker generation strategies.

---

## Phase 5 — Edge Cases (DRAFT)

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | PAT with a completely empty scope array attempting bootstrap | No | Medium | Add to AC (PO confirm) |
| 2 | PAT holding `atc:write` only attempting a read-gated route | No | Medium | Add to AC (PO confirm) |
| 3 | Expired/revoked PAT on any of the 24 routes | No (pre-existing behavior) | Low | Test only — regression check, don't add AC |
| 4 | Browser session hitting a session-only route | No | High | Add to AC (ties to Business Rule 2) |

> Test-data generation strategy + Faker recipes are NOT defined here. They land in `/sprint-testing` Stage 1 when the feature exists.

---

## Story Quality Assessment

***Verdict***: Needs Improvement

***Key findings***:

- The Story's 3 given ACs cover only 2 of the 4 real behavioral categories in scope (24 handlers found in code vs. 5 files named in `scope.md`); the other 2 categories (7 identity/notification handlers, 5 workspaces/membership handlers) have zero AC coverage today.
- One literal contradiction exists in the target codebase itself (`workspaces/[id]/notifications/route.ts`) that must be resolved before that route can be implemented or tested correctly.
- Both Business Rules stated in `business-rules.md` (role-independence, session-always-full-access) are asserted in prose but exercised by zero ACs.

---

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***Does ****`GET /workspaces/{id}/notifications`**** require ****`atc:read`****, or does it stay in the no-capability "identity and notifications" bucket?***

1. ***What capability, if any, does ****`POST /workspaces/{id}/projects`**** require?***

1. ***Should the Story's "capability-free" language be corrected to "session-only" for ****`DELETE /workspaces/{id}/membership`**** and ****`POST /me/active-workspace`****?***

1. ***Please reconcile the DoD's "27 of the remaining 28 handlers" against the 24 handlers this refinement found via ****`grep -rl "BK-499 pending" app/api/v1/`****.***

---

## Technical Questions for Dev

> These do not block PO but block implementation.

1. ***Confirm ****`GET /workspaces`**** and ****`GET /workspaces/{id}`**** are intended to require ***`atc:read` (the same scope every other read in this Story reuses), not a new scope — context: no AC states this explicitly, testing impact: determines the exact `requires: [...]` value to assert against.
2. ***Once ****`POST /workspaces/{id}/projects`****'s capability (if any) is decided, confirm the evaluation order against its existing RLS role check (****`role >= member`****)*** — context: `app/api/v1/workspaces/[id]/projects/route.ts:71-95` already gates on role independently; testing impact: determines which failure (403 missing-capability vs. 403 not-a-member) a given token/role combination should produce, and in what order.
3. ***Confirm the no-capability posture for "identity and notifications" applies uniformly to writes, not just reads*** — context: 4 of the 7 handlers in that category are writes (`PATCH /notification-preferences`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `POST /me/active-workspace` [session-only, separate concern]); testing impact: confirms whether `atc:write` is ever required inside this category.

---

## Suggested Story Improvements

| # | Current state | Suggested change | Benefit |
| --- | --- | --- | --- |
| 1 | DoD calls `DELETE /workspaces/{id}/membership` "capability-free" | Reclassify as "session-only" (PAT rejected outright, not merely un-scoped) | Prevents a mis-asserted test case and a misleading precedent for future "capability-free" routes |
| 2 | `business-rules.md` states role-independence and session-full-access as prose rules with zero exercising ACs | Add AC6/AC7 (drafted above) formally to the Story | Closes the gap between stated business rules and testable behavior |
| 3 | `scope.md`'s enumerated file list (5 files) is stale relative to the actual 21-file/24-handler set | Refresh the field with the grep-verified list (reproduced in this document's Phase 1) | Prevents Dev from under-scoping the implementation using a stale reference |

---

## Data feasibility flags

No data feasibility risks identified — no new fixtures, entities, or seed data required. This Story is pure authorization-layer logic on already-shipped read/write handlers.

---

## Recommended testing strategy

### Pre-implementation

- Resolve all 4 Critical Questions for PO before Dev starts — 2 of them (`workspaces/[id]/notifications`, `.../projects`) directly change what code needs to be written, not just how it's tested.

### During implementation

- Dev should verify handler coverage against this refinement's grep-confirmed 24-handler / 21-file list, not `scope.md`'s stale 5-file list.
- Pay special attention to NOT conflating "capability-free" (PAT allowed through, no scope required) with "session-only" (PAT rejected outright) — they require different code paths and different error messages.

### Post-implementation (in-sprint by /sprint-testing)

- Execute the 14 outline buckets above, exploding per-route where `/sprint-testing` Stage 1 judges it necessary (especially the 12-route reads bucket and the 5-route identity/notifications bucket).
- Give the 2 session-only routes dedicated negative cases that assert the exact "…Use a browser session." message, not a generic 403.

---

## Risks & mitigation

| # | Risk | Likelihood | Impact | Mitigated by which outlines |
| --- | --- | --- | --- | --- |
| 1 | Dev implements against `scope.md`'s stale 5-file list and misses part of the real 21-file/24-handler surface | Medium | High — a route ships unenforced, reopening the exact security gap this Story exists to close | All Positive/Negative outlines, once exploded per-route in-sprint |
| 2 | Session-only routes get coded as a plain missing-scope 403 instead of a session-only 403 | Medium | Medium — breaks the distinct error-message contract already shipped in `assertSessionOnly` | "Should reject any Bearer PAT on session-only routes, regardless of scope" |
| 3 | `POST /workspaces/{id}/projects`'s eventual capability check is wired in the wrong order relative to its existing RLS role check | Low-Medium | Medium — ambiguous or wrong error message on failure | Integration outline "Should resolve `POST /workspaces/{id}/projects`'s capability requirement", once unblocked |

---

## Next steps

- [ ] PO answers the 4 Critical Questions before sprint planning
- [ ] Dev answers the 3 Technical Questions before estimation
- [ ] Story enters sprint at status `Ready For Dev` once estimated
- [ ] When Story reaches `Ready For QA`, `/sprint-testing` will short-circuit refinement (label `shift-left-reviewed` detected)

---
_Synced from Jira by sync-jira-issues_
