# TMS-ATC Propagation | Cascade ATC edits to all tests

**Jira Key:** [BK-21](https://jira.upexgalaxy.com/browse/BK-21)
**Epic:** [BK-13](https://jira.upexgalaxy.com/browse/BK-13) (ATC Library (Acceptance Test Cases))
**Type:** Story
**Status:** QA Approved
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

***Source spec:*** FR-012

## User story

***As a*** Senior QA Engineer
***I want to*** have my edits to an ATC reflected automatically in every Test that uses it
***So that*** maintaining shared components is a one-edit-many-tests operation and I never re-stitch tests by hand after a change.

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
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Storys (2)

- [BK-18](https://jira.upexgalaxy.com/browse/BK-18): TMS-ATC API | Create and edit ATCs with steps and assertions _(Ready For Release)_
- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Ready For Release)_

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 7/6/2026
- **Reporter:** Ely
- **Assignee:** Ramiro Majdalani
- **Labels:** atc, mvp, propagation, wave-2

---

_Synced from Jira by sync-jira-issues_
