# TMS-Home | Show workspace test coverage summary

**Jira Key:** [BK-259](https://jira.upexgalaxy.com/browse/BK-259)
**Epic:** [BK-254](https://jira.upexgalaxy.com/browse/BK-254) (Home Dashboard)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As a QA Lead, I want to see the workspace's overall test coverage percentage and how it changed recently so that I can build a coverage story I trust without assembling it by hand.

## Definition of done

- The coverage summary appears on Home once the Coverage domain can compute a workspace-wide percentage.
- The change does not regress existing Home navigation or other screens.

## Technical notes

Renders into `home.jsx` (master-design-plan.md §4.2), the "Coverage" KPI card. Blocked by the Coverage domain (BK-44, Coverage & Traceability) — see this story's Jira links for the specific gating ticket.

---

## Traceability

### Story (1)

- [BK-46](https://jira.upexgalaxy.com/browse/BK-46): TMS-Coverage | Surface untested ACs and modules with not-run filter _(Ready For QA)_

---

## Metadata

- **Created:** 7/31/2026
- **Updated:** 7/31/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** blocked, p2

---

_Synced from Jira by sync-jira-issues_
