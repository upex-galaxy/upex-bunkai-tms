# As a QA Engineer I want to assemble a Test by chaining ATCs from my workspace so that I can run the validations together when verifying a User Story

**Jira Key:** [BK-27](https://upexgalaxy67.atlassian.net/browse/BK-27)
**Epic:** [BK-24](https://upexgalaxy67.atlassian.net/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-015

## User story

***As a*** QA Engineer (Elena persona)
***I want to*** assemble a Test by chaining a sequence of ATCs from my workspace's library
***So that*** I can execute those chained validations together in one Run when verifying a User Story

## Definition of done

- [ ] Functionality available behind the workspace's role permissions (member and above can create; viewer cannot)
- [ ] New Test appears in the Test list immediately after saving
- [ ] Activity log records who created the Test and when
- [ ] Operation works whether triggered from the UI or from an AI agent / CI client using the same Bunkai surface
- [ ] Acceptance criteria validated end-to-end against staging
- [ ] No P0 / P1 bugs open against this story

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Storys (4)

- [BK-28](https://upexgalaxy67.atlassian.net/browse/BK-28): As a QA Engineer I want to reorder the ATCs inside an existing Test so that I can fix the sequence after seeing it does not match the User Story flow _(Shift-Left QA)_
- [BK-32](https://upexgalaxy67.atlassian.net/browse/BK-32): As a QA Engineer, I want to open a Test and see every chained ATC expanded in order with its steps and assertions so that I can review exactly what will be validated before running it. _(Shift-Left QA)_
- [BK-33](https://upexgalaxy67.atlassian.net/browse/BK-33): As a QA Engineer, I want to assign tags to a Test, including the reserved smoke, sanity, and regression tags, so that my Tests are grouped and filtered into the right suites. _(Shift-Left QA)_
- [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34): As a QA Engineer, I want to start a manual run of a Test in a chosen environment so that I get a fresh step-by-step checklist to execute. _(Shift-Left QA)_

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** master-sprint-4, mvp, tests-epic

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:50.903Z_
