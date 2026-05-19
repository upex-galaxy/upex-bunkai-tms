# Create Modules (with nested sub-modules) inside a Project

**Jira Key:** BK-9
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-9
**Epic:** EPIC-BK-7 (Project & Module Hierarchy)
**Priority:** Medium
**Story Points:** (unset)
**Status:** Backlog
**Assignee:** Ely
**Labels:** mvp, wave-1, hierarchy

---

## User Story

**As a** Project member
**I want to** define Modules (and nested sub-modules up to depth 6)
**So that** the test repository is organized by product area

Implements the create-and-nest side of **FR-006**.

---

## Scope

### In Scope

- `POST /api/v1/projects/{id}/modules` endpoint
- `name` validation: 2–80 chars
- Optional `parent_module_id` (nullable for top-level)
- Optional description (Markdown)
- Auto-compute `path` materialized column
- Depth limit: hard 6, soft warning at 4
- Parent must belong to same Project

### Out of Scope

- Module rename (BK-10)
- Module move (BK-11)
- Module soft-delete (BK-10)
- Drag-and-drop UI reorder (Phase 2, EPIC-BK-008)

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Create a top-level Module

- **Given** a project member of Project P
- **When** they POST `/api/v1/projects/P/modules` with `{ name: "Cart" }`
- **Then** the system inserts a `modules` row with `parent_module_id = null` and `path "/cart"`
- **And** returns 201 with `{ module_id, path: "/cart" }`

### Scenario 2: Create a nested sub-module

- **Given** Project P already has a Module `"Cart"` (`id = m_cart`, `path = "/cart"`)
- **When** a member POSTs a Module with `{ name: "Add to Cart", parent_module_id: "m_cart" }`
- **Then** the system inserts `modules` with `parent_module_id = "m_cart"` and `path "/cart/add-to-cart"`
- **And** returns 201

### Scenario 3: Depth warning at depth 4

- **Given** a member creates a Module at depth 4 (parent_module is at depth 3)
- **When** the POST succeeds
- **Then** the response metadata includes a soft warning `DEPTH_APPROACHING_LIMIT`

### Scenario 4: Depth exceeded at depth 7

- **Given** a member attempts to create a Module under a depth-6 parent
- **When** they POST
- **Then** the system returns 400 with code `MODULE_DEPTH_EXCEEDED` and no row is inserted

### Scenario 5: Parent module belongs to different project rejected

- **Given** Module `m_x` belongs to Project A
- **When** a member of Project B POSTs a Module with `parent_module_id = m_x`
- **Then** the system returns 400 with code `PARENT_PROJECT_MISMATCH`

---

## Business Rules

- `name` MUST be 2–80 chars.
- Depth MUST be ≤ 6 (computed from `path`).
- `parent_module` MUST belong to the same Project as the new Module.
- `path` is server-computed; clients MUST NOT set `path` directly.
- Cycle detection NOT required on create (no parent can point back to a not-yet-existing child).

---

## Workflow

1. Project member opens the tree view of their Project.
2. Clicks "+ New Module" (top-level) or "+ Sub-module" on an existing node.
3. UI shows name input + description textarea.
4. POST `/api/v1/projects/{id}/modules` with `{ name, parent_module_id?, description? }`.
5. Server validates project membership + parent constraints + depth limit.
6. Server computes slug from name and path from `parent.path + slug`.
7. Insert `modules` row.
8. Return 201 with `{ module_id, path }`.
9. UI inserts the new node in the tree.

---

## Technical Notes

### Frontend

- Tree view: `<ModuleTree />` with inline "+ New Module" affordances.

### Backend

- Route: `app/api/v1/projects/[id]/modules/route.ts` (POST).
- Path computation: `parent ? parent.path + "/" + slug : "/" + slug`.

### Database

- Tables: `modules` with materialized `path` column.
- Index: GIN or btree on `path` for subtree queries.

---

## Dependencies

### Blocked By

- BK-8 (need a project).

### Blocks

- BK-10 (rename / soft-delete needs existing modules).
- BK-11 (move needs ≥2 modules to swap parents).
- EPIC-BK-3, BK-4, BK-7, BK-8 (anchored entities need modules).

---

## Definition of Done

- [ ] All 5 AC scenarios pass on staging.
- [ ] Path materialization verified at DB level on 4-deep subtree.
- [ ] Soft-warning metadata present in 201 responses at depth 4.
- [ ] E2E test: create 4-deep tree via UI.

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-BK-7-project-module-hierarchy/epic.md`
- **PRD:** `.context/PRD/user-journeys.md` (Journey 1, Step 4)
- **SRS:** `.context/SRS/functional-specs.md` (FR-006 — create side)
