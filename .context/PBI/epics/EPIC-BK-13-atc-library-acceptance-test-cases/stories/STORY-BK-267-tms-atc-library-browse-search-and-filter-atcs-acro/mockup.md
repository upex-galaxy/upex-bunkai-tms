# BK-267 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-267)

# ATP DRAFT — BK-267: TMS-ATC Library | Browse, search, and filter ATCs

> ***Shift-Left ATP DRAFT*** | Mode: Pre-Sprint | Refined: 2026-08-07 | QA: Facu Barea
ACs source: `✅ Acceptance Criteria (Gherkin)` field — 14 blocks, 19 scenarios (confirmed PO source of truth).
This is a PRE-SPRINT DRAFT — outlines only, no test code. Execution scope confirmed at sprint planning.

---

## Coverage Estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 9 | Browse, incremental search, keyboard shortcuts x3, filter combos, clear-all, navigate+toast, single-project |
| Negative | 5 | Empty workspace, no-match search+filter, failed load (error state), loading state, unauthenticated access |
| Boundary | 4 | Esc clears search, "Clear all" resets all, hundreds of ATCs (no cap), single ATC in workspace |
| Security / Integration | 4 | Access control (inaccessible project), workspace isolation (API), workspace isolation (DB), "Coming soon" items unaffected |
| ***Total**** | ****22*** | Grounded in 14 confirmed ACs. Decision Table for Project+Module+layer filter combo covered by AC-05 outline. |

---

## Test Outlines (Names Only — No Test Code)

### Positive

- Should show dense list of all accessible ATCs across projects with no filter applied
- Should narrow list incrementally with each character typed in the search field
- Should move focus to the search field when "/" is pressed
- Should move focus to the search field when Cmd+K / Ctrl+K is pressed
- Should narrow list to ATCs matching all three active filters simultaneously (Project + Module + layer)
- Should narrow list to ATCs matching both an active Module filter and a typed search term
- Should restore full list when "Clear all" is triggered
- Should navigate to owning project context with a toast when an ATC row is opened
- Should render list and filters correctly in a single-project workspace

### Negative

- Should show explicit "nothing found" empty state (not error) when no ATC matches search + filters
- Should show same "nothing found" empty state when workspace has zero ATCs
- Should show named error state with retry path when ATC index fails to load
- Should show loading state (no partial/stale data) while ATCs are being fetched
- Should redirect to login (or 401) when ATC Library URL accessed without authentication

### Boundary

- Should clear search term and reflect remaining filters when Esc is pressed
- Should allow reaching every ATC in a workspace with hundreds of ATCs (no silent cap)
- Should show correct empty state (not infinite spinner) when workspace has exactly zero ATCs
- Should display single ATC correctly with full row data

### Security / Integration

- Should NEVER show an ATC from a project the user is not a member of
- Should NOT return ATCs from a different workspace (API-level assertion)
- Should NOT expose cross-workspace ATCs at DB level (RLS assertion)
- Should leave "Test Runs", "Bug Reports", and "Metrics" sidebar items unchanged as "Coming soon"

---

## Pending Questions — Block Sprint Planning

1. ***What does "every ATC in the workspace" mean?*** — All projects, or only user-accessible projects? Impact: workspace isolation design and test coverage change significantly.
2. ***Which filter dimensions are in scope?*** — Project, Module, layer confirmed by ACs. Are Status, Tags, or others also in scope?
3. ***Is the design file available?*** — `.context/designs/.../atc-library-global.html` does not exist locally. UI assertions are ungrounded without it.
4. ***What does the sidebar badge count represent?*** — Total workspace ATCs, user-accessible ATCs, or filtered count?
5. ***Is there pagination or an upper limit on results?*** — AC-02 says "no cap"; confirm page-size boundary for BVA.

## Pending Questions — Block Implementation

1. ***Will ****`GET /api/v1/atcs/search`**** have ****`project*id`**** made optional, or is there a new endpoint?*** — Current endpoint requires `project*id` (BK-20 contract). Cross-project search needs a defined API surface.
2. ***What is the canonical route for the ATC Library?*** — `app/(app)/` has no `/atc-library` route yet.
3. ***Does clicking a Library row navigate in the same tab or open a new tab?***
4. ***Is filter state preserved when the user navigates away and returns (browser Back)?***
5. ***Does the sidebar badge reflect real-time or cached count?***

---

## Risk Register

| Risk | Likelihood | Impact | Covered by |
| --- | --- | --- | --- |
| Cross-workspace data leak (RLS misconfiguration) | Medium | Critical | Security outline — API + DB level |
| Project-removal not reflected in library (stale RLS) | Low | High | Access control outline |
| API endpoint not built — story ships with project-scoped fallback | Medium | High | Integration outline (cross-project positive) |
| XSS via ATC title in table render | Low | High | Security: special chars / XSS outline |
| Empty state missing or shows error on zero ATCs | Medium | Medium | Negative outlines 1 + 2 |

---
_Synced from Jira by sync-jira-issues_
