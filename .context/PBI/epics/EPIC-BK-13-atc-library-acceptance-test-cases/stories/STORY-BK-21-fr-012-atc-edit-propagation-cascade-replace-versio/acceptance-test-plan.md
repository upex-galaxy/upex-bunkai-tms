# BK-21 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-21)

# Acceptance Test Plan - BK-21 - TMS-ATC Propagation

***Story******:*** BK-21 - TMS-ATC Propagation | Cascade ATC edits to all tests  
***Epic******:*** BK-13 - ATC Library (Atomic Test Components)  
***Status******:*** Draft ATP based on Shift-Left QA refinement

## Objective

Validate that editing a reusable ATC updates all live Tests that reference that ATC, without copying ATC step/assertion content into Tests, while preserving version safety, transaction integrity, authorization boundaries, contract accuracy, and historical Run evidence.

## Primary Quality Risks

- Tests may copy ATC step/assertion content instead of referencing `test*steps.atc*id`, breaking propagation.
- A stale edit may overwrite a newer ATC version if optimistic concurrency is not enforced.
- Partial save failures may leave ATC metadata, steps, assertions, or anchors inconsistent.
- Live Tests may update correctly, but historical Runs may be incorrectly mutated.
- OpenAPI may not match the implemented PATCH contract, blocking reliable API/automation coverage.

## Scope

### In scope

- ATC edit propagation to active referencing Tests.
- DB/integration validation of reference integrity.
- ATC version increment and stale-version conflict handling.
- Affected Test count for zero, one, and many referencing Tests.
- Transactional replacement of steps and assertions.
- Module / User Story / Acceptance Criteria anchor validation.
- Layer compatibility validation against referencing Tests.
- Authorization for viewer and cross-workspace access.
- `atc.updated` event emission after commit.
- Historical Run snapshot preservation.
- OpenAPI contract alignment for headers, response, and errors.
- UI confirmation and stale-version conflict messaging.

### Out of scope

- Full ATC CRUD regression outside edit propagation.
- Test execution engine behavior unrelated to ATC edit visibility.
- Performance/load testing for very large affected Test sets unless PO/Dev defines a target.

## Assumptions / Open Decisions To Confirm

- Propagation means updated content is visible on the next Test detail read, unless PO/Dev defines realtime behavior.
- `If-Match` is expected for optimistic concurrency, but final required/optional behavior must be confirmed.
- Final PATCH response is expected to include `atc`, `version`, and `affected*test*count`; OpenAPI must confirm this.
- User Story anchor mutability must be explicitly confirmed.
- Archived ATC/Test behavior and affected Test counting rules must be confirmed.
- Historical Runs must preserve execution snapshots after live ATC edits.

## Test Scenarios

| ID | Layer | Scenario | Priority | Expected Result |
| --- | --- | --- | --- | --- |
| BK21-T01 | Integration | Edit one ATC step while the ATC is referenced by multiple active Tests | Critical | All referencing Tests render the updated step on next read and keep the same ATC id reference |
| BK21-T02 | DB/Integration | Inspect Test-to-ATC relationship after edit | Critical | `test_steps` stores ATC references and does not copy ATC step/assertion content |
| BK21-T03 | API | Save a valid ATC edit | Critical | ATC version increments and response includes the new version |
| BK21-T04 | API | Save with stale `If-Match` version | Critical | Request is rejected with version conflict and latest ATC remains unchanged |
| BK21-T05 | API | Save with missing or malformed `If-Match` | High | System follows the final documented contract consistently |
| BK21-T06 | API | Edit an ATC referenced by many active Tests | High | Response returns correct `affected*test*count` |
| BK21-T07 | API | Edit an unused ATC | High | Save succeeds and `affected*test*count = 0` |
| BK21-T08 | API/DB | Force failure during step/assertion replacement | Critical | Full transaction rolls back; previous ATC version, steps, assertions, and anchors remain unchanged |
| BK21-T09 | API | Submit invalid Module / User Story / Acceptance Criteria anchor combination | High | Edit is rejected and ATC remains unchanged |
| BK21-T10 | API | Attempt User Story anchor change | High | Behavior matches final mutability decision and is documented |
| BK21-T11 | API | Change ATC layer to value incompatible with referencing Tests | High | Edit is rejected with stable validation error and ATC remains unchanged |
| BK21-T12 | Authorization | Viewer attempts to edit ATC | High | Request is rejected with insufficient permissions |
| BK21-T13 | Authorization | User from another workspace attempts to edit ATC | Critical | Request is rejected and source ATC is not mutated |
| BK21-T14 | Event | Successful ATC edit commits | Medium | `atc.updated` event is emitted with `atc_id`, new `version`, and affected Test ids |
| BK21-T15 | Integration | Edit ATC after a Run already executed a Test using it | Critical | Live Tests show updated ATC content; historical Run keeps captured snapshot |
| BK21-T16 | Contract | Compare OpenAPI with implemented endpoint behavior | High | OpenAPI documents `If-Match`, final 200 response shape, 403, 409, and 422 errors |
| BK21-T17 | UI | Save ATC edit that affects multiple Tests | Medium | UI shows user-readable confirmation with affected Test count |
| BK21-T18 | UI | Save stale ATC version after another user updated it | Medium | UI shows conflict message and prevents overwriting newer version |

## Test Data Needed

- Workspace member with edit permission.
- Viewer/read-only user in same workspace.
- User from another workspace.
- ATC not referenced by any Test.
- ATC referenced by one active Test.
- ATC referenced by multiple active Tests.
- Test that references the same ATC more than once, if supported.
- Archived Test and archived ATC records, if behavior is in scope.
- Historical Run snapshot containing a Test that uses the edited ATC.

## Entry Criteria

- BK-21 implementation is deployed to the target QA/staging environment.
- Final PATCH contract is documented or otherwise confirmed by Dev.
- Test data can be created or seeded for active, unused, cross-workspace, viewer, and historical Run cases.
- DB/API access is available for reference-integrity validation.

## Exit Criteria

- All Critical scenarios pass.
- High-priority failures are either fixed or explicitly accepted with PO/QA sign-off.
- No unresolved defect breaks ATC reference integrity, version conflict protection, transaction rollback, authorization, or historical Run evidence.
- OpenAPI and implemented behavior are aligned for the tested contract.

## Automation Candidate Notes

- Best automation candidates: BK21-T01, BK21-T02, BK21-T03, BK21-T04, BK21-T08, BK21-T13, BK21-T15, BK21-T16.
- UI scenarios BK21-T17 and BK21-T18 are useful as smoke/regression after API behavior stabilizes.

---
_Synced from Jira by sync-jira-issues_
