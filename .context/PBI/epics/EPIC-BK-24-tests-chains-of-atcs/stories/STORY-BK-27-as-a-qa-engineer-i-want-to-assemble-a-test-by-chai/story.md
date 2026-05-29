# TMS-Test Builder | Assemble a test by chaining ATCs

**Jira Key:** [BK-27](https://upexgalaxy67.atlassian.net/browse/BK-27)
**Epic:** [BK-24](https://upexgalaxy67.atlassian.net/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** Backlog
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

- [BK-28](https://upexgalaxy67.atlassian.net/browse/BK-28): TMS-Test Builder | Reorder ATCs inside a test _(Backlog)_
- [BK-32](https://upexgalaxy67.atlassian.net/browse/BK-32): TMS-Test View | View a test with all chained ATCs expanded _(Backlog)_
- [BK-33](https://upexgalaxy67.atlassian.net/browse/BK-33): TMS-Test Tags | Assign reserved and custom tags to a test _(Backlog)_
- [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Backlog)_

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** master-sprint-4, mvp, tests-epic

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:49.009Z_
