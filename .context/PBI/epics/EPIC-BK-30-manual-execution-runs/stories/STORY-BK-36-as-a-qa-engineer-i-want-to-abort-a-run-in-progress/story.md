# As a QA Engineer, I want to abort a run in progress with a reason so that remaining steps are skipped and the run is closed as aborted.

**Jira Key:** [BK-36](https://upexgalaxy67.atlassian.net/browse/BK-36)
**Epic:** [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** 1

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

- [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34): As a QA Engineer, I want to start a manual run of a Test in a chosen environment so that I get a fresh step-by-step checklist to execute. _(Shift-Left QA)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:52.242Z_
