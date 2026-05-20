# Create a Workspace

**Jira Key:** [BK-4](https://upexgalaxy67.atlassian.net/browse/BK-4)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Priority:** Medium
**Story Points:** 1
**Status:** Shift-Left QA

---

## User Story

As an authenticated user, I want to create a Workspace so that my team's data is isolated from other tenants. Implements FR-002.

---

## Acceptance Criteria

Scenario: Successful workspace creation

  Given an authenticated user

  When they POST /api/v1/workspaces with name "Acme QA"

  Then the system inserts a row in workspaces with the auto-derived slug "acme-qa"

  And inserts the creator into workspace_members with role "owner"

  And returns 201 with body { workspace_id, slug: "acme-qa" }



Scenario: Name too short rejected

  Given an authenticated user

  When they submit a workspace name "A" (1 char)

  Then the system returns 400 with code NAME_TOO_SHORT (min 3 chars)



Scenario: Reserved slug rejected

  Given an authenticated user

  When they submit name "API" which slugifies to "api"

  Then the system returns 400 with code SLUG_RESERVED and the list of reserved slugs ({ api, app, auth, admin, bunkai, ... })



Scenario: Duplicate name per owner case-insensitive

  Given a user who already owns a workspace named "Acme QA"

  When they POST a second workspace with name "acme qa"

  Then the system returns 409 with code NAME_DUPLICATE_FOR_OWNER



Scenario: workspace.created event emitted

  Given a successful workspace creation

  When the row is inserted

  Then a workspace.created event is emitted on the realtime channel for the owner

---

## Business Rules

- name MUST be 3-60 chars, contain ≥1 alphanumeric.

- slug derived from name: lowercase, kebab-case (spaces → hyphens, accents stripped), strip leading/trailing hyphens, max 60 chars.

- slug MUST be globally unique across all workspaces.

- slug MUST NOT match any reserved value (loaded from config).

- Creator inherits role owner; no other roles assignable at create-time.

---

## Scope

IN SCOPE:

- POST /api/v1/workspaces endpoint

- Name validation: 3-60 chars, unique per owner (case-insensitive)

- Slug auto-derivation: lowercase, kebab-case, globally unique

- Reserved slug rejection list (api, app, auth, admin, bunkai, ...)

- Creator auto-added as owner in workspace_members

- workspace.created event



OUT OF SCOPE:

- Workspace rename (separate story, post-MVP)

- Workspace deletion (Phase 2)

- Custom slug input by user (auto-derived only in MVP)

- Workspace logo / branding (Phase 2)

---

## Workflow

1. Authenticated user clicks "Create Workspace".

2. UI shows name input + slug preview computed client-side.

3. User submits.

4. POST /api/v1/workspaces with { name }.

5. Server validates name length + alphanumeric requirement.

6. Server derives slug, checks reserved list + global uniqueness.

7. Insert workspaces row in transaction with workspace_members row (role=owner).

8. Emit workspace.created event.

9. Return 201 with { workspace_id, slug }.

10. UI navigates to new workspace's home.

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
- **Labels:** mvp, tenancy, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:06:02.002Z_
