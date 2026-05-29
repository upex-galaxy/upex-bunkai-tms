# TMS-Defect Sync | Sync defects one-way to the external tracker

**Jira Key:** [BK-43](https://upexgalaxy67.atlassian.net/browse/BK-43)
**Epic:** [BK-31](https://upexgalaxy67.atlassian.net/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 1

---

## Overview

***Source spec:*** BK-028

## User story

***As a*** QA Lead
***I want to*** have defects filed in Bunkai sync automatically and one-way to the team's external tracker
***So that*** engineering can pick the work up in the tool they already use, with a link back to the full context in Bunkai

## Definition of done

- [ ] A defect filed in Bunkai is sent to the external tracker automatically when the integration is enabled
- [ ] The synced item in the external tracker links back to the original defect in Bunkai
- [ ] Filing a defect never waits on or fails because of the sync
- [ ] A defect whose sync succeeds shows a clear synced state with a way to open it in the external tracker
- [ ] A defect whose sync fails is marked sync-failed and remains fully usable in Bunkai
- [ ] A sync-failed defect is retried later without the Lead doing anything
- [ ] Sync sends defects in one direction only — Bunkai to the external tracker, never the reverse

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
_Last sync: 2026-05-29T07:23:52.060Z_
