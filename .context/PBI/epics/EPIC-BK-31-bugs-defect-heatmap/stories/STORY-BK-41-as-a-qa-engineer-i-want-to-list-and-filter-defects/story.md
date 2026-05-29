# TMS-Defect List | List and filter defects by module, status, severity

**Jira Key:** [BK-41](https://upexgalaxy67.atlassian.net/browse/BK-41)
**Epic:** [BK-31](https://upexgalaxy67.atlassian.net/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-026

## User story

***As a*** QA Engineer
***I want to*** list and filter defects by module (including its sub-modules), status and severity, with counts by severity and status
***So that*** I can focus on the defects affecting a given area without wading through everything

## Definition of done

- [ ] Defects can be listed for a chosen module
- [ ] Selecting a module includes defects from all of its nested sub-modules
- [ ] The list can be filtered by status and by severity, alone or combined
- [ ] Counts by severity (P1 to P4) are shown for the current view
- [ ] Counts by status (open, in progress, resolved, closed) are shown for the current view
- [ ] An empty result shows a clear "no defects match" state rather than a blank screen
- [ ] Counts update to reflect whatever filters are currently applied

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

- [BK-40](https://upexgalaxy67.atlassian.net/browse/BK-40): TMS-Defect Filing | File a defect from a failing run step _(Backlog)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:52.059Z_
