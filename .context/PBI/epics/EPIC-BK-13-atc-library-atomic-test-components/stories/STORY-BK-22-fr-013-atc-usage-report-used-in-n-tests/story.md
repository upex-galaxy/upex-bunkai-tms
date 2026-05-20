# FR-013 — ATC usage report ("Used in N tests")

**Jira Key:** [BK-22](https://upexgalaxy67.atlassian.net/browse/BK-22)
**Epic:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
**Priority:** Medium
**Story Points:** 1
**Status:** Backlog

---

## User Story

As a tester evaluating whether an ATC is safe to edit or delete,

I want to see which Tests reference this ATC and in what position,

So that I can assess blast radius before making changes.



Anchors PRD US 4.5 and implements SRS FR-013. Powers the "Used in N tests" widget on the ATC detail page and the impact preview before any destructive action.

---

## Acceptance Criteria

Scenario: ATC referenced by multiple Tests

  Given ATC X is referenced by Tests T-1 (position 2), T-2 (position 1), and T-3 (position 4)

  When the user calls GET /atcs/{id}/usage

  Then the API returns 200 with used_in array of 3 entries

  And each entry includes test_id, slug, title, and position_in_test

  And the array is ordered by test slug ascending



Scenario: ATC not referenced anywhere

  Given ATC Y has never been used in any Test

  When the user calls GET /atcs/{id}/usage

  Then the API returns 200 with an empty used_in array

  And no error is raised



Scenario: ATC referenced multiple times in the same Test

  Given ATC Z is used in Test T-5 at positions 1 and 3

  When the user calls GET /atcs/{id}/usage

  Then the response includes two entries for T-5 with position_in_test 1 and 3 respectively

  And both entries carry the same test_id, slug, and title



Scenario: Usage report respects workspace scope

  Given ATC X exists in workspace W-1

  And a viewer of workspace W-2 attempts to call GET /atcs/{id}/usage

  Then the API returns 404 with error code "atc_not_found"

---

## Business Rules

- The endpoint reads from test_steps (join table linking Tests to ATCs), never from atc_steps

- Each row in test_steps with atc_id = {id} produces one entry in used_in

- position_in_test is the position field on test_steps, not on atc_steps

- Results are ordered by test slug ASC for stable UI rendering; ties broken by position ASC

- Workspace scoping returns 404 (not 403) when the ATC belongs to a different workspace, to avoid leaking existence

---

## Scope

- GET /atcs/{id}/usage endpoint

- Query joins test_steps to tests, filtered by test_steps.atc_id

- Response shape: { used_in: [{ test_id, slug, title, position_in_test }] } ordered by slug ASC

- Multiple positions in the same Test return as multiple entries

- Empty array on zero references (no special "not used" payload)

- Workspace scoping enforced at service layer

- Unit tests for empty / single / multi-position / multi-test cases

- OpenAPI entry

---

## Workflow

The ATC detail page calls GET /atcs/{id}/usage on mount. The service loads the ATC to verify it exists in the caller's workspace (returns 404 if not), then queries test_steps JOIN tests WHERE test_steps.atc_id = {id}, ordered by tests.slug ASC then test_steps.position ASC. Each row becomes one entry in the used_in array. The client renders this as a list under "Used in N tests" with deep links to each referencing Test.

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
- **Labels:** atc, mvp, reporting, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:08.573Z_
