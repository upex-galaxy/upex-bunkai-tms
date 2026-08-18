# TMS-Defect Sync | Sync defects one-way to the external tracker

**Jira Key:** [BK-43](https://jira.upexgalaxy.com/browse/BK-43)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** ABORTED
**Priority:** Medium
**Story Points:** 1
**Web Link:** https://staging-upexbunkai.vercel.app/

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
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Test (1)

- [BK-242](https://jira.upexgalaxy.com/browse/BK-242): BK-43-TDS09: Synced defect update triggers re-sync _(DEPRECATED)_

### Storys (2)

- [BK-40](https://jira.upexgalaxy.com/browse/BK-40): TMS-Defect Filing | File a defect from a failing run step _(QA Approved)_
- [BK-337](https://jira.upexgalaxy.com/browse/BK-337): TMS-Defect Detail | Open a defect and read its full record _(Ready For QA)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 8/14/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-07-03, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
