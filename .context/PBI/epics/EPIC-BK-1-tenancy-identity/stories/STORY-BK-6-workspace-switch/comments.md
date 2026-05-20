# Comments for BK-6

[View in Jira](https://upexgalaxy67.atlassian.net/browse/BK-6)

---

### Ely - 5/19/2026, 9:05:45 PM

🧱 **Architect Annotation**

*Posted by repo automation. Sections below are the architecture-grade complement to the user-facing fields (description / AC / Scope / Business Rules / Workflow). Source-of-truth on dev-side concerns — synced to local `comments.md` by `sync-jira-issues`.*

## Technical Notes
### Frontend

- Component: `<WorkspaceSwitcher />` in `app/layout.tsx` header.
- Hook: `useActiveWorkspace()` consuming `AuthContext`.

### Backend

- Routes:
  - `GET app/api/v1/me/workspaces/route.ts`
  - `POST app/api/v1/me/active-workspace/route.ts`
- Middleware updated to read `active_workspace_id` from session on every request.

### Database

- Tables: `workspace_members` (status field).
- Session: stored in Supabase cookie + read by `lib/supabase/server.ts`.

## Dependencies
### Blocked By

- BK-4 (workspace creation) — need ≥2 workspaces to switch between.

### Blocks

- API middleware tenancy scoping (relied upon by every subsequent epic).

## Definition of Done
- [ ] All 4 AC scenarios pass on staging.
- [ ] API middleware verified — every protected route reads active_workspace_id.
- [ ] UI switcher renders correctly when user has 1, 2, and 10+ workspaces.
- [ ] Suspended-membership path returns 403 (not 404 / not silent success).

---


_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:01.090Z_
