# TMS-Run Execution | Mark each step pass, fail, or block

**Jira Key:** [BK-35](https://upexgalaxy67.atlassian.net/browse/BK-35)
**Epic:** [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-020

## User story

***As a*** QA Engineer
***I want to*** mark each step passed, failed, or blocked while executing, with an optional note and evidence link
***So that*** the parent ATC verdict and overall run progress update as I go, and teammates watching see it live

## Definition of done

- [ ] The engineer can mark any pending step passed, failed, or blocked
- [ ] A note and an evidence link can be attached to a step result, both optional
- [ ] The parent ATC verdict updates from the step results (passed when all pass, failed when any fails, blocked when any is blocked and none failed)
- [ ] The overall run progress percentage advances as steps are resolved
- [ ] A teammate watching the same Run sees the verdict and progress update live without refreshing
- [ ] Reporting a result on a Run that has already finished or been aborted is blocked with a clear message
- [ ] The latest reported result for a step is the one shown

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

### Storys (2)

- [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Backlog)_
- [BK-40](https://upexgalaxy67.atlassian.net/browse/BK-40): TMS-Defect Filing | File a defect from a failing run step _(Backlog)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:51.467Z_
