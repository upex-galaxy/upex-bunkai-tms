# FR-012 — ATC edit propagation (cascade replace, version bump, affected_test_ids)

**Jira Key:** [BK-21](https://upexgalaxy67.atlassian.net/browse/BK-21)
**Epic:** [BK-13](https://upexgalaxy67.atlassian.net/browse/BK-13) (ATC Library (Atomic Test Components))
**Priority:** Medium
**Story Points:** 1
**Status:** Backlog

---

## User Story

As a tester maintaining shared ATCs,

I want edits to an ATC to propagate automatically to every Test that references it,

So that a single change updates downstream tests without manual re-stitching.



Anchors PRD US 4.4 and implements SRS FR-012. Builds on the PATCH endpoint from FR-010a; this story owns the propagation event payload and the affected-test report.

---

## Acceptance Criteria

Scenario: PATCH /atcs/{id} bumps version and emits affected_test_ids

  Given an ATC at version 3 referenced by 5 Tests

  When a member PATCHes the ATC with new step content

  Then the API returns 200 with version 4 and affected_test_count 5

  And the emitted atc.updated event payload includes affected_test_ids of length 5

  And no row in test_steps is copied or modified — Tests reference the ATC by id, not by copied content



Scenario: Layer change is allowed and propagates

  Given an ATC at layer "UI" referenced by 2 Tests

  When the author PATCHes layer to "API"

  Then the API returns 200 with the new layer

  And affected_test_count is 2

  And the layer change is visible immediately to any subsequent GET on the Tests



Scenario: Reject layer change when the new layer breaks a referencing Test's policy

  Given a Test that requires all referenced ATCs to be layer "UI"

  When the author PATCHes a referenced ATC to layer "Unit"

  Then the API returns 422 with error code "layer_breaks_test_policy"

  And the response lists the offending test_ids

  And no update is persisted



Scenario: Version skew rejection (optimistic concurrency)

  Given client loaded ATC at version 5

  And another user has since PATCHed it to version 6

  When the first client PATCHes with If-Match: 5

  Then the API returns 409 with error code "version_conflict"

  And the response includes the current server version



Scenario: Caller without member role cannot PATCH

  Given an authenticated user with role "viewer"

  When the user PATCHes /atcs/{id}

  Then the API returns 403 with error code "insufficient_role"

---

## Business Rules

- Tests reference ATCs by atc_id in test_steps; step content is NEVER copied at composition time. This guarantees automatic propagation.

- version is monotonically increasing per atc_id; PATCH increments by exactly 1

- Layer changes are allowed but validated against each referencing Test's layer policy

- affected_test_ids includes only Tests that currently reference this ATC at patch time (not historical references)

- Role hierarchy for PATCH: viewer < member < admin; member is the minimum

- Module / US / AC changes must satisfy the same cross-entity rules as FR-010a create

---

## Scope

- Wire affected_test_ids computation to the existing PATCH /atcs/{id} from FR-010a

- Version increment on every successful PATCH (monotonic, gap-free per ATC)

- Optimistic concurrency via If-Match header against current version

- Emit atc.updated event with { atc_id, version, affected_test_ids[] }

- Cross-entity validation for layer/module/US changes (reuse FR-010a rules)

- Role check: PATCH requires role >= member

- Integration tests proving Tests see the change without copying step content

- Performance: affected_test_ids query uses index on test_steps.atc_id

---

## Workflow

A member calls PATCH /atcs/{id} with an If-Match header carrying the version they loaded. The service layer loads the current row, checks the version matches (else 409), validates cross-entity rules including any layer change against referencing Tests, applies the update in a single transaction (atcs row + cascade replace of atc_steps and atc_assertions), increments version, and computes affected_test_ids by querying test_steps.atc_id = {id}. On commit the event bus emits atc.updated with the version and the affected_test_ids array. Downstream Tests pick up the change on their next GET because they store only the reference, not the content.

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
- **Labels:** atc, mvp, propagation, wave-2

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-20T00:58:08.291Z_
