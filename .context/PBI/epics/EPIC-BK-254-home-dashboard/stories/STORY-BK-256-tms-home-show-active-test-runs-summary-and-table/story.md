# TMS-Home | Show active test runs summary and table

**Jira Key:** [BK-256](https://jira.upexgalaxy.com/browse/BK-256)
**Epic:** [BK-254](https://jira.upexgalaxy.com/browse/BK-254) (Home Dashboard)
**Type:** Story
**Status:** Backlog
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

Renders into `home.jsx` (master-design-plan.md §4.2), the "Active test runs" section. Backed by the Runs domain (BK-30, informational context only — no blocking dependency; BK-30's child stories already provide the underlying run data).

---

## Metadata

- **Created:** 7/31/2026
- **Updated:** 7/31/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** p2

---

_Synced from Jira by sync-jira-issues_
