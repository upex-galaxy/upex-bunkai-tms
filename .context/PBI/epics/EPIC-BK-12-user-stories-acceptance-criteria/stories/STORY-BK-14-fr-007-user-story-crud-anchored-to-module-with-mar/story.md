# User Story CRUD anchored to Module (Markdown body, optional Jira external_id)

**Jira Key:** [BK-14](https://upexgalaxy67.atlassian.net/browse/BK-14)
**Epic:** [BK-12](https://upexgalaxy67.atlassian.net/browse/BK-12) (User Stories & Acceptance Criteria)
**Priority:** Medium
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

***Source spec:*** FR-007

## User story

As a Project member, I want to create, read, update and delete ***User Stories*** anchored to a Module, with a Markdown description and an optional Jira `external_id`, so I can capture product behavior next to its module owner and keep traceability with an upstream Jira issue when one exists.

This story implements FR-007 and PRD US 3.1. It is the foundation for FR-008 (Acceptance Criteria) and FR-009 (Jira import), both of which write to the same `user*stories` table. The `external*id` field enables idempotent re-imports from Jira without creating duplicates.

## Business rules

- `title` is required, length 3-200 chars.
- `description` is optional Markdown, max 50KB (UTF-8 bytes).
- `external_id`, when present, must match `^[A-Z]+-\d+$`.
- `external_id` is unique per Project (case-insensitive normalization to uppercase).
- `external_id` is immutable once set - cannot be changed via PATCH.
- DELETE is soft (sets `deleted*at`); list endpoints filter `deleted*at IS NULL` by default.

## Workflow

The user opens a Module detail page in the SPA and clicks ***New User Story***. A form opens with title, Markdown description, and an optional `external*id` / `external*url` pair. On submit the client POSTs to `/api/user-stories` with `module*id` pre-filled from the URL. The Next.js route handler validates with Zod, relies on Supabase RLS to enforce Workspace membership, and inserts into the `user*stories` table inside a transaction. The response carries the persisted row, which the client merges into its local cache and renders inline in the Module's story list.

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

---

## Acceptance Criteria

```gherkin
Feature: User Story CRUD anchored to Module

  Scenario: Create a User Story under a Module the user owns
    Given the authenticated user belongs to Workspace W and is a member of Project P
    And Module M exists under Project P
    When the user POSTs a User Story with module_id=M, title="Login flow", description="# Login" (Markdown)
    Then the API responds 201 with { user*story } including a generated UUID id and created*at
    And a row exists in user*stories with module*id=M and title="Login flow"

  Scenario: Reject a User Story whose Module belongs to another Workspace
    Given Module M belongs to Workspace W2 different from the caller's Workspace
    When the user POSTs a User Story with module_id=M
    Then the API responds 403 with { error: "module*not*in_workspace" }
    And no row is inserted in user_stories

  Scenario: Reject invalid external_id format
    Given the user submits a User Story with external_id="not-a-jira-key"
    When the request is validated
    Then the API responds 422 with { error: "external*id*invalid_format" }
    And the error body names the regex ^[A-Z]+-\d+$

  Scenario: Update keeps external_id immutable once set
    Given a User Story exists with external_id="PROJ-42"
    When the user PATCHes the User Story with external_id="OTHER-1"
    Then the API responds 409 with { error: "external*id*immutable" }
    And the stored external_id remains "PROJ-42"

  Scenario: Title length boundary
    Given the user submits a User Story with a 201-character title
    When the request is validated
    Then the API responds 422 with { error: "title*too*long", max: 200 }
```

---

## Business Rules

- title is required, length 3-200 chars

- description is optional Markdown, max 50KB (UTF-8 bytes)

- external_id, when present, must match regex ^[A-Z]+-\d+$

- external_id is unique per Project (case-insensitive normalization to uppercase)

- external_id is immutable once set (cannot be changed via PATCH)

- DELETE is soft (sets deleted*at); list endpoints filter deleted*at IS NULL by default

---

## Scope

- POST /api/user-stories - create a User Story under a Module
- GET /api/user-stories/:id - fetch a single User Story
- GET /api/modules/:module_id/user-stories - list Stories of a Module
- PATCH /api/user-stories/:id - update title, description, external*id (only when unset), external*url
- DELETE /api/user-stories/:id - soft delete (deleted_at)
- Zod validation for all inputs (title 3-200, description max 50KB, external_id regex)
- Supabase RLS policy: caller must be member of Module's Project's Workspace
- OpenAPI schemas for UserStoryCreate / UserStoryUpdate / UserStoryResponse

---

## Workflow

The user opens a Module detail page in the SPA and clicks "New User Story". A form opens with title, Markdown description, and an optional external*id/external*url pair. On submit the client POSTs to /api/user-stories with module*id pre-filled from the URL. The Next.js route handler validates with Zod, checks Workspace membership via RLS context, and inserts into the user*stories table inside a transaction. The response carries the persisted row, which the client merges into its local cache and renders inline in the Module's story list.

---

## Definition of Done

- [ ] Implementation complete
- [ ] Unit tests written
- [ ] Code reviewed
- [ ] Documentation updated

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/21/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** mvp, user-stories, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-21T05:14:29.135Z_
