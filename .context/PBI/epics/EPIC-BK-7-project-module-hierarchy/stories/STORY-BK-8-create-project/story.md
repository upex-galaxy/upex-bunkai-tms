# Create a Project inside a Workspace

**Jira Key:** [BK-8](https://upexgalaxy67.atlassian.net/browse/BK-8)
**Epic:** [BK-7](https://upexgalaxy67.atlassian.net/browse/BK-7) (Project & Module Hierarchy)
**Priority:** Medium
**Story Points:** 1
**Status:** Estimation

---

## User Story

As a Workspace member, I want to create a Project inside a Workspace so that I can organize different applications / products under their own roof. Implements FR-005.

---

## Acceptance Criteria

Scenario: Successful Project creation

  Given a workspace member of Workspace W

  When they POST /api/v1/workspaces/W/projects with { name: "Checkout v2" }

  Then the system inserts a row in projects with slug "checkout-v2" auto-derived

  And returns 201 with { project_id, slug: "checkout-v2" }



Scenario: Name too short rejected

  Given a workspace member

  When they submit name "AB" (2 chars)

  Then the system returns 400 with code NAME_TOO_SHORT (min 3 chars)



Scenario: Duplicate slug in workspace rejected

  Given workspace W already has a Project with slug "checkout-v2"

  When a member POSTs another Project with name "Checkout V2"

  Then the system returns 409 with code SLUG_DUPLICATE_IN_WORKSPACE



Scenario: Member cannot create in workspace they do not belong to

  Given an authenticated user who is NOT a member of Workspace X

  When they POST /api/v1/workspaces/X/projects

  Then the system returns 403 with code NOT_A_MEMBER

---

## Business Rules

- Caller MUST have an active membership in the target workspace.

- Slug uniqueness scope is per-workspace (two workspaces can each have project "checkout-v2").

- name MUST contain >=1 alphanumeric char.

- Description is optional but if present must be <=5KB Markdown.

---

## Scope

IN SCOPE:

- POST /api/v1/workspaces/{id}/projects endpoint

- Name validation: 3-80 chars

- Auto-derived slug (lowercase, kebab-case, unique per workspace)

- Optional description (Markdown, max 5KB)

- Caller MUST be a member of the workspace (role >= member)



OUT OF SCOPE:

- Project rename (post-MVP)

- Project deletion / archival (Phase 2)

- Project transfer between workspaces (Phase 3)

- Project templates (Phase 2)

---

## Workflow

1. Workspace member navigates to Workspace Home, clicks "Create Project".

2. UI shows name input + optional description textarea + slug preview.

3. User submits.

4. POST /api/v1/workspaces/{id}/projects with { name, description }.

5. Server validates membership.

6. Server derives slug, checks per-workspace uniqueness.

7. Insert projects row.

8. Return 201 with { project_id, slug }.

9. UI navigates to /workspaces/{ws-slug}/projects/{project-slug}.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/19/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** hierarchy, mvp, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:01.689Z_
