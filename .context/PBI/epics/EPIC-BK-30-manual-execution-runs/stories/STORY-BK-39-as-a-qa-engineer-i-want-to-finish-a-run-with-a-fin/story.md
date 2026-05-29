# TMS-Run Execution | Finish a run with a final verdict

**Jira Key:** [BK-39](https://upexgalaxy67.atlassian.net/browse/BK-39)
**Epic:** [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-024

## User story

***As a*** QA Engineer
***I want to*** finish a Run when the work is done, recording a final verdict of passed or failed
***So that*** the Run is closed with a clear outcome and any still-pending steps are marked skipped

## Definition of done

- [ ] The engineer can finish a Run that is in progress
- [ ] Finishing requires choosing a final verdict of passed or failed
- [ ] Any steps still pending at finish are marked skipped
- [ ] Already-executed step results are preserved unchanged
- [ ] The Run's final verdict and finish time are shown afterward
- [ ] Finishing a Run that has already finished or been aborted is blocked with a clear message
- [ ] A Run finished by an AI Test Agent or a CI pipeline records the same verdict and skipped-step handling as a human-finished Run

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
_Last sync: 2026-05-29T07:23:51.468Z_
