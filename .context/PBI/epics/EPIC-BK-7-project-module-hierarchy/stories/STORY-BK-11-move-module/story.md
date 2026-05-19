# Move a Module to a different parent (with cycle-detection + path rebuild)

**Jira Key:** BK-11
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-11
**Epic:** EPIC-BK-7 (Project & Module Hierarchy)
**Priority:** Medium
**Story Points:** (unset)
**Status:** Backlog
**Assignee:** Ely
**Labels:** mvp, wave-1, hierarchy

---

## User Story

**As a** Project member
**I want to** move a Module to a different parent (with circular-parent detection + depth guard + materialized-path rebuild)
**So that** I can restructure the tree without breaking it

Implements the move side of **FR-006**. Rename + delete are BK-10.

---

## Scope

### In Scope

- `PATCH /api/v1/modules/{id}` accepting `parent_module_id` field
- Cycle detection (server-side, inside transaction)
- Depth check after move (resulting subtree must fit within depth 6)
- Path rebuild for moved Module and all descendants in same transaction
- Same-project constraint enforced

### Out of Scope

- Move via drag-and-drop UI on tree (Phase 2, EPIC-BK-008 territory)
- Cross-project move (explicit anti-feature for MVP)
- Bulk move (Phase 2)
- Move history / audit log of structural changes (Phase 3)

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Successful Module move

- **Given** Modules `m_source` (path = `"/cart"`) and `m_target` (path = `"/payment"`)
- **And** `m_source` has 2 descendant modules
- **When** a project member PATCHes `/api/v1/modules/m_source` with `{ parent_module_id: "m_target" }`
- **Then** the system updates `m_source.parent_module_id = m_target`
- **And** rebuilds `m_source.path` to `"/payment/cart"`
- **And** rebuilds `path` on the 2 descendants accordingly
- **And** all in a single transaction
- **And** returns 200 with the moved module

### Scenario 2: Move to top-level (parent_module_id = null)

- **Given** Module `m_source` has parent `m_parent`
- **When** a member PATCHes `m_source` with `{ parent_module_id: null }`
- **Then** `m_source` becomes a top-level Module with `path = "/" + m_source.slug`

### Scenario 3: Circular parent rejected

- **Given** Module `m_ancestor` and its descendant `m_descendant`
- **When** a member attempts to PATCH `m_ancestor` with `{ parent_module_id: "m_descendant" }`
- **Then** the system returns 409 with code `MODULE_CIRCULAR_PARENT`
- **And** no row is updated

### Scenario 4: Move into another Project rejected

- **Given** Module `m_source` belongs to Project A
- **And** Module `m_target` belongs to Project B
- **When** a member attempts to PATCH `m_source` with `{ parent_module_id: "m_target" }`
- **Then** the system returns 400 with code `PARENT_PROJECT_MISMATCH`

### Scenario 5: Move that would exceed depth 6 rejected

- **Given** Module `m_source` is itself a 3-deep subtree (so moving it under a depth-4 parent yields depth 7)
- **When** a member attempts the move
- **Then** the system returns 400 with code `MODULE_DEPTH_EXCEEDED_AFTER_MOVE`

### Scenario 6: Move idempotent on no-op

- **Given** Module `m_source` already has `parent_module_id = m_target`
- **When** a member PATCHes the same parent again
- **Then** the system returns 200 with no changes (and no path-rebuild work performed)

---

## Business Rules

- **Cycle detection:** the new `parent_module` MUST NOT be a descendant of the moved Module (including itself).
- **Depth check:** the maximum depth in the resulting subtree (moved Module + all descendants) MUST NOT exceed 6.
- **Same-project constraint:** new `parent_module` MUST belong to the same Project as the moved Module.
- **Atomicity:** path rebuild MUST happen in the same transaction as the `parent_module_id` update; partial state is not allowed.
- **No-op:** same `parent_module_id` as before MUST return 200 without performing any DB writes.

---

## Workflow

1. Project member opens the tree view and identifies the Module to move.
2. Selects "Move to..." from the Module context menu.
3. UI shows a target-parent picker scoped to the current Project (with the moved Module + its descendants greyed out to make cycle attempts visible).
4. User picks new parent (or "top-level").
5. PATCH `/api/v1/modules/{source-id}` with `{ parent_module_id: new-parent-id-or-null }`.
6. Server validates membership.
7. Server validates: same project + cycle + post-move depth.
8. Inside a transaction: update `parent_module_id`, rebuild `path` for moved Module + all descendants.
9. Returns 200 with the moved Module.
10. UI re-renders the tree with the Module under its new parent.

---

## Technical Notes

### Frontend

- Module context menu: `<ModuleMoveDialog />` with target-parent picker (recursive tree, with disallowed nodes greyed).
- Pre-flight client check (cycle / depth) for instant UX feedback; server still authoritative.

### Backend

- Same PATCH route as rename (BK-10), but the handler branches on whether `parent_module_id` is present.
- Cycle detection: walk ancestors of target, fail if any equals `m_source.id`.
- Depth check: `max_descendant_depth_of(m_source) + depth_of(new_parent) + 1 ≤ 6`.

### Database

- Single transaction with two UPDATEs: parent reassignment + recursive path rebuild.

---

## Dependencies

### Blocked By

- BK-9 (need existing modules).
- BK-10 (the rename PATCH route is shared; merge ordering may matter).

### Blocks

- EPIC-BK-008 (drag-and-drop reorder UI is built on top of this endpoint in Phase 2).

---

## Definition of Done

- [ ] All 6 AC scenarios pass on staging.
- [ ] Cycle-detection tested with ancestor / descendant / self-as-parent attempts.
- [ ] Post-move depth check tested at the boundary (depth = 6 succeeds, depth = 7 rejects).
- [ ] Path rebuild verified on a 4-deep subtree move.
- [ ] No-op move test confirms no DB writes occur.

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-BK-7-project-module-hierarchy/epic.md`
- **PRD:** `.context/PRD/mvp-scope.md` (US 2.3 — move portion)
- **SRS:** `.context/SRS/functional-specs.md` (FR-006 — move side)
