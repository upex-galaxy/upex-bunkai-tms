# Rename and soft-delete a Module (with cascade)

**Jira Key:** [BK-10](https://upexgalaxy67.atlassian.net/browse/BK-10)
**Epic:** [BK-7](https://upexgalaxy67.atlassian.net/browse/BK-7) (Project & Module Hierarchy)
**Priority:** Medium
**Story Points:** 1
**Status:** Estimation

---

## User Story

As a Project member, I want to rename a Module and soft-delete a Module so that the structure stays accurate as the product evolves. Implements the rename + delete side of FR-006. Move is a separate story.

---

## Acceptance Criteria

Scenario: Successful Module rename

  Given a project member and an existing Module m1 with name "Cart"

  When they PATCH /api/v1/modules/m1 with { name: "Shopping Cart" }

  Then the system updates the modules row

  And path column is updated to reflect the new slug if slug changed

  And all anchored entities (US, ATCs, Tests, Bugs) remain linked via foreign key

  And returns 200 with the updated module



Scenario: Rename to invalid name rejected

  Given a project member

  When they PATCH a Module with name "A" (1 char, below the 2-char minimum)

  Then the system returns 400 with code NAME_TOO_SHORT



Scenario: Soft-delete a Module cascades

  Given Module m_parent has 3 child Modules and 5 anchored entities (US, ATCs, Tests)

  When a project member DELETEs /api/v1/modules/m_parent

  Then the system sets archived_at = now() on m_parent in a single transaction

  And sets archived_at on all 3 child Modules

  And sets archived_at on all 5 anchored entities (US, ATCs, Tests)

  And returns 200



Scenario: Soft-deleted Module hidden from default listing

  Given Module m_archived has archived_at set

  When a member calls GET /api/v1/projects/{id}/modules without include_archived

  Then m_archived is NOT in the response



Scenario: Soft-deleted Module visible with include_archived

  Given Module m_archived has archived_at set

  When a member calls GET /api/v1/projects/{id}/modules?include_archived=true

  Then m_archived IS in the response with archived_at populated



Scenario: Non-member cannot rename / delete

  Given an authenticated user who is NOT a member of the Project

  When they PATCH or DELETE a Module in that Project

  Then the system returns 403 with code NOT_A_MEMBER

---

## Business Rules

- Soft-delete cascades MUST happen in a single transaction (no orphans on partial failure).

- Renaming MUST NOT break foreign-key links to anchored entities.

- archived_at column is a timestamp, set once on first delete; idempotent on re-delete.

- Listings filter archived_at IS NULL by default.

- Path rebuild on rename is a server-side trigger / explicit code path; clients MUST NOT set path directly.

---

## Scope

IN SCOPE:

- PATCH /api/v1/modules/{id} (rename + optional description update)

- DELETE /api/v1/modules/{id} (soft-delete with archived_at)

- Cascade soft-delete to descendant Modules + anchored entities (US, ATCs, Tests)

- include_archived query flag on listing endpoint

- Path rebuild if rename causes slug change



OUT OF SCOPE:

- Hard-delete (admin-only endpoint, post-MVP)

- Restore from soft-delete (post-MVP)

- Module move to different parent (separate story BK-move)

- Bulk delete (Phase 2)

---

## Workflow

RENAME:

1. Project member opens Module detail or right-clicks Module node in tree.

2. Selects "Rename"; UI shows inline editor with current name.

3. Submits new name.

4. PATCH /api/v1/modules/{id} with { name }.

5. Server validates membership + name length.

6. If name slugifies to a new value, server rebuilds path for this Module and all descendants.

7. Returns 200 with updated module.



DELETE:

1. Project member right-clicks Module node, picks "Delete".

2. UI shows confirmation dialog listing descendant counts ("This will archive 3 sub-modules and 5 anchored entities").

3. User confirms.

4. DELETE /api/v1/modules/{id}.

5. Server runs single transaction: set archived_at on Module + cascade to descendants.

6. Returns 200.

7. UI removes the Module subtree from default tree view.

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
_Last sync: 2026-05-20T00:58:03.084Z_
