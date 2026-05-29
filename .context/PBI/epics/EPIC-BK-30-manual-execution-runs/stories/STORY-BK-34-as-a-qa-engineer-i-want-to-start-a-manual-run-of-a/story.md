# As a QA Engineer, I want to start a manual run of a Test in a chosen environment so that I get a fresh step-by-step checklist to execute.

**Jira Key:** [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34)
**Epic:** [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Shift-Left QA
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-019

## User story

***As a*** QA Engineer
***I want to*** start a manual run of a Test against a chosen environment
***So that*** I get a fresh checklist where every step is pending and I can begin executing immediately

## Definition of done

- [ ] From a Test, the engineer can start a Run by selecting one of the environments configured for that Project
- [ ] A started Run shows every step of every ATC in the Test's chain in a pending state, in chain order
- [ ] Starting a Run on a Test that contains no ATCs is blocked with a clear message
- [ ] Selecting an environment not configured for the Project is blocked with a clear message
- [ ] Re-starting the same Test with the same start token within 24 hours opens the already-started Run instead of creating a duplicate
- [ ] The new Run is attributed to its executor mode (human, agent, or CI)
- [ ] A teammate viewing the Test sees the newly started Run appear in its run history

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

### Storys (6)

- [BK-27](https://upexgalaxy67.atlassian.net/browse/BK-27): As a QA Engineer I want to assemble a Test by chaining ATCs from my workspace so that I can run the validations together when verifying a User Story _(Shift-Left QA)_
- [BK-35](https://upexgalaxy67.atlassian.net/browse/BK-35): As a QA Engineer, I want to mark each step pass, fail, or block with notes and evidence so that ATC verdicts and run progress update as I execute. _(Shift-Left QA)_
- [BK-36](https://upexgalaxy67.atlassian.net/browse/BK-36): As a QA Engineer, I want to abort a run in progress with a reason so that remaining steps are skipped and the run is closed as aborted. _(Shift-Left QA)_
- [BK-37](https://upexgalaxy67.atlassian.net/browse/BK-37): As a QA Engineer, I want to see a Test's past runs newest first, filterable by outcome so that I can compare results and spot flaky areas. _(Shift-Left QA)_
- [BK-38](https://upexgalaxy67.atlassian.net/browse/BK-38): As a QA Lead, I want to filter all project runs by date, module, status, and executor type with pass/fail totals so that I can report what we executed quickly. _(Shift-Left QA)_
- [BK-39](https://upexgalaxy67.atlassian.net/browse/BK-39): As a QA Engineer, I want to finish a run with a final passed or failed verdict so that any still-pending steps are clearly marked skipped. _(Shift-Left QA)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:52.240Z_
