# Switch between Workspaces I belong to

**Jira Key:** BK-6
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-6
**Epic:** EPIC-BK-1 (Tenancy & Identity)
**Priority:** Medium
**Story Points:** (unset)
**Status:** Backlog
**Assignee:** Ely
**Labels:** mvp, wave-1, tenancy

---

## User Story

**As an** authenticated user
**I want to** switch between Workspaces I belong to
**So that** I can serve multiple clients / teams from one Bunkai account

Implements **FR-004**.

---

## Scope

### In Scope

- `POST /api/v1/me/active-workspace` endpoint
- Session field `active_workspace_id` rotation
- Membership status check (only `"active"` members can switch in)
- UI workspace switcher in header (lists user's workspaces, shows current)
- `GET /api/v1/me/workspaces` endpoint (list user's memberships)

### Out of Scope

- Workspace context in URL path (vs header) — architecture decision deferred
- Recent / favorite workspaces UI (Phase 2)
- Cross-workspace search (Phase 3)

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Successful workspace switch

- **Given** an authenticated user who is an active member of Workspace A and Workspace B
- **When** they POST `/api/v1/me/active-workspace` with `{ workspace_id: "B" }`
- **Then** the system rotates the session's `active_workspace_id` to B
- **And** returns 200 with the new workspace `{ id, slug, name, role }`
- **And** every subsequent API call is scoped to Workspace B

### Scenario 2: Switch to non-member workspace rejected

- **Given** an authenticated user who is NOT a member of Workspace C
- **When** they POST `/api/v1/me/active-workspace` with `{ workspace_id: "C" }`
- **Then** the system returns 403 with code `NOT_A_MEMBER` and does NOT change the session

### Scenario 3: Switch to workspace where membership is suspended

- **Given** an authenticated user with a `workspace_members` row where `status = "suspended"` for Workspace D
- **When** they POST the switch
- **Then** the system returns 403 with code `MEMBERSHIP_SUSPENDED` and does NOT change the session

### Scenario 4: UI switcher reflects current active workspace

- **Given** a user has switched to Workspace B via API
- **When** they reload the app
- **Then** the workspace switcher in the header displays "Workspace B" as the active one
- **And** the URL persists the workspace context (path-based or header-based, per architecture)

---

## Business Rules

- User MUST be an active member of the target workspace (`status = "active"`); suspended / removed members get 403.
- The session's `active_workspace_id` MUST be the single source of truth for tenancy scoping in API middleware.
- Switching does NOT invalidate the session; only the scope changes.
- All subsequent API responses MUST reflect data scoped to the new active workspace.

---

## Workflow

1. User clicks the workspace switcher in the header.
2. Dropdown shows list of workspaces from `GET /api/v1/me/workspaces`.
3. User clicks Workspace B.
4. UI POSTs `/api/v1/me/active-workspace` with `{ workspace_id: "B" }`.
5. Server validates membership + status.
6. Server rotates session's `active_workspace_id`.
7. Returns 200 with the new workspace context.
8. UI navigates to `/home` (Workspace B's home).
9. All subsequent requests carry the new context.

---

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

---

## Dependencies

### Blocked By

- BK-4 (workspace creation) — need ≥2 workspaces to switch between.

### Blocks

- API middleware tenancy scoping (relied upon by every subsequent epic).

---

## Definition of Done

- [ ] All 4 AC scenarios pass on staging.
- [ ] API middleware verified — every protected route reads active_workspace_id.
- [ ] UI switcher renders correctly when user has 1, 2, and 10+ workspaces.
- [ ] Suspended-membership path returns 403 (not 404 / not silent success).

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-BK-1-tenancy-identity/epic.md`
- **PRD:** `.context/PRD/mvp-scope.md` (US 1.4)
- **SRS:** `.context/SRS/functional-specs.md` (FR-004)
- **API Contracts:** `.context/SRS/api-contracts.yaml`
