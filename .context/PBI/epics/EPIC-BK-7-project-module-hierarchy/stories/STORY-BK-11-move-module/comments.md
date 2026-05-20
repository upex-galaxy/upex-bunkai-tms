# Comments for BK-11

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-11)

---

### Ely - 5/19/2026, 9:05:50 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

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

## Dependencies
### Blocked By

- BK-9 (need existing modules).
- BK-10 (the rename PATCH route is shared; merge ordering may matter).

### Blocks

- EPIC-BK-008 (drag-and-drop reorder UI is built on top of this endpoint in Phase 2).

## Definition of Done
- [ ] All 6 AC scenarios pass on staging.
- [ ] Cycle-detection tested with ancestor / descendant / self-as-parent attempts.
- [ ] Post-move depth check tested at the boundary (depth = 6 succeeds, depth = 7 rejects).
- [ ] Path rebuild verified on a 4-deep subtree move.
- [ ] No-op move test confirms no DB writes occur.

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:06:04.500Z_
