# BK-89 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-89)

# Shift-Left Refinement — BK-89: TMS-Workspace | View the workspaces I belong to

***Date******:*** 2026-06-10
***Session******:*** shift-left-testing/2026-06-10-bk89-workspace-view
***Modality******:*** jira-native
***Risk Level******:*** HIGH (forced — auth/RLS/multi-tenancy)

---

## Phase 1 — Critical Analysis

Code read of `app/api/v1/workspaces/route.ts` in `upex-bunkai-tms` surfaced three feasibility findings.

### FINDING 1 — CRITICAL: Role field missing from API response

`GET /api/v1/workspaces` (FR-010) returns only: `id`, `slug`, `name`, `owner*user*id`, `plan`, `created_at`.

The `role` field is ***not returned*** in either auth path (cookie-session or Bearer token). AC 1 requires "each labelled with his role" but the backend does not join `workspace_members` to expose the `MemberRole` value. The `MemberRole` enum has four values: `viewer`, `member`, `admin`, `owner`.

Partial workaround exists: `owner*user*id` is in the response, so the `owner` role can be inferred client-side by comparing `owner*user*id === current*user.id`. However, `viewer`, `member`, and `admin` are indistinguishable without a DB join with the `workspace*members` table.

***Impact on testability******:**** AC 1 cannot be verified end-to-end until the endpoint is fixed. Any test asserting a non-owner role label will fail by design. This is a ****story blocker***.

### FINDING 2 — MEDIUM: "Active workspace" concept undefined at data layer

"The currently active workspace is visibly marked" appears in both ACs, but there is no `active*workspace*id` field in the DB schema and no such field in the API response. No session storage, localStorage, or cookie pattern documenting which workspace is "active" was found in the codebase.

***Impact on testability******:*** The active-workspace indicator is completely undefined at the backend. Without a spec for how activeness is stored or communicated to the client, the AC cannot be precisely tested — the test would be testing an assumption, not a contract.

### FINDING 3 — LOW: Navigation path depends on unshipped BK-87

BK-87 (Settings Hub) is in "Ready For Dev" — the Settings section UI does not exist yet. BK-89 lives inside the Settings hub by naming convention. The page container, route, and navigation path are unknown until BK-87 ships.

***Impact on testability******:*** Smoke and UI exploration tests cannot be written with a confirmed selector path. Functional logic tests (API-level) are unblocked, but UI integration tests carry a navigation-path risk that will require rework after BK-87 ships.

---

## Phase 2 — Story Quality Analysis

### Gap 1 — Role label source is undefined (CRITICAL BLOCKER)

***Problem******:*** The AC says "each labelled with his role" but the API does not return role. The story does not specify whether role resolution is a frontend concern (infer from `owner*user*id`), a backend concern (extend the endpoint), or a new dedicated endpoint. There are four distinct role values the label must cover.

***Why it matters for testability******:*** Without knowing where role comes from, there is no contract to test. A test validating the label text could pass with a hardcoded string and still be wrong. Worse, the partial `owner` workaround hides the gap for the workspace creator but breaks for all other roles.

### Gap 2 — "Active workspace" has no data contract (MEDIUM BLOCKER)

***Problem******:*** Neither AC defines what makes a workspace "active". No DB column, no API field, no session/cookie/localStorage spec. The visual marking requirement is concrete ("visibly marked") but the data driving it is phantom.

***Why it matters for testability******:*** A tester cannot write a precondition ("given workspace X is active") without knowing what sets it. A dev implementing this will make an arbitrary decision unless the PO specifies the contract. If each dev on the team independently interprets "active", the feature becomes non-deterministic to test.

### Gap 3 — MemberStatus filter not reflected in ACs

***Problem******:*** The `workspace_members` table has a `status` column with values `active | invited | suspended`. FR-010 explicitly filters `status = 'active'` on the Bearer path. The ACs only test multi-workspace and single-workspace happy paths with no mention of suspended or invited memberships.

***Why it matters for testability******:*** If a user has an `invited` (not yet accepted) or `suspended` membership in a workspace, the ACs are silent on whether that workspace should appear. This creates an untested edge condition that could leak data or create a confusing UI state.

### Gap 4 — Single-workspace scenario lacks role assertion

***Problem******:*** AC 2 (single-workspace user) says "he sees that single workspace marked active" but does not assert the role label. If role labeling is a requirement (from AC 1), it should apply to single-workspace users too. The omission is ambiguous — either the role label is intentionally omitted for the single-workspace view, or it was forgotten.

***Why it matters for testability******:*** Tests for AC 2 cannot determine whether to assert a role label or not. A test that skips the role assertion may miss a regression; a test that adds it may fail on an intentional design decision.

### Gap 5 — "Workspaces section" location not specified

***Problem******:*** The story says "When he opens the Workspaces section" but does not specify the route, tab, or navigation path. Given BK-87 (Settings Hub) is the expected container and it is not yet implemented, the entry point is undefined.

***Why it matters for testability******:*** Without a confirmed route or navigation trigger, UI tests cannot navigate to the feature. This is a documentation gap rather than a design gap — it should be resolvable by linking BK-87 once its route is decided.

### Gap 6 — Empty state for zero workspaces not in scope

***Problem******:*** The scope says "Loading + empty/edge state (e.g. belongs to only one workspace)" — but it parenthetically conflates "empty state" with "single workspace". A user with zero workspaces is a technically valid state (e.g., invited user who never accepted, or a user whose only workspace was deleted). The ACs do not cover this.

***Why it matters for testability******:*** An empty state is a distinct UI state from a single-workspace state. Without a spec, the test would need to assume expected behavior (render nothing? show a CTA? show an error?).

---

## Phase 3 — Refined Acceptance Criteria

### AC 1 (Refined) — Multi-workspace user sees list with roles

```gherkin
Scenario: Workspaces section lists all active memberships with roles
  Given Mateo is authenticated
    And he holds an active membership in "Acme QA" with role "admin"
    And he holds an active membership in "Fintech Audit" with role "member"
    And "Fintech Audit" is his currently active workspace
  When he opens the Workspaces section
  Then he sees exactly two workspace entries
    And "Acme QA" displays the label "Admin"
    And "Fintech Audit" displays the label "Member"
    And "Fintech Audit" is visually distinguished as the active workspace
    And "Acme QA" does not carry the active workspace indicator
```

> ***NEEDS PO/DEV CONFIRMATION******:*** What API field or client-side mechanism identifies the active workspace? Is it a field in the `GET /api/v1/workspaces` response, a separate endpoint, localStorage, or session cookie?

> ***NEEDS PO/DEV CONFIRMATION******:*** Will `GET /api/v1/workspaces` be extended to return the `role` field per workspace, or will a separate endpoint/join be introduced? The current response does not include `role`.

---

### AC 2 (Refined) — Single-workspace user sees their workspace as active

```gherkin
Scenario: Single-workspace user sees a clean, unambiguous state
  Given Mateo is authenticated
    And he holds exactly one active membership, in "Acme QA" with role "admin"
    And "Acme QA" is his currently active workspace
  When he opens the Workspaces section
  Then he sees exactly one workspace entry for "Acme QA"
    And "Acme QA" is visually marked as the active workspace
    And the layout renders without broken or empty-looking space
    And no "leave workspace" or "add workspace" controls are visible
```

> ***NEEDS PO/DEV CONFIRMATION******:*** Should the role label ("Admin") also be displayed for the single-workspace view, consistent with AC 1? The original AC 2 omits it.

---

### AC 3 (Inferred) — Suspended or invited memberships are excluded

```gherkin
Scenario: Workspaces with non-active membership status are not shown
  Given Mateo has an active membership in "Acme QA"
    And he has a suspended membership in "Old Corp"
    And he has an invited (not yet accepted) membership in "Startup Inc"
  When he opens the Workspaces section
  Then he sees only "Acme QA"
    And "Old Corp" does not appear in the list
    And "Startup Inc" does not appear in the list
```

> ***NEEDS PO/DEV CONFIRMATION******:*** Should invited memberships be shown with a distinct "Pending" state, or excluded entirely? FR-010 excludes them at the API level, but the UX decision is not documented.

---

### AC 4 (Inferred) — Owner role resolves correctly from owner*user*id

```gherkin
Scenario: Workspace owner sees "Owner" role label
  Given Mateo is authenticated
    And he is the owner (owner*user*id == Mateo's user ID) of "Acme QA"
  When he opens the Workspaces section
  Then "Acme QA" displays the role label "Owner"
```

> ***NEEDS PO/DEV CONFIRMATION******:*** Confirm that "Owner" is the displayed label for the owner role. Also confirm whether owner status is derived client-side from `owner*user*id` comparison or returned from the API as a role field.

---

## Phase 4 — ATP DRAFT Outlines (Shift-Left mode — names + preconditions only)

***Coverage estimate******:****** 5 Positive | 4 Negative | 3 Boundary | 3 Integration = 15 outlines***

### Positive

| # | Outline Name | Precondition |
| --- | --- | --- |
| P-01 | Workspace list shows both workspaces with correct names — 2-workspace user | User has 2 active memberships; API returns role field |
| P-02 | Role label renders correctly for each role value — admin and member in same list | User holds admin in WS-A and member in WS-B |
| P-03 | Active workspace is visually marked — 2-workspace user | Active workspace mechanism is defined and implemented |
| P-04 | Single workspace renders cleanly with active indicator | User has exactly 1 active membership |
| P-05 | Owner role label displays correctly — owner*user*id matches authenticated user | User is workspace owner; role resolution mechanism confirmed |

### Negative

| # | Outline Name | Precondition |
| --- | --- | --- |
| N-01 | Suspended membership workspace does not appear in the list | User has 1 active + 1 suspended membership |
| N-02 | Invited (pending) membership workspace does not appear in the list | User has 1 active + 1 invited membership |
| N-03 | Unauthenticated request to workspace list endpoint returns 401 | No auth cookie or Bearer token |
| N-04 | Cross-tenant isolation — user cannot see workspaces they have no membership in | Two users in different workspaces; RLS active |

### Boundary

| # | Outline Name | Precondition |
| --- | --- | --- |
| B-01 | User with zero active workspaces sees a defined empty state | User has no active memberships (all suspended or invited) |
| B-02 | User belonging to the maximum supported number of workspaces renders without truncation | Maximum workspace membership count defined by PO |
| B-03 | Loading state renders while API request is in flight | Network latency simulated; skeleton/spinner required |

### Integration

| # | Outline Name | Precondition |
| --- | --- | --- |
| I-01 | Cookie-session auth path returns correct workspace list matching DB state | User authenticated via cookie; RLS active |
| I-02 | Bearer token auth path returns correct workspace list with status=active filter | User authenticated via PAT; `workspace_members.status = 'active'` enforced |
| I-03 | Navigation from Settings Hub (BK-87) to Workspaces section lands on correct view | BK-87 Settings Hub must be shipped; route confirmed |

---

## Phase 5 — Edge Cases

| Edge Case | Criticality |
| --- | --- |
| Workspace name is very long (100+ chars) — label overflow / truncation behavior | MEDIUM |
| Role field missing from API response (current state) — UI fallback renders without crashing | CRITICAL |
| Active workspace indicator missing from API response — UI fallback renders without crashing | HIGH |
| Two workspaces with identical names but different IDs — list renders without collision | MEDIUM |
| User's session expires mid-render while workspace list loads — graceful auth redirect | HIGH |
| workspace_members RLS policy blocks query — API returns empty list vs. 403 | HIGH |
| Workspace is deleted after list is fetched — stale entry displayed before next refresh | LOW |
| User is both owner of WS-A and member of WS-B — two different role labels in same list | MEDIUM |
| API responds slowly (>3s) — loading state holds and does not flash broken layout | MEDIUM |

---

## PO/Dev Open Questions

1. ***[******BLOCKER — AC 1]*** Will `GET /api/v1/workspaces` be extended to return a `role` field per workspace entry? Or will a separate endpoint (e.g. `GET /api/v1/workspaces/memberships`) be introduced? The current response does not include `role`, making AC 1 untestable end-to-end.

1. ***[******BLOCKER — AC 1 + AC 2]*** What is the data contract for "active workspace"? Is it stored in the DB (a new column), in a session cookie, in localStorage, or returned as part of the workspace list response? This must be defined before any test for the active-workspace indicator can be written.

1. ***[******DECISION — AC 2]*** Should the role label be displayed for the single-workspace view as well? AC 2 does not mention it, but AC 1 establishes it as a general requirement. Omission or intentional design difference?

1. ***[******DECISION — AC 3 / Invited memberships]*** Should workspaces where Mateo has an `invited` (not yet accepted) membership be excluded from the list entirely, or shown with a distinct "Pending" visual state? FR-010 excludes them at the API level (`status = 'active'` filter), but this UX decision is not documented.

1. ***[******DECISION — Empty state]*** What should render when the authenticated user has no active workspace memberships at all (e.g., all memberships are suspended)? The scope mentions "empty/edge state" but only illustrates it with a single-workspace example, not a zero-workspace case.

1. ***[******DEPENDENCY — UI path]*** What is the confirmed route and navigation path to the Workspaces section? This is blocked on BK-87 (Settings Hub). Please confirm the route (e.g., `/settings/workspaces`) and the parent nav element once BK-87 design is finalized, so UI outlines can be completed without rework.

---
_Synced from Jira by sync-jira-issues_
