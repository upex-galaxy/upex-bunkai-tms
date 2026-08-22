# TMS-Home | Show active test runs summary and table

**Jira Key:** [BK-256](https://jira.upexgalaxy.com/browse/BK-256)
**Epic:** [BK-254](https://jira.upexgalaxy.com/browse/BK-254) (Home Dashboard)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As a QA Lead, I want to see a table of active test runs across every project in the workspace so that I can spot stalled or blocked runs without opening each project individually.

## Definition of done

- The table appears on Home and reflects the workspace's currently active runs.
- The change does not regress existing Home navigation or other screens.

## Technical notes

Renders into `home.jsx` (master-design-plan.md §4.2), the "Active test runs" section. Backed by the Runs domain ([https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30), informational context only — no blocking dependency; BK-30's child stories already provide the underlying run data).

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Implementation Plan (Dev)](./implementation-plan.md)

---

## Metadata

- **Created:** 7/31/2026
- **Updated:** 8/4/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** p2

---

_Synced from Jira by sync-jira-issues_
