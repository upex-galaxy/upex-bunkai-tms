# TMS-Test Builder | Reorder ATCs inside a test

**Jira Key:** [BK-28](https://upexgalaxy67.atlassian.net/browse/BK-28)
**Epic:** [BK-24](https://upexgalaxy67.atlassian.net/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-016

## User story

***As a*** QA Engineer (Elena persona)
***I want to*** reorder the ATCs inside an existing Test
***So that*** I can fix the execution sequence after discovering the original order does not match the User Story flow I am verifying

## Definition of done

- [ ] Functionality available behind the workspace's role permissions (member and above can reorder; viewer cannot)
- [ ] New order is visible immediately after saving and persists across page reloads
- [ ] Activity log records who reordered the Test, when, and what the new chain looks like
- [ ] The same reorder operation works whether triggered from the UI or from an AI agent / CI client using the Bunkai surface
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

### Story (1)

- [BK-27](https://upexgalaxy67.atlassian.net/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Backlog)_

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** master-sprint-4, mvp, tests-epic

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:49.010Z_
