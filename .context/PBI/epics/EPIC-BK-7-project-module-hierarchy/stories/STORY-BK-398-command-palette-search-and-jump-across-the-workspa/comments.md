# Comments for BK-398

[View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

---

### Ely - 8/12/2026, 4:47:14 AM

## AI Product Owner / Business Analyst — Decision: which entity types the first cut of the command palette spans

### Question

`components/layout/CommandPalette.tsx` ships the overlay shell (⌘K/Esc handler, both mount points) but the results area is a stub. FR-031 (Command palette search) describes a union search across Modules, US, AC, ATCs, Tests, Runs, Bugs. The palette's own placeholder copy says "Search ATCs, modules, user stories…". Before authoring this story's scope, a decision was needed: which entity types does the first shipped cut actually span?

### Candidates considered

1. ***ATCs only.*** Smallest slice; matches the current placeholder copy literally.

1. ***The six entities with shipped routes today******:****** ATCs, Tests, Projects, Modules, Bugs, Runs.**** Every one of these already has a live, addressable screen in the app (verified: `/projects/{slug}`, `/projects/{slug}/atcs/**`, `/projects/{slug}/tests/*`, `/projects/{slug}/runs`, `/projects/{slug}/bugs`, plus the Module tree inside a Project). Jumping to any of them is a real, testable navigation today.

1. ***All entities including User Stories and Milestones.*** Matches FR-031's full list plus the post-MVP Milestone entity.

1. ***Defer the whole story until BK-267 (ATC Library) ships.*** Wait for the cross-project ATC index before building the palette, on the theory the palette could reuse its search backend.

### Decision

***Option 2 — the six entity types with shipped routes today (ATCs, Tests, Projects, Modules, Bugs, Runs).*** It is the only candidate that delivers the palette's actual value (fast cross-entity, cross-project navigation) without inventing landing behavior for entities that have no screen to land on yet. User Stories and Milestones are explicitly deferred to a follow-up story once they have their own destinations — this keeps the scope honest about what "search and jump" can mean today instead of quietly building a broken or half-working entry for an entity type this story cannot finish correctly.

---

### Facu Barea - 8/14/2026, 5:40:13 PM

## Acceptance Test Plan (ATP)

# Shift-Left Refinement: BK-398 - Command Palette | Search and jump across the workspace

***Status***: Refined - Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint, batch grooming)
***Refined on***: 2026-08-14
***Refined by***: QA - Shift-Left batch session
***Modality***: Xray on Jira (no Test Plan created in this phase)

---

## Phase 1 - Critical Analysis

### Business context

- ***Primary persona affected***: Senior QA Engineer navigating a multi-tenant test-management workspace.
- ***Secondary personas***: Workspace members who need permitted access to projects and test entities.
- ***Business value proposition***: Reduce navigation time by providing one keyboard-driven entry point to addressable workspace entities.
- ***KPI(s) influenced***: Navigation efficiency and successful entity discovery; no numeric target is defined in the Story.
- ***User journey position***: Cross-cutting app-shell navigation, before or between project, ATC, Test, Bug, and Run work.

### Technical context

- ***Frontend***: `components/layout/CommandPalette.tsx` currently provides the overlay shell, input, open/close state, Cmd/Ctrl+K handler, Escape handler, and focus-on-open markup. `AppSidebar.tsx` owns the global hotkey and opens the controlled instance; `project-shell.tsx` mounts a second instance with `ownsHotkey={false}` for the topbar trigger. `app/(app)/layout.tsx` keeps the sidebar mounted across app-shell routes.
- ***Backend***: No dedicated union-search endpoint or response contract is documented in `business-api-map.md`. Existing search/read surfaces are entity-specific, including `GET /api/v1/atcs/search`, `GET /api/v1/tests`, `GET /api/v1/projects/{id}/bugs`, `GET /api/v1/bugs`, and run read/list routes. Their filters, scopes, and response shapes differ.
- ***Data entities***: Workspace-scoped `projects`, `modules`, `atcs`, `tests`, `bugs`, and `runs`; workspace and project membership/RLS are the relevant visibility boundaries.
- ***External services***: Supabase PostgreSQL and RLS; no third-party integration is required by the Story.
- ***Integration points specific to this Story***: App shell to palette state; palette query to the chosen search source; result selection to entity-specific routes; active-workspace resolution to every search result; permission filtering to result visibility.

### Story complexity

| Axis | Rating | Why |
| --- | --- | --- |
| Business logic | High | Six entity classes, grouped results, visibility rules, empty/no-results states, and navigation behavior. |
| Integration | High | A new cross-entity search contract must reconcile multiple existing entity APIs/direct queries and route shapes. |
| Data validation | High | Workspace scoping and project/entity permission visibility must be enforced server-side, not only hidden in the UI. |
| UI | Medium | Existing shell exists, but focus, keyboard behavior, async loading, grouping, and overlay layering are new behavior. |

***Estimated test effort***: High for a 1-point Story as currently sized; a meaningful minimum includes six entity classes, keyboard and mouse entry paths, route destinations, async states, permission isolation, and stale-request behavior.

### Epic-level inheritance (if applicable)

- ***Risks restated at Story level***: Workspace/RLS isolation is load-bearing; search must not disclose entities outside the active workspace or viewer permissions.
- ***Integration points inherited***: None available from a synced BK-7 epic artifact.
- ***PO/Dev answers already given at epic level***: None available; the six-entity scope and User Story/Milestone deferral are answered in the BK-398 team discussion and are not re-asked.
- ***Test strategy inherited***: Project-wide maps favor UI, API, integration, and RLS-focused coverage for dynamic workspace data.

---

## Phase 2 - Story Quality Analysis

### Ambiguities

| # | Location in Story | Question for PO/Dev | Impact on testing | Suggested clarification |
| --- | --- | --- | --- | --- |
| 1 | AC-03 / business rule: “matching” and “name/keyword-based” | Is matching prefix, substring, tokenized full-text, case-insensitive, and accent-insensitive? | The same query can produce different result sets and group counts. | Define matching semantics and normalization for each entity type; default to case-insensitive keyword matching only if confirmed. |
| 2 | Business rule: “minimum query length” | What is the minimum length, and is the boundary inclusive? | Cannot verify whether a one-character query is ignored, rejected, or searched. | State the exact threshold and behavior for empty, below-threshold, and threshold queries. |
| 3 | Business rule: “debounced” | What debounce interval is required, and is it a product-level observable or implementation detail? | Cannot assert request timing or distinguish expected request suppression from a slow response. | Define the interval or explicitly classify debounce as non-functional implementation guidance with a separate performance target. |
| 4 | AC-03 / AC-04: “enough context” and “own screen” | What identifying fields must each result show, and what exact route is the destination for each entity, especially a Module and a Run? | A result may navigate successfully but still be ambiguous or land on a generic screen. | Add a six-row entity contract: label/context, stable identifier, and destination route per type. |
| 5 | AC-08 / business rule: current workspace and permission | Does “current workspace” mean the active-workspace cookie at query time, and should project membership further narrow results? | A stale workspace selection or hidden project can cause cross-tenant or unauthorized disclosure. | Require server-side active-workspace and permission filtering; define expected behavior after workspace switching while the palette is open. |
| 6 | Business rule: focus restoration | Which element receives focus when the palette is opened from Cmd/Ctrl+K, the sidebar, the topbar, or an underlying modal/form? | Focus assertions differ by entry point; overlay layering can cause unsaved form loss or keyboard traps. | Define opener-focus restoration for each entry point and explicitly preserve underlying modal/form state. |
| 7 | AC-05: keyboard operation | Does ArrowUp wrap, and what is initially highlighted? How are group headings treated? | Keyboard coverage cannot determine the complete selectable sequence. | Define initial active item, ArrowUp/Down traversal, wrapping, disabled/loading items, and group-heading exclusion. |
| 8 | AC-06 / AC-07 async behavior | What appears while a qualifying query is loading, and how are stale or failed searches surfaced? | A blank, stale, or error state can be mistaken for no results. | Add loading, request failure, and stale-response behavior to the contract; distinguish no-results from operational error. |

### Gaps (missing info)

| # | Type | Why critical | What to add | Risk if omitted |
| --- | --- | --- | --- | --- |
| 1 | Technical detail | No union-search source, endpoint, or response schema exists; current APIs are entity-specific. | Define the search boundary, request parameters, grouped response shape, result cap/order, and error envelope. | Implementation divergence, inconsistent groups, and untestable API behavior. |
| 2 | AC | AC-03 says results group by type but does not define zero-result groups, group order, result ordering, or maximum results. | Define whether empty groups are omitted, canonical group order, ranking/tie-break, and per-group/total limits. | Unstable UI and incomplete or excessive result sets. |
| 3 | AC | AC-04 does not specify destinations for all six entities. | Add exact navigation destinations and required route context for ATC, Test, Project, Module, Bug, and Run. | “Selection navigates” can pass while landing at the wrong or non-specific page. |
| 4 | Business rule | Permission visibility is stated but the role/project-membership matrix is not. | Define viewer/member/admin behavior and whether project membership is distinct from workspace membership. | Unauthorized existence disclosure or over-filtering valid results. |
| 5 | AC / technical detail | Empty, below-threshold, loading, error, and no-results states are not fully separated. | Add observable copy/state semantics and cancellation behavior. | Users see a blank or stale overlay and cannot tell whether search failed. |
| 6 | AC | No requirement protects against duplicate requests or stale responses when typing quickly. | Specify latest-query-wins behavior and whether canceled requests may update the UI. | Older responses overwrite newer results. |
| 7 | Testability | The Story has no fixture/data path for all six entity types in one active workspace plus a second workspace and restricted project. | Identify seed/fixture ownership and a repeatable dataset contract before implementation. | Critical scope and permission coverage becomes blocked or non-reproducible. |
| 8 | Non-functional | “Fast” is implied by the command-palette purpose but no latency or result-availability target exists. | Define a measurable response budget or explicitly defer performance acceptance. | A technically correct but unusably slow search can pass. |

### Edge cases not in Story

| # | Scenario | Expected behavior (best guess) | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Query is below the confirmed minimum length | No search request; preserve the empty/guidance state. ***NEEDS PO/DEV CONFIRMATION*** | High | Add to AC after threshold is confirmed. |
| 2 | Query equals the minimum length | Search begins after debounce and renders matching groups. ***NEEDS PO/DEV CONFIRMATION*** | High | Add BVA scenario after threshold is confirmed. |
| 3 | Query contains leading/trailing whitespace or repeated spaces | Normalize input before matching; no accidental broad search. ***NEEDS PO/DEV CONFIRMATION*** | Medium | Add to search contract or test-only edge coverage. |
| 4 | Query differs only by case or contains non-ASCII characters | Matching follows the confirmed normalization rules. ***NEEDS PO/DEV CONFIRMATION*** | Medium | Confirm matching semantics. |
| 5 | A group has no matches while other groups do | Omit empty groups and keep non-empty groups visible. ***NEEDS PO/DEV CONFIRMATION*** | Medium | Confirm group rendering rule. |
| 6 | A qualifying search is still loading | Show a loading state; do not show stale results as current. ***NEEDS PO/DEV CONFIRMATION*** | High | Add async-state AC. |
| 7 | An older request resolves after a newer query | Older response is ignored; results correspond to the latest query. ***NEEDS PO/DEV CONFIRMATION*** | High | Add integration scenario. |
| 8 | Search backend returns an error or times out | Show a recoverable error state distinct from no results; preserve the query. ***NEEDS PO/DEV CONFIRMATION*** | High | Add failure-path AC. |
| 9 | User opens the palette over an unsaved form or existing modal | Underlying state remains unchanged; closing restores the prior focus/state. ***NEEDS PO/DEV CONFIRMATION*** | High | Add overlay layering scenario. |
| 10 | User switches active workspace while the palette is open or while a request is in flight | Results are cleared or re-scoped and never display the previous workspace. ***NEEDS PO/DEV CONFIRMATION*** | Critical | Add workspace-state integration scenario. |
| 11 | User selects a result that becomes inaccessible or archived before selection | Navigation fails safely without exposing data; palette reports a recoverable state. ***NEEDS PO/DEV CONFIRMATION*** | High | Confirm with Dev; add negative integration coverage. |
| 12 | Two entity types contain equally named results | Each result remains distinguishable through type and context. ***NEEDS PO/DEV CONFIRMATION*** | Medium | Add to AC-03 examples/contract. |
| 13 | Result list exceeds the UI/API cap | Results follow the documented cap and ranking; no silent group starvation. ***NEEDS PO/DEV CONFIRMATION*** | Medium | Add BVA/limit scenario once cap is defined. |

### Contradictions

No direct contradictions found. The original placeholder says “ATCs, modules, user stories…” while the team decision and scope define six types and explicitly defer User Stories and Milestones; the decision is authoritative for BK-398. The technical note says the existing shell is shipped, while current source confirms the result area is still a stub, which is consistent with the Story's implementation intent.

### Testability validation

***Verdict***: Partial

- Entry points and shell behavior are observable and feasible.
- Six entity types and destination routes are present in the application surface, but there is no documented union-search contract.
- Minimum query length, debounce interval, matching semantics, result limits/order, loading/error states, and focus restoration are not sufficiently measurable.
- The required multi-workspace, permission-filtered dataset is not documented as a fixture or seed contract.

---

## Phase 3 - Refined Acceptance Criteria

### Original AC-01 - Open via the keyboard shortcut

#### Scenario 1.1: Should open the command palette with Cmd+K from an app-shell screen (Type: Positive, Priority: High)

- ***Given***: An authenticated member is on an app-shell screen and the palette is closed.
- ***When***: The member presses Cmd+K on macOS.
- ***Then***: One command-palette overlay is visible, the input is focused, and the current route and underlying state are unchanged.

#### Scenario 1.2: Should open the command palette with Ctrl+K on non-macOS (Type: Positive, Priority: High)

- ***Given***: An authenticated member is on an app-shell screen and the palette is closed.
- ***When***: The member presses Ctrl+K on a non-macOS browser context.
- ***Then***: One command-palette overlay is visible and the input is focused without navigating.

#### Scenario 1.3: Should avoid opening duplicate palettes when multiple shell mounts receive Cmd/Ctrl+K (Type: Negative, Priority: High)

- ***Given***: The global sidebar palette and the project-shell palette mounts are both present.
- ***When***: The member presses the platform shortcut once.
- ***Then****: Exactly one overlay is rendered and one input receives focus. The two mounts do not produce duplicate overlays. ****NEEDS PO/DEV CONFIRMATION***

### Original AC-02 - Open via the sidebar search control

#### Scenario 2.1: Should open the command palette from the sidebar search control (Type: Positive, Priority: High)

- ***Given***: An authenticated member is on any app-shell screen and the palette is closed.
- ***When***: The member activates the sidebar search control.
- ***Then***: The same command-palette overlay is visible, the input is focused, and the current route is unchanged.

#### Scenario 2.2: Should restore focus to the sidebar search control after dismissal (Type: Edge, Priority: Medium)

- ***Given***: The palette was opened from the sidebar search control.
- ***When***: The member presses Escape or clicks outside the overlay without selecting a result.
- ***Then****: The palette closes and focus returns to the sidebar search control. ****NEEDS PO/DEV CONFIRMATION***

### Original AC-03 - Results grouped by entity type

#### Scenario 3.1: Should group matching results under the six in-scope entity headings (Type: Positive, Priority: Critical)

- ***Given***: The active workspace contains permitted matches for ATCs, Tests, Projects, Modules, Bugs, and Runs.
- ***When***: The member enters a qualifying query that matches more than one entity type.
- ***Then****: Results are grouped under headings for the matching entity types, each result identifies its entity type and sufficient context, and User Stories/Milestones do not appear. Group order and empty-group behavior remain to be confirmed. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 3.2: Should distinguish same-named results across projects and entity types (Type: Positive, Priority: High)

- ***Given***: Two permitted results share the same display name but belong to different entity types or projects.
- ***When***: The member searches for that name.
- ***Then****: Each result shows enough project/module/type context to select the intended entity. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 3.3: Should apply the confirmed keyword matching semantics consistently across entity types (Type: Boundary, Priority: High)

- ***Given***: The active workspace contains names/tags that exercise valid, partial, case-variant, whitespace-variant, and non-ASCII query partitions.
- ***When***: The member searches each partition after the confirmed minimum threshold.
- ***Then****: Results follow the documented normalization and matching rules. Exact semantics are a PO/Dev contract gap. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 3.4: Should omit deferred User Story and Milestone results (Type: Negative, Priority: High)

- ***Given***: The active workspace contains User Stories and Milestones whose names match the query.
- ***When***: The member searches for those names.
- ***Then***: No User Story or Milestone group/result is returned because both are explicitly out of scope for BK-398.

### Original AC-04 - Selecting a result navigates

#### Scenario 4.1: Should navigate to the selected ATC screen and close the palette (Type: Positive, Priority: Critical)

- ***Given***: A permitted ATC result is visible.
- ***When***: The member selects it.
- ***Then***: The palette closes and the browser navigates to that ATC's project-scoped editor route.

#### Scenario 4.2: Should navigate to each in-scope entity's exact destination (Type: Integration, Priority: Critical)

- ***Given***: A permitted result exists for each of ATC, Test, Project, Module, Bug, and Run.
- ***When***: The member selects one result from each type.
- ***Then****: Each selection closes the palette and lands on the corresponding entity-specific screen with the correct project/module context. Exact route mapping for Module and all entity variants requires confirmation. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 4.3: Should not navigate when an inaccessible result is selected (Type: Negative, Priority: High)

- ***Given***: A result becomes inaccessible before activation or the destination returns not-found/forbidden.
- ***When***: The member selects that result.
- ***Then****: The application does not disclose the entity and shows a recoverable navigation/error state. ****NEEDS PO/DEV CONFIRMATION***

### Original AC-05 - Keyboard-only operation

#### Scenario 5.1: Should move the active result with ArrowDown and select it with Enter (Type: Positive, Priority: High)

- ***Given***: The palette is open with at least two selectable results.
- ***When***: The member presses ArrowDown and then Enter.
- ***Then***: The active item moves according to the defined traversal order, Enter selects that item, the palette closes, and the correct entity screen opens.

#### Scenario 5.2: Should move backward with ArrowUp without selecting group headings (Type: Boundary, Priority: Medium)

- ***Given***: The palette is open with multiple groups and results.
- ***When***: The member presses ArrowUp/ArrowDown across group boundaries.
- ***Then****: Only selectable result items receive the active state; traversal and wrapping behavior follow the confirmed keyboard contract. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 5.3: Should close with Escape without navigation (Type: Negative, Priority: High)

- ***Given***: The palette is open on a known route.
- ***When***: The member presses Escape.
- ***Then****: The palette closes, the route remains unchanged, underlying input/modal state is preserved, and focus returns to the opener where applicable. Focus restoration is inferred. ****NEEDS PO/DEV CONFIRMATION***

### Original AC-06 - Empty-query state

#### Scenario 6.1: Should show search guidance before any query is entered (Type: Positive, Priority: Medium)

- ***Given***: The member opens the palette and the input is empty.
- ***Then****: Guidance identifies the searchable scope, no entity-type result groups are shown, and no search request is sent. The exact guidance text and request policy are partly unconfirmed. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 6.2: Should suppress search below the confirmed minimum query length (Type: Boundary, Priority: High)

- ***Given***: The palette is open and the confirmed minimum query length is greater than one.
- ***When***: The member enters an empty or below-threshold query.
- ***Then****: No search request is sent and the palette remains in the defined guidance state. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 6.3: Should begin search at the confirmed minimum query boundary (Type: Boundary, Priority: High)

- ***Given***: The palette is open and the confirmed minimum query length is known.
- ***When***: The member enters a query exactly at that threshold.
- ***Then****: A debounced search begins and the UI transitions to loading/results/no-results according to the response. ****NEEDS PO/DEV CONFIRMATION***

### Original AC-07 - No-results state

#### Scenario 7.1: Should display an explicit no-results state for an unmatched query (Type: Negative, Priority: High)

- ***Given***: The palette is open and the query meets the minimum length.
- ***When***: The search returns no permitted entity across all six types.
- ***Then***: An explicit no-results message is shown, no entity group headings are rendered, and the UI does not present the state as an operational error.

#### Scenario 7.2: Should distinguish backend failure from no results (Type: Negative, Priority: High)

- ***Given***: The palette is open with a qualifying query.
- ***When***: The search source fails or times out.
- ***Then****: A recoverable error state distinct from no results is shown and the query remains available for retry. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 7.3: Should render only the latest query response when requests resolve out of order (Type: Integration, Priority: Critical)

- ***Given***: The member changes from query A to query B before query A completes.
- ***When***: Query A resolves after query B.
- ***Then****: Query A does not overwrite the results or state for query B. ****NEEDS PO/DEV CONFIRMATION***

### Original AC-08 - Workspace scoping

#### Scenario 8.1: Should return only current-workspace results (Type: Negative, Priority: Critical)

- ***Given***: The member belongs to Workspace A and Workspace B, with matching entities in both, and Workspace A is active.
- ***When***: The member searches for the shared term.
- ***Then***: Only Workspace A entities appear; Workspace B names, identifiers, and context are not disclosed.

#### Scenario 8.2: Should exclude entities the member cannot access within the active workspace (Type: Negative, Priority: Critical)

- ***Given***: The active workspace contains a permitted project and a project/entity the member cannot access.
- ***When***: The member searches for a term matching both.
- ***Then****: Only permitted results appear, and the inaccessible entity's existence is not revealed. The exact project-membership matrix requires confirmation. ****NEEDS PO/DEV CONFIRMATION***

#### Scenario 8.3: Should re-scope in-flight results after an active-workspace change (Type: Integration, Priority: Critical)

- ***Given***: The palette is open while a search for Workspace A is in flight.
- ***When***: The active workspace changes to Workspace B before the response resolves.
- ***Then****: Workspace A results are not displayed after the switch; the palette clears or searches again under Workspace B according to the confirmed behavior. ****NEEDS PO/DEV CONFIRMATION***

---

---

### Facu Barea - 8/14/2026, 5:40:14 PM

## Acceptance Test Plan (ATP) - Phase 4 onward (continuation)

## Phase 4 - Test Outlines (DRAFT - outline names only)

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 10 | Two entry paths, grouped results, distinguishing context, valid selection, six entity destination classes, and current-workspace success. |
| Negative | 9 | Duplicate overlay, deferred entities, inaccessible entity, Escape, no-results, backend failure, and workspace/permission disclosure prevention. |
| Boundary | 7 | Minimum-query partitions, matching normalization partitions, group traversal boundaries, and result-cap/empty-group behavior pending contract. |
| Integration | 6 | Search source contract, six destination mappings as one cross-entity flow, stale responses, active-workspace changes, permission filtering, and overlay preservation. |
| API | 5 | Union search contract, auth/workspace scope, response grouping, validation/debounce boundary observability, and failure/error envelope. |
| ***Total**** | ****37*** | Outline estimate; formal TCs and executable detail are deferred to later workflow stages. |

***Rationale***: The Story is a high-risk cross-cutting search feature with six entity classes and tenant/permission boundaries. EP applies to query and visibility partitions; BVA applies to minimum length, result limits, and empty/threshold inputs; decision-table coverage applies to active workspace × project visibility × entity visibility; error guessing applies to stale responses, timeouts, double activation, and overlay layering. API outlines remain distinct because the current codebase has no documented union-search contract.

### Outline list (NAMES ONLY - preconditions in 1 line, expected in 1 line)

#### Positive

- ***Should open one command palette from Cmd+K on an app-shell screen*** - Pre: authenticated member with palette closed. Expected: one overlay opens and input is focused.
- ***Should open one command palette from Ctrl+K on a non-macOS browser context*** - Pre: authenticated member with palette closed. Expected: one focused overlay opens without navigation.
- ***Should open the same palette from the sidebar search control*** - Pre: member on a non-project app-shell route. Expected: controlled palette opens with input focused.
- ***Should group permitted matches under the six in-scope entity headings*** - Pre: active workspace has matches in multiple entity classes. Expected: matching groups and typed context render; deferred types are absent.
- ***Should distinguish same-named results by entity and project context*** - Pre: permitted duplicate display names exist. Expected: each result is unambiguous.
- ***Should navigate to the selected ATC editor and close the palette*** - Pre: permitted ATC match is visible. Expected: ATC route opens and overlay closes.
- ***Should navigate to the selected Test screen and close the palette*** - Pre: permitted Test match is visible. Expected: Test route opens with correct project/workspace context.
- ***Should navigate to the selected Project screen and close the palette*** - Pre: permitted Project match is visible. Expected: project route opens.
- ***Should navigate to the selected Module context and close the palette**** - Pre: permitted Module match is visible. Expected: exact module destination opens. ****NEEDS PO/DEV CONFIRMATION***
- ***Should navigate to the selected Bug or Run screen and close the palette**** - Pre: permitted Bug and Run matches are visible. Expected: each opens its exact entity screen. ****NEEDS PO/DEV CONFIRMATION***

#### Negative

- ***Should not render duplicate overlays when both palette mounts receive the shortcut*** - Pre: both shell mounts are present. Expected: exactly one overlay and one focused input.
- ***Should not show deferred User Story or Milestone results*** - Pre: deferred entities match the query. Expected: no deferred result groups appear.
- ***Should not navigate when an inaccessible result is activated*** - Pre: entity access is revoked before activation. Expected: no disclosure and recoverable error.
- ***Should close on Escape without changing the current route*** - Pre: palette open on a stable route. Expected: overlay closes and route/state remain unchanged.
- ***Should show no-results instead of an error for a permitted unmatched query*** - Pre: qualifying query has no permitted matches. Expected: explicit no-results state with no group headings.
- ***Should show a distinct recoverable state when search fails**** - Pre: qualifying query and unavailable search source. Expected: error state differs from no-results and supports retry. ****NEEDS PO/DEV CONFIRMATION***
- ***Should suppress Workspace B results while Workspace A is active*** - Pre: member belongs to both workspaces with matching entities. Expected: only Workspace A results are present.
- ***Should suppress inaccessible project results within the active workspace**** - Pre: matching visible and restricted projects exist. Expected: restricted entity existence is not disclosed. ****NEEDS PO/DEV CONFIRMATION***
- ***Should preserve unsaved underlying modal or form state when the palette closes**** - Pre: unsaved state exists beneath the overlay. Expected: state remains unchanged and focus is restored. ****NEEDS PO/DEV CONFIRMATION***

#### Boundary

- ***Should keep the guidance state for an empty query*** - Pre: palette just opened with empty input. Expected: guidance is shown and no groups/search request appear.
- ***Should keep the guidance state below the minimum query length**** - Pre: confirmed minimum length is greater than one. Expected: no search request and no result groups. ****NEEDS PO/DEV CONFIRMATION***
- ***Should start a debounced search at the minimum query length**** - Pre: minimum threshold is defined. Expected: search begins after the defined debounce interval. ****NEEDS PO/DEV CONFIRMATION***
- ***Should normalize leading and trailing whitespace according to the search contract**** - Pre: matching entity exists and query contains surrounding whitespace. Expected: result behavior follows confirmed normalization. ****NEEDS PO/DEV CONFIRMATION***
- ***Should apply case and non-ASCII matching rules at the query boundary**** - Pre: names exercise case/accent/Unicode partitions. Expected: behavior follows documented matching semantics. ****NEEDS PO/DEV CONFIRMATION***
- ***Should traverse results without focusing group headings at group boundaries**** - Pre: multiple result groups are visible. Expected: ArrowUp/Down moves only among selectable results. ****NEEDS PO/DEV CONFIRMATION***
- ***Should enforce the documented per-group or total result cap**** - Pre: query matches more entities than the configured cap. Expected: ranking and cap behavior are stable and documented. ****NEEDS PO/DEV CONFIRMATION***

#### Integration

- ***Should search all six entity sources under one active-workspace context*** - Pre: union-search implementation and permitted fixtures exist. Expected: grouped response contains only current-workspace entities.
- ***Should map each entity type to its exact destination route**** - Pre: one permitted result exists per entity class. Expected: each route preserves project/module/entity identity. ****NEEDS PO/DEV CONFIRMATION***
- ***Should ignore stale responses after the query changes**** - Pre: query A and B overlap in flight. Expected: latest query controls rendered state. ****NEEDS PO/DEV CONFIRMATION***
- ***Should clear or re-scope results when the active workspace changes**** - Pre: search is open during workspace change. Expected: prior-workspace data is not rendered. ****NEEDS PO/DEV CONFIRMATION***
- ***Should preserve underlying modal/form state across palette open and dismissal**** - Pre: unsaved overlay/form state exists. Expected: state and opener focus survive. ****NEEDS PO/DEV CONFIRMATION***
- ***Should handle a destination becoming unavailable between result and selection**** - Pre: result is visible, access changes before activation. Expected: navigation fails safely without entity disclosure. ****NEEDS PO/DEV CONFIRMATION***

#### API

- ***Should define a union-search request and grouped response contract**** - Pre: authenticated caller and active workspace. Expected: stable request validation and typed grouped result envelope. ****NEEDS PO/DEV CONFIRMATION***
- ***Should reject or suppress below-threshold search requests according to the contract**** - Pre: empty and below-threshold inputs. Expected: documented validation/no-request behavior. ****NEEDS PO/DEV CONFIRMATION***
- ***Should enforce active-workspace and permission scoping server-side*** - Pre: caller has multiple memberships and restricted project data exists. Expected: response contains only permitted active-workspace results.
- ***Should return a distinct empty result envelope for no matches*** - Pre: qualifying unmatched query. Expected: successful empty response maps to no-results UI, not an API error.
- ***Should return a recoverable error envelope for search failure**** - Pre: search dependency failure. Expected: UI can distinguish failure from an empty result and retry. ****NEEDS PO/DEV CONFIRMATION***

> Parametrization, numbered steps, test-data JSON, and generation strategy are intentionally omitted; they belong to in-sprint planning.

---

## Phase 5 - Edge Cases (DRAFT)

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Below-threshold query | No | High | Add to AC after threshold confirmation. ***NEEDS PO/DEV CONFIRMATION*** |
| 2 | Exact threshold query | No | High | Add BVA outline and confirm inclusive behavior. ***NEEDS PO/DEV CONFIRMATION*** |
| 3 | Whitespace/case/Unicode query normalization | No | Medium | Confirm matching contract; retain as boundary coverage. ***NEEDS PO/DEV CONFIRMATION*** |
| 4 | Empty group among non-empty groups | No | Medium | Confirm whether empty groups are omitted. ***NEEDS PO/DEV CONFIRMATION*** |
| 5 | Loading state for a slow query | No | High | Add async-state AC. ***NEEDS PO/DEV CONFIRMATION*** |
| 6 | Backend timeout/error | No | High | Add distinct recoverable error state. ***NEEDS PO/DEV CONFIRMATION*** |
| 7 | Out-of-order query responses | No | Critical | Add latest-query-wins integration coverage. ***NEEDS PO/DEV CONFIRMATION*** |
| 8 | Workspace switch during search | No | Critical | Add active-workspace re-scope coverage. ***NEEDS PO/DEV CONFIRMATION*** |
| 9 | Permission revocation before selection | No | High | Confirm safe failure behavior. ***NEEDS PO/DEV CONFIRMATION*** |
| 10 | Unsaved modal/form under palette | Partially stated in business rules | High | Add preservation and focus restoration scenario. ***NEEDS PO/DEV CONFIRMATION*** |
| 11 | Duplicate result names | “Enough context” only | Medium | Add explicit context requirement. ***NEEDS PO/DEV CONFIRMATION*** |
| 12 | Result cap overflow | No | Medium | Confirm cap/order and add BVA coverage. ***NEEDS PO/DEV CONFIRMATION*** |

---

## Story Quality Assessment

***Verdict***: Significant Issues

***Key findings***:

- The user-facing scope is clear, but the implementation contract for union search, matching, result grouping, limits, and destinations is incomplete.
- Workspace and permission isolation are explicitly required but lack a documented search endpoint/response contract and fixture path.
- The current source has only the palette shell; existing entity APIs are separate and cannot be assumed to compose into one search contract without Dev design.

---

## Critical Questions for PO

> These block sprint planning until answered.

1. ***What are the exact matching semantics and minimum query threshold?***
2. ***What exact destination and identifying context must be used for each of the six entity types?***
3. ***What is the expected grouped-result policy?***
4. ***What must the user see while a qualifying search is loading or when the search source fails?***

---

## Technical Questions for Dev

1. ***Will BK-398 introduce a dedicated union-search API/RPC, or aggregate entity-specific sources?*** The current code exposes separate entity routes and direct server-component queries; the choice controls contract, latency, auth, and test isolation.
2. ***What is the authoritative active-workspace and permission filter for the search request?*** Confirm server-side enforcement, especially for users belonging to multiple workspaces and projects they cannot access.
3. ***How will stale requests, debounce, loading, timeout, and cancellation be handled?*** The latest query must not be overwritten by an older response.
4. ***How will result selection map to exact routes, particularly Modules and Runs?*** Provide route builders or a stable typed destination field in the response.
5. ***What fixture/seed path will provide all six entity types, two workspaces, and restricted visibility?*** Without it, critical data-isolation coverage is not repeatable.
6. ***How will focus restoration work across the two existing palette mounts and underlying modals/forms?*** The current shell opens the input but does not define opener refs or focus-return behavior.

---

## Suggested Story Improvements

| # | Current state | Suggested change | Benefit |
| --- | --- | --- | --- |
| 1 | Search semantics are described as “name/keyword-based”. | Define matching normalization, threshold, debounce policy, and result cap/order. | Makes query behavior measurable and estimable. |
| 2 | Results are “grouped” with “enough context”. | Add a six-entity result contract with group rules, visible fields, and stable ordering. | Prevents inconsistent UI/API implementations. |
| 3 | “Own screen” is undefined per entity. | Add exact destination routes for ATC, Test, Project, Module, Bug, and Run. | Makes navigation assertions unambiguous. |
| 4 | No async failure contract exists. | Add loading, no-results, error, retry, and latest-query-wins behavior. | Separates degraded operation from valid empty search. |
| 5 | Workspace scoping lacks fixture details. | Add a repeatable dataset/seed prerequisite for two workspaces and restricted project visibility. | Enables critical tenant-isolation testing. |
| 6 | Story Points = 1 despite high-risk cross-cutting scope. | Re-estimate after the union-search contract and fixture work are defined. | Aligns planning with implementation and QA effort. |

---

## Data feasibility flags

***DATA-FEASIBILITY-RISK******:****** Yes - documentation and contract gap.***

- ***Entity / fixture missing***: No documented fixture set guarantees ATCs, Tests, Projects, Modules, Bugs, and Runs across two workspaces with a restricted project/entity.
- ***API contract gap***: No dedicated union-search endpoint/response contract; current APIs are entity-specific and some project data is loaded directly in server components.
- ***Required pre-work***: Define the search source and typed result contract, confirm route destinations, and provide seed/fixture ownership before implementation or sprint-level execution.

---

## Recommended testing strategy

### Pre-implementation

- Resolve the four PO questions and six Dev questions; update ACs with the union-search, result, route, async, and focus contracts.
- Re-estimate the Story from the confirmed scope; the current 1-point estimate does not reflect the six-source and tenant-isolation surface.
- Define deterministic fixtures for six entity types, two workspaces, permission-restricted data, duplicate names, empty results, and result-cap overflow.

### During implementation

- Add API/contract tests for request validation, grouped response shape, active-workspace filtering, permission filtering, no-results, and failure envelopes.
- Add focused UI tests for both entry points, keyboard traversal, selection, dismissal, focus restoration, loading/error states, and stale-response suppression.
- Keep destination mapping typed and covered per entity class; do not infer routes from display labels.

### Post-implementation (in-sprint by /sprint-testing)

- Execute the outline set against staging with the seeded multi-workspace dataset.
- Verify UI/API/RLS consistency for every entity class and navigation destination.
- Validate responsive overlay behavior and keyboard accessibility on the supported browser/viewport matrix once that project-wide scope is confirmed.

---

## Risks & mitigation

| # | Risk | Likelihood | Impact | Mitigated by which outlines |
| --- | --- | --- | --- | --- |
| 1 | Search contract differs across six entity sources | High | High | API-1, INT-1, POS-4 |
| 2 | Cross-workspace or restricted-project disclosure | Medium | Critical | NEG-7, NEG-8, API-3, INT-4 |
| 3 | Stale async response shows wrong results | High | High | NEG-6, INT-3 |
| 4 | Selection lands on wrong/ambiguous destination | Medium | High | POS-6 through POS-10, INT-2 |
| 5 | Palette breaks unsaved modal/form state or focus | Medium | High | NEG-9, INT-5, POS-3 |
| 6 | Story is under-estimated and fixture work blocks QA | High | High | Pre-implementation actions and DATA-FEASIBILITY-RISK flag |

---

## Next steps

- [ ] PO answers Critical Questions before sprint planning
- [ ] Dev answers Technical Questions before estimation
- [ ] Define union-search response, route map, and fixture contract
- [ ] Re-estimate BK-398 after scope clarification
- [ ] Story enters sprint at status `Estimation`/`Ready For Dev` once refined and estimated
- [ ] When BK-398 reaches `Ready For QA`, `/sprint-testing` should validate this refinement before completing in-sprint ATP detail

---

Action Required: review ambiguities, answer critical questions, confirm edge-case behavior, validate parametrization.
Refined on: 2026-08-14 - QA Shift-Left batch session
Local working copy: .context/PBI/epics/EPIC-BK-7-project-module-hierarchy/stories/STORY-BK-398-command-palette-search-and-jump-across-the-workspa/shift-left-refinement.md

---

### Facu Barea - 8/14/2026, 6:10:48 PM

## PO/Dev Decisions — Shift-Left Resolution (2026-08-14)

All NEEDS PO/DEV CONFIRMATION markers from the Shift-Left refinement are now resolved. The Acceptance Criteria field holds the final contract for implementation.

### PO Decisions

1. ***Matching + minimum threshold****: minimum ****2 characters*** (inclusive); below 2 → guidance, no request. Case-insensitive; 1 token = prefix, multi-token = AND (parity with bunkai*search*atcs). Accent-sensitive in v1. Debounce 250 ms; timeout 8 s → recoverable error.
2. ***Destinations + context*** (six-row contract):

   Result context: {entity type} · {project} · {name}.

1. ***Grouped-result policy***: order ATCs, Tests, Projects, Modules, Bugs, Runs; empty groups omitted; within group relevance → recency → name; caps 5/group, 20 total.
2. ***States***: empty/<2 chars → guidance; loading → skeleton (no stale results); no-results → "No results for 'query'"; error → "Search failed. Try again." distinct from no-results; latest-query-wins.

### Dev Decisions

1. ***Union search***: new SECURITY DEFINER RPC bunkai*search*workspace(actor, query, workspace*id, limit) joining the 6 tables to workspace*members; exposed via GET /api/v1/search. Auth: browser cookie only in v1 (PAT → 403 browser-only).
2. ***Workspace + permissions***: resolveActiveWorkspaceId from bk*active*ws cookie; RPC re-verifies active membership server-side. Visibility = workspace membership, NOT per-project (projects visible to all workspace members in the data model).
3. ***Stale/debounce***: 250 ms + AbortController; abort in-flight on query change; stale discarded. Workspace switch with palette open → clear to guidance.
4. ***Routes***: RPC returns typed `route` field per result; UI never infers routes.
5. ***Fixture***: new scripts/seed-palette-demo.ts (bun run seed:palette, non-prod gated): 2 workspaces + six entity types + duplicate names + cap overflow.
6. ***Focus + mounts***: single CommandPaletteProvider in app/(app)/layout.tsx; capture document.activeElement on open, restore on close; portal preserves modal/form state.

### AC changes from resolution

- AC-08-8.2 (inaccessible project within workspace) does NOT apply — projects visible to all members. Replaced with suspended/inactive membership → no results, no disclosure.
- AC-08-8.3 (workspace switch): palette clears to guidance; in-flight old-workspace request aborted.
- AC-01-1.3 (duplicate overlay): resolved structurally by the single provider instance.

### Estimate

***Story Points******:****** 5*** (was 1). Scope: union RPC + route + provider refactor + cmdk wiring + route mapping + 2 list tweaks (bugs highlight, explorer modulePath) + seed script.

Action Required: Dev implements per the final Acceptance Criteria field. When BK-398 reaches Ready For QA, run /sprint-testing (short-circuits thanks to shift-left-reviewed label).

---

### Ely - 8/15/2026, 3:26:24 PM

## AI Tech Lead — Decision: data-access design for cross-entity workspace search

> ***NOTE:*** This is an AI Tech Lead ruling, published under Critical Rule #18 (this project is AI-orchestrated). It is not a human sign-off. It overrides the self-ratified Dev Decision 1 in the 2026-08-14 shift-left resolution comment on this issue.

### Why this ruling exists

The shift-left refinement on this issue was raised at 5:40 PM and closed at 6:10 PM on 2026-08-14 by the same Jira identity, thirty minutes apart. Its "Dev Decisions" therefore carry no independent ratification. Dev Decision 1 specifies a `SECURITY DEFINER` RPC `bunkai*search*workspace(actor, query, workspace_id, limit)`.

That directly contradicts a ***standing architecture ruling*** already published from the BK-267 refinement (2026-08-13, comment `12316`):

> For a workspace-wide read over an RLS-covered table, prefer `SECURITY INVOKER` with NO actor parameter over a DEFINER function with an actor bind. A function that cannot be told who the caller is cannot be lied to about it. The single load-bearing condition: the route must pass `getAuth(ctx).db`, NEVER `createAdminClient()`.

A settled ruling is followed, not re-derived. A self-ratified closure does not overturn it. This comment scores the alternatives anyway, because a decision without alternatives is a guess.

---

### The candidates

| # | Shape |
| --- | --- |
| A | `SECURITY INVOKER` RPC, no actor parameter, UNION ALL over the six tables, invoked through the caller's own RLS-scoped client |
| B | `SECURITY DEFINER` RPC with `p*actor*user_id` bound at step 0 plus explicit per-branch workspace scoping (the shift-left spec, corrected to satisfy ADR-0012) |
| C | No RPC — six parallel RLS-covered PostgREST reads composed and ranked in the API route |
| D | A denormalised `search_index` table (or materialised view) with one shared tsvector, refreshed by triggers on all six tables |

### Scoring

Scale 1–5, higher is better. Criteria are the five named in the dispatch.

| Criterion | A · INVOKER RPC | B · DEFINER + bind | C · six route queries | D · search index |
| --- | --- | --- | --- | --- |
| Consistency with standing ruling + ADR-0012 | 5 | 1 | 4 | 4 |
| Security / tenancy risk | 5 | 2 | 5 | 3 |
| Implementation cost | 4 | 2 | 3 | 1 |
| Query performance across 6 tables | 4 | 4 | 2 | 5 |
| Reversibility | 4 | 3 | 5 | 1 |
| ***Total**** | ****22**** | ****12**** | ****19**** | ****14*** |

### WINNER — A. `SECURITY INVOKER` RPC `bunkai*search*workspace(p*query, p*workspace*id, p*limit)`, no actor parameter, called through `getAuth(ctx).db`.

---

### Rationale

***1. Every one of the six tables is already covered by a workspace-member SELECT policy.*** This is the fact that decides the ruling, and it was verified table by table:

| Entity | Table | Reaches workspace via | SELECT policy |
| --- | --- | --- | --- |
| ATC | `public.atcs` | `project*id` -> `projects.workspace*id` | `atcs*select*workspace*member` (`0005*rls_helpers.sql:345`) |
| Test | `public.tests` | direct `workspace*id` | `tests*select*workspace*member` (`0024_tests.sql:82`) |
| Project | `public.projects` | direct `workspace*id` | `projects*select*workspace*member` (`0005*rls*helpers.sql:153`) |
| Module | `public.modules` | `project*id` -> `projects.workspace*id` | `modules*select*workspace*member` (`0005*rls_helpers.sql:174`) |
| Bug | `public.bugs` | direct `workspace*id` | `bugs*select*workspace*member` (`0046_bugs.sql:133`) |
| Run | `public.runs` | direct `workspace*id` | `runs*select*workspace*member` (`0031_runs.sql:103`) |

All six resolve through `bunkai*is*workspace*member(ws*id)` (`0005*rls*helpers.sql:19-33`), which is itself `SECURITY DEFINER STABLE` and keyed on `auth.uid()` with `status = 'active'`. Under INVOKER the union inherits that boundary on all six branches for free. There is no per-branch scoping obligation for an author to get half-right — which is precisely the obligation that BK-49 got half-right and shipped as a live cross-tenant disclosure.

***2. Cross-tenant disclosure becomes structurally impossible, not merely unlikely**** — the standard the RPC authorization gate sets. Under INVOKER the function runs as the caller's role, so every table reference re-evaluates its own SELECT policy against `auth.uid()`. `p*workspace*id` appears only as an AND-narrowing predicate on a set RLS has already floored. ****No parameter this function accepts can widen its result set.*** A forged `bk*active*ws` cookie naming a foreign workspace intersects to zero rows — the same non-disclosure property already documented at `lib/home/open-bugs.ts:89` and `lib/home/coverage.ts:136`.

***3. Candidate B's only genuine justification is removed by the shift-left comment's own text.**** `0027*atc*search.sql` is DEFINER for one stated reason (line 17): **"for an EXPLICIT actor because PAT callers carry no auth.uid()"**. Dev Decision 1 of the same comment scopes this endpoint to **"browser cookie only in v1 (PAT -> 403 browser-only)"*. Removing PAT callers removes the sole precedent-backed reason to escalate to DEFINER. The spec argues against itself.

***4. Candidate B's actor bind would be inert on the real call path.**** A DEFINER function reached through `createAdminClient()` sees `auth.uid()` as NULL, so `auth.uid() is not null and auth.uid() <> p*actor*user*id` never fires. This is recorded as a standing open item since 2026-08-07 and stated verbatim in `0068*story*traceability*report.sql:119-121`: **"Inert on the admin-client call path (auth.uid() NULL); the real protection is the per-CTE scoping below, never this bind alone."* B would ship a guard that does nothing, and buy in exchange six independent chances to reproduce ADR-0012's live-disclosure failure class.

***5. Candidate C is safe and loses only on fit.*** It scores identically on tenancy risk and better on reversibility, and it remains the correct fallback if the RPC proves awkward in review. It loses because the ranking contract is a SQL problem: caps of 5 per group and 20 total, ordering by relevance then recency then name, and cross-entity truncation all have to be reimplemented in TypeScript over six separately-fetched result sets, inside an 8-second budget spanning six PostgREST round-trips.

***6. Candidate D is the right answer to a problem this product does not have yet.*** A denormalised index earns its keep at a data volume this workspace is nowhere near, and it costs write-path triggers on six live tables plus a staleness contract. Reversibility is its worst property: unwinding it means dropping the table and rewriting the read path. Revisit only if A is measured too slow on real data.

***No ADR is required.*** This applies ADR-0012's existing stated preference, introduces no new authorization path, and does not touch the tenancy posture. It is an application of settled architecture, not a new decision about it.

---

### The six authoring questions, answered in advance

Per the RPC authorization gate, these are answered before any SQL is written.

| # | Question | Answer |
| --- | --- | --- |
| 1 | Needs DEFINER, or does INVOKER do it? | INVOKER. All six tables carry workspace-member SELECT policies; no cross-boundary read is needed. Governing ADR: ADR-0012. |
| 2 | Can the identity parameter be removed? | Yes — and it is. The function takes no actor parameter at all. |
| 3 | Where is the actor bind? | Not applicable. There is nothing to bind, which is the point. |
| 4 | Which returned rows cross a tenant boundary, and what constrains each? | None. Each of the six UNION branches is constrained by its own RLS SELECT policy evaluating `bunkai*is*workspace*member` against the caller's `auth.uid()`, plus an AND-narrowing `workspace*id = p*workspace*id`. |
| 5 | Does the failure path disclose existence? | No path discloses. An unknown, foreign, or suspended-membership workspace yields an empty result and HTTP 200 — never 403, never 404. Matches `app/api/v1/workspaces/[id]/open-bugs/route.ts:33-37`. |
| 6 | Which test proves it against the real database? | A DB-integration isolation test in the shape of `lib/runs/report-isolation.test.ts` and `lib/activity/list-activity-isolation.test.ts`. A route test that mocks the RPC proves nothing. |

---

### Matching mechanism — the actual work in this story

Only `atcs` has text-search infrastructure today (`atcs.tsv` plus `atcs*tsv*gin*idx`, `0004*atcs.sql:74`). `tests`, `projects`, `modules`, `bugs` and `runs` have none, and `pg_trgm` has never been installed in this schema — the only extension anywhere is `pgcrypto`.

***Ruling******:**** reuse the existing `atcs.tsv` for the ATC branch, and for the other five add ****expression GIN indexes*** of the form `using gin (to*tsvector('english', <display*column>))`. Do NOT add tsvector columns with triggers to five live tables (that is a backfill project, not a 5 SP story), and do NOT install `pg_trgm` (no precedent, and this ruling will not create one inside a navigation story).

Rationale: with a literal regconfig, `to*tsvector` is immutable and therefore indexable as an expression — no schema change, no backfill, no trigger, and exact semantic parity with the ATC branch, which AC-03 Scenario 3.3 explicitly requires ("v1 parity with `bunkai*search_atcs`").

Verified display columns: `atcs.title`, `tests.title`, `projects.name`, `modules.name`, `bugs.title`, `runs.test*title` (the start-time snapshot, `0031*runs.sql:84`).

Query construction copies `0027*atc*search.sql:79-85` verbatim — single token becomes `to*tsquery('english', tok:*)` for prefix autocomplete, multi-token becomes `plainto*tsquery` (AND). Ranking within a group is `ts_rank` with the same 7-day exponential recency decay as `0027`, then name as the final tiebreak.

Note for the migration author: `create index` cannot run `concurrently` inside a Supabase migration transaction. Five plain index builds briefly lock writes on those tables. Accepted — the tables are small — but state it in the migration header.

---

### Secondary rulings

***Route shape and response contract.*** `GET /api/v1/search?q=<string>&limit=<int>`. No workspace path segment and no workspace query parameter — the client is never the authority on scope. Wrapped in `withApiHandler(..., { auth: 'required', requires: ['atc:read'] })`. Zod validation in its own module mirroring `lib/atcs/search-validation.ts`: `q` trimmed with `min(2)`, `limit` coerced int `min(1).max(20).default(20)`. Below two characters the client fires no request at all; a two-character query is valid (the threshold is inclusive).

Response envelope follows the newer `bugs/route.ts` convention, not `atcs/search`'s `{ items }`:

```
{ "data": SearchResultItem[], "truncated": boolean }
```

Ordering and the 5-per-group / 20-total caps are decided in SQL and preserved by array order. The client groups by `entity_type` on render; empty groups disappear naturally, satisfying AC-03 with no client-side policy.

***Route strings are built in TypeScript, not in SQL — this overturns self-ratified Dev Decision 4.**** The RPC returns identifiers (`entity*type`, `id`, `project*id`, `project*slug`, `module*path`, `name`, `project_name`), and a single shared route-builder module turns those into hrefs behind an exhaustive `satisfies Record<EntityType, ...>` map with unit tests. Encoding Next.js route shapes in a Postgres function makes every route rename a database migration, and route shape is owned by ADR-0003's route-driven workbench, not by the schema. The QA concern behind Dev Decision 4 — **"the UI never infers routes"* — is fully met by one typed, tested builder; it did not require SQL.

***Where scoping and permission filtering are enforced.*** Two server-side layers, and only one of them is authorization.

1. ***Authorization floor — Postgres RLS.*** Non-negotiable and not restatable in application code. It is what makes a forged cookie inert.
2. ***Active-workspace narrowing — the route.*** `resolveActiveWorkspaceId(cookieValue, visibleWorkspaceIds)` from `lib/workspaces/active.ts`, the same single source of truth the app shell, `/projects` and `/api/v1/me` already share. `visibleWorkspaceIds` MUST come from the caller's own RLS-scoped read, never from the cookie. The resolved id is passed as `p*workspace*id` and is a filter, never a grant.

Permission filtering is ***workspace membership only***. There is no `project*members` table anywhere in this schema — membership exists at workspace grain alone, and per-project visibility would be a new tenancy posture needing its own ADR. This confirms the AC-08 8.2 rewrite. Suspended or inactive membership needs no special code: `bunkai*is*workspace*member` already requires `status = 'active'`, so the entire workspace silently disappears from the caller's view.

PAT callers: do not hard-code a 403 before verifying. If `getAuth(ctx).db` is RLS-scoped for PAT principals under ADR-0001's Path B impersonation, the same endpoint serves them correctly and a bespoke 403 is unjustified special-casing. If PAT principals instead resolve to a non-RLS client, `auth.uid()` is NULL and the caller silently receives zero results — which is worse than a refusal, so in that case return an explicit 403. ***Verify which, then implement accordingly.*** Do not ship the silent-empty branch.

***Debounce, abort, stale responses.*** 250 ms plus `AbortController`, copying the live precedent at `app/(app)/projects/[projectSlug]/atc-search-filter.tsx:32,42-77` in shape — one `useEffect` whose cleanup both clears the timer and aborts the controller. The self-ratified 250 ms stands; it matches the shipped constant. Compose an 8-second `AbortSignal.timeout(8000)` with the manual controller for the recoverable-error state. Abort-on-change already gives latest-query-wins, so no sequence counter is needed, but the rendered results MUST be keyed to the query string that produced them. Workspace switch while the palette is open clears to guidance and aborts the in-flight request (AC-08 8.3). Do not extract a shared `useDebounce` hook — there is no `hooks/` directory and this story is not the place to create one.

***Fixture / seed script — CUT. ****`scripts/seed-palette-demo.ts`**** and ****`bun run seed:palette`**** are NOT to be created.*** No seed or fixture script exists anywhere in this repo (16 files in `scripts/`, none of them fixtures; no `supabase/seed.sql`), so this would introduce a first-of-its-kind convention inside a navigation story. The coverage it was meant to enable — AC-08 8.1 and 8.2 — is exactly what the two established reference isolation tests already do by seeding inline and cleaning up after themselves. Build that instead; it is required, not optional, and it is what answers authoring question 6.

One hazard to respect while writing it: BK-401 showed that isolation tests keyed on shared-table data drift flake against the live database. Seed with unique probe tokens scoped to the test run and clean up in a `finally`.

***Net effect on the estimate******:*** the seed script comes out, five expression indexes go in. 5 SP still holds.

---

### Implementation constraints — binding on the implementing agent

1. Create `bunkai*search*workspace(p*query text, p*workspace*id uuid, p*limit int)` as `SECURITY INVOKER` — omit the clause, as `0051*bugs*list.sql` does. It takes ***no*** actor parameter. Adding one reopens the ADR-0012 failure class and will be rejected in review.
2. The route MUST use `getAuth(ctx).db`. Using `createAdminClient()` sets `auth.uid()` to NULL, collapses every RLS policy, and turns this design into an unscoped cross-tenant read. This is the single load-bearing condition of the whole ruling.
3. `p*workspace*id` is a narrowing filter. Never document, comment, or treat it as the authorization boundary.
4. Do not retrofit guards onto any of the 22 known-unbound live DEFINER functions while in this diff. ADR-0012 forbids inline remediation.
5. Do not touch `0047*activity*actor*resolve*scope.sql` or relax any provenance filter.
6. Do not install `pg_trgm`. Do not add tsvector columns or triggers to `tests`, `projects`, `modules`, `bugs` or `runs`.
7. Ship the DB-integration isolation test in the same slice as the migration — two workspaces, matching names in both, asserting the second workspace's rows never appear. A mocked-RPC route test does not satisfy this.
8. Grants follow precedent exactly: `revoke execute ... from public, anon;` then `grant execute ... to authenticated, service_role;`.
9. Every failure mode returns HTTP 200 with an empty `data` array. No 403 and no 404 for an unknown or foreign workspace — the only exception is the PAT branch, and only after verifying it is genuinely non-RLS.
10. Verify the six display columns against their own migrations before writing the union. Do not trust this comment's column list without checking it.

---

**Published by the AI Tech Lead per Critical Rule #18. Alternatives enumerated and scored above; the standing BK-267 ruling was followed rather than re-derived.**

---

### Ely - 8/15/2026, 3:29:23 PM

## AI Product Owner — Decision: command palette UX contract and design-contract position

### Why this ruling exists

The six `NEEDS PO/DEV CONFIRMATION` markers raised in the Shift-Left refinement (2026-08-14, 5:40pm) were closed 30 minutes later (6:10pm) by the same Jira identity, with no alternatives enumerated, no scoring, and no attribution. Under Critical Rule #18 that is not a decision, it is a self-ratification. This comment re-decides each item under the mandatory scored-alternatives method, ratifying what holds and correcting what does not, and records the story's design-contract position under Critical Rule #15.

***Two prior rulings are SETTLED and were FOLLOWED here, not re-derived******:***

1. The 2026-08-12 AI Product Owner decision on this ticket (comment `12297`) fixing the palette's first cut to the six entity types with shipped routes: ATCs, Tests, Projects, Modules, Bugs, Runs. User Stories and Milestones stay deferred.
2. The 2026-08-13 ruling retiring `Cmd+K` from BK-267/BK-440's ATC Library search because it collides with this palette. `/` and `Esc` remain the ATC Library's; `Cmd+K` / `Ctrl+K` is this palette's.

***Scoring criteria*** (0-5 each, 25 max): product value · consistency with existing precedent and the live UI · implementation cost (higher = cheaper) · reversibility · risk (higher = safer).

***Net effect on the AC field******:****** three items ratified as written, three corrected.*** Two of the corrections reduce build cost.

---

### (a) Matching semantics and minimum query threshold — RATIFIED (23/25)

| # | Candidate | Value | Consistency | Cost | Reversibility | Risk | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Minimum 2 chars inclusive, 250ms debounce, single token = prefix, multi-token = AND, case-insensitive, accent-sensitive (parity with the shipped ATC search) | 4 | 5 | 5 | 5 | 4 | ***23*** |
| 2 | Minimum 1 char, matching the shipped ATC search validator | 2 | 3 | 4 | 5 | 2 | 16 |
| 3 | Minimum 3 chars, cheapest on the union query | 2 | 2 | 5 | 5 | 4 | 18 |
| 4 | Minimum 2 chars plus `unaccent` for accent-insensitive matching | 4 | 2 | 2 | 3 | 3 | 14 |

***Winner******:****** candidate 1, as the AC already states it.**** The semantics were verified against the shipped implementation, not taken on the refinement's word: `supabase/migrations/0027*atc*search.sql` lines 71-84 uses `to*tsquery('english', <sanitised>:**)` for a single token and `plainto*tsquery('english', ...)` for multi-token. So prefix-on-single, AND-on-multi, case-insensitive and accent-sensitive are all literally true of the code the palette is claiming parity with. Candidate 2 loses because the 1-char precedent it cites is a project-scoped, single-entity endpoint; the same threshold across six tables in a whole workspace returns noise and costs a round trip per keystroke. Candidate 4 loses on consistency before cost: adding `unaccent` here and not to the ATC search would make two search surfaces in one product disagree about whether "Módulo" matches "Modulo".

***Three clarifications the AC must absorb***, because each is observable and will otherwise be filed as a defect:

- The `english` configuration ***stems***. "running" matches "run", "tests" matches "test". That is correct behaviour, not a matching bug.
- `plainto_tsquery('english', ...)` ***drops stopwords***. A multi-token query made entirely of stopwords ("to be") yields zero matches, which is the no-results state, not the error state.
- The 2-char threshold counts characters ***after trimming*** leading and trailing whitespace, matching the live filter at `app/(app)/projects/[projectSlug]/atc-search-filter.tsx` lines 44-48, which fires no request on an empty trimmed value.

---

### (b) Per-entity destination on selection — CORRECTED (23/25)

| # | Candidate | Value | Consistency | Cost | Reversibility | Risk | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Ratify the six-row contract as written (Bug to `/projects/{slug}/bugs?bugId=`, Module to `?modulePath=`) | 3 | 1 | 2 | 3 | 2 | 11 |
| 2 | Ratify four rows; correct Bug to the shipped detail route and Module to an id-keyed param | 5 | 5 | 5 | 4 | 4 | ***23*** |
| 3 | Route every type to its parent screen with a highlight parameter | 2 | 2 | 3 | 4 | 3 | 14 |
| 4 | Correct Bug only, keep `modulePath` | 4 | 3 | 4 | 4 | 3 | 18 |

***Winner******:****** candidate 2.*** Candidate 1 fails on two counts that the refinement did not catch:

- ***The Bug row contradicts a ratified ruling.**** A defect detail route is shipped at `/projects/{slug}/bugs/{bugId}`, and the BK-337 Product Owner decision recorded in `lib/notifications/entity-routes.ts` lines 55-62 already settled that a bug reference opens the defect record, precisely so that two surfaces do not answer "what does a bug reference open?" two different ways. Sending the palette to a filtered list would recreate the split that ruling closed. (The `?bugId=` parameter the AC borrowed is real, but it belongs to the ****run detail*** route, not the bugs list.)
- `?modulePath={path}`*** invents an addressing scheme no route in this app uses.*** Every URL parameter shipped here is id-keyed (`?story=`, `?bugId=`, `?ac=`, `?outcome=`), and module selection in the explorer is already held as a UUID. A path is also not rename-stable and needs escaping for names containing a separator.

***Final destination contract******:***

| Entity | Destination |
| --- | --- |
| ATC | `/projects/{slug}/atcs/{atcId}` |
| Test | `/projects/{slug}/tests/{testId}` |
| Project | `/projects/{slug}` (slug-keyed; the only one of the six not keyed by UUID) |
| Module | `/projects/{slug}?module={moduleId}` |
| Bug | `/projects/{slug}/bugs/{bugId}` |
| Run | `/projects/{slug}/runs/{runId}` |

Supporting rules:

- The search response carries a typed route per result and the UI never infers one (the Dev decision on this point stands).
- URLs are built with `encodeURIComponent` on the slug exactly as `lib/notifications/entity-routes.ts` line 48 already does, for the same reason.
- ***Extend the existing switch in that file rather than forking a second mapper.*** It handles run, test and bug today; add atc, module and project. One map, two callers.
- Module deep-link behaviour: `?module={moduleId}` selects that module in the project explorer and expands its ancestors. An unknown or stale id falls back to the project root with nothing selected and ***no*** error, because a module can be deleted between the search and the click.

***Cost note for planning******:*** this correction deletes the "bugs highlight" list tweak from the 5-point estimate, since the destination route already exists. The estimate does not need raising.

---

### (c) Group order, per-group caps, tie-breaking — CORRECTED (23/25)

The self-ratified answer is internally contradictory: 5 per group across 6 groups is 30, but the stated total cap is 20. When every group is full, 10 results are dropped, and because groups render in a fixed canonical order the drops land ***entirely on Bugs and Runs***. That is exactly the silent group starvation the refinement flagged as edge case 13 and left unconfirmed.

| # | Candidate | Value | Consistency | Cost | Reversibility | Risk | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 5 per group, no independent total cap (natural ceiling 30) | 4 | 4 | 5 | 5 | 5 | ***23*** |
| 2 | 5 per group plus a 20 total, truncating in canonical order (as written) | 2 | 2 | 4 | 5 | 1 | 14 |
| 3 | 3 per group, ceiling 18 | 3 | 4 | 5 | 5 | 4 | 21 |
| 4 | 20 total allocated dynamically by cross-entity relevance | 3 | 1 | 1 | 3 | 2 | 10 |

***Winner******:****** candidate 1.**** Candidate 4 additionally fails on feasibility: it needs relevance scores comparable ****across*** entity types, which no source in this schema provides.

***Final grouping contract******:***

- ***Group order is canonical and fixed, never re-ordered by relevance******:*** ATCs, Tests, Projects, Modules, Bugs, Runs. Groups with no matches are omitted entirely, heading included.
- ***Cap******:****** 5 per group, with no separate total cap*** (natural ceiling 30). A group that hits its cap must say so with a non-interactive "+N more" count, so the member is told to narrow the query instead of being silently truncated. No pagination in v1.
- ***Order within a group******:****** relevance DESC, then ****`updated_at`**** DESC, then name ASC, then id ASC.*** The final id key is the correction: duplicate names are an explicit edge case on this story, and without a total order the same query returns different lists on different runs, which makes every cap test flaky.
- ***A simplification the builder should not miss******:**** because group order is fixed, relevance only has to be comparable ****within*** one entity type. Projects and Modules, which carry no tsvector today, may rank by a plain deterministic rule (prefix match ahead of substring match, then the tie-break chain). No cross-entity score normalisation is needed anywhere.

---

### (d) Loading, empty, error and timeout UX — RATIFIED (23/25)

| # | Candidate | Value | Consistency | Cost | Reversibility | Risk | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | As written: guidance below 2 chars, skeleton while loading with no stale results, explicit no-results, plain recoverable error, 8s timeout, latest-query-wins | 4 | 5 | 5 | 5 | 4 | ***23*** |
| 2 | Same, but with a monospace error code chip plus Retry | 3 | 2 | 3 | 4 | 3 | 15 |
| 3 | Same, but keep stale results dimmed while the next query loads | 3 | 3 | 4 | 4 | 2 | 16 |
| 4 | Same, but a shorter 5s timeout | 3 | 3 | 5 | 5 | 3 | 19 |

***Winner******:****** candidate 1.**** It matches every live list screen: a plain human sentence plus a Retry button (`components/bugs/BugsListView.tsx` lines 696-709, repeated in `ActivityView.tsx` lines 165-179 and the run views). Candidate 2 is specifically rejected: the monospace error-code pattern exists only in the ATC Library ****mockup's**** states strip and in the API error envelope, and appears on ****no shipped screen***. Under Critical Rule #14 the live UI is the fidelity source, so importing a mockup-only pattern here would make the palette the odd one out. Candidate 3 loses because stale results under a changed query are a mis-click hazard on a surface whose only action is navigation.

***Four additions that make the state contract measurable******:***

- The 8s is an ***abort ceiling, not a budget***. The p95 target for the union query is 400ms server-side. A palette that routinely takes seconds is a defect regardless of the ceiling being respected.
- The loading skeleton appears only after ***150ms*** of in-flight time, so a fast response never flashes it.
- The on-screen error copy is the plain sentence. The API envelope's machine codes (`validation*failed`, `internal*error`) stay in the response body for logs and ***never render to the member***.
- Retry re-issues the current query without closing the palette or clearing the input.

---

### (e) Focus restoration and unsaved-state preservation — CORRECTED, additively (24/25)

| # | Candidate | Value | Consistency | Cost | Reversibility | Risk | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Capture the active element on open, restore on close, portal preserves the tree (as written) | 4 | 4 | 5 | 5 | 3 | 21 |
| 2 | Always restore to the sidebar search control | 3 | 3 | 5 | 5 | 4 | 20 |
| 3 | Restore nothing, browser default | 1 | 1 | 5 | 5 | 1 | 13 |
| 4 | Candidate 1 plus an explicit fallback chain and a no-restore-on-navigation rule | 5 | 5 | 4 | 5 | 5 | ***24*** |

***Winner******:****** candidate 4.*** Candidate 1 is right but underspecified in the one case that actually breaks: the captured element can be gone from the DOM by the time the palette closes, and the written answer says nothing about it, so focus silently lands on `<body>` and a keyboard-only member is stranded (a WCAG 2.4.3 failure). Candidate 3 is listed only to be rejected on that ground.

***Final focus contract******:***

- On open, capture the currently focused element.
- On close ***without navigation**** (Escape or outside click), restore focus to that element ****if it is still in the document and still focusable***; otherwise fall back to the sidebar search control. This covers the Cmd+K-from-anywhere case, which has no DOM opener and is the common one.
- On close ***because a result was selected***, do not restore. Focus follows the destination screen. (This already stands as a business rule; it is kept.)
- The palette renders in a portal and ***never unmounts the route beneath it***, so an open form keeps its unsaved input, its caret position, its scroll position and its own modal state. Concretely testable: open the ATC editor, type without saving, press Cmd+K, press Escape, and the text and caret are unchanged.
- ***The palette's query is not preserved between openings in v1.*** Every open starts at the guidance state. A query left over from earlier is a mis-navigation hazard and there is no recent-items surface to hang it off yet. Cheap to revisit later.

---

### (f) Invocation keybinding — SETTLED CHORD, open behaviour DECIDED (24/25)

The chord itself is not open for re-derivation: the 2026-08-13 ruling retired `Cmd+K` from the ATC Library expressly to reserve it here, and `/` plus `Esc` belong to that screen. What the standing ruling never reached is three behaviour questions, which the self-ratified answer also left untouched.

| # | Candidate | Value | Consistency | Cost | Reversibility | Risk | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Cmd+K / Ctrl+K global with no exceptions (today's stub behaviour) | 3 | 3 | 5 | 5 | 1 | 17 |
| 2 | Cmd+K / Ctrl+K, local owners of the chord win, open-not-toggle, Escape and outside click close | 5 | 5 | 4 | 5 | 5 | ***24*** |
| 3 | Add `/` as a second global trigger | 2 | 1 | 4 | 4 | 1 | 12 |
| 4 | Move the palette to Cmd+P and give Cmd+K back to the editor | 2 | 1 | 3 | 3 | 2 | 11 |

***Winner******:****** candidate 2.*** Candidate 3 directly contradicts the standing ruling and would fire on the very screen that owns `/`. Candidate 4 reopens a settled ruling and orphans the shipped `Cmd K` key chips in the sidebar, which are the mockup's own affordance.

***Candidate 1 is today's live behaviour and it carries a real collision******:**** the Markdown editor binds Cmd+K to insert-link (`components/markdown/markdown-editor.tsx` lines 82-83, tooltip "Link (Cmd/Ctrl+K)"), while the palette listens on `window`. A member writing a bug repro who presses Cmd+K for a link currently gets the link affordance ****and*** the palette on top of it. That is a defect waiting to be filed, and it is the same class of two-behaviours-on-one-chord problem the ATC Library retirement existed to prevent.

***Final keybinding contract******:***

- ***Cmd+K on macOS, Ctrl+K elsewhere, and nothing else.*** `/` is not bound globally; it stays the ATC Library's.
- ***Open, not toggle.*** If the palette is already open, the chord keeps it open, refocuses the input and selects the existing text. Escape and outside click are the documented close paths.
- ***One scoped exception******:*** when the keystroke originates inside an element that owns Cmd+K for its own editing command (today only the Markdown editor textarea), the local handler wins and the palette does not open. Implement by having the owning component stop propagation, not by hardcoding a component list inside the palette.
- The sidebar control keeps its visible key chips and its "Search or jump to…" label. It is the mockup's own affordance and the second entry path in AC-02.
- ***Exactly one visible palette affordance in the shell.**** Remove the second trigger currently rendered in the project topbar (`project-shell.tsx` line 115): it sits immediately beside the in-page ATC search filter (line 113), and two adjacent search boxes on one toolbar teach the wrong mental model. Cmd+K already works on every project route. This also resolves the duplicate-overlay scenario structurally, instead of by the hand-rolled `ownsHotkey` flag, and it moves ****toward*** the mockup, which places search in the sidebar only.

---

### Glossary compliance (`.context/business/domain-glossary.md`)

No §4 anti-glossary violation exists in the current AC text. Four corrections are still required:

1. ***The shipped stub's placeholder is now wrong.*** `components/layout/CommandPalette.tsx` reads "Search ATCs, modules, user stories…", naming an entity type the settled 2026-08-12 decision deferred. It must become the AC-06 guidance string: "Search ATCs, tests, projects, modules, bugs, and runs in this workspace".
2. ***The Business Rules field contradicts the schema and its own AC.*** It says a result appears only if the viewer holds permission "(project membership)". There is no `project_members` table anywhere in this schema; membership exists only at workspace grain, which AC-08 scenario 8.2 already states correctly. Left as-is, that bullet sends the builder hunting for a table that does not exist. Rewrite to: "...permission to see the underlying entity (active membership in the workspace that owns it)".
3. ***Group headings and result context use the §3 headwords******:****** ATC, Test, Project, Module, Bug, Run.*** Not the sidebar navigation labels "Bug Reports" and "Test Runs", and not "defect record". This follows the glossary's own §5 rule that new ACs use the §3 term rather than whichever string a given screen renders.
4. ***The overlay is the "command palette" throughout.*** Never "search bar", which names the ATC Library's in-page filter, and never "omnibox".

---

### Design contract position (Critical Rule #15)

BK-398 has no §8 row in `master-design-plan.md` and no mockup screen in any of the ten mockup batches, and none is being authored. Ratified position: ***the palette renders into the existing App Shell (§3) as an overlay above the current route****, entered from the already-shipped sidebar search control, which the mockup does specify (§3 row "Search ⌘K"). The mockup gives the affordance but never draws the overlay it opens, so this is a deliberate ****spec-only divergence***, recorded below as D33. It is not a departure to correct later.

***Frozen §2 tokens to reuse, with nothing new invented******:*** surfaces `bg-1` / `bg-2` for the overlay card over a `bg-0` scrim; strokes 1 and 2; text `fg-0` / `fg-2` / `fg-3`; radii 10px card and 5px rows; the `pop` shadow; Inter at the 13px/1.45 base; JetBrains Mono for entity ids; the `.kbd` atom for the key chips, `.layer-chip` for an ATC's layer and `.dot` for status; `--accent` and `--accent-soft` for the active row only. No new colours, radii or fonts.

***Live components to reuse (Critical Rule #14)******:*** rewrite `components/layout/CommandPalette.tsx` in place, preserving its `data-testid`; the existing `ui/input.tsx` and `ui/button.tsx`; `lib/hooks/use-modal-dismiss.ts` for Escape and outside-click; `lib/notifications/entity-routes.ts` extended, not forked; the debounce plus AbortController idiom in `atc-search-filter.tsx` lines 32-77; and the colocated-skeleton plus plain-sentence-error plus Retry shape from `BugsListView.tsx` lines 696-721. `cmdk` is already a dependency at `^1.1.1` and is the intended list and keyboard engine.

***The implementing agent must add both rows below to ****`master-design-plan.md`**** before UI work starts.*** Text is final; paste verbatim.

***§8 row*** (under the BK-7 Project & Module Hierarchy block, after the BK-266 row, leading cell intentionally empty):

```
| | BK-398 Command Palette — search and jump across the workspace | ***Shell*** — command-palette overlay (§3 "Search ⌘K" row; no screen of its own, spec-only — D33) | §3 · §5 D33 · `app.jsx` sidebar search control (affordance only, no palette mockup) |
```

***§5 divergence row*** (append after D32):

```
| D33 | Command palette (BK-398) ships with no mockup screen — the overlay's layout, grouping and states are specified in the ticket's AC, not drawn in any of the ten mockup batches | ***UI**** | ****Spec-only, ratified 2026-08-15 (AI Product Owner).**** The mockup specifies the **affordance** (§3 "Search ⌘K" = full-width sidebar button, shipped in `AppSidebar.tsx`) but never the overlay it opens. Per Critical Rule #14 the live UI is the fidelity source: rewrite `components/layout/CommandPalette.tsx` in place on `cmdk@^1.1.1`, reuse frozen §2 tokens only (`bg-1`/`bg-2` card on a `bg-0` scrim, strokes 1/2, `fg-0`/`fg-2`/`fg-3`, radii 10/5px, `pop` shadow, Inter 13px, JetBrains Mono for ids, `.kbd` / `.layer-chip` / `.dot` atoms), and reuse the live list-screen loading/empty/error shape (colocated skeleton, plain-sentence error + Retry, `BugsListView.tsx`) — ****no monospace error-code chip***, that pattern exists only in the §4.9 mockup and on no shipped screen. Not a departure to correct later: the palette is an app-shell overlay and a mockup for it is not required before build. Supersedes nothing. |
```

---

### One flag, outside this ruling's remit

The Dev resolution gives the new search endpoint browser-cookie auth only, returning 403 to a PAT. That is a defensible v1 posture, but it means an agent or CLI cannot use cross-entity search at all, which touches the per-route PAT capability work tracked separately. Flagged for the AI Tech Lead, not decided here, and ***not a blocker for this story***.

### Status

BK-398 stays where it is. This ruling changes no status, no assignee and no estimate. The 5-point estimate stands; correction (b) removes one of its two list tweaks.

---


_Synced from Jira by sync-jira-issues_
