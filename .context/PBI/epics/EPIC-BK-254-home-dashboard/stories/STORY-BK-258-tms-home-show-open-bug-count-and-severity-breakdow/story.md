# TMS-Home | Show open bug count and severity breakdown

**Jira Key:** [BK-258](https://jira.upexgalaxy.com/browse/BK-258)
**Epic:** [BK-254](https://jira.upexgalaxy.com/browse/BK-254) (Home Dashboard)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As a QA Lead, I want to see how many bugs are currently open across the workspace, broken down by severity, so that I can answer "what does quality look like right now" in under a minute without opening the bug tracker.

## Definition of done

- The open-bugs summary appears on Home once the Bugs domain has a queryable read surface.
- The change does not regress existing Home navigation or other screens.

## Technical notes

Renders into `home.jsx` (master-design-plan.md §4.2), the "Open bugs" KPI card. Blocked by the Bugs domain ([https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31), Bugs & Defect Heatmap) — see this story's Jira links for the specific gating tickets.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)

---

## Traceability

### Storys (2)

- [BK-41](https://jira.upexgalaxy.com/browse/BK-41): TMS-Defect List | List and filter defects by module, status, severity _(In Test)_
- [BK-40](https://jira.upexgalaxy.com/browse/BK-40): TMS-Defect Filing | File a defect from a failing run step _(QA Approved)_

---

## Metadata

- **Created:** 7/31/2026
- **Updated:** 8/4/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** blocked, p2

---

_Synced from Jira by sync-jira-issues_
