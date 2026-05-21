# ATC usage report ("Used in N tests")

**Jira Key:** [BK-22](https://upexgalaxy67.atlassian.net/browse/BK-22)
**Epic:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
**Priority:** Medium
**Story Points:** -
**Status:** Shift-Left QA

---

## User Story

***Source spec:*** FR-013

## User Story

As a tester reviewing an ATC, I want a "Used in N tests" report on the ATC detail page, so that I can see the downstream impact of any change before I make it.

## Context

Anchors PRD US 4.5 and implements SRS FR-013. Powers the "Used in N tests" widget on the ATC detail page and the impact preview before any destructive action.

---

## Acceptance Criteria

```gherkin
Scenario: User views usage report for an ATC with active tests
Given an ATC atc_id = 42 referenced by 3 active Tests
And the caller has at least viewer role on the workspace
When the caller GETs /atcs/42/usage
Then the response is 200 OK
And used_in[] contains exactly 3 entries
And each entry has { test*id, slug, title, position*in_test }

Scenario: ATC with zero usage returns empty list
Given an ATC atc_id = 99 not referenced by any Test
When the caller GETs /atcs/99/usage
Then the response is 200 OK
And used_in[] equals []
And the response is NOT 404

Scenario: Same ATC chained multiple times in one Test
Given Test T1 chains ATC 42 at positions 1, 4, and 7
When the caller GETs /atcs/42/usage
Then used_in[] contains 3 entries for T1
And position*in*test values are 1, 4, 7
```

---

## Business Rules

- The endpoint reads from test*steps (join table linking Tests to ATCs), never from atc*steps

- Each row in test*steps with atc*id = {id} produces one entry in used_in

- position*in*test is the position field on test*steps, not on atc*steps

- Results are ordered by test slug ASC for stable UI rendering; ties broken by position ASC

- Workspace scoping returns 404 (not 403) when the ATC belongs to a different workspace, to avoid leaking existence

---

## Scope

- GET /atcs/{id}/usage endpoint

- Query joins test*steps to tests, filtered by test*steps.atc_id

- Response shape: { used*in: [{ test*id, slug, title, position*in*test }] } ordered by slug ASC

- Multiple positions in the same Test return as multiple entries

- Empty array on zero references (no special "not used" payload)

- Workspace scoping enforced at service layer

- Unit tests for empty / single / multi-position / multi-test cases

- OpenAPI entry

---

## Workflow

The ATC detail page calls GET /atcs/{id}/usage on mount. The service loads the ATC to verify it exists in the caller's workspace (returns 404 if not), then queries test*steps JOIN tests WHERE test*steps.atc*id = {id}, ordered by tests.slug ASC then test*steps.position ASC. Each row becomes one entry in the used_in array. The client renders this as a list under "Used in N tests" with deep links to each referencing Test.

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
- **Labels:** atc, mvp, reporting, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-21T05:14:29.688Z_
