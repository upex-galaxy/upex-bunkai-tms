# Comments for BK-4

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-4)

---

### Ely - 5/19/2026, 9:05:42 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Frontend

- Modal: `<CreateWorkspaceDialog />` triggered from Workspace switcher or empty-state CTA.
- Client-side slug preview computed via `slugify(name)`.

### Backend

- Route: `app/api/v1/workspaces/route.ts` (POST).
- Validation: zod schema.
- DB transaction.

### Database

- Tables: `workspaces`, `workspace_members`.
- Index: `UNIQUE (slug)` on `workspaces`; `UNIQUE (owner_user_id, lower(name))`.

## Dependencies
### Blocked By

- BK-2 or BK-3 (need a signed-in user).

### Blocks

- BK-5 (invite teammate) needs an existing workspace.
- BK-6 (switch workspace) needs ≥2 workspaces.
- EPIC-BK-2 (Project & Module Hierarchy) needs Workspace.

## Definition of Done
- [ ] Endpoint passes all 5 AC scenarios on staging.
- [ ] Reserved-slug list defined in `lib/config.ts` (or similar).
- [ ] Realtime event emitted + observable from UI subscription.
- [ ] E2E test: sign-in → create workspace → land on workspace home.

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:06:02.287Z_
