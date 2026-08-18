# BK-398 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

# Acceptance Test Plan — BK-398

***Story******:*** BK-398 — Command Palette | Search and jump across the workspace
***Epic******:*** BK-7 — Project & Module Hierarchy
***Modality******:*** Jira-native (ATP stored in Story custom field `customfield_10067`)
***Status******:*** Ready For QA
***Stage******:*** 1 — Planning (in-sprint)

---

## Scope

Verify the command palette search + navigation feature end to end against staging, per the 8 Final ACs (PO/Dev resolved 2026-08-14) and the risk-beyond-AC coverage derived from the test-design doctrine. User Stories and Milestones are explicitly out of scope (AC-03-3.4).

## Environment

- ***Environment******:*** staging (`https://staging-upexbunkai.vercel.app`). Production is never used for testing.
- ***Backend contract (BINDING)******:*** `public.bunkai*search*workspace(p*query text, p*workspace*id uuid, p*limit int default 5)` — `SECURITY INVOKER`, no actor param, RLS is the authorization boundary (six UNION branches: atcs, tests, projects, modules, bugs, runs). Exposed as `GET /api/v1/search`.
- ***Active workspace******:*** resolved from the `bk*active*ws` cookie; the RPC re-verifies active membership server-side.
- ***Query contract******:*** min 2 chars (inclusive). Case-insensitive; single token = prefix; multi-token = AND. Accent-sensitive (v1 parity). Debounce 250 ms. Timeout 8 s → recoverable error.
- ***Result contract******:*** canonical group order ATCs → Tests → Projects → Modules → Bugs → Runs; empty groups omitted; within group relevance desc → recency desc → name asc. Result context `{entity type} · {project} · {name}`.
- ***Destinations (six-row contract)******:*** ATC `/projects/{slug}/atcs/{atcId}`, Test `/projects/{slug}/tests/{testId}`, Project `/projects/{slug}`, Module `/projects/{slug}?modulePath={path}`, Bug `/projects/{slug}/bugs?bugId={bugId}`, Run `/projects/{slug}/runs/{runId}`. RPC returns a typed `route` per result; UI never infers routes.
- ***States******:*** guidance / skeleton (loading) / results / "No results for 'query'" / "Search failed. Try again." / latest-query-wins.

## Test Data Plan

Staging seed data (existing) covers the six entity types across the active workspace. No dedicated seed script exists for BK-398 (checked: no `scripts/seed-palette-demo.ts`, no `seed:palette` in `package.json`). Coverage relies on:

1. Existing staging workspace entities for ATCs, Tests, Projects, Modules, Bugs, Runs.
2. A second workspace the tester belongs to (for AC-08 isolation) — verify membership before execution; if absent, record as a blocker for AC-08 scenarios.
3. Deferred types (User Story, Milestone) present in staging for AC-03-3.4 negative coverage.
4. A slow/error trigger for AC-07-7.2 and 7.3 (dev route or network throttle / mock) — confirm availability during execution; if not available, mark those scenarios as blocked-not-executed.

## Outline Set

Naming: `should <expected outcome> [connector <condition>] [given <precondition>]` — no `{US_ID}: TC#:` prefix (added at Stage 4).

### AC-01 — Open via the keyboard shortcut

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 1 | should open one command palette overlay from Cmd+K on an app-shell screen | Positive | P1 |
| 2 | should open one command palette overlay from Ctrl+K on a non-macOS context | Positive | P1 |
| 3 | should not render duplicate overlays when both palette mounts receive the platform shortcut | Negative | P1 |

***1. Precondition******:**** authenticated member on an app-shell screen, palette closed. ****Expected******:*** exactly one overlay visible, input focused, current route and underlying state unchanged.
***2. Precondition******:**** authenticated member on an app-shell screen (non-macOS browser context), palette closed. ****Expected******:*** exactly one overlay visible, input focused, no navigation.
***3. Precondition******:**** sidebar palette trigger and project topbar trigger both present (single `CommandPaletteProvider` instance). ****Expected******:*** one shortcut press renders exactly one overlay and focuses one input; never duplicate overlays.

### AC-02 — Open via the sidebar search control

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 4 | should open the same command palette from the sidebar search control | Positive | P1 |
| 5 | should restore focus to the sidebar search control after dismissing the palette without selection | Edge | P2 |

***4. Precondition******:**** authenticated member on any app-shell screen, palette closed. ****Expected******:*** the same overlay opens, input focused, current route unchanged.
***5. Precondition******:**** palette opened from the sidebar search control. ****Expected******:*** Escape or outside click closes the palette and focus returns to the sidebar search control.

### AC-03 — Results grouped by entity type

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 6 | should group matching results under the six in-scope entity headings in canonical order and omit empty groups | Positive | P0 |
| 7 | should distinguish same-named results by entity and project context | Positive | P1 |
| 8 | should apply the confirmed matching semantics consistently at and above the 2-char threshold | Boundary | P1 |
| 9 | should not return User Story or Milestone results | Negative | P1 |

***6. Precondition******:**** active workspace contains permitted matches for more than one entity type; query ≥ 2 chars. ****Expected******:*** groups render in canonical order ATCs, Tests, Projects, Modules, Bugs, Runs; empty groups omitted; each result shows `{entity type} · {project} · {name}`; no User Story/Milestone group appears.
***7. Precondition******:**** two permitted results share a display name across entity types or projects. ****Expected******:*** each result shows enough context (`{entity type} · {project} · {name}`) to select the intended entity.
***8. Precondition******:**** workspace contains names exercising valid, partial, case-variant, and multi-token partitions. ****Expected (parametrized)******:***

| Partition | Query | Expected |
| --- | --- | --- |
| Single-token prefix | first 2 chars of a name | name matches by prefix |
| Single-token prefix | full name | name matches |
| Case variant | name in different case | matches (case-insensitive) |
| Multi-token | two tokens both present (AND) | matches only if all tokens present |
| Multi-token | two tokens, one absent (AND) | no match |
| Accent sensitivity | name with accented char vs unaccented query | accent-sensitive (no match on unaccented query) |

***9. Precondition******:**** active workspace contains User Stories and Milestones whose names match the query. ****Expected******:*** no User Story or Milestone group/result is returned.

### AC-04 — Selecting a result navigates

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 10 | should navigate to the selected ATC screen and close the palette | Positive | P0 |
| 11 | should navigate to each in-scope entity's exact destination | Integration | P0 |
| 12 | should not navigate or disclose when a selected result is inaccessible | Negative | P1 |

***10. Precondition******:**** permitted ATC result visible. ****Expected******:*** palette closes; browser navigates to `/projects/{slug}/atcs/{atcId}`.
***11. Precondition******:**** one permitted result per entity class. ****Expected (parametrized)******:*** each selection closes the palette and lands on the contract destination:

| Entity | Expected destination |
| --- | --- |
| ATC | `/projects/{slug}/atcs/{atcId}` |
| Test | `/projects/{slug}/tests/{testId}` |
| Project | `/projects/{slug}` |
| Module | `/projects/{slug}?modulePath={path}` |
| Bug | `/projects/{slug}/bugs?bugId={bugId}` |
| Run | `/projects/{slug}/runs/{runId}` |

***12. Precondition******:**** a result becomes inaccessible before activation, or the destination returns not-found/forbidden. ****Expected******:*** no entity disclosure; recoverable navigation/error state shown.

### AC-05 — Keyboard-only operation

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 13 | should move the active result with ArrowDown and select it with Enter | Positive | P1 |
| 14 | should traverse with ArrowUp/ArrowDown without focusing group headings and wrap at boundaries | Boundary | P2 |
| 15 | should close with Escape without navigating and restore opener focus | Negative | P1 |

***13. Precondition******:**** palette open with at least two selectable results. ****Expected******:*** ArrowDown moves the active item per traversal order; Enter selects it; palette closes; correct entity screen opens.
***14. Precondition******:**** palette open with multiple groups and results. ****Expected******:*** only selectable result items receive the active state; ArrowUp/Down wraps at boundaries; group headings never focused.
***15. Precondition******:**** palette open on a known route. ****Expected******:*** Escape closes the palette; route unchanged; underlying input/modal state preserved; focus returns to opener where applicable.

### AC-06 — Empty-query state

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 16 | should show search guidance when the input is empty and send no request | Positive | P2 |
| 17 | should suppress search below the 2-char minimum and stay in guidance | Boundary | P1 |
| 18 | should begin a debounced search at the 2-char boundary | Boundary | P1 |

***16. Precondition******:**** palette open, input empty. ****Expected******:*** guidance text "Search ATCs, tests, projects, modules, bugs, and runs in this workspace"; no entity-type result groups; no search request sent.
***17. Precondition******:**** minimum query length is 2 chars. ****Expected******:*** a 1-char query sends no request and stays in guidance.
***18. Precondition******:**** minimum query length is 2 chars. ****Expected******:*** a 2-char query triggers a 250ms-debounced search; UI transitions to loading/results/no-results per response.

### AC-07 — No-results state

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 19 | should show an explicit no-results state for an unmatched qualifying query | Negative | P1 |
| 20 | should show a distinct recoverable error state when search fails or times out after 8s | Negative | P1 |
| 21 | should render only the latest query response when requests resolve out of order | Integration | P0 |

***19. Precondition******:**** qualifying query (≥ 2 chars) with no permitted matches across all six types. ****Expected******:*** explicit "No results for 'query'" message; no group headings; not presented as an operational error.
***20. Precondition******:**** qualifying query; search source fails or exceeds 8 s. ****Expected******:*** recoverable error state "Search failed. Try again." distinct from no results; query retained for retry.
***21. Precondition******:**** member changes from query A to query B before A completes; A resolves after B. ****Expected******:*** A is aborted/discarded; never overwrites results/state for B.

### AC-08 — Workspace scoping

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 22 | should return only current-workspace results and never disclose other-workspace entities | Negative | P0 |
| 23 | should return no results and no disclosure when active membership is suspended or inactive | Negative | P0 |
| 24 | should clear to guidance and discard in-flight results when the active workspace changes | Integration | P0 |

***22. Precondition******:**** member belongs to Workspace A and B, matching entities in both, A active. ****Expected******:*** only Workspace A entities appear; Workspace B names, identifiers, and context not disclosed.
***23. Precondition******:**** membership in the active workspace is suspended/inactive while matching entities exist. ****Expected******:*** no results; existence of the workspace's entities not disclosed.
***24. Precondition******:**** palette open while a Workspace A search is in flight. ****Expected******:*** switch to Workspace B clears the palette to guidance; the in-flight A request is aborted/discarded; A results never render after the switch.

### Risk-beyond-AC (extended edge cases)

| # | Outline | Type | Priority |
| --- | --- | --- | --- |
| 25 | should show a loading skeleton for a slow qualifying query and never render stale results while loading | Boundary | P1 |
| 26 | should enforce the per-group and total result caps when matches overflow | Boundary | P1 |
| 27 | should preserve unsaved underlying modal or form state when the palette closes | Negative | P1 |
| 28 | should allow retrying a failed search from the recoverable error state | Positive | P1 |

***25. Precondition******:**** qualifying query with a slow backend response. ****Expected******:*** skeleton shown while loading; no stale results rendered as current.
***26. Precondition******:**** query matches more entities than the configured cap. ****Expected******:*** result count respects the documented cap (5 per group / 20 total) with stable ranking; no silent group starvation.
***27. Precondition******:**** unsaved modal or form state exists beneath the overlay. ****Expected******:*** closing the palette leaves underlying state unchanged; opener focus restored.
***28. Precondition******:**** search failed with the recoverable error state shown. ****Expected******:*** user can retry the same query; a successful retry renders results.

## Coverage Summary

| Type | Count |
| --- | --- |
| Positive | 9 |
| Negative | 9 |
| Boundary | 6 |
| Integration | 3 |
| Edge | 1 |
| ***Total**** | ****28*** |

| Priority | Count |
| --- | --- |
| P0 (Critical) | 7 |
| P1 (High) | 18 |
| P2 (Medium) | 3 |

## Conflicts and Open Questions

1. ***Result cap (total)******:*** refinement PO Decision #3 states 5 per group / 20 total; the BINDING implementation plan states "5 rows/group, no total cap (natural ceiling 30)" with the route `limit` default 20 / max 20 partially reconciling. The `bunkai*search*workspace` signature defaults `p_limit` to 5. Verify the governing total-cap value before Stage 2; outline 26 asserts per refinement.
2. ***Module destination******:*** AC-04 + refinement specify `/projects/{slug}?modulePath={path}`; the implementation plan notes `?module={moduleId}`. Confirm the exact query param before Stage 2 (outline 11 Module row).
3. ***Bug destination******:*** AC-04 specifies `/projects/{slug}/bugs?bugId={bugId}`; the implementation plan notes `bugs/{bugId}`. Confirm before Stage 2 (outline 11 Bug row).
4. ***Debounce observability******:*** 250 ms debounce is implementation-observable; outline 18 asserts a debounced request fires, not wall-clock timing.
5. ***Slow/error fixture******:*** no seed script or route stub for slow/error/timeout triggers is documented; outlines 20, 21, 25, 28 depend on a controllable backend. If unavailable at execution, mark blocked-not-executed.
6. ***Second workspace******:*** AC-08 isolation outlines 22–24 require tester membership in a second workspace; verify presence on staging before execution.

## Test-Design Checklist

- [x] Every Final AC has at least one outline (8/8 ACs covered)
- [x] Equivalence partitioning applied to query length and result partitions
- [x] BVA applied to 2-char threshold, 5/group cap, 20 total cap, 250 ms debounce, 8 s timeout
- [x] State-transition coverage for palette states (guidance → skeleton → results / no-results / error → closed)
- [x] Decision-table style coverage for workspace × membership interactions (AC-08)
- [x] Error-guessing: stale responses, timeout, double activation, overlay layering, suspended membership
- [x] Parametrization used for matching partitions and six destination rows
- [x] Naming convention respected (`should <outcome> ...`)
- [x] No duplicate outline names
- [x] Out-of-scope entities (User Story, Milestone) explicitly covered as negative
- [x] Test data plan defined and feasibility flags recorded
- [x] Conflicts surfaced as open questions (cap, Module/Bug destination)

## Out of Scope (this plan)

- Execution of tests (Stage 2), ATR creation (Stage 3), TMS Test entities (Stage 4), automation (Stage 5).
- Performance/latency acceptance beyond the 8 s timeout and debounce observability.

---
_Synced from Jira by sync-jira-issues_
