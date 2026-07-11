# BK-49 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-49)

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
_Synced from Jira by sync-jira-issues_
