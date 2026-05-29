# As a QA Engineer, I want to file a defect from a failing run step with module, severity, steps and evidence pre-filled so that the defect is captured without retyping.

**Jira Key:** [BK-40](https://upexgalaxy67.atlassian.net/browse/BK-40)
**Epic:** [BK-31](https://upexgalaxy67.atlassian.net/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Shift-Left QA
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

- [BK-35](https://upexgalaxy67.atlassian.net/browse/BK-35): As a QA Engineer, I want to mark each step pass, fail, or block with notes and evidence so that ATC verdicts and run progress update as I execute. _(Shift-Left QA)_
- [BK-41](https://upexgalaxy67.atlassian.net/browse/BK-41): As a QA Engineer, I want to list and filter defects by module, status and severity with counts so that I can focus on a given area. _(Shift-Left QA)_
- [BK-42](https://upexgalaxy67.atlassian.net/browse/BK-42): As a QA Lead, I want to view a defect heatmap with count and week-over-week trend per module so that I can see at a glance where quality is degrading. _(Shift-Left QA)_
- [BK-43](https://upexgalaxy67.atlassian.net/browse/BK-43): As a QA Lead, I want defects filed in Bunkai to sync automatically and one-way to the external tracker so that engineering works them in their existing tool. _(Shift-Left QA)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:53.836Z_
