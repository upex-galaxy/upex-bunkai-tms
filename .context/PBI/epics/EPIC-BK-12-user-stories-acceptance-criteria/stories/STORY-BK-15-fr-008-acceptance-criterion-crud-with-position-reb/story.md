# Acceptance Criterion CRUD with position rebalance and ready_to_test gating

**Jira Key:** [BK-15](https://upexgalaxy67.atlassian.net/browse/BK-15)
**Epic:** [BK-12](https://upexgalaxy67.atlassian.net/browse/BK-12) (User Stories & Acceptance Criteria)
**Priority:** Medium
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

***Source spec:*** FR-008

## User story

As a Project member, I want to create, read, update, delete and reorder ***Acceptance Criteria*** under a User Story so I can describe the testable behavior of each Story and block premature `ready*to*test` transitions.

This story implements FR-008 and PRD US 3.2. It enforces the rule that a User Story cannot be marked `ready*to*test` until it has at least one Acceptance Criterion. `position` is an integer sort order rebalanced on insert/move/delete to keep gaps under control.

## Business rules

- `title` required, length 3-200 chars.
- `description` optional Markdown, max 50KB.
- `position` is a positive integer, unique per `user*story*id` (enforced by a unique partial index).
- On insert with `position=N`, all siblings with `position >= N` shift by `+1`.
- On delete, siblings with `position > deleted.position` shift by `-1`.
- A User Story cannot transition to `status="ready*to*test"` while `count(ACs where deleted_at IS NULL) = 0`.

## Workflow

From a User Story detail page the user clicks ***Add Acceptance Criterion***. A modal opens with title and Markdown description. On submit the client POSTs to `/api/acceptance-criteria`. The Next.js route handler validates input with Zod, opens a transaction against Supabase, runs the position-rebalance UPDATE that shifts siblings, inserts the new row, and commits. When the user later attempts to mark the parent Story `ready*to*test`, a separate route checks the AC count via SQL and returns `409` if zero.

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

---

## Acceptance Criteria

```gherkin
Feature: Acceptance Criterion CRUD with position rebalance and ready*to*test gating

  Scenario: Create an Acceptance Criterion under a User Story
    Given a User Story US1 exists in a Project the user belongs to
    When the user POSTs an AC with user*story*id=US1, title="User can submit valid creds", description="Given... When... Then..."
    Then the API responds 201 with { acceptance_criterion } including position=1
    And the AC appears in the US1 detail response

  Scenario: Reorder rebalances positions across siblings
    Given US1 has three ACs at positions 1, 2, 3
    When the user moves the third AC to position 1
    Then the three ACs are persisted with positions 1, 2, 3 in the new order
    And no two ACs share the same position within US1

  Scenario: Block ready*to*test when no AC exists
    Given a User Story US2 with zero Acceptance Criteria
    When the user PATCHes US2 with status="ready*to*test"
    Then the API responds 409 with { error: "ac*required*for*ready*to_test" }
    And the status of US2 remains the previous value

  Scenario: Reject AC whose User Story is in another Workspace
    Given User Story USx belongs to a Project outside the caller's Workspace
    When the user POSTs an AC with user*story*id=USx
    Then the API responds 403 with { error: "user*story*not*in*workspace" }

  Scenario: Title length boundary
    Given the user submits an AC with a 2-character title
    When the request is validated
    Then the API responds 422 with { error: "title*too*short", min: 3 }
```

---

## Business Rules

- title required, length 3-200 chars

- description optional Markdown, max 50KB

- position is a positive integer, unique per user*story*id (enforced by unique partial index)

- on insert with position=N, all siblings with position >= N shift by +1

- on delete, siblings with position > deleted.position shift by -1

- a User Story cannot transition to status="ready*to*test" while count(ACs where deleted_at IS NULL) = 0

---

## Scope

- POST /api/acceptance-criteria - create AC under a User Story
- GET /api/acceptance-criteria/:id - fetch one AC
- GET /api/user-stories/:us_id/acceptance-criteria - list ACs ordered by position
- PATCH /api/acceptance-criteria/:id - update title, description, position
- DELETE /api/acceptance-criteria/:id - soft delete
- Position-rebalance SQL (renumber siblings on insert/move/delete)
- ready*to*test status guard on user_stories.status transition
- OpenAPI schemas for AcceptanceCriterionCreate / AcceptanceCriterionUpdate

---

## Workflow

From a User Story detail page the user clicks "Add Acceptance Criterion". A modal opens with title and Markdown description. On submit the client POSTs to /api/acceptance-criteria. The route handler validates input with Zod, opens a transaction, runs the position-rebalance SQL (a single UPDATE shifting siblings), inserts the new row, and commits. When the user later attempts to mark the parent Story ready*to*test, a separate route checks the AC count via SQL and returns 409 if zero.

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
- **Labels:** acceptance-criteria, mvp, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-21T05:14:29.135Z_
