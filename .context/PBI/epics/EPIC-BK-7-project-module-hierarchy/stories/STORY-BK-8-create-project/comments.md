# Comments for BK-8

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-8)

---

### Ely - 5/19/2026, 9:05:46 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Frontend

- Modal: `<CreateProjectDialog />` triggered from Workspace Home empty-state CTA.

### Backend

- Route: `app/api/v1/workspaces/[id]/projects/route.ts` (POST).
- Validation: zod schema.

### Database

- Tables: `projects`.
- Index: `UNIQUE (workspace_id, slug)`.

## Dependencies
### Blocked By

- BK-4 (workspace create) — need a workspace first.

### Blocks

- BK-9 (modules need a project).

## Definition of Done
- [ ] All 4 AC scenarios pass on staging.
- [ ] Per-workspace slug uniqueness verified at DB level.
- [ ] Reserved-slug list applied (`api`, `app`, etc.).
- [ ] E2E test: sign-in → create workspace → create project → land in project home.

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:02.395Z_
