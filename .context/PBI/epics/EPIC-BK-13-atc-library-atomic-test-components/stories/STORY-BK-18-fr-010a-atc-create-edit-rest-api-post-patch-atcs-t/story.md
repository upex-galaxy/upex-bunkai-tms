# FR-010a — ATC create+edit REST API (POST/PATCH /atcs, transactional steps+assertions)

**Jira Key:** [BK-18](https://upexgalaxy67.atlassian.net/browse/BK-18)
**Epic:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
**Priority:** Medium
**Story Points:** 1
**Status:** Backlog

---

## User Story

As an automation engineer or API consumer,

I want a REST API to create and edit ATCs (Atomic Test Components) with their steps and assertions in a single transactional call,

So that I can compose reusable test building blocks from CLI tools, scripts, and the UI client.



Anchors PRD US 4.1 and US 4.2 and implements SRS FR-010 (server surface). The UI form (Story FR-010b) and downstream Test composition (EPIC-BK-5) both depend on this contract.

---

## Acceptance Criteria

Scenario: Create ATC with valid payload

  Given an authenticated member of the workspace

  And a User Story US-100 in module M-10 with acceptance criteria AC-1 and AC-2

  When the user POSTs to /atcs with title "Login with valid email", module_id M-10, user_story_id US-100, acceptance_criterion_ids [AC-1], layer "UI", and 3 steps plus 2 assertions

  Then the API returns 201 with the new ATC, its steps, and its assertions

  And the slug is "{module-slug}/{atc-id-padded}"

  And an atc.created event is emitted



Scenario: Reject ATC when acceptance criteria belong to a different user story

  Given an authenticated member

  And AC-9 belongs to user story US-200 (not US-100)

  When the user POSTs /atcs with user_story_id US-100 and acceptance_criterion_ids [AC-9]

  Then the API returns 422 with error code "ac_outside_user_story"

  And no row is inserted in atcs, atc_steps, or atc_assertions



Scenario: Reject ATC when module is not in the user story's project subtree

  Given a User Story US-100 belongs to project P-1

  And module M-99 belongs to project P-2

  When the user POSTs /atcs with user_story_id US-100 and module_id M-99

  Then the API returns 422 with error code "module_outside_project_subtree"



Scenario: Step positions must be strictly increasing from 1

  Given an authenticated member

  When the user POSTs /atcs with steps positions [1, 3, 2]

  Then the API returns 422 with error code "steps_position_invalid"

  And the response body lists the offending positions



Scenario: PATCH /atcs/{id} updates fields and cascade-replaces steps and assertions atomically

  Given an existing ATC at version 1 with 3 steps and 1 assertion

  When the user PATCHes /atcs/{id} with a new title and a replacement steps array of 2 steps

  Then the API returns 200 with version 2

  And the old steps and assertions are deleted in the same transaction as the new inserts

  And an atc.updated event is emitted with affected_test_ids

---

## Business Rules

- acceptance_criterion_ids[] must all belong to the supplied user_story_id (cross-entity check)

- module_id must equal the user story's module OR be a descendant module within the same project (subtree check)

- layer must be one of {UI, API, Unit} — enum constraint at DB and API level

- steps[] positions must be integers, strictly increasing, starting at 1

- tags[] max length is 10; title length 3..200 chars; step content max 2KB Markdown

- slug is computed once on create and is immutable across edits (renames do not change slug)

- version integer is monotonically increasing per ATC; PATCH increments by 1

---

## Scope

- POST /atcs endpoint with full body validation (title, module_id, user_story_id, AC ids, layer, steps[], assertions[], tags[])

- PATCH /atcs/{id} endpoint with partial update + cascade replace of steps/assertions

- Transactional insert/update of atcs + atc_steps + atc_assertions tables

- Slug computation "{module-slug}/{atc-id-padded}"

- Cross-entity validation (AC belongs to US, module in project subtree, layer enum, step positions)

- Event emission: atc.created on POST, atc.updated on PATCH (with affected_test_ids count)

- OpenAPI spec entries for both endpoints with request/response schemas

- Unit + integration tests (cross-entity rules, transaction rollback on failure)

---

## Workflow

A member calls POST /atcs with a fully-formed payload. The API layer validates schema (zod/openapi) then performs cross-entity checks against user_stories, acceptance_criteria, and modules tables. Inside a single SQL transaction the service inserts the atcs row, then bulk-inserts atc_steps and atc_assertions referencing the new atc_id, then computes and persists the slug. On commit the event bus emits atc.created with the full payload. PATCH /atcs/{id} follows the same path but starts by loading the current row, applies the partial update, deletes-then-inserts steps and assertions in the same transaction, increments version, and emits atc.updated with the list of test_ids that reference this ATC.

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
- **Assignee:** Luis Daniel Medina Meléndez 
- **Labels:** api, atc, backend, mvp, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:07.001Z_
