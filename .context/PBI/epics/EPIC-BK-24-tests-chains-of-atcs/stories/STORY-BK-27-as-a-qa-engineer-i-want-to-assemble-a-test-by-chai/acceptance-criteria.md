# BK-27 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-27)

## Refined Acceptance Criteria

### AC1 — Elena assembles a Test from three ATCs (chain order preserved + activity log)

#### Scenario 1.1: Should create a Test with three ATCs in the selected order (Type: Positive, Priority: High)

- Given: Elena is an `active` `member` (or above) of workspace "Acme QA" which has at least 3 selectable ATCs in its library (ATC-A, ATC-B, ATC-C).
- When: she opens "New Test", enters title `"Add to Cart from Empty State"`, selects ATC-A, ATC-B, ATC-C in that order, and clicks "Save".
- Then:
- UI: redirects to the new Test (or shows it in the Test list) with the entered title.
- Persistence: one `tests` row created, bound to "Acme QA"; the ordered chain persists positions 1=ATC-A, 2=ATC-B, 3=ATC-C exactly.
- Audit: one `activity*log` entry recording actor, action "test created", target Test title, timestamp. NEEDS PO/DEV CONFIRMATION — activity*log write path not yet built (Gap #4).
- System state: opening the Test shows the three ATCs in the exact selected order.

#### Scenario 1.2: Should preserve a chain that references the same ATC twice (Type: Edge, Priority: High)

- Given: Elena (member) in "Acme QA" with ATC-A available.
- When: she builds chain [ATC-A, ATC-B, ATC-A] and saves.
- Then: the Test persists three positions with ATC-A at positions 1 and 3 (sequence, not set — business-rules explicit). No de-duplication occurs.

### AC2 — Saving a Test without any ATC is blocked

#### Scenario 2.1: Should block save when no ATC is selected (Type: Negative, Priority: High)

- Given: Elena (member) on "New Test" with title `"Add to Cart from Empty State"` and zero ATCs selected.
- When: she clicks "Save".
- Then: save is blocked; message `"A Test must include at least one ATC"` (verbatim — confirm Ambiguity #3); no `tests` row created; form stays open. Re-validated server-side, not only in the form. NEEDS PO/DEV CONFIRMATION on server-side enforcement.

#### Scenario 2.2: Should reject empty/whitespace-only title (Type: Negative, Priority: High)

- Given: Elena (member) on "New Test" with a whitespace-only title `"   "` and at least 1 ATC selected.
- When: she clicks "Save".
- Then: save blocked; clear validation message; no row created. (business-rules: whitespace-only titles rejected.)

#### Scenario 2.3: Should reject a title over 200 characters (Type: Boundary, Priority: Medium)

- Given: Elena (member) with a 201-character title and at least 1 ATC.
- When: she saves.
- Then: rejected; a 200-character title is accepted. (business-rules: 200-char limit.)

### AC3 — Accidentally clicking Save twice does not create duplicates

#### Scenario 3.1: Should create exactly one Test on a double-submit (Type: Edge, Priority: High)

- Given: Elena (member) with a valid title + three ATCs, on a slow connection.
- When: she clicks "Save", then clicks "Save" again before the first response returns (same retry-safe identifier / idempotency key).
- Then: exactly one `tests` row titled `"Add to Cart from Empty State"`; the Test appears once in the list, not duplicated. NEEDS PO/DEV CONFIRMATION — depends on the idempotency window + key source (Ambiguity #1); `idempotency_keys` table exists (0009) but is NOT wired in any handler today (feasibility flag).

#### Scenario 3.2: Should dedupe a headless agent retry with the same idempotency key (Type: Edge, Priority: High)

- NEEDS PO/DEV CONFIRMATION: behavior inferred from workflow "agent provides a retry-safe identifier".
- Given: an agent (PAT-authed, write scope) submits a create with idempotency key `K`.
- When: the same request with key `K` is retried (network retry).
- Then: one Test created; the second call returns the cached prior response (per `idempotency_keys` semantics), not a second Test.

### AC4 — Elena cannot use ATCs from a workspace she does not belong to

#### Scenario 4.1: Should reject a chain referencing a foreign-workspace ATC without disclosing existence (Type: Negative/Security, Priority: Critical)

- Given: Elena belongs to "Acme QA" but not "Other Co"; an ATC `ATC-X` is owned by "Other Co".
- When: she attempts (via UI or headless API) to create a Test referencing `ATC-X`.
- Then: rejected; no `tests` row in "Acme QA"; error does NOT reveal whether `ATC-X` exists. NEEDS PO/DEV CONFIRMATION on exact status + verbatim copy (Ambiguity #2) — must be identical to the response for a wholly-nonexistent ATC id (non-disclosure, INV-3).

### New scenarios surfaced from Phase 2 edge cases — NEEDS PO/DEV CONFIRMATION

#### Scenario E1: Should reject Test creation by a viewer via the headless API (Type: Negative/Security, Priority: High)

- NEEDS PO/DEV CONFIRMATION: confirm server-side 403 regardless of UI affordance.
- Given: a `viewer` of "Acme QA" with a valid PAT.
- When: they POST a valid Test-create to the headless surface.
- Then: 403; no Test created. (UI hides the button for viewers, but the API must enforce — master-test-plan section 7.)

#### Scenario E2: Should bind the Test to the workspace active at the creation instant (Type: Edge, Priority: Medium)

- NEEDS PO/DEV CONFIRMATION: define the binding instant (form-open vs Save click) under a mid-form workspace switch.
- Given: Elena opens "New Test" while active in "Acme QA", then switches active workspace before clicking Save.
- Then: the Test binds permanently to the workspace defined by the agreed instant; binding is immutable thereafter.

---
_Synced from Jira by sync-jira-issues_
