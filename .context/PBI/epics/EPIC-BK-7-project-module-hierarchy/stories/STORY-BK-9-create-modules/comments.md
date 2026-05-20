# Comments for BK-9

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-9)

---

### Ely - 5/19/2026, 9:05:48 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Frontend

- Tree view: `<ModuleTree />` with inline "+ New Module" affordances.

### Backend

- Route: `app/api/v1/projects/[id]/modules/route.ts` (POST).
- Path computation: `parent ? parent.path + "/" + slug : "/" + slug`.

### Database

- Tables: `modules` with materialized `path` column.
- Index: GIN or btree on `path` for subtree queries.

## Dependencies
### Blocked By

- BK-8 (need a project).

### Blocks

- BK-10 (rename / soft-delete needs existing modules).
- BK-11 (move needs ≥2 modules to swap parents).
- EPIC-BK-3, BK-4, BK-7, BK-8 (anchored entities need modules).

## Definition of Done
- [ ] All 5 AC scenarios pass on staging.
- [ ] Path materialization verified at DB level on 4-deep subtree.
- [ ] Soft-warning metadata present in 201 responses at depth 4.
- [ ] E2E test: create 4-deep tree via UI.

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:03.083Z_
