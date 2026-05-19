# Create a Project inside a Workspace

**Jira Key:** BK-8
**Jira URL:** https://upexgalaxy67.atlassian.net/browse/BK-8
**Epic:** EPIC-BK-7 (Project & Module Hierarchy)
**Priority:** Medium
**Story Points:** (unset)
**Status:** Backlog
**Assignee:** Ely
**Labels:** mvp, wave-1, hierarchy

---

## User Story

**As a** Workspace member
**I want to** create a Project inside a Workspace
**So that** I can organize different applications / products under their own roof

Implements **FR-005**.

---

## Scope

### In Scope

- `POST /api/v1/workspaces/{id}/projects` endpoint
- Name validation: 3–80 chars
- Auto-derived slug (lowercase, kebab-case, unique per workspace)
- Optional description (Markdown, max 5KB)
- Caller MUST be a member of the workspace (role ≥ member)

### Out of Scope

- Project rename (post-MVP)
- Project deletion / archival (Phase 2)
- Project transfer between workspaces (Phase 3)
- Project templates (Phase 2)

---

## Acceptance Criteria (Gherkin)

### Scenario 1: Successful Project creation

- **Given** a workspace member of Workspace W
- **When** they POST `/api/v1/workspaces/W/projects` with `{ name: "Checkout v2" }`
- **Then** the system inserts a row in `projects` with slug `"checkout-v2"` auto-derived
- **And** returns 201 with `{ project_id, slug: "checkout-v2" }`

### Scenario 2: Name too short rejected

- **Given** a workspace member
- **When** they submit name `"AB"` (2 chars)
- **Then** the system returns 400 with code `NAME_TOO_SHORT` (min 3 chars)

### Scenario 3: Duplicate slug in workspace rejected

- **Given** workspace W already has a Project with slug `"checkout-v2"`
- **When** a member POSTs another Project with name `"Checkout V2"`
- **Then** the system returns 409 with code `SLUG_DUPLICATE_IN_WORKSPACE`

### Scenario 4: Non-member rejected

- **Given** an authenticated user who is NOT a member of Workspace X
- **When** they POST `/api/v1/workspaces/X/projects`
- **Then** the system returns 403 with code `NOT_A_MEMBER`

---

## Business Rules

- Caller MUST have an active membership in the target workspace.
- Slug uniqueness scope is per-workspace (two workspaces can each have project `"checkout-v2"`).
- `name` MUST contain ≥1 alphanumeric char.
- Description is optional but if present must be ≤5KB Markdown.

---

## Workflow

1. Workspace member navigates to Workspace Home, clicks "Create Project".
2. UI shows name input + optional description textarea + slug preview.
3. User submits.
4. POST `/api/v1/workspaces/{id}/projects` with `{ name, description }`.
5. Server validates membership.
6. Server derives slug, checks per-workspace uniqueness.
7. Insert `projects` row.
8. Return 201 with `{ project_id, slug }`.
9. UI navigates to `/workspaces/{ws-slug}/projects/{project-slug}`.

---

## Technical Notes

### Frontend

- Modal: `<CreateProjectDialog />` triggered from Workspace Home empty-state CTA.

### Backend

- Route: `app/api/v1/workspaces/[id]/projects/route.ts` (POST).
- Validation: zod schema.

### Database

- Tables: `projects`.
- Index: `UNIQUE (workspace_id, slug)`.

---

## Dependencies

### Blocked By

- BK-4 (workspace create) — need a workspace first.

### Blocks

- BK-9 (modules need a project).

---

## Definition of Done

- [ ] All 4 AC scenarios pass on staging.
- [ ] Per-workspace slug uniqueness verified at DB level.
- [ ] Reserved-slug list applied (`api`, `app`, etc.).
- [ ] E2E test: sign-in → create workspace → create project → land in project home.

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-BK-7-project-module-hierarchy/epic.md`
- **PRD:** `.context/PRD/user-journeys.md` (Journey 1, Step 3)
- **SRS:** `.context/SRS/functional-specs.md` (FR-005)
