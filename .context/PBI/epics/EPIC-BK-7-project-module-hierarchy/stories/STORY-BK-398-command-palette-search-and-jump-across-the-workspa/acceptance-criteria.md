# BK-398 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-398)

# Acceptance Criteria — BK-398: Command Palette | Search and jump across the workspace (Final — PO/Dev resolved)

## AC-01 — Open via the keyboard shortcut

### Scenario 1.1: Open the command palette with Cmd+K from an app-shell screen (Positive)

- ***Given***: An authenticated member is on an app-shell screen and the palette is closed.
- ***When***: The member presses Cmd+K on macOS.
- ***Then***: One command-palette overlay is visible, the input is focused, and the current route and underlying state are unchanged.

### Scenario 1.2: Open the command palette with Ctrl+K on non-macOS (Positive)

- ***Given***: An authenticated member is on an app-shell screen and the palette is closed.
- ***When***: The member presses Ctrl+K on a non-macOS browser context.
- ***Then***: One command-palette overlay is visible and the input is focused without navigating.

### Scenario 1.3: Avoid duplicate palettes when multiple shell mounts receive Cmd/Ctrl+K (Negative)

- ***Given***: The sidebar palette trigger and the project topbar trigger are both present (single `CommandPaletteProvider` instance).
- ***When***: The member presses the platform shortcut once.
- ***Then***: Exactly one overlay is rendered and one input receives focus; the two triggers never produce duplicate overlays.

## AC-02 — Open via the sidebar search control

### Scenario 2.1: Open the command palette from the sidebar search control (Positive)

- ***Given***: An authenticated member is on any app-shell screen and the palette is closed.
- ***When***: The member activates the sidebar search control.
- ***Then***: The same command-palette overlay is visible, the input is focused, and the current route is unchanged.

### Scenario 2.2: Restore focus to the sidebar search control after dismissal (Edge)

- ***Given***: The palette was opened from the sidebar search control.
- ***When***: The member presses Escape or clicks outside the overlay without selecting a result.
- ***Then***: The palette closes and focus returns to the sidebar search control.

## AC-03 — Results grouped by entity type

### Scenario 3.1: Group matching results under the six in-scope entity headings (Positive)

- ***Given***: The active workspace contains permitted matches for ATCs, Tests, Projects, Modules, Bugs, and Runs.
- ***When***: The member enters a qualifying query (≥2 chars) that matches more than one entity type.
- ***Then***: Results are grouped in the canonical order ATCs, Tests, Projects, Modules, Bugs, Runs; empty groups are omitted; each result identifies its entity type and project context; User Stories/Milestones never appear.

### Scenario 3.2: Distinguish same-named results across projects and entity types (Positive)

- ***Given***: Two permitted results share the same display name but belong to different entity types or projects.
- ***When***: The member searches for that name.
- ***Then***: Each result shows context as `{entity type} · {project} · {name}` so the intended entity is selectable.

### Scenario 3.3: Apply keyword matching semantics consistently (Boundary)

- ***Given***: The active workspace contains names exercising valid, partial, case-variant, and multi-token queries at and above the 2-char threshold.
- ***When***: The member searches each partition with a query of 2+ chars.
- ***Then***: Single-token queries match by prefix; multi-token queries require all tokens (AND); matching is case-insensitive and accent-sensitive (v1 parity with `bunkai*search*atcs`).

### Scenario 3.4: Omit deferred User Story and Milestone results (Negative)

- ***Given***: The active workspace contains User Stories and Milestones whose names match the query.
- ***When***: The member searches for those names.
- ***Then***: No User Story or Milestone group/result is returned because both are explicitly out of scope for BK-398.

## AC-04 — Selecting a result navigates

### Scenario 4.1: Navigate to the selected ATC screen and close the palette (Positive)

- ***Given***: A permitted ATC result is visible.
- ***When***: The member selects it.
- ***Then***: The palette closes and the browser navigates to `/projects/{slug}/atcs/{atcId}`.

### Scenario 4.2: Navigate to each in-scope entity's exact destination (Integration)

- ***Given***: A permitted result exists for each of ATC, Test, Project, Module, Bug, and Run.
- ***When***: The member selects one result from each type.
- ***Then***: Each selection closes the palette and lands on the entity's destination per the contract: ATC `/projects/{slug}/atcs/{atcId}`, Test `/projects/{slug}/tests/{testId}`, Project `/projects/{slug}`, Module `/projects/{slug}?modulePath={path}`, Bug `/projects/{slug}/bugs?bugId={bugId}`, Run `/projects/{slug}/runs/{runId}`.

### Scenario 4.3: Do not navigate when a result is inaccessible (Negative)

- ***Given***: A result becomes inaccessible before activation or the destination returns not-found/forbidden.
- ***When***: The member selects that result.
- ***Then***: The application does not disclose the entity and shows a recoverable navigation/error state.

## AC-05 — Keyboard-only operation

### Scenario 5.1: Move the active result with ArrowDown and select it with Enter (Positive)

- ***Given***: The palette is open with at least two selectable results.
- ***When***: The member presses ArrowDown and then Enter.
- ***Then***: The active item moves according to the defined traversal order, Enter selects that item, the palette closes, and the correct entity screen opens.

### Scenario 5.2: Move backward with ArrowUp without selecting group headings (Boundary)

- ***Given***: The palette is open with multiple groups and results.
- ***When***: The member presses ArrowUp/ArrowDown across group boundaries.
- ***Then***: Only selectable result items receive the active state; traversal wraps and group headings are never focused.

### Scenario 5.3: Close with Escape without navigation (Negative)

- ***Given***: The palette is open on a known route.
- ***When***: The member presses Escape.
- ***Then***: The palette closes, the route remains unchanged, underlying input/modal state is preserved, and focus returns to the opener where applicable.

## AC-06 — Empty-query state

### Scenario 6.1: Show search guidance before any query is entered (Positive)

- ***Given***: The member opens the palette and the input is empty.
- ***Then***: Guidance identifies the searchable scope ("Search ATCs, tests, projects, modules, bugs, and runs in this workspace"), no entity-type result groups are shown, and no search request is sent.

### Scenario 6.2: Suppress search below the 2-char minimum (Boundary)

- ***Given***: The palette is open and the minimum query length is 2 characters.
- ***When***: The member enters a 1-character query.
- ***Then***: No search request is sent and the palette remains in the guidance state.

### Scenario 6.3: Begin search at the 2-char boundary (Boundary)

- ***Given***: The palette is open and the minimum query length is 2 characters.
- ***When***: The member enters a 2-character query.
- ***Then***: A 250ms-debounced search begins and the UI transitions to loading/results/no-results according to the response.

## AC-07 — No-results state

### Scenario 7.1: Display an explicit no-results state for an unmatched query (Negative)

- ***Given***: The palette is open and the query meets the 2-char minimum.
- ***When***: The search returns no permitted entity across all six types.
- ***Then***: An explicit "No results for 'query'" message is shown, no entity group headings are rendered, and the UI does not present the state as an operational error.

### Scenario 7.2: Distinguish backend failure from no results (Negative)

- ***Given***: The palette is open with a qualifying query.
- ***When***: The search source fails or times out after 8s.
- ***Then***: A recoverable error state ("Search failed. Try again.") distinct from no results is shown and the query remains available for retry.

### Scenario 7.3: Render only the latest query response (Integration)

- ***Given***: The member changes from query A to query B before query A completes.
- ***When***: Query A resolves after query B.
- ***Then***: Query A is aborted/discarded and does not overwrite the results or state for query B.

## AC-08 — Workspace scoping

### Scenario 8.1: Return only current-workspace results (Negative)

- ***Given***: The member belongs to Workspace A and Workspace B, with matching entities in both, and Workspace A is active.
- ***When***: The member searches for the shared term.
- ***Then***: Only Workspace A entities appear; Workspace B names, identifiers, and context are not disclosed.

### Scenario 8.2: Exclude entities when membership is not active (Negative)

- ***Given***: The member's membership in the active workspace is suspended/inactive while matching entities exist.
- ***When***: The member searches.
- ***Then***: No results are returned and the existence of the workspace's entities is not disclosed. (Per-project visibility restrictions do not apply — all workspace members can access all projects in v1.)

### Scenario 8.3: Re-scope on active-workspace change (Integration)

- ***Given***: The palette is open while a search for Workspace A is in flight.
- ***When***: The active workspace changes to Workspace B.
- ***Then***: The palette clears to guidance, the in-flight Workspace A request is aborted/discarded, and Workspace A results are never rendered after the switch.

---
_Synced from Jira by sync-jira-issues_
