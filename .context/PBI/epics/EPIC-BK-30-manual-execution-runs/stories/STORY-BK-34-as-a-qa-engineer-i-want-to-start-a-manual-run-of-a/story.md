# TMS-Run Execution | Start a manual run in a chosen environment

**Jira Key:** [BK-34](https://upexgalaxy67.atlassian.net/browse/BK-34)
**Epic:** [BK-30](https://upexgalaxy67.atlassian.net/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Backlog
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

- [BK-27](https://upexgalaxy67.atlassian.net/browse/BK-27): TMS-Test Builder | Assemble a test by chaining ATCs _(Backlog)_
- [BK-35](https://upexgalaxy67.atlassian.net/browse/BK-35): TMS-Run Execution | Mark each step pass, fail, or block _(Backlog)_
- [BK-36](https://upexgalaxy67.atlassian.net/browse/BK-36): TMS-Run Execution | Abort a run in progress with a reason _(Backlog)_
- [BK-37](https://upexgalaxy67.atlassian.net/browse/BK-37): TMS-Run History | View a test's past runs, filterable by outcome _(Backlog)_
- [BK-38](https://upexgalaxy67.atlassian.net/browse/BK-38): TMS-Run Reporting | Filter project runs with pass/fail totals _(Backlog)_
- [BK-39](https://upexgalaxy67.atlassian.net/browse/BK-39): TMS-Run Execution | Finish a run with a final verdict _(Backlog)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:51.466Z_
