# TMS-Defect Triage | Assign a defect to a workspace member and update its status

**Jira Key:** [BK-264](https://jira.upexgalaxy.com/browse/BK-264)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** QA Approved
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

***As a*** Mateo Silva, QA Lead
***I want to*** assign a defect to a workspace member (and reassign or unassign it later)
***So that*** every defect has a clear owner during triage instead of sitting unclaimed in a shared backlog

***As a*** Sara Iglesias, Full-Stack Developer
***I want to*** move a defect assigned to me from open to in progress, and from in progress to resolved
***So that*** the defect's status reflects my real progress without QA having to ping me for an update

***As a*** Elena Vargas, Senior QA Engineer
***I want to*** close a defect once I've verified the fix
***So that*** the record shows the defect is actually done, not just claimed done by whoever fixed it

## Context

Bugs already exist in Bunkai with a status of open, in progress, resolved, or closed, but nothing today ever moves a defect out of "open" and no one can be attached to a defect as its owner. This story adds both: assigning a defect to a workspace member, and moving a defect through its existing status lifecycle. It is the direct prerequisite for the sibling notifications story that tells a member when a defect lands on them or changes status — that story has no event to subscribe to until this one ships.

## Definition of done

- [ ] A defect can be assigned to a workspace member, reassigned to a different member, or unassigned
- [ ] A defect's status can move forward through open, in progress, resolved, closed
- [ ] Invalid status moves (skipping a stage or moving backward) are rejected with a clear message
- [ ] Assigning a defect to someone who is not a workspace member, or who has view-only access, is rejected with a clear message
- [ ] Every assignment and status change is attributed to the workspace member who performed it
- [ ] Acceptance criteria validated
- [ ] Code review approved
- [ ] Deployed to staging
- [ ] No critical/high bugs open

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Tests (14)

- [BK-477](https://jira.upexgalaxy.com/browse/BK-477): BK-264: TC1: should set assignee when assigning an open bug to an eligible member _(AUTOMATED)_
- [BK-478](https://jira.upexgalaxy.com/browse/BK-478): BK-264: TC10: should reject a status change that skips a lifecycle stage _(AUTOMATED)_
- [BK-479](https://jira.upexgalaxy.com/browse/BK-479): BK-264: TC9: should advance status given a legal forward transition _(AUTOMATED)_
- [BK-480](https://jira.upexgalaxy.com/browse/BK-480): BK-264: TC2: should reject assignment given the target is not a workspace member _(AUTOMATED)_
- [BK-481](https://jira.upexgalaxy.com/browse/BK-481): BK-264: TC3: should reject assignment given the target is a Viewer-role member _(AUTOMATED)_
- [BK-482](https://jira.upexgalaxy.com/browse/BK-482): BK-264: TC11: should reject a status change given it moves backward or repeats the current status _(AUTOMATED)_
- [BK-483](https://jira.upexgalaxy.com/browse/BK-483): BK-264: TC4: should update the assignee when reassigning to a different member _(AUTOMATED)_
- [BK-484](https://jira.upexgalaxy.com/browse/BK-484): BK-264: TC12: should keep assignee and status changes independent of each other _(AUTOMATED)_
- [BK-485](https://jira.upexgalaxy.com/browse/BK-485): BK-264: TC6: should clear the assignee when unassigning _(AUTOMATED)_
- [BK-486](https://jira.upexgalaxy.com/browse/BK-486): BK-264: TC7: should reject a write action given the actor is a Viewer-role member _(AUTOMATED)_
- [BK-487](https://jira.upexgalaxy.com/browse/BK-487): BK-264: TC13: should attribute an action to the actual calling actor, not the bug's assignee _(Candidate)_
- [BK-488](https://jira.upexgalaxy.com/browse/BK-488): BK-264: TC8: should return a non-disclosing 404 given the bug does not exist or is outside the caller's workspace _(AUTOMATED)_
- [BK-489](https://jira.upexgalaxy.com/browse/BK-489): BK-264: TC14: should write a notifications row given a bug is assigned _(AUTOMATED)_
- [BK-490](https://jira.upexgalaxy.com/browse/BK-490): BK-264: TC15: should exclude Viewer-role members from the assignee picker _(MANUAL)_

### Story (1)

- [BK-212](https://jira.upexgalaxy.com/browse/BK-212): Notifications | Get notified on bug assignment and status changes _(Ready For QA)_

---

## Metadata

- **Created:** 8/3/2026
- **Updated:** 8/15/2026
- **Reporter:** Ely
- **Assignee:** Luis Eduardo Flores Villarroel

---

_Synced from Jira by sync-jira-issues_
