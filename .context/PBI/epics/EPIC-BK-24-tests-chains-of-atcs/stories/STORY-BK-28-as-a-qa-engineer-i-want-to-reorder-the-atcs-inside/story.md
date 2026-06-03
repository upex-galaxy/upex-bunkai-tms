# TMS-Test Builder | Reorder ATCs inside a test

**Jira Key:** [BK-28](https://jira.upexgalaxy.com/browse/BK-28)
**Epic:** [BK-24](https://jira.upexgalaxy.com/browse/BK-24) (Tests (chains of ATCs))
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

## Traceability

### Story (1)

- [BK-27](https://jira.upexgalaxy.com/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Shift-Left QA)_

---

## Metadata

- **Created:** 5/27/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** master-sprint-4, mvp, tests-epic

---

_Synced from Jira by sync-jira-issues_
