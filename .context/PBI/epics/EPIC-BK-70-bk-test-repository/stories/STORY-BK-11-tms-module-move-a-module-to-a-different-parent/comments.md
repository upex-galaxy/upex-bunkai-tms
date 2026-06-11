# Comments for BK-11

[View in Jira](https://jira.upexgalaxy.com/browse/BK-11)

---

### Ely - 5/19/2026, 9:05:50 PM

🧱 ****Architect Annotation****

**Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.**

1. 

- Module context menu: `<ModuleMoveDialog />` with target-parent picker (recursive tree, with disallowed nodes greyed).
- Pre-flight client check (cycle / depth) for instant UX feedback; server still authoritative.

1. 

- Same PATCH route as rename ([https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10)), but the handler branches on whether `parent*module*id` is present.
- Cycle detection: walk ancestors of target, fail if any equals `m_source.id`.
- Depth check: `max*descendant*depth*of(m*source) + depth*of(new*parent) + 1 ≤ 6`.

1. 

- Single transaction with two UPDATEs: parent reassignment + recursive path rebuild.

1. 

- [https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9](https://jira.upexgalaxy.com/browse/BK-9#icft=BK-9) (need existing modules).
- [https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10](https://jira.upexgalaxy.com/browse/BK-10#icft=BK-10) (the rename PATCH route is shared; merge ordering may matter).

1. 

- EPIC-BK-008 (drag-and-drop reorder UI is built on top of this endpoint in Phase 2).

1. 

- [ ] All 6 AC scenarios pass on staging.
- [ ] Cycle-detection tested with ancestor / descendant / self-as-parent attempts.
- [ ] Post-move depth check tested at the boundary (depth = 6 succeeds, depth = 7 rejects).
- [ ] Path rebuild verified on a 4-deep subtree move.
- [ ] No-op move test confirms no DB writes occur.

---

### Ely - 6/4/2026, 10:12:04 PM

## Ready For QA — BK-11 (Move a module to a different parent)

Merged to `staging` and deployed. Ready for testing on staging.

### Links

- PR: https://github.com/upex-galaxy/upex-bunkai-tms/pull/11 (merged)
- Staging: https://staging-upexbunkai.vercel.app — deploy READY
- Merge commit: `8fd44e2`

### What shipped

- Per-node "Move" action in the project tree. The move dialog offers only valid destinations (it hides the module itself, its sub-tree, its current parent, and any target that would push the branch past 6 levels) plus a "Project root" option.
- Moving carries the whole sub-tree; breadcrumbs and stored paths of the module and all descendants are rebuilt.
- Same operation lives on `PATCH /api/v1/modules/{id}` with a `parent*module*id` field.

### As-built contract (observable)

- Success: 200 `{ module }` with the new parent + path; sub-tree re-based.
- Move under itself or a descendant: 422 `move*cycle`. Resulting depth > 6: 422 `depth*exceeded`. Invalid/cross-project/archived target: 422 `parent_invalid`.
- Destination already has a module with the same name: 409 `module*slug*duplicate`.
- No-op (same parent): 200, no changes. Viewer/non-member: 403. Missing/archived module: 404.

### Suggested QA focus

- Move a leaf and a parent-with-subtree under another module; confirm breadcrumbs read "A / B / C" and the branch carries.
- Move a nested module back to the project root.
- Blocked cases: move onto own descendant (cycle), move that would exceed depth 6 (boundary: depth 6 ok, 7 blocked).
- Permissions: a workspace viewer cannot move (403).
- Confirm the picker never offers an invalid destination, and "Project root" only shows for nested modules.

### Known follow-ups (not blocking)

- BK-57: combining rename AND move in one API call is not atomic across the two steps (the UI performs them separately, so not triggered in the app).
- Integration/E2E of the move/cycle/depth/root paths is deferred to the test-authoring phase.

---


_Synced from Jira by sync-jira-issues_
