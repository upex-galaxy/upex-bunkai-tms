# EPIC: Project & Module Hierarchy

**Jira Key:** [BK-7](https://upexgalaxy67.atlassian.net/browse/BK-7)
**Priority:** Medium
**Status:** Planning
**Total Story Points:** 5

---

## Description

# Project & Module Hierarchy

## Wave

***Wave 2*** — Project + Module hierarchy. Substrate for User Stories, ATCs, Tests, Bugs. Builds the materialized `modules.path` column + tree-rebuild query (FR-029) that every downstream screen reads. See `.context/master-implementation-plan.md` §5.

## Overview

Defines the second-layer scoping of Bunkai's data model. Inside every Workspace, users create Projects (one Project = one application / product under test). Inside every Project, users define a tree of Modules (and sub-modules) that organize the test repository by product area (Login, Payment, Dashboard, etc.).

## Why Modules Are First-Class Entities (Not Folders)

Modules are real DB entities, not strings. Every other artifact in Bunkai (User Stories, ATCs, Tests, Runs, Bugs) anchors to a Module. Metrics (defect heatmap, coverage) are computed per Module. Renaming or moving a Module preserves all anchored data via foreign keys — no string-rewrite operation.

## Business Value

The Module hierarchy is the spine of every dashboard, every coverage report, every defect heatmap. Without this epic, no other epic can persist or display data with the structural traceability that is Bunkai's differentiator.

## In Scope (MVP)

- Create a Project inside a Workspace (name, slug, optional description)
- Create / nest Modules under a Project (up to depth 6, soft warning at depth 4)
- Rename a Module
- Move a Module to a different parent (with cycle-detection + depth guard + path rebuild)
- Soft-delete a Module (cascade soft-delete to descendant Modules + linked entities via `archived_at`)
- Materialized `path` column on Modules for tree queries

## Out of Scope (Phase 2 / Phase 3)

- Project deletion / archival flow — backlog post-MVP
- Module reorder via drag-and-drop UI on tree view — Phase 2 (covered in EPIC-BK-008)
- Module templates / cloning — Phase 2
- Cross-project module reference — explicit anti-feature

## Acceptance Criteria (Epic Level)

1. A workspace member can create a Project; the auto-derived slug is unique within the workspace.
2. A project member can create a Module under a Project; the Module exists in the DB and renders in the tree.
3. A project member can create a sub-module up to depth 6; depth >6 is rejected with code `MODULE*DEPTH*EXCEEDED`.
4. A project member can rename a Module without breaking any anchored data (US, ATCs, Tests, Bugs, Runs).
5. A project member can soft-delete a Module; all descendant modules and anchored entities have `archived_at` set in the same transaction.
6. A project member can move a Module to a different parent; the system detects and rejects circular ancestry with code `MODULE*CIRCULAR*PARENT`.

## Related Functional Requirements

- FR-005 — Project creation
- FR-006 — Module CRUD with nesting
- FR-029 — Tree view query (consumes `modules.path`)

See: `.context/SRS/functional-specs.md`.

## Technical Considerations

- ***Tables involved:*** `projects`, `modules`. `modules` has a materialized `path` column (e.g. `/cart/add-to-cart`) for efficient subtree queries.
- ***Cascade rule:*** soft-delete propagates via `archived_at` to descendant Modules + child entities (US, ATCs, Tests anchored to those Modules). Bugs follow because they reference Module via foreign key.
- ***Cycle detection:*** when moving a Module to a new parent, verify the new parent is not a descendant of the moved Module.
- ***RLS:*** project membership scoped via `workspace_members` → `workspaces` → `projects`.

## Dependencies

- ***External:*** Supabase (Postgres 16) for the DB and RLS.
- ***Internal:*** EPIC-BK-001 (Tenancy & Identity) — needs Workspace + active membership.
- ***Blocks:*** EPIC-BK-003 (User Stories anchor to Modules), EPIC-BK-004 (ATCs anchor to Modules), EPIC-BK-007 (Bugs anchor to Modules), EPIC-BK-008 (tree view needs Module hierarchy).

## Success Metrics

- Module tree of depth 4 with 50 nodes renders in < 200ms on staging (subtree query benchmark).
- Soft-delete of a Module with 20 descendant entities runs in a single transaction with no orphan rows post-rollback test.

## Risks & Mitigations

- Circular parent introduced via concurrent edits — data corruption — Low probability — mitigated by cycle-detection inside the move transaction; PG constraint as belt + suspenders.
- Deep tree (>6) breaks tree rendering — UX degradation — Low probability — mitigated by hard cap at depth 6 enforced at API; soft warning at depth 4 surfaced to client.
- Materialized `path` drift after parent moves — stale queries / metrics — Medium probability — mitigated by path rebuild covered by trigger on move; integration test asserts no drift after 1000 random moves.

## Testing Strategy

See per-story `story.md` for Gherkin acceptance criteria.

### Test Coverage Requirements

- Unit: cycle-detection algorithm, slug derivation, path-rebuild logic.
- Integration: full CRUD lifecycle of a 4-depth subtree; soft-delete cascade.
- E2E (Playwright): user creates Project → Modules → sub-modules in tree view.

## Notes

- This epic is the structural foundation everything else hangs off. Quality here pays compound interest across the rest of the MVP.
- Self-hosted edition (Phase 2): same schema migrates; only the runtime swaps from Supabase to Postgres-in-Docker.

---

## User Stories

| Key | Story | Points | Priority | Status |
| --- | ----- | ------ | -------- | ------ |
| [BK-8](https://upexgalaxy67.atlassian.net/browse/BK-8) | Create a Project inside a Workspace | 5 | Medium | Ready For Dev |
| [BK-9](https://upexgalaxy67.atlassian.net/browse/BK-9) | Create Modules (with nested sub-modules) inside a Project | - | Medium | Shift-Left QA |
| [BK-10](https://upexgalaxy67.atlassian.net/browse/BK-10) | Rename and soft-delete a Module (with cascade) | - | Medium | Shift-Left QA |
| [BK-11](https://upexgalaxy67.atlassian.net/browse/BK-11) | Move a Module to a different parent (with cycle-detection + path rebuild) | - | Medium | Shift-Left QA |

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/21/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** mvp, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:47.769Z_
