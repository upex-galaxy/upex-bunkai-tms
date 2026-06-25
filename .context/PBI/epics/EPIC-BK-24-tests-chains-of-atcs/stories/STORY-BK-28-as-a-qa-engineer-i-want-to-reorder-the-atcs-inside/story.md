# TMS-Test Builder | Reorder ATCs inside a test

**Jira Key:** [BK-28](https://jira.upexgalaxy.com/browse/BK-28)
**Epic:** [BK-24](https://jira.upexgalaxy.com/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** QA Approved
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

# TMS-Test Builder | Reorder ATCs inside a test

## User Story

As a QA Engineer (Elena persona), I want to reorder the ATCs inside an existing Test so that I can fix the execution sequence after discovering the original order does not match the User Story flow I am verifying.

## Source

Source spec: BK-016

## Shift-Left Review Status

This Story has been reviewed through the shift-left workflow with expert-development-team-analysis and is ready for estimation.

Note: BK-28 is blocked-by BK-27 (Test assembly). The tests and test_steps tables do not exist yet. BK-27 must land first or in the same sprint with BK-27 scheduled before BK-28.

## Scope

### In Scope

- Reorder the ATC chain inside an existing Test, preserving the exact set of ATCs.
- Permission gate: workspace role member and above can reorder; viewer cannot.
- New order is visible immediately after saving and persists across page reloads.
- Activity log records who reordered, when, and the full before/after chain.
- Same reorder operation works from UI and from API clients (PAT bearer).
- Optimistic locking via If-Match header with 409 conflict response.
- No-op detection: submitting the same order returns 200 without version bump or event.
- Chain validation: set equality, uniqueness, and non-empty checks before DB write.

### Out Of Scope

- Adding or removing ATCs from a Test; covered by BK-27 (Test assembly).
- Test creation or editing of Test metadata.
- Run execution or step result updates; covered by BK-34 through BK-39.
- Activity log viewing UI; this Story only creates the event.

## Acceptance Criteria

```gherkin
Background:
  Given an authenticated workspace member with role member or higher
    And a Project exists in the active workspace
    And a Test exists in that Project with ATC chain [ATC-A, ATC-B, ATC-C, ATC-D] at version 1
    And the member has a PAT with scope test:write

Scenario: Successful reorder of ATC chain
  Given the user submits a new chain order [ATC-A, ATC-D, ATC-B, ATC-C]
    And the user sends If-Match header with version 1
  When the reorder request is processed
  Then the response is 200 with version 2
    And the DB positions are updated (position 1 = A, position 2 = D, position 3 = B, position 4 = C)
    And a test.reordered event is logged with old*chain and new*chain

Scenario: Reorder persists across reads
  Given a successful reorder has been applied
  When the Test is fetched via GET
  Then the chain reflects the new order
    And the version number has incremented

Scenario: No-op when same order is submitted
  Given the current chain is [ATC-A, ATC-B, ATC-C]
  When the user submits the identical chain [ATC-A, ATC-B, ATC-C]
  Then the response is 200
    And the version remains unchanged
    And updated_at remains unchanged
    And no event is logged

Scenario: Single-ATC Test reorder is no-op
  Given the Test has only one ATC [ATC-A]
  When the user submits chain [ATC-A]
  Then the response is 200
    And the version remains unchanged
    And no event is logged

Scenario: Unauthenticated request is rejected
  Given no authentication header is provided
  When the reorder request is sent
  Then the response is 401 unauthorized
    And no rows are updated

Scenario: Viewer role is forbidden from reordering
  Given the user has role viewer
  When the reorder request is sent
  Then the response is 403 forbidden
    And no rows are updated

Scenario: Version conflict on concurrent reorder
  Given two concurrent reorder requests both send If-Match version 1
  When the first request succeeds with 200 and version 2
  Then the second request receives 409 conflict
    And the 409 body includes current*chain and current*version = 2
    And only one test.reordered event is logged

Scenario: Chain mismatch returns validation error
  Given the Test has ATCs [ATC-A, ATC-B, ATC-C]
  When the submitted chain includes ATC-X which is not in the Test
  Then the response is 422 chain_mismatch
    And the body includes missing = [ATC-B] and extra = [ATC-X]
    And no rows are updated

Scenario: Duplicate ATC ids in chain are rejected
  When the submitted chain is [ATC-A, ATC-A, ATC-B]
  Then the response is 422 chain_invalid
    And the error indicates duplicate references
    And no rows are updated

Scenario: Empty chain is rejected
  When the submitted chain is an empty array
  Then the response is 422 chain_invalid
    And the error indicates at least one ATC is required
    And no rows are updated

Scenario: Activity log captures reorder event
  Given a successful reorder from [ATC-A, ATC-B, ATC-C] to [ATC-C, ATC-A, ATC-B]
  When the activity log is queried
  Then a test.reordered event exists
    And the event includes old*chain, new*chain, author_id, and timestamp

Scenario: Retry-safe double-click returns no-op
  Given a reorder was already applied (version bumped to 2)
  When the same reorder request is sent again with If-Match version 2
  Then the response is 200
    And the version remains 2 (no-op, same order)
    And only one test.reordered event exists total
```

## Business Rules

- A reorder preserves the set of ATCs exactly — set equality is enforced, not just length.
- Optimistic locking via If-Match header: absent header skips the version check (lenient mode), but version still bumps on real change.
- Error codes follow the existing API*ERROR*CODES envelope: chain*mismatch (422) with details.missing and details.extra, chain*invalid (422) for structural violations, conflict (409) for version mismatch.
- Permission gate: requireAuth() + role check (member/admin/owner). Viewer gets 403. RLS policy provides defense in depth at DB level.
- Activity log event shape: test.reordered with test*id, author*id, old*chain (array of uuids), new*chain (array of uuids), and timestamp.
- API endpoint: PATCH /api/v1/tests/{id}/reorder — dedicated sub-resource, body is the complete new order (not a diff).
- No-op detection: JSON.stringify comparison of ordered arrays. Exact match = no version bump, no event, no updated_at change.
- Chain validation: set equality + uniqueness check before DB write. Zod superRefine for duplicates.
- Version field: tests table needs version int (BK-27 should include it; if not, BK-28 adds migration).
- DB operation: UPDATE test_steps positions in a single transaction — atomic, no partial state.
- Idempotency: not needed as a separate mechanism — optimistic locking + no-op detection make retries inherently safe.

## Open Clarifications With Expert Recommendations

### PO: If-Match lenient vs strict mode

Question: Should the reorder endpoint enforce strict If-Match (reject when header is absent) or stay lenient (skip check when absent)?

Expert recommendation: Lenient mode. UI clients may not track version — absent header skips the check, version still bumps on real change. Bearer/agent clients SHOULD send it for safety. Strict mode can be added later if audit requirements demand it — changing from lenient to strict is backward-compatible; the reverse is not.

Pending confirmation: PO confirms lenient mode is acceptable for MVP.

### PO: Activity log detail level

Question: Should the activity log store full before/after chains or just a summary?

Expert recommendation: Full chains in event payload. Debugging needs before/after, not just "someone reordered". Event consumers (future activity-log UI, BK-30 Runs) can filter or aggregate as needed.

Pending confirmation: PO confirms full-chain storage is the right level of detail.

### Architect: Version field migration ownership

Question: Should BK-27 (Test assembly) include the version column, or should BK-28 add its own migration?

Expert recommendation: BK-27 should include version int on the tests table. If BK-27 ships without it, BK-28 adds ALTER TABLE tests ADD COLUMN version int not null default 1 — same pattern as atcs.version in migration 0004.

Pending confirmation: Architect confirms which Story owns the migration.

### Developers: Conflict resolution UX pattern

Question: What should the user see when a 409 conflict occurs during reorder?

Expert recommendation: Modal with side-by-side comparison (Your order vs Current order). Two buttons: "Keep theirs" (reload) and "Apply mine" (retry with new version). Modal shows ATC titles (not just ids) for readability.

Pending confirmation: Design confirms modal layout and copy.

### QA Lead: Minimum ATP coverage gate

Question: What must be tested before BK-28 can be QA-approved?

Expert recommendation: Cover successful reorder, persistence, no-op same order, single-ATC no-op, unauthenticated rejection, viewer forbidden, version conflict, chain mismatch, duplicate ids, empty chain, activity log, and retry-safe double-click. 12 scenarios total.

Pending confirmation: QA Lead confirms these remain the minimum ATP coverage for sprint testing.

### Delivery: BK-27 dependency readiness

Question: Can BK-28 move forward while BK-27 (Test assembly) is not yet complete?

Expert recommendation: BK-28 can stay in Estimation for sizing, but should not move to Ready For Dev until BK-27 has landed and the tests/test_steps tables exist. If both are in the same sprint, BK-27 must be scheduled before BK-28.

Pending confirmation: Delivery/PO confirms whether BK-28 is estimated now or held until BK-27 is ready.

## Definition of Done

- [ ] Functionality available behind the workspace's role permissions (member and above can reorder; viewer cannot)
- [ ] New order is visible immediately after saving and persists across page reloads
- [ ] Activity log records who reordered the Test, when, and what the new chain looks like
- [ ] The same reorder operation works whether triggered from the UI or from an API client using the Bunkai surface
- [ ] Acceptance criteria validated end-to-end against staging
- [ ] No P0 / P1 bugs open against this story

## References

- ATP Draft and scenario matrix are documented in the shift-left handoff comment.
- Labels: shift-left-reviewed, shift-left-2026-06-09.
- Previous analysis (v2, 2026-06-04) was restructured into this format; all senior decisions preserved inline above.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Implementation Plan (Dev)](./implementation-plan.md)

---

## Traceability

### Story (1)

- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(QA Approved)_

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 6/23/2026
- **Reporter:** Ely
- **Assignee:** jesusgpythondev
- **Labels:** master-sprint-4, mvp, shift-left-2026-06-09, shift-left-reviewed, tests-epic

---

_Synced from Jira by sync-jira-issues_
