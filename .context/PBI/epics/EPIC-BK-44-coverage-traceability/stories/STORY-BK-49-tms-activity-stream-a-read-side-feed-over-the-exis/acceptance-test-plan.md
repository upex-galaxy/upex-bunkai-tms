# BK-49 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-49)

# Shift-Left Refinement: BK-49 - TMS Activity Stream

***Status***: Refined - Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint)
***Refined on***: 2026-06-29
***Refined by***: QA - Shift-Left batch session
***Modality***: Jira-native draft

---

## Phase 1 - Critical Analysis

### Business context

- ***Primary persona affected***: QA Lead.
- ***Secondary personas***: QA engineers, workspace members who need shared quality awareness.
- ***Business value proposition***: Workspace members can understand recent QA changes without relying on chat narration.
- ***KPI(s) influenced***: Traceability confidence, handoff clarity, time-to-awareness after test/design activity, reduced missed changes.
- ***User journey position***: Activity awareness layer after module, ATC, Test, tag, reorder, and Run actions have already written `activity_log` rows.

### Technical context

- ***Frontend***: No confirmed activity feed UI/page/component exists in the baseline.
- ***Backend***: Existing write model is `public.activity_log`; no confirmed feed read route/API/server action exists.
- ***Database***: `activity*log` stores `workspace*id`, `actor*user*id`, `entity*type`, `entity*id`, `action`, `payload`, and `created*at`; workspace-member RLS can read workspace rows; index exists on `(workspace*id, created_at desc)`.
- ***External services***: Supabase Auth/Postgres/RLS are relevant because feed visibility depends on workspace membership. Jira, realtime, email, push, comments, reactions, and mentions are out of BK-49 scope unless separately added.
- ***Integration points specific to this Story***: Existing event writers for module, ATC, Test, tag, reorder, and Run start flows; future feed read model/UI contract.

### Evidence-confirmed facts

- `activity_log` table/RLS/index exist and are workspace-scoped.
- Workspace members can read workspace activity rows through RLS.
- Confirmed MVP event writer set: `module.renamed`, `module.description*updated`, `module.moved`, `module.archived`, `atc.created`, `atc.updated`, `test.created`, `test.reordered`, `test.tags*changed`, `run.started`.
- Confirmed silent cases include module create, same-parent module move, already-archived module subtree retry, empty-body ATC PATCH, no-op Test reorder, no-op Test tags update, and idempotent Run start replay.
- No confirmed feed read endpoint, server action, route path, response shape, UI component, page size, cursor format, timestamp display, actor fallback, item fallback, empty/loading/error/page-end behavior, or realtime subscription exists in the baseline.

### Proposals / pending decisions

- ***Proposal***: MVP should remain read-side only, paginated, newest-first, and workspace-scoped over existing `activity_log` rows.
- ***Pending decision***: Stable tie-breaker for rows sharing the same `created_at`.
- ***Pending decision***: Feed access rule by workspace role, especially viewer visibility.
- ***Pending decision***: Canonical event taxonomy and user-facing labels.
- ***Pending decision***: Whether duplicated ATCs need a distinct display label even though the stored action is `atc.created`.
- ***Pending decision***: How actor/item references render when deleted, archived, hidden, or unavailable.

### Story complexity

| Axis | Rating | Why |
| --- | --- | --- |
| Business logic | Medium | Feed is read-side, but expected labels, actor/item fallbacks, and silent cases need clear business decisions. |
| Integration | High | Depends on existing event writers, workspace RLS, future read model/API/UI, and entity reference resolution. |
| Data validation | Medium | Pagination, ordering, workspace scoping, missing references, and empty states require deterministic behavior. |
| UI | Medium | List rendering seems simple, but loading, empty, error, page-end, timestamp, and long-label states are undefined. |

***Estimated test effort***: High for refinement because the acceptance criteria are short but hide feed contract, pagination, auth/RLS, taxonomy, and UI state decisions.

### Epic-level inheritance

- ***Risks restated at Story level***: Coverage and traceability value depends on trustworthy event visibility without cross-workspace leakage.
- ***Integration points inherited***: Workspace -> Project -> Module -> Story/AC -> ATC -> Test -> Run -> `activity_log` -> feed candidate.
- ***PO/Dev answers already given at epic level***: None confirmed in the allowed baseline.
- ***Test strategy inherited***: Treat `activity_log` writer behavior as upstream dependency; do not final-design feed assertions until route/UI contract and taxonomy are confirmed.

---

## Phase 2 - Story Quality Analysis

### Ambiguities

| # | Location in Story | Question for PO/Dev | Impact on testing | Suggested clarification |
| --- | --- | --- | --- | --- |
| 1 | User story says "live feed" | Does "live" mean paginated read on open/scroll, polling, or realtime updates? | QA cannot decide whether to test automatic updates. | Confirm BK-49 MVP is read-side paginated only, with no automatic realtime. |
| 2 | AC1 "opens the activity feed" | Where does the QA Lead open the feed: workspace page, project shell, global nav, dashboard, or another route? | UI entry-point tests cannot be scoped. | Specify target page/component and navigation entry. |
| 3 | AC1 "each event" | Which event types are in MVP? | Expected-results mapping cannot be completed. | Use confirmed MVP set or explicitly list a subset. |
| 4 | AC1 "who did it" | Should actor display use live profile, email, full name, fallback text, or stored snapshot? | Missing/deleted actor behavior is untestable. | Define actor label and fallback. |
| 5 | AC1 "what they did" | What exact user-facing labels map to each `action`? | Label assertions become subjective. | Add taxonomy-to-label mapping. |
| 6 | AC1 "the item" | Should item display title/name, entity type + id, link, breadcrumb, or fallback for deleted/archived items? | Cannot test item rendering or links safely. | Define item label, link target, and missing-item fallback. |
| 7 | AC1 "when" | What timestamp format/timezone/relative-vs-absolute behavior is required? | Time display assertions are unstable. | Define display format and timezone rule. |
| 8 | AC2 "fits on one page" | What is the page size and cursor shape? | Pagination boundary cannot be tested. | Define default page size and cursor contract. |
| 9 | AC2 "without losing position" | Does this mean scroll position remains stable, no duplicate rows, no skipped rows, or all three? | Scroll/pagination assertions are unclear. | Define position retention and ordering invariants. |

### Gaps (missing info)

| # | Type | Why critical | What to add | Risk if omitted |
| --- | --- | --- | --- | --- |
| 1 | API/read model contract | No confirmed read route/server action exists. | Route/server action path, auth, response shape, pagination fields, error shape. | Implementation and QA invent different contracts. |
| 2 | UI placement | No confirmed feed UI exists. | Page/component location and navigation affordance. | QA cannot verify AC1 entry point. |
| 3 | Event taxonomy | Event types are distributed across sources. | Canonical MVP event list and label mapping. | Feed includes/excludes events inconsistently. |
| 4 | Ordering tie-breaker | Index supports `created*at desc`, but same-timestamp behavior is not defined. | Stable order, e.g. `created*at desc, id desc` if Dev confirms. | Pagination can skip or duplicate rows. |
| 5 | Role/access rule | Story says QA Lead, but RLS allows workspace members. | Define roles allowed to view feed. | Viewer/member/admin/owner expectations diverge. |
| 6 | Error state | ACs mention empty state only. | Add error state for failed activity read. | User may see blank feed on failure. |
| 7 | Loading and page-end states | AC2 implies scroll loading but does not define UI state. | Loading indicator and no-more-results behavior. | Infinite scroll UX may feel broken. |
| 8 | Missing-reference fallbacks | Actor/item can be unavailable after deletes/archives or role boundaries. | Define fallback copy and link behavior. | UI may crash or leak raw IDs. |

### Edge cases not in Story

| # | Scenario | Expected behavior (best guess) | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Two or more events share the same timestamp | Feed remains stable using confirmed tie-breaker. NEEDS PO/DEV CONFIRMATION | High | Add to AC or technical contract. |
| 2 | Workspace has activity rows from silent cases expected by users, such as module create | Feed does not show non-persisted events. NEEDS PO/DEV CONFIRMATION | Medium | Explain in scope/taxonomy. |
| 3 | `module.description_updated` has empty payload | Feed shows safe generic label without description diff. NEEDS PO/DEV CONFIRMATION | Medium | Add label rule. |
| 4 | Duplicate ATC emits `atc.created` | Feed displays generic ATC created unless separate label is added elsewhere. NEEDS PO/DEV CONFIRMATION: current writer emits `atc.created`, not `atc.duplicated`; PO must confirm whether generic creation copy is acceptable or a distinct UX label is required. | Medium | Ask PO. |
| 5 | Actor reference cannot be resolved | Feed shows non-sensitive fallback. NEEDS PO/DEV CONFIRMATION | High | Add to AC. |
| 6 | Item reference cannot be resolved or is archived | Feed shows event with fallback item text and no broken link. NEEDS PO/DEV CONFIRMATION | High | Add to AC. |
| 7 | Viewer opens feed | Behavior follows explicit role policy. NEEDS PO/DEV CONFIRMATION | High | Ask PO/Dev. |
| 8 | Cross-workspace activity exists | Feed shows only active/selected workspace rows. NEEDS PO/DEV CONFIRMATION | Critical | Add security AC. |
| 9 | Feed read fails due to network/server error | UI shows clear recoverable error. NEEDS PO/DEV CONFIRMATION | High | Add negative AC. |
| 10 | User reaches final page | UI communicates no older activity remains. NEEDS PO/DEV CONFIRMATION | Medium | Add AC or UX note. |

### Contradictions

- Story text says "live feed", while baseline MVP direction says read-side, paginated, newest-first feed with no automatic realtime. Treat "live" as ambiguous until PO confirms wording.
- Story text mentions "who filed a defect", but native defect/bug event writers are not confirmed and defects are lower-confidence in the baseline. Treat defect activity as out of MVP unless Dev confirms implementation.

### Testability validation

***Verdict***: Partial

Issues blocking full testability:

- Feed read route/server action is missing from the confirmed contract.
- UI entry point is not defined.
- Page size, cursor, and stable tie-breaker are not defined.
- Event taxonomy and user-facing labels are not canonical.
- Actor/item fallback behavior is missing.
- Role policy is broader in DB/RLS evidence than persona wording in the Story.
- Error/loading/page-end states are not defined.

---

## Phase 3 - Refined Acceptance Criteria

### Original AC1 - View the workspace activity feed

#### Scenario 1.1: Should list existing workspace activity newest-first with required entry fields (Type: Positive, Priority: Critical)

- ***Given***: Activity has been recorded in the selected workspace using confirmed MVP event writers.
- ***When***: The QA Lead opens the activity feed from the defined UI entry point.
- ***Then***: The feed lists events newest-first and each visible entry shows actor, action label, item label, and timestamp.
- ***Evidence basis***: Existing `activity_log` rows and workspace-member RLS are confirmed; UI/read route is not confirmed.

#### Scenario 1.2: Should display only confirmed MVP event types unless PO expands the taxonomy (Type: Positive, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: Event inclusion set is inferred from baseline taxonomy.
- ***Given***: Activity rows exist for module, ATC, Test, tag, reorder, and Run start actions.
- ***When***: The feed loads.
- ***Then***: Feed contents match the confirmed MVP event set or a PO-approved subset.

#### Scenario 1.3: Should keep activity visibility scoped to the selected workspace (Type: Negative, Priority: Critical)

- ***NEEDS PO/DEV CONFIRMATION***: Security scenario is inferred from RLS/workspace isolation risk.
- ***Given***: The user belongs to one or more workspaces and activity exists in another workspace.
- ***When***: The user opens the feed for the selected workspace.
- ***Then***: Only rows for that workspace are visible; global or foreign workspace rows are not displayed.

#### Scenario 1.4: Should render safe fallbacks when actor or item cannot be resolved (Type: Edge, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: Fallback behavior is not in original ACs.
- ***Given***: An activity row references an actor or item that is deleted, archived, hidden, or unavailable.
- ***When***: The feed renders the entry.
- ***Then***: The entry remains visible with non-sensitive fallback text and no broken link/crash.

#### Scenario 1.5: Should not show activity for confirmed silent cases (Type: Negative, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: Silent-case expectations are inferred from current writers.
- ***Given***: A user performs a current silent case such as module create, no-op reorder, no-op tag change, or idempotent Run replay.
- ***When***: The feed refreshes or loads.
- ***Then***: No new feed entry appears for the silent case.

### Original AC2 - Page through older activity

#### Scenario 2.1: Should load older activity after the first page without losing position (Type: Positive, Priority: Critical)

- ***Given***: More workspace activity exists than fits on one page.
- ***When***: The QA Lead scrolls to the end of the feed or triggers the pagination control.
- ***Then***: Older events append/load in newest-to-oldest order without skipping visible rows or resetting the user's position.

#### Scenario 2.2: Should avoid duplicate or missing rows across page boundaries (Type: Boundary, Priority: Critical)

- ***NEEDS PO/DEV CONFIRMATION***: Cursor/tie-breaker behavior is not defined.
- ***Given***: Activity rows exist around the page boundary.
- ***When***: The next page loads.
- ***Then***: Rows already shown do not repeat and expected older rows are not skipped.

#### Scenario 2.3: Should keep order stable when multiple rows share `created_at` (Type: Boundary, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: Stable tie-breaker is not defined.
- ***Given***: Multiple activity rows share the same timestamp.
- ***When***: The feed loads and pages through older activity.
- ***Then***: Ordering remains deterministic across reloads and pagination.

#### Scenario 2.4: Should show clear loading and page-end states during pagination (Type: Edge, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: Loading/page-end states are not in original ACs.
- ***Given***: The user is paging through feed entries.
- ***When***: Older events are loading or no older events remain.
- ***Then***: The UI clearly communicates loading and final-page state.

### Original AC3 - Empty workspace

#### Scenario 3.1: Should show a clear empty state when no activity exists (Type: Positive, Priority: High)

- ***Given***: A workspace has no recorded activity rows visible to the user.
- ***When***: The QA Lead opens the activity feed.
- ***Then***: The feed shows a clear empty state and no misleading error.

#### Scenario 3.2: Should distinguish empty state from feed read failure (Type: Negative, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: Error state is not in original ACs.
- ***Given***: The feed read fails due to network/server/auth error.
- ***When***: The user opens or pages the feed.
- ***Then***: The UI shows a clear recoverable error state, not the empty workspace message.

### New scenarios surfaced from Phase 2 edge cases - NEEDS PO/DEV CONFIRMATION

#### Scenario E1: Should keep BK-49 read-side only with no automatic realtime behavior (Type: Edge, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: Story says "live feed" but MVP baseline says no automatic realtime.
- ***Given***: New activity is recorded after the user has opened the feed.
- ***When***: The user does not refresh, page, or manually trigger a reload.
- ***Then***: The feed is not required to auto-update unless PO adds polling/realtime to scope.

#### Scenario E2: Should use non-sensitive labels for payload-limited events (Type: Edge, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: Label copy is not defined.
- ***Given***: A `module.description_updated` row has an intentionally empty payload.
- ***When***: The entry renders.
- ***Then***: The label communicates that a module description changed without exposing old/new description content.

#### Scenario E3: Should treat defect activity as out of MVP unless an event writer exists (Type: Edge, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: Story mentions defect filing, but baseline has no confirmed defect writer.
- ***Given****: No confirmed `bug.**` or `defect.*` activity writer exists.
- ***When***: QA defines expected feed contents.
- ***Then***: Defect entries are not expected unless Dev adds and documents the writer.

---

## Phase 4 - Test Outlines (DRAFT - outline names only)

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 5 | Core feed load, event fields, MVP taxonomy, pagination, empty state. |
| Negative | 5 | Cross-workspace isolation, silent cases, unsupported defect events, read failure, forbidden/unauthenticated access. |
| Boundary | 5 | Page boundary, same timestamp, exact page size, final page, long/limited labels. |
| Integration | 5 | Event producers, RLS, actor/item resolution, UI entry point, Supabase read path. |
| API | 4 | Future read route/server action contract, cursor, auth errors, response shape. |
| ***Total**** | ****24*** | High count is driven by missing feed contract plus pagination and workspace isolation risk. |

***Rationale***: BK-49 appears UI-simple, but the ACs depend on a missing read model, event taxonomy, stable pagination, and workspace visibility rules. Shift-left should keep outlines broad and named only until PO/Dev confirm the contract.

### Outline list (NAMES ONLY - preconditions in 1 line, expected in 1 line)

#### Positive

- ***Should show newest-first activity entries with actor action item and timestamp*** - Pre: workspace has confirmed MVP activity rows. Expected: entries render required fields in newest-first order.
- ***Should show the confirmed MVP event set in the activity feed*** - Pre: module, ATC, Test, tag, reorder, and Run start rows exist. Expected: feed includes approved event types only.
- ***Should load older activity when user reaches the end of the first page*** - Pre: activity count exceeds page size. Expected: older events load in order without resetting position.
- ***Should show clear empty state when workspace has no visible activity*** - Pre: workspace has zero visible `activity_log` rows. Expected: empty state appears without error copy.
- ***Should preserve readable labels for payload-limited events*** - Pre: `module.description_updated` row exists. Expected: generic safe label renders without content diff.

#### Negative

- ***Should not show activity from another workspace*** - Pre: user can access one workspace and foreign activity exists. Expected: foreign rows do not render.
- ***Should not show feed entries for confirmed silent cases*** - Pre: silent case action performed. Expected: no new activity entry appears.
- ***Should not require realtime updates in MVP feed*** - Pre: feed is already open and new activity is recorded. Expected: no automatic update required unless scope changes.
- ***Should show error state when activity read fails*** - Pre: feed read fails. Expected: recoverable error appears, not empty state.
- ***Should not show defect activity unless a defect event writer exists**** - Pre: no confirmed `bug.**` or `defect.*` writer. Expected: defect entries are not part of expected MVP feed.

#### Boundary

- ***Should page without duplicate rows at exact page-size boundary*** - Pre: activity count equals page size plus one. Expected: second page contains only older row(s), no duplicates.
- ***Should keep stable order when events share the same timestamp*** - Pre: multiple rows share `created_at`. Expected: deterministic order across reload and pagination.
- ***Should show page-end state after final activity page*** - Pre: user has loaded last page. Expected: UI communicates no older activity remains.
- ***Should handle long actor action or item labels without breaking layout*** - Pre: activity row has long display text. Expected: entry remains readable and accessible.
- ***Should render timestamp consistently around timezone boundaries*** - Pre: rows exist near day/timezone boundary. Expected: timestamp follows confirmed display rule.

#### Integration

- ***Should read feed rows through workspace-member RLS*** - Pre: authenticated workspace member opens feed. Expected: rows are constrained to membership.
- ***Should render entries from module activity writers*** - Pre: module rename/move/archive/description rows exist. Expected: approved module labels render.
- ***Should render entries from ATC and Test activity writers*** - Pre: ATC/Test activity rows exist. Expected: approved ATC/Test labels render.
- ***Should render run started activity from Run start writer*** - Pre: `run.started` row exists. Expected: approved Run label renders with allowed payload details.
- ***Should handle missing actor or item references safely*** - Pre: row references unavailable actor/item. Expected: fallback text renders without crash or sensitive leakage.

#### API

- ***Should expose or call a confirmed activity feed read contract*** - Pre: feed UI is implemented. Expected: route/server action returns paginated activity data in agreed shape.
- ***Should enforce feed auth and role policy on the read contract*** - Pre: user lacks session/membership or required role. Expected: safe auth/permission failure.
- ***Should return stable cursor data for newest-first pagination*** - Pre: more rows exist than first page. Expected: response includes next cursor matching agreed tie-breaker.
- ***Should distinguish empty result from read error in the response/UI mapping*** - Pre: zero rows or failed read. Expected: empty and error states map to different UI outcomes.

---

## Phase 5 - Edge Cases (DRAFT)

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Same `created_at` for multiple rows causes unstable ordering | No | High | NEEDS PO/DEV CONFIRMATION - define tie-breaker. |
| 2 | Cross-workspace rows accidentally appear | No | Critical | NEEDS PO/DEV CONFIRMATION - add security AC. |
| 3 | Actor cannot be resolved | No | High | NEEDS PO/DEV CONFIRMATION - define fallback. |
| 4 | Item cannot be resolved, is archived, or is hidden | No | High | NEEDS PO/DEV CONFIRMATION - define fallback/link behavior. |
| 5 | `module.description_updated` payload has no content diff | No | Medium | NEEDS PO/DEV CONFIRMATION - define generic label. |
| 6 | Duplicate ATC appears as `atc.created` | No | Medium | NEEDS PO/DEV CONFIRMATION - decide display label. |
| 7 | Module create does not emit activity | No | Medium | NEEDS PO/DEV CONFIRMATION - keep silent or add writer. |
| 8 | No-op update/reorder/tag/replay has no event | No | Medium | NEEDS PO/DEV CONFIRMATION - persisted-change-only feed. |
| 9 | Feed read fails | No | High | NEEDS PO/DEV CONFIRMATION - add error state. |
| 10 | User reaches final page | Partially | Medium | NEEDS PO/DEV CONFIRMATION - define page-end copy/state. |
| 11 | Story mentions defects but no defect writer exists | Partially | Medium | NEEDS PO/DEV CONFIRMATION - out of MVP unless writer added. |
| 12 | Story says live but MVP says no realtime | Yes | High | NEEDS PO/DEV CONFIRMATION - adjust wording/scope. |

---

## Story Quality Assessment

***Verdict***: Significant Issues

***Key findings***:

- The story has clear user value, but ACs are not testable enough until feed read contract, UI placement, taxonomy, ordering, and role policy are defined.
- Baseline evidence supports `activity_log` as a workspace-scoped event sink with known writers, but not a user-facing feed implementation.
- The word "live" conflicts with the current MVP direction unless PO confirms it means read-side paginated visibility rather than realtime.

---

## Critical Questions for PO

1. ***Should "live feed" be reworded to "activity feed" for BK-49 MVP?***

1. ***Where should the user open the activity feed?***

1. ***Which event types are included in MVP?***

1. ***Should defect activity remain out of scope for BK-49?***

1. ***What exact actor, action, item, and timestamp labels should users see?***

1. ***Can all workspace members view the feed, or only QA Leads/admin roles?***

1. ***What should users see when actor/item references are unavailable?***

1. ***What empty, loading, error, and page-end states are expected?***

1. ***Should duplicated ATCs appear as generic ATC creation or as a distinct duplicate label?***

---

## Technical Questions for Dev

1. ***What read contract will power the feed******:****** API route, server action, or direct server component query?*** - Blocks API/UI test planning.
2. ***What path/name will the read contract use if it is an API route?**** - Baseline found no `GET /api/v1/activity**` or workspace activity endpoint.
3. ***What response shape will include actor, action, item, timestamp, cursor, and any links?*** - Blocks expected-results mapping.
4. ***What page size and cursor format will be used, and will the response expose an explicit next cursor plus ****`has*next*page`****/****`has_more`****?*** - Blocks pagination boundary tests and final-page automation.
5. ***What stable tie-breaker should be used with ****`created_at desc`****?*** - Blocks duplicate/skip prevention tests.
6. ***Will the feed resolve actor/item references live, join them server-side, or derive labels from payload only?*** - Blocks fallback and performance-risk testing.
7. ***How should RLS/role failures map to UI errors?*** - Blocks auth/permission negative tests.
8. ***Will a single maintainable event taxonomy contract be added for labels and payload expectations, ideally as a TypeScript type/constant or equivalent source of truth?*** - Blocks objective label assertions and final QA Expected Results until centralized.
9. ***Confirm that implementation will rely on page/component reloads rather than realtime/polling for this MVP.*** - Blocks scope control around automatic updates.

---

## Suggested Story Improvements

| # | Current state | Suggested change | Benefit |
| --- | --- | --- | --- |
| 1 | "live feed" | "paginated workspace activity feed" for MVP | Removes realtime ambiguity. |
| 2 | "opens the activity feed" | Name exact UI location/navigation entry | Makes AC1 executable. |
| 3 | "each event" | List MVP event types or link canonical taxonomy | Makes expected feed contents measurable. |
| 4 | "who did it, what they did, the item, and when" | Define label rules, timestamp format, and missing-reference fallbacks | Makes assertions objective and safe. |
| 5 | "more activity than fits on one page" | Define page size, cursor, and stable ordering tie-breaker | Makes AC2 testable. |
| 6 | Empty state only | Add loading, error, and page-end states | Prevents blank/error confusion. |
| 7 | Story mentions defects | Mark defects out of MVP unless Dev adds writer | Aligns ACs with confirmed implementation baseline. |
| 8 | Persona is QA Lead only | Define role visibility policy | Aligns UI expectations with workspace-member RLS. |

---

## Data feasibility flags

- ***Entity / fixture missing***: No confirmed feed UI/read model entity beyond raw `activity_log` rows.
- ***API contract gap****: No confirmed `GET /api/v1/activity**`, `GET /api/v1/workspaces/{id}/activity*`, server action, response shape, page size, cursor, or error shape.
- ***Required pre-work***: Define feed contract, UI placement, event taxonomy/labels, role policy, stable ordering, and fallback rules before sprint implementation is estimated as ready.
- ***Data risk***: Existing `activity_log` can support the MVP, but expected test data must come from confirmed event writers; story/AC/import/defect/run-completion activity is not confirmed.

---

## Recommended testing strategy

### Pre-implementation

- Confirm BK-49 scope as read-side, paginated, newest-first over existing `activity_log`, no automatic realtime.
- Finalize route/server action/UI placement, page size, cursor, tie-breaker, role policy, and taxonomy-to-label mapping.
- Mark defect, Story/AC, import, run-completion, comments, reactions, mentions, email, push, and new event generation out of MVP unless explicitly added.

### During implementation

- Pair feed UI work with read contract tests for workspace scoping, pagination, empty/error/page-end states, and missing-reference fallbacks.
- Validate feed rows with existing event writers only; do not create new writer expectations silently.
- Keep no-op/silent cases explicit so QA does not file false feed-missing defects.

### Post-implementation (in-sprint by /sprint-testing)

- Run UI checks for opening the feed, reading entries, paging older rows, and empty/error/page-end states.
- Run API/read-contract checks if a route exists, including auth/RLS negative tests and cursor boundaries.
- Verify upstream writer coverage with selected module, ATC, Test, tag, reorder, and Run start events.

---

## Risks & mitigation

| # | Risk | Likelihood | Impact | Mitigated by which outlines |
| --- | --- | --- | --- | --- |
| 1 | Realtime is accidentally expected or implemented | Medium | High | Negative #3, Critical PO #1 |
| 2 | Cross-workspace activity leaks | Medium | Critical | Negative #1, Integration #1, API #2 |
| 3 | Pagination skips or duplicates rows | High | High | Positive #3, Boundary #1, Boundary #2, API #3 |
| 4 | Feed includes events without confirmed writers | High | Medium | Positive #2, Negative #2, Negative #5 |
| 5 | UI labels are inconsistent or subjective | High | Medium | Positive #2, Positive #5, Integration #2-4 |
| 6 | Missing actor/item breaks feed rendering | Medium | High | Integration #5, Edge #3-4 |
| 7 | Error state is confused with empty state | Medium | High | Negative #4, API #4 |
| 8 | Page-end/loading UX remains undefined | Medium | Medium | Boundary #3, Critical PO #8 |

---

## Next steps

- [ ] PO answers Critical Questions before sprint planning.
- [ ] Dev answers Technical Questions before estimation.
- [ ] Story ACs are updated to remove realtime ambiguity and define feed contract basics.
- [ ] Event taxonomy/labels are centralized before expected-results mapping.
- [ ] When Story reaches Ready For QA, `/sprint-testing` expands this DRAFT into a full ATP with parametrization, test data, and executable steps.

---
_Synced from Jira by sync-jira-issues_
