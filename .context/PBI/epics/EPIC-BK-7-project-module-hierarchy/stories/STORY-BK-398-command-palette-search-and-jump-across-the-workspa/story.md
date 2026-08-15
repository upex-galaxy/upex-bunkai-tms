# Command Palette | Search and jump across the workspace

**Jira Key:** [BK-398](https://jira.upexgalaxy.com/browse/BK-398)
**Epic:** [BK-7](https://jira.upexgalaxy.com/browse/BK-7) (Project & Module Hierarchy)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 5

---

## Overview

***Source spec******:*** FR-031

## User story

***As a*** Senior QA Engineer
***I want to*** search and jump to any ATC, Test, Project, Module, Bug, or Run from a single keyboard-driven overlay, no matter which screen I am on
***So that*** I can move through the workspace without hunting through nested project trees or memorizing routes

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

## Technical notes

### Current state (verified at `origin/staging@4924f48`)

`components/layout/CommandPalette.tsx` already ships the shell of this feature: the ⌘K / Esc key handler (lines ~44-60), the open/close state contract (controlled + uncontrolled), and both mount points — `project-shell.tsx:115` (`<CommandPalette ownsHotkey={false} />`, topbar) and `AppSidebar.tsx:746` (`<CommandPalette trigger={false} open={paletteOpen} onOpenChange={setPaletteOpen} />`, the hotkey owner, driven by the sidebar's own search button). What is missing is everything behind the input: line 95 renders the literal placeholder string "Command palette is a stub. Wire up cmdk + fuzzy search in Phase D." `cmdk` (`package.json:64`, `^1.1.1`) is a declared dependency with zero imports repo-wide (`components/tests/AtcChainPicker.tsx:37` notes the same gap). This story wires the real search behavior into the existing shell and mount points; it does not re-architect how or where the palette opens.

### Design note — no dedicated mockup (spec-only, per Critical Rule #14)

`.context/design/master-design-plan.md` §4 describes the global App Shell (sidebar + topbar) but draws no dedicated screen for the command palette overlay itself — it is a cross-cutting affordance, not a routed screen with its own §8 US→Screen row. Per Critical Rule #14 (LIVE-UI-FIRST), the live `CommandPalette.tsx` markup (overlay container, input styling, `.kbd` hint chips) is the fidelity source for this story, used as-is; the only visual work is populating the results area beneath the existing input. This mirrors the same spec-only path Activity (BK-49) and other cross-cutting, mockup-less screens took in §5 of the design plan — built against `DESIGN.md`'s frozen §2 tokens plus the component's own existing markup, no new colors/radii/fonts/spacing invented.

---

## QA Refinements (Shift-Left Analysis) — Added 2026-08-14

> Refined Acceptance Criteria live in the `acceptance_criteria` field.

### Edge Cases Identified

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

### Clarified Business Rules

1. Search is scoped to the active workspace at query time (active-workspace selection), and project membership may further narrow results.
2. A minimum query length gates search requests; behavior for empty and below-threshold queries is a defined guidance state.
3. Search is debounced; the interval is not yet defined and may be implementation-only.
4. Keyboard traversal highlights only selectable results; group headings are never focused. Wrapping behavior is not yet defined.
5. Focus restoration after dismissal depends on the entry point (Cmd/Ctrl+K, sidebar, topbar); underlying modal/form state must be preserved.
6. Async search must distinguish loading, no-results, and recoverable failure states; a stale response must never overwrite the latest query.

### Critical Questions for PO

1. ***What are the exact matching semantics and minimum query threshold?***
2. ***What exact destination and identifying context must be used for each of the six entity types?***
3. ***What is the expected grouped-result policy?***
4. ***What must the user see while a qualifying search is loading or when the search source fails?***

### Technical Questions for Dev

1. ***Will BK-398 introduce a dedicated union-search API/RPC, or aggregate entity-specific sources?*** The current code exposes separate entity routes and direct server-component queries; the choice controls contract, latency, auth, and test isolation.
2. ***What is the authoritative active-workspace and permission filter for the search request?*** Confirm server-side enforcement, especially for users belonging to multiple workspaces and projects they cannot access.
3. ***How will stale requests, debounce, loading, timeout, and cancellation be handled?*** The latest query must not be overwritten by an older response.
4. ***How will result selection map to exact routes, particularly Modules and Runs?*** Provide route builders or a stable typed destination field in the response.
5. ***What fixture/seed path will provide all six entity types, two workspaces, and restricted visibility?*** Without it, critical data-isolation coverage is not repeatable.
6. ***How will focus restoration work across the two existing palette mounts and underlying modals/forms?*** The current shell opens the input but does not define opener refs or focus-return behavior.

> Full refinement (Phases 1-5, outline DRAFT, risk + data feasibility) lives in the ATP DRAFT custom field.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Improvement (1)

- [BK-265](https://jira.upexgalaxy.com/browse/BK-265): App Shell | Reach Runs, Bugs and Metrics from a project sub-nav _(Ready For QA)_

---

## Metadata

- **Created:** 8/12/2026
- **Updated:** 8/15/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** app-shell, command-palette, navigation, shift-left-2026-08-14, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
