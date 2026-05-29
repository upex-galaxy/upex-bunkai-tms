# TMS-Test View | View a test with all chained ATCs expanded

**Jira Key:** [BK-32](https://upexgalaxy67.atlassian.net/browse/BK-32)
**Epic:** [BK-24](https://upexgalaxy67.atlassian.net/browse/BK-24) (Tests (chains of ATCs))
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-017

## User story

***As a*** QA Engineer

***I want to*** open a Test and see all of its chained ATCs expanded in order, each showing its steps and assertions in a single read-only view

***So that*** I can review exactly what the Test will validate, in the exact sequence it will run, before I commit to executing it

## Definition of done

- [ ] Opening a Test shows every ATC in the chain expanded inline, in the saved running order
- [ ] Each expanded ATC shows its ordered steps and its assertions
- [ ] The view is strictly read-only — nothing can be edited, reordered, added, or removed from it
- [ ] The position number shown for each ATC matches the order the Test would execute
- [ ] A Test with no ATCs yet shows a clear empty state instead of a blank screen
- [ ] A summary count of how many ATCs are in the Test is visible at the top
- [ ] The expanded content reflects the latest saved version of each ATC (edits made to an ATC elsewhere appear here)

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

- **Created:** 5/28/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:49.010Z_
