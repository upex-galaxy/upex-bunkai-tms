# TMS-Run History | View a test's past runs, filterable by outcome

**Jira Key:** [BK-37](https://upexgalaxy67.atlassian.net/browse/BK-37)
**Epic:** [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-022

## User story

***As a*** QA Engineer
***I want to*** see the history of past Runs for a Test, newest first, filterable by outcome
***So that*** I can compare results over time and spot flaky areas

## Definition of done

- [ ] A Test shows its past Runs ordered newest first
- [ ] Each history entry shows the Run's outcome, environment, executor mode, and when it ran
- [ ] The history can be filtered to show only passed, only failed, or only aborted Runs
- [ ] A Test with no Runs yet shows an empty-state message instead of a blank list
- [ ] Older Runs can be loaded beyond the first page
- [ ] Clearing a filter restores the full newest-first list

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

- [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Backlog)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:51.467Z_
