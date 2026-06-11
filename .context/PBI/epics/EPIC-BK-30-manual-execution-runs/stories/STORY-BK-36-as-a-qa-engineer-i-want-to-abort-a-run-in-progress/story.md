# TMS-Run Execution | Abort a run in progress with a reason

**Jira Key:** [BK-36](https://jira.upexgalaxy.com/browse/BK-36)
**Epic:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Estimation
**Priority:** Medium
**Story Points:** 1
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

***Source spec:*** BK-021

## User story

***As a*** QA Engineer
***I want to*** abort a Run that is in progress, giving a reason
***So that*** the remaining unexecuted steps are marked skipped and the Run is cleanly closed as aborted

## Definition of done

- [ ] The engineer can abort a Run that is still in progress
- [ ] A reason of at least 3 characters is required to abort
- [ ] All steps not yet executed are marked skipped
- [ ] Already-executed step results are preserved unchanged
- [ ] The Run's final state is shown as aborted, with the stated reason visible
- [ ] Aborting a Run that has already finished or been aborted is blocked with a clear message
- [ ] The aborted Run remains visible in the Test's run history

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

- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(Ready For Dev)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 6/10/2026
- **Reporter:** Ely
- **Assignee:** Juan Leites

---

_Synced from Jira by sync-jira-issues_
