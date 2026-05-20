# Create Modules (with nested sub-modules) inside a Project

**Jira Key:** [BK-9](https://upexgalaxy67.atlassian.net/browse/BK-9)
**Epic:** [BK-7](https://upexgalaxy67.atlassian.net/browse/BK-7) (Project & Module Hierarchy)
**Priority:** Medium
**Story Points:** 1
**Status:** Estimation

---

## User Story

As a Project member, I want to define Modules (and nested sub-modules up to depth 6) so that the test repository is organized by product area. Implements the create-and-nest side of FR-006.

---

## Acceptance Criteria

Scenario: Create a top-level Module

  Given a project member of Project P

  When they POST /api/v1/projects/P/modules with { name: "Cart" }

  Then the system inserts a modules row with parent_module_id = null and path "/cart"

  And returns 201 with { module_id, path: "/cart" }



Scenario: Create a nested sub-module

  Given Project P already has a Module "Cart" (id = m_cart, path = "/cart")

  When a member POSTs a Module with { name: "Add to Cart", parent_module_id: "m_cart" }

  Then the system inserts modules with parent_module_id = "m_cart" and path "/cart/add-to-cart"

  And returns 201



Scenario: Depth warning at depth 4

  Given a member creates a Module at depth 4 (parent_module is at depth 3)

  When the POST succeeds

  Then the response metadata includes a soft warning DEPTH_APPROACHING_LIMIT



Scenario: Depth exceeded at depth 7

  Given a member attempts to create a Module under a depth-6 parent

  When they POST

  Then the system returns 400 with code MODULE_DEPTH_EXCEEDED and no row is inserted



Scenario: Parent module belongs to different project rejected

  Given Module m_x belongs to Project A

  When a member of Project B POSTs a Module with parent_module_id = m_x

  Then the system returns 400 with code PARENT_PROJECT_MISMATCH

---

## Business Rules

- name MUST be 2-80 chars.

- depth MUST be <=6 (computed from path).

- parent_module MUST belong to the same Project as the new Module.

- path is server-computed; clients MUST NOT set path directly.

- Cycle detection NOT required on create (no parent can point back to a not-yet-existing child).

---

## Scope

IN SCOPE:

- POST /api/v1/projects/{id}/modules endpoint

- name validation: 2-80 chars

- Optional parent_module_id (nullable for top-level)

- Optional description (Markdown)

- Auto-compute path materialized column

- Depth limit: hard 6, soft warning at 4

- parent must belong to same Project



OUT OF SCOPE:

- Module rename (separate story, BK-rename-delete)

- Module move (separate story, BK-move)

- Module soft-delete (separate story, BK-rename-delete)

- Drag-and-drop UI reorder (Phase 2, EPIC-BK-008)

---

## Workflow

1. Project member opens the tree view of their Project.

2. Clicks "+ New Module" (top-level) or "+ Sub-module" on an existing node.

3. UI shows name input + description textarea.

4. POST /api/v1/projects/{id}/modules with { name, parent_module_id?, description? }.

5. Server validates project membership + parent constraints + depth limit.

6. Server computes slug from name and path from parent.path + slug.

7. Insert modules row.

8. Return 201 with { module_id, path }.

9. UI inserts the new node in the tree.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/19/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** hierarchy, mvp, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:06:03.677Z_
