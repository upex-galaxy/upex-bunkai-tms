# Move a Module to a different parent (with cycle-detection + path rebuild)

**Jira Key:** [BK-11](https://upexgalaxy67.atlassian.net/browse/BK-11)
**Epic:** [BK-7](https://upexgalaxy67.atlassian.net/browse/BK-7) (Project & Module Hierarchy)
**Priority:** Medium
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

***Source spec:*** FR-006

## User Story

As a Project member, I want to move a Module to a different parent (with circular-parent detection + depth guard + materialized-path rebuild) so that I can restructure the tree without breaking it. Implements the move side of FR-006.

---

## Acceptance Criteria

```gherkin
Scenario: Successful Module move
Given Modules m*source (path = "/cart") and m*target (path = "/payment")
And m_source has 2 descendant modules
When a project member PATCHes /api/v1/modules/m*source with { parent*module*id: "m*target" }
Then the system updates m*source.parent*module*id = m*target
And rebuilds m_source.path to "/payment/cart"
And rebuilds path on the 2 descendants accordingly
And all in a single transaction
And returns 200 with the moved module

Scenario: Move to top-level (parent*module*id = null)
Given Module m*source has parent m*parent
When a member PATCHes m*source with { parent*module_id: null }
Then m*source becomes a top-level Module with path = "/" + m*source.slug

Scenario: Circular parent rejected
Given Module m*ancestor and its descendant m*descendant
When a member attempts to PATCH m*ancestor with { parent*module*id: "m*descendant" }
Then the system returns 409 with code MODULE*CIRCULAR*PARENT
And no row is updated

Scenario: Move into another Project rejected
Given Module m_source belongs to Project A
And Module m_target belongs to Project B
When a member attempts to PATCH m*source with { parent*module*id: "m*target" }
Then the system returns 400 with code PARENT*PROJECT*MISMATCH

Scenario: Move that would exceed depth 6 rejected
Given Module m_source is itself a 3-deep subtree (so moving it under a depth-4 parent yields depth 7)
When a member attempts the move
Then the system returns 400 with code MODULE*DEPTH*EXCEEDED*AFTER*MOVE

Scenario: Move idempotent on no-op
Given Module m*source already has parent*module*id = m*target
When a member PATCHes the same parent again
Then the system returns 200 with no changes (and no path-rebuild work performed)
```

---

## Business Rules

- Cycle detection: the new parent_module MUST NOT be a descendant of the moved Module (including itself).

- Depth check: the maximum depth in the resulting subtree (moved Module + all descendants) MUST NOT exceed 6.

- Same-project constraint: new parent_module MUST belong to the same Project as the moved Module.

- Path rebuild MUST happen in the same transaction as the parent*module*id update; partial state is not allowed.

- No-op (same parent*module*id as before) MUST return 200 without performing any DB writes.

---

## Scope

- PATCH /api/v1/modules/{id} accepting parent*module*id field
- Cycle detection (server-side, inside transaction)
- Depth check after move (resulting subtree must fit within depth 6)
- Path rebuild for moved Module and all descendants in same transaction
- Same-project constraint enforced

---

## Workflow

1. Project member opens the tree view and identifies the Module to move.

2. Selects "Move to..." from the Module context menu.

3. UI shows a target-parent picker scoped to the current Project (with the moved Module + its descendants greyed out to make cycle attempts visible).

4. User picks new parent (or "top-level").

5. PATCH /api/v1/modules/{source-id} with { parent*module*id: new-parent-id-or-null }.

6. Server validates membership.

7. Server validates: same project + cycle + post-move depth.

8. Inside a transaction: update parent*module*id, rebuild path for moved Module + all descendants.

9. Returns 200 with the moved Module.

10. UI re-renders the tree with the Module under its new parent.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/21/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** hierarchy, mvp, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-21T05:14:28.578Z_
