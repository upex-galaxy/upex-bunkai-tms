# BK-22 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-22)

## Scenario 1.1: Should show "Used in N tests" count for ATC referenced in multiple Tests (Type: Positive, Priority: Critical)

- ***Given***: workspace W1 has ATC atc-slug-a referenced in 4 Tests within the same workspace; the user is authenticated as a workspace member (role >= viewer) of W1
- ***When***: the user opens the ATC detail page for atc-slug-a
- ***Then***:

- UI: the usage widget displays "Used in 4 tests"
- API: GET /atcs/{atc-slug-a-id}/usage returns HTTP 200 with body { "used_in": [ ...4 or more entries... ] } (N distinct Test entries)
- DB: no mutation; read-only query against test_steps JOIN tests
- System state: unchanged

---

## Scenario 2.1: Should list each Test with the ATC's position when usage report is expanded (Type: Positive, Priority: High)

- ***Given***: ATC atc-slug-a is referenced by Test-A at position 3, Test-B at position 1, Test-C at position 7, Test-D at position 2; user is authenticated
- ***When***: the user expands the usage report on the ATC detail page
- ***Then***:

- UI: the expanded list shows 4 entries; each entry displays the Test title and the ATC's position within that Test
- API: response body contains 4 objects each with test*id, slug, title, position*in_test fields
- List order: entries are ordered by Test slug ascending, then position ascending (per Architect Annotation)
- DB: no mutation

## Scenario 2.2: Should show multiple rows when one Test references the same ATC at multiple positions (Type: Edge, Priority: High) — NEEDS PO/DEV CONFIRMATION

- ***NEEDS PO/DEV CONFIRMATION***: multi-position rendering in UI is not specified in the Story. This scenario is inferred from the Architect Annotation ("no deduplication"). Confirm whether the UI shows one row per Test (with all positions listed) or one row per Test-position pair.
- ***Given***: ATC atc-slug-b is referenced by Test-X at position 2 AND at position 5 (same test, two steps use this ATC)
- ***When***: the usage report is expanded
- ***Then***:

- API: GET /atcs/{atc-slug-b-id}/usage returns HTTP 200 with at minimum 2 entries for Test-X: { position*in*test: 2 } and { position*in*test: 5 }
- UI: rendering behavior to be confirmed by PO — either two rows for Test-X or one row with "positions: 2, 5"
- Count label: ***NEEDS PO/DEV CONFIRMATION*** — should read "Used in 1 test" (1 distinct Test) or "Used in 2 steps" (2 positions)?

---

## Scenario 3.1: Should show "Used in 0 tests" and empty list for an ATC with no test_steps references (Type: Positive, Priority: High)

- ***Given***: ATC atc-slug-c exists in workspace W1 and has no rows in test*steps with atc*id = atc-slug-c-id; user is authenticated
- ***When***: the user opens the ATC detail page for atc-slug-c
- ***Then***:

- UI: the widget displays "Used in 0 tests"; the expandable list is empty (or the expand control is absent/disabled)
- API: GET /atcs/{atc-slug-c-id}/usage returns HTTP 200 with body { "used_in": [] } — NOT 404
- DB: no mutation

## Scenario 3.2: Should return 200 with empty array (not 404) for an ATC with zero usage — API contract (Type: API, Priority: Critical) — NEEDS PO/DEV CONFIRMATION

- ***NEEDS PO/DEV CONFIRMATION***: the explicit { used_in: [] } vs 404 distinction is in the Architect Annotation but not in any AC. This scenario formalizes that contract.
- ***Given***: ATC atc-slug-c exists in workspace W1 with no test_steps referencing it
- ***When***: GET /atcs/{atc-slug-c-id}/usage is called with a valid session cookie or PAT (atc:read scope)
- ***Then***:

- API: HTTP 200 { "used_in": [] }
- NOT: HTTP 404 with any error code

---

## Scenario 4.1: Should exclude Tests from other workspaces from the usage count (Type: Negative, Priority: Critical)

- ***Given***: ATC atc-slug-a belongs to workspace W1; Test-Z belongs to workspace W2 and references atc-slug-a via test_steps; user is authenticated in workspace W1
- ***When***: the user opens the usage report for atc-slug-a in W1
- ***Then***:

- UI: Test-Z is NOT listed; count reflects only W1 Tests
- API: GET /atcs/{atc-slug-a-id}/usage returns 200 with used*in array containing only Tests where t.workspace*id = W1
- DB: no mutation; WHERE clause enforces workspace scoping

## Scenario 4.2: Should return 404 (not 403 or 200) when the ATC belongs to a different workspace — NEEDS PO/DEV CONFIRMATION

- ***NEEDS PO/DEV CONFIRMATION***: this scenario is in Architect Annotation but not in any AC. It formalizes the existence-leak prevention requirement.
- ***Given***: ATC atc-slug-x belongs to workspace W2; user is authenticated in workspace W1
- ***When***: GET /atcs/{atc-slug-x-id}/usage is called from W1 context
- ***Then***:

- API: HTTP 404 with body { "error": "atc*not*found" } (or equivalent error code)
- NOT: HTTP 403 (which would confirm the ATC exists in another workspace — information leak)
- NOT: HTTP 200 with empty used_in (ambiguous — indistinguishable from a valid ATC with zero usage)

---

## Scenario E1: Should return "Used in 1 test" in singular form for ATC referenced in exactly one Test (Type: Boundary, Priority: Medium) — NEEDS PO/DEV CONFIRMATION

- ***NEEDS PO/DEV CONFIRMATION***: singular vs plural label copy ("1 test" vs "1 tests") is not addressed in the Story. Inferred from standard UX grammar convention.
- ***Given***: ATC atc-slug-d is referenced by exactly 1 Test at position 1
- ***When***: the user opens the ATC detail page
- ***Then***: UI displays "Used in 1 test" (singular) — NOT "Used in 1 tests"

## Scenario E2: Should return 404 for a valid UUID that does not exist in the atcs table (Type: Negative, Priority: Medium) — NEEDS PO/DEV CONFIRMATION

- ***NEEDS PO/DEV CONFIRMATION***: behavior for a non-existent ATC UUID (not cross-workspace, but truly absent) is inferred from the 404-for-cross-workspace pattern.
- ***Given***: a UUID 00000000-0000-0000-0000-000000000000 that does not correspond to any row in atcs
- ***When***: GET /atcs/00000000-0000-0000-0000-000000000000/usage is called
- ***Then***: HTTP 404 with error code atc*not*found — same response as cross-workspace case (no existence leak)

## Scenario E3: Should return 401 for unauthenticated caller (Type: Negative, Priority: High) — NEEDS PO/DEV CONFIRMATION

- ***NEEDS PO/DEV CONFIRMATION***: no AC specifies auth behavior for this endpoint. Inferred from BK-13's global pattern that all ATC endpoints require active workspace membership.
- ***Given***: no session cookie and no Authorization header
- ***When***: GET /atcs/{id}/usage is called
- ***Then***: HTTP 401 — consistent with all other protected BK-13 endpoints

## Scenario (design fidelity): "Used by N tests" surface in the Projects screen

Given an ATC shown in the Tree-view detail pane or the Table view
When the tests domain exists
Then the ATC surfaces "Used by N tests" listing the tests that chain it
And this matches the Projects screen per master-design-plan §4.3 and mockup screens/project.jsx (Detail "Used by tests")

---
_Synced from Jira by sync-jira-issues_
