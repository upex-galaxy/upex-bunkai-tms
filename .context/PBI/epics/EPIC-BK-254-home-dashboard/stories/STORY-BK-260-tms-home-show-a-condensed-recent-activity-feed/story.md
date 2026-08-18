# TMS-Home | Show a condensed recent activity feed

**Jira Key:** [BK-260](https://jira.upexgalaxy.com/browse/BK-260)
**Epic:** [BK-254](https://jira.upexgalaxy.com/browse/BK-254) (Home Dashboard)
**Type:** Story
**Status:** Ready For QA
**Priority:** Medium
**Story Points:** -

---

## Overview

## User story

As a Senior QA Engineer, I want to see a condensed feed of recent workspace activity on Home so that I can catch up on what changed without leaving the screen I land on first.

## Definition of done

- The condensed feed appears on Home and reflects the workspace's most recent activity.
- The change does not regress existing Home navigation or other screens.

## Technical notes

Renders into `home.jsx` (master-design-plan.md §4.2), the "Recent activity" section. A thin presentation layer over the activity stream already built for TMS-Activity ([https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49](https://jira.upexgalaxy.com/browse/BK-49#icft=BK-49)) — this story does not duplicate that backend, it reuses it with a small page size and no pagination controls.

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)

---

## Traceability

### Story (1)

- [BK-49](https://jira.upexgalaxy.com/browse/BK-49): TMS-Activity | Stream a read-side feed over the existing activity log _(Ready For QA)_

---

## Metadata

- **Created:** 7/31/2026
- **Updated:** 8/4/2026
- **Reporter:** Ely
- **Assignee:** Unassigned
- **Labels:** p2

---

_Synced from Jira by sync-jira-issues_
