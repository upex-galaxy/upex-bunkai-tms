# TMS-Defect Filing | File a defect from a failing run step

**Jira Key:** [BK-40](https://upexgalaxy67.atlassian.net/browse/BK-40)
**Epic:** [BK-31](https://upexgalaxy67.atlassian.net/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-025

## User story

***As a*** QA Engineer
***I want to*** file a defect directly from a failing step during a run, with the module, severity, steps-to-reproduce and evidence already filled in from the run context
***So that*** the defect is captured in the moment without me retyping anything I just saw

## Definition of done

- [ ] A "Report defect" action appears when a step is marked failed during a run
- [ ] The defect form opens pre-filled with the module, the steps already executed, the failing test component, and any captured evidence
- [ ] Severity can be set to one of P1, P2, P3 or P4 before saving
- [ ] A defect can also be filed standalone (not tied to any run) from the defects area
- [ ] Title length is validated (5 to 200 characters) with a clear message when out of range
- [ ] The module is required and only modules belonging to the current project can be chosen
- [ ] Up to 10 evidence links can be attached; attempting more is blocked with a clear message
- [ ] A filed defect starts in the open state and is immediately visible in the defects list

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

### Storys (4)

- [BK-35](https://upexgalaxy67.atlassian.net/browse/BK-35): TMS-Run Execution | Mark each step pass, fail, or block _(Backlog)_
- [BK-41](https://upexgalaxy67.atlassian.net/browse/BK-41): TMS-Defect List | List and filter defects by module, status, severity _(Backlog)_
- [BK-42](https://upexgalaxy67.atlassian.net/browse/BK-42): TMS-Defect Heatmap | View count and week-over-week trend per module _(Backlog)_
- [BK-43](https://upexgalaxy67.atlassian.net/browse/BK-43): TMS-Defect Sync | Sync defects one-way to the external tracker _(Backlog)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:52.059Z_
