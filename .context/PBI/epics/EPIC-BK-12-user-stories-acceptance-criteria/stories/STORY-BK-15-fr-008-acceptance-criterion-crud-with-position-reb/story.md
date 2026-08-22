# TMS-AC | Manage criteria under a user story

**Jira Key:** [BK-15](https://jira.upexgalaxy.com/browse/BK-15)
**Epic:** [BK-12](https://jira.upexgalaxy.com/browse/BK-12) (User Stories & Acceptance Criteria)
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** 3
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

***Source spec:*** FR-008

## User story

***As a*** Senior QA Engineer
***I want to*** add, edit, reorder and remove Acceptance Criteria under a User Story
***So that*** each Story spells out its testable behaviours in a clear order, and a Story cannot be marked ready to test until it actually has criteria.

## Definition of done

- [ ] Feature works end-to-end against staging
- [ ] Covered by an ATC chain anchored to a User Story + Acceptance Criterion
- [ ] Acceptance Criteria verified by QA
- [ ] Demoed to the team

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Defect (1)

- [BK-143](https://jira.upexgalaxy.com/browse/BK-143): AC Management: Description Validation: Byte cap enforces 50,000 bytes (decimal) instead of 51,200 bytes (binary KiB) _(Closed)_

### Storys (3)

- [BK-14](https://jira.upexgalaxy.com/browse/BK-14): TMS-US | Manage user stories anchored to a module _(QA Approved)_
- [BK-17](https://jira.upexgalaxy.com/browse/BK-17): Jira Import | Pull Jira issues by JQL _(Ready For Release)_
- [BK-18](https://jira.upexgalaxy.com/browse/BK-18): TMS-ATC API | Create and edit ATCs with steps and assertions _(Ready For Release)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 7/24/2026
- **Reporter:** Ely
- **Assignee:** maibeth vega
- **Labels:** acceptance-criteria, mvp, shift-left-reviewed, wave-2

---

_Synced from Jira by sync-jira-issues_
