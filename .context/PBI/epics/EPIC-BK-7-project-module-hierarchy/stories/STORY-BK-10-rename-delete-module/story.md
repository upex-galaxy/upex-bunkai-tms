# Rename and soft-delete a Module (with cascade)

**Jira Key:** BK-10
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-10
**Epic:** EPIC-BK-7 (Project & Module Hierarchy)
**Priority:** Medium
**Story Points:** (unset)
**Status:** Backlog
**Assignee:** Ely
**Labels:** mvp, wave-1, hierarchy

---

## User Story

**As a** Project member
**I want to** rename a Module and soft-delete a Module
**So that** the structure stays accurate as the product evolves

Implements the rename + delete side of **FR-006**. Move is BK-11.

---

## Scope

### In Scope

- `PATCH /api/v1/modules/{id}` (rename + optional description update)
- `DELETE /api/v1/modules/{id}` (soft-delete with `archived_at`)
- Cascade soft-delete to descendant Modules + anchored entities (US, ATCs, Tests)
- `include_archived` query flag on listing endpoint
- Path rebuild if rename causes slug change

### Out of Scope

- Hard-delete (admin-only endpoint, post-MVP)
- Restore from soft-delete (post-MVP)
- Module move to different parent (BK-11)
- Bulk delete (Phase 2)

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Successful Module rename

- **Given** a project member and an existing Module `m1` with name `"Cart"`
- **When** they PATCH `/api/v1/modules/m1` with `{ name: "Shopping Cart" }`
- **Then** the system updates the `modules` row
- **And** `path` column is updated to reflect the new slug if slug changed
- **And** all anchored entities (US, ATCs, Tests, Bugs) remain linked via foreign key
- **And** returns 200 with the updated module

### Scenario 2: Rename to invalid name rejected

- **Given** a project member
- **When** they PATCH a Module with name `"A"` (1 char, below the 2-char minimum)
- **Then** the system returns 400 with code `NAME_TOO_SHORT`

### Scenario 3: Soft-delete a Module cascades

- **Given** Module `m_parent` has 3 child Modules and 5 anchored entities (US, ATCs, Tests)
- **When** a project member DELETEs `/api/v1/modules/m_parent`
- **Then** the system sets `archived_at = now()` on `m_parent` in a single transaction
- **And** sets `archived_at` on all 3 child Modules
- **And** sets `archived_at` on all 5 anchored entities (US, ATCs, Tests)
- **And** returns 200

### Scenario 4: Soft-deleted Module hidden from default listing

- **Given** Module `m_archived` has `archived_at` set
- **When** a member calls `GET /api/v1/projects/{id}/modules` without `include_archived`
- **Then** `m_archived` is NOT in the response

### Scenario 5: Soft-deleted Module visible with include_archived

- **Given** Module `m_archived` has `archived_at` set
- **When** a member calls `GET /api/v1/projects/{id}/modules?include_archived=true`
- **Then** `m_archived` IS in the response with `archived_at` populated

### Scenario 6: Non-member cannot rename / delete

- **Given** an authenticated user who is NOT a member of the Project
- **When** they PATCH or DELETE a Module in that Project
- **Then** the system returns 403 with code `NOT_A_MEMBER`

---

## Business Rules

- Soft-delete cascades MUST happen in a single transaction (no orphans on partial failure).
- Renaming MUST NOT break foreign-key links to anchored entities.
- `archived_at` column is a timestamp, set once on first delete; idempotent on re-delete.
- Listings filter `archived_at IS NULL` by default.
- Path rebuild on rename is a server-side trigger / explicit code path; clients MUST NOT set `path` directly.

---

## Workflow

### Rename

1. Project member opens Module detail or right-clicks Module node in tree.
2. Selects "Rename"; UI shows inline editor with current name.
3. Submits new name.
4. PATCH `/api/v1/modules/{id}` with `{ name }`.
5. Server validates membership + name length.
6. If name slugifies to a new value, server rebuilds `path` for this Module and all descendants.
7. Returns 200 with updated module.

### Delete

1. Project member right-clicks Module node, picks "Delete".
2. UI shows confirmation dialog listing descendant counts ("This will archive 3 sub-modules and 5 anchored entities").
3. User confirms.
4. DELETE `/api/v1/modules/{id}`.
5. Server runs single transaction: set `archived_at` on Module + cascade to descendants.
6. Returns 200.
7. UI removes the Module subtree from default tree view.

---

## Technical Notes

### Backend

- Routes:
  - `PATCH app/api/v1/modules/[id]/route.ts`
  - `DELETE app/api/v1/modules/[id]/route.ts`
- Cascade implemented via SQL transaction (`WITH RECURSIVE` to find descendants + UPDATE).

### Database

- Tables: `modules`, `user_stories`, `acceptance_criteria`, `atcs`, `tests`, `bugs`.
- Soft-delete column `archived_at` on every entity table.

---

## Dependencies

### Blocked By

- BK-9 (need existing modules to rename / delete).

### Blocks

- (none directly — but quality matters because cascade bugs corrupt downstream data).

---

## Definition of Done

- [ ] All 6 AC scenarios pass on staging.
- [ ] Cascade verified on 4-deep subtree with mixed anchored entities.
- [ ] Path rebuild verified on rename that changes slug.
- [ ] `include_archived` flag returns archived rows without exception.
- [ ] Integration test for transactional rollback on partial failure.

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-BK-7-project-module-hierarchy/epic.md`
- **PRD:** `.context/PRD/mvp-scope.md` (US 2.3 — rename + delete portion)
- **SRS:** `.context/SRS/functional-specs.md` (FR-006 — rename + soft-delete sides)
