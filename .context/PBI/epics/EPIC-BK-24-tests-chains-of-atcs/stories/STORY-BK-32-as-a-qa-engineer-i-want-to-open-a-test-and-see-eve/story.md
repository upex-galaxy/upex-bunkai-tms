# TMS-Test View | View a test with all chained ATCs expanded

**Jira Key:** [BK-32](https://jira.upexgalaxy.com/browse/BK-32)
**Epic:** [BK-24](https://jira.upexgalaxy.com/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** 3
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

# BK-32: TMS-Test View | View a test with all chained ATCs expanded

## Source

- Source spec: BK-017
- Parent epic: BK-24 Tests (chains of ATCs)
- Formal dependency: BK-27 Test assembly and canonical chain order

## User Story

As a QA Engineer, I want to open a Test and see all of its chained ATCs expanded in order, each showing its steps and assertions in a single read-only view, so that I can review exactly what the Test will validate, in the exact sequence it will run, before I commit to executing it.

## Shift-Left Review Status

- Verdict: Needs PO/Dev confirmation
- Reason: The Story is clear enough to refine, but not ready for estimation until two contract points are confirmed: zero-ATC behavior and final route path.
- QA note: Full shift-left package and QA handoff mirror are available in Jira comments `11583` and `11584`.

## Key Contract Decisions

| Decision | Contract |
| --- | --- |
| Expanded read | Default refinement route is `/api/v1/tests/{id}?expand=atcs.steps,atcs.assertions`; `/tests/{id}` remains source-spec shorthand until Dev confirms final routing. |
| Read model | Expanded Test view shows the Test header plus ordered ATC chain, steps, and assertions in one read. |
| Order source | Display order must come from the saved Test chain order, not client-side sorting. |
| Content freshness | Expanded view should show live/latest saved ATC content. Snapshot behavior belongs to Run/history/audit, not this Test definition view. |
| Read-only UX | No edit, reorder, add, or remove controls are in scope. |
| Permissions | Viewer/member/admin/owner may read inside their workspace unless Dev/Security defines stricter rules; cross-workspace access must not leak Test or ATC details. |
| Empty state | Zero-ATC empty state is conditional and needs PO/Dev confirmation because BK-27 says a Test must contain at least one ATC. |

## Refined Acceptance Criteria

```gherkin
Background:
  Given Elena is signed in to workspace "Acme QA"
    And Elena has read access to the project
    And Test "Add to Cart from Empty State" exists in that workspace
    And the Test has an ATC chain saved in execution order
    And each chained ATC has ordered steps and ordered assertions

Scenario: Elena views a Test with all chained ATCs expanded in execution order
  Given the Test contains ATCs [ATC-A, ATC-B, ATC-C]
  When Elena opens the Test detail view
  Then the view shows ATC-A as position 1, ATC-B as position 2, and ATC-C as position 3
    And each ATC is expanded inline
    And each ATC shows its ordered steps
    And each ATC shows its ordered assertions
    And the top summary shows "3 ATCs"

Scenario: Expanded view reflects the latest saved ATC content
  Given ATC-B was edited elsewhere and its latest saved version has 4 steps and 2 assertions
  When Elena opens or refreshes the Test detail view
  Then ATC-B shows the latest saved 4 steps and 2 assertions
    And the Test chain order remains unchanged

Scenario: The expanded Test view is strictly read-only
  Given Elena is viewing the expanded Test
  Then she cannot edit ATC title, steps, assertions, or chain position from this view
    And she cannot add or remove ATCs from this view
    And no reorder controls are available in this view

Scenario: User cannot view a Test from another workspace
  Given Pablo belongs to workspace "Other Co"
  When Pablo attempts to open a Test owned by workspace "Acme QA"
  Then the system denies access without exposing the foreign Test's ATCs, steps, or assertions

Scenario: Missing Test shows a safe not-found state
  Given the requested Test id does not exist or is not visible to the current user
  When the user opens the Test view
  Then the system shows a safe not-found state
    And no ATC details are displayed

Scenario: Test has no ATCs yet
  Given PO and Dev have confirmed zero-ATC Tests can exist
    And Test "Draft Checkout Flow" has no ATCs
  When Elena opens the Test detail view
  Then the view shows a clear empty state
    And the top summary shows "0 ATCs"
    And the page is not blank

Scenario: Expanded read returns full chain in one round trip
  Given the Test contains 7 ATCs
  When the client requests the expanded Test read with steps and assertions
  Then the response includes the Test header, ordered ATC chain, steps, and assertions in one response
    And the response meets the BK-24 target of <500ms p95 for a 7-ATC Test
```

## Open Confirmations

| Owner | Question | Expert recommendation |
| --- | --- | --- |
| PO/Dev | Should zero-ATC Tests exist for BK-32? | Do not accept zero-ATC Test as default. Keep the empty state only if BK-32 targets draft/legacy/deleted-chain recovery. |
| Dev | What is the final route? | Use `/api/v1/tests/{id}?expand=atcs.steps,atcs.assertions` unless Dev confirms bare `/tests/{id}`. |

## Out of Scope

- Test creation.
- Test reorder.
- Run execution.
- Editing, adding, or removing ATCs.
- Jira/Xray test case creation.
- QA execution evidence.

## Publication Notes

- Comments should complement this field, not duplicate it.
- Current comments include QA handoff mirror `11583` and full pre-publication package `11584`.
- Do not move to Estimation until PO/Dev confirmations are resolved.

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

### Storys (2)

- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Ready For Release)_
- [BK-147](https://jira.upexgalaxy.com/browse/BK-147): App Shell | Open ATCs and Tests as tabs with a persistent explorer _(Ready For Release)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 7/6/2026
- **Reporter:** Ely
- **Assignee:** jesusgpythondev
- **Labels:** needs-dev-confirmation, needs-po-confirmation, shift-left-2026-06-14, shift-left-reviewed, tests-epic

---

_Synced from Jira by sync-jira-issues_
