# TMS-Test Plan | Add and remove tests from a plan

**Jira Key:** [BK-203](https://jira.upexgalaxy.com/browse/BK-203)
**Epic:** [BK-201](https://jira.upexgalaxy.com/browse/BK-201) (Test Plans & Milestones)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As Elena Vargas, Senior QA Engineer, I want to add existing Tests to a test plan and remove them, so that the plan reflects exactly the verification scope agreed for its goal.

## Context

A Test Plan is only useful once it holds the right Tests. This story delivers membership curation: picking Tests from the project's existing test library and removing ones that no longer belong. Membership is by reference — the same Test can serve several plans (a smoke plan and a regression plan may share it), and removing a Test from a plan never touches the Test itself. This story activates once its dependency epics (Tests, Manual Execution & Runs) and the plan container story are live.

## QA Refinements (Shift-Left Analysis)

> Full refinement: `.context/PBI/epics/EPIC-BK-201-test-plans-milestones/stories/STORY-BK-203-tms-test-plan-add-and-remove-tests-from-a-plan/shift-left-refinement.md`

### Data Feasibility Flag

***DATA-FEASIBILITY-RISK******:****** confirmed.*** No `test_plan`/`TestPlan` entity exists yet in the target repo (zero routes, zero migrations, zero source references). This Story is blocked on BK-202 (plan container, still `Estimation`) and the Tests dependency epic. This blocks execution, not design — the refinement below is fully derivable from the spec.

### Edge Cases Identified

1. Removing the last test returns the plan to its empty state with no residual count drift — High criticality, no AC covers it (Scenario 4.2).
2. Viewer's direct API attempt to add/remove, bypassing the absent UI control — High, test-only (established RBAC precedent).
3. Concurrent add of the same test to the same plan by two members near-simultaneously — Medium, exact rejection shape needs PO confirmation (Scenario E3).
4. Add-tests picker search returns 0 results — Low, empty-state copy needs confirmation (Scenario E4).
5. Membership change attempted on a Closed plan — hidden control vs. shown-then-rejected — Critical, no AC covers it (Scenario E1).
6. Test from a different project added via direct API, bypassing the picker's project-scoped search — High, enforcement layer needs confirmation (Scenario E2).

### Clarified Business Rules (pending PO confirmation)

- business-rules.md: "viewers are read-only" — read as UI controls not rendered at all (not disabled), pending PO confirmation.
- business-rules.md + out-of-scope.md: "Closed plans reject membership changes" — read as UI-hidden, but exact surfaced behavior is not stated; suggested: hidden UI + server-side rejection (double-gate), pending PO confirmation.
- business-rules.md: "Only Tests from the plan's own project can be added" — enforcement layer (picker-scope-only vs. also server-validated) not stated; suggested: both layers, pending PO confirmation.

### Open Questions for PO

1. Is membership editing on a Closed plan hidden from the UI entirely, or shown and then rejected on submit? Suggested: hide controls entirely, enforce server-side too (defense-in-depth).
2. Is cross-project Test isolation enforced only by scoping the picker's search results, or also validated server-side against a direct API call? Suggested: enforce both layers, consistent with this codebase's established multi-tenant isolation pattern.

### Open Questions for Dev

1. Exact error shape (status code + error code) for the three rejection paths: duplicate add, closed-plan add/remove, cross-project add.
2. Idempotency behavior on a rapid double-submit of the add-tests confirm action.
3. Empty-results state copy for the add-tests picker when a search term matches nothing.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Storys (2)

- [BK-202](https://jira.upexgalaxy.com/browse/BK-202): TMS-Test Plan | Create a test plan grouping tests for a goal _(Estimation)_
- [BK-204](https://jira.upexgalaxy.com/browse/BK-204): TMS-Test Plan | Track plan progress from run outcomes _(Backlog)_

---

## Metadata

- **Created:** 7/11/2026
- **Updated:** 8/17/2026
- **Reporter:** Ely
- **Assignee:** Alfonso Hernandez
- **Labels:** new-feature, post-mvp, shift-left-2026-08-16, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
