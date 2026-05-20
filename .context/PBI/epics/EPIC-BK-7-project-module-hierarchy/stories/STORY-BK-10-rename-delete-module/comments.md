# Comments for BK-10

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-10)

---

### Ely - 5/19/2026, 9:05:49 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Backend

- Routes:
  - `PATCH app/api/v1/modules/[id]/route.ts`
  - `DELETE app/api/v1/modules/[id]/route.ts`
- Cascade implemented via SQL transaction (`WITH RECURSIVE` to find descendants + UPDATE).

### Database

- Tables: `modules`, `user_stories`, `acceptance_criteria`, `atcs`, `tests`, `bugs`.
- Soft-delete column `archived_at` on every entity table.

## Dependencies
### Blocked By

- BK-9 (need existing modules to rename / delete).

### Blocks

- (none directly — but quality matters because cascade bugs corrupt downstream data).

## Definition of Done
- [ ] All 6 AC scenarios pass on staging.
- [ ] Cascade verified on 4-deep subtree with mixed anchored entities.
- [ ] Path rebuild verified on rename that changes slug.
- [ ] `include_archived` flag returns archived rows without exception.
- [ ] Integration test for transactional rollback on partial failure.

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:03.360Z_
