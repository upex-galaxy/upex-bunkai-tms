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

### Story (1)

- [BK-212](https://jira.upexgalaxy.com/browse/BK-212): Notifications | Get notified on bug assignment and status changes _(Ready For QA)_

---

## Metadata

- **Created:** 8/3/2026
- **Updated:** 8/14/2026
- **Reporter:** Ely
- **Assignee:** Luis Eduardo Flores Villarroel

---

_Synced from Jira by sync-jira-issues_
