# Project & Module Hierarchy

**Jira Key:** BK-7
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-7
**Status:** Backlog
**Priority:** Medium
**Phase:** Wave 1 — Foundation
**Labels:** mvp, wave-1

---

## Epic Description

Defines the second-layer scoping of Bunkai's data model. Inside every Workspace, users create Projects (one Project = one application / product under test). Inside every Project, users define a tree of Modules (and sub-modules) that organize the test repository by product area (Login, Payment, Dashboard, etc.).

### Why Modules Are First-Class Entities (Not Folders)

Modules are real DB entities, not strings. Every other artifact in Bunkai (User Stories, ATCs, Tests, Runs, Bugs) anchors to a Module. Metrics (defect heatmap, coverage) are computed per Module. Renaming or moving a Module preserves all anchored data via foreign keys — no string-rewrite operation.

**Business Value:** The Module hierarchy is the spine of every dashboard, every coverage report, every defect heatmap. Without this epic, no other epic can persist or display data with the structural traceability that is Bunkai's differentiator.

---

## User Stories

1. **BK-8** — As a Workspace member, I want to create a Project inside a Workspace so I can organize different applications / products under their own roof. → `stories/STORY-BK-8-create-project/story.md`
2. **BK-9** — As a Project member, I want to define Modules (and nested sub-modules up to depth 6) so the test repository is organized by product area. → `stories/STORY-BK-9-create-modules/story.md`
3. **BK-10** — As a Project member, I want to rename and soft-delete a Module so the structure stays accurate as the product evolves. → `stories/STORY-BK-10-rename-delete-module/story.md`
4. **BK-11** — As a Project member, I want to move a Module to a different parent (with circular-parent detection + depth guard) so I can restructure without breaking the tree. → `stories/STORY-BK-11-move-module/story.md`

---

## Scope

### In Scope

- Create a Project inside a Workspace (name, slug, optional description)
- Create / nest Modules under a Project (up to depth 6, soft warning at depth 4)
- Rename a Module
- Move a Module to a different parent (with cycle-detection + depth guard + path rebuild)
- Soft-delete a Module (cascade soft-delete to descendant Modules + linked entities via `archived_at`)
- Materialized `path` column on Modules for tree queries

### Out of Scope (Phase 2 / Phase 3)

- Project deletion / archival flow — backlog post-MVP
- Module reorder via drag-and-drop UI on tree view — Phase 2 (covered in EPIC-BK-008)
- Module templates / cloning — Phase 2
- Cross-project Module reference — explicit anti-feature

---

## Acceptance Criteria (Epic Level)

1. A workspace member can create a Project; the auto-derived slug is unique within the workspace.
2. A project member can create a Module under a Project; the Module exists in the DB and renders in the tree.
3. A project member can create a sub-module up to depth 6; depth >6 is rejected with code `MODULE_DEPTH_EXCEEDED`.
4. A project member can rename a Module without breaking any anchored data (US, ATCs, Tests, Bugs, Runs).
5. A project member can soft-delete a Module; all descendant Modules and anchored entities have `archived_at` set in the same transaction.
6. A project member can move a Module to a different parent; the system detects and rejects circular ancestry with code `MODULE_CIRCULAR_PARENT`.

---

## Related Functional Requirements

- **FR-005** — Project creation
- **FR-006** — Module CRUD with nesting

See: `.context/SRS/functional-specs.md` § EPIC-BK-002.

---

## Technical Considerations

- **Tables involved:** `projects`, `modules`. Modules has a materialized `path` column (e.g. `/cart/add-to-cart`) for efficient subtree queries.
- **Cascade rule:** soft-delete propagates via `archived_at` to descendant Modules + child entities (US, ATCs, Tests anchored to those Modules). Bugs follow because they reference Module via foreign key.
- **Cycle detection:** when moving a Module to a new parent, verify the new parent is not a descendant of the moved Module.
- **RLS:** project membership scoped via `workspace_members → workspaces → projects`.

---

## Dependencies

### External

- Supabase (Postgres 16) for the DB and RLS.

### Internal

- **EPIC-BK-1** (Tenancy & Identity) — needs Workspace + active membership.

### Blocks

- **EPIC-BK-3** (User Stories anchor to Modules).
- **EPIC-BK-4** (ATCs anchor to Modules).
- **EPIC-BK-7** (Bugs anchor to Modules).
- **EPIC-BK-8** (tree view needs Module hierarchy).

---

## Success Metrics

- Module tree of depth 4 with 50 nodes renders in < 200ms on staging (subtree query benchmark).
- Soft-delete of a Module with 20 descendant entities runs in a single transaction with no orphan rows post-rollback test.

---

## Risks & Mitigations

| Risk                                                | Impact            | Probability | Mitigation                                                                                  |
| --------------------------------------------------- | ----------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Circular parent introduced via concurrent edits     | Data corruption   | Low         | Cycle-detection runs inside the move transaction; PG constraint as belt + suspenders        |
| Deep tree (>6) breaks tree rendering                | UX degradation    | Low         | Hard cap at depth 6 enforced at API; soft warning at depth 4 surfaced to client             |
| Materialized path drift after parent moves          | Stale queries / metrics | Medium | Path rebuild covered by trigger on move; integration test asserts no drift after 1000 random moves |

---

## Testing Strategy

See per-story `story.md` for Gherkin acceptance criteria.

### Test Coverage Requirements

- **Unit:** cycle-detection algorithm, slug derivation, path-rebuild logic.
- **Integration:** full CRUD lifecycle of a 4-depth subtree; soft-delete cascade.
- **E2E (Playwright):** user creates Project → Modules → sub-modules in tree view.

---

## Notes

- This epic is the structural foundation everything else hangs off. Quality here pays compound interest across the rest of the MVP.
- Self-hosted edition (Phase 2): same schema migrates; only the runtime swaps from Supabase to Postgres-in-Docker.

---

## Related Documentation

- **PRD:** `.context/PRD/mvp-scope.md` (EPIC-BK-002, US 2.1–2.3)
- **SRS:** `.context/SRS/functional-specs.md` (FR-005, FR-006)
- **Architecture:** `.context/SRS/architecture-specs.md`
- **API Contracts:** `.context/SRS/api-contracts.yaml`
