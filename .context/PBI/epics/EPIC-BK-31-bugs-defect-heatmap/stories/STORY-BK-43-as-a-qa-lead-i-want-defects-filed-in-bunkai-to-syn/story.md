# TMS-Defect Sync | Sync defects one-way to the external tracker

**Jira Key:** [BK-43](https://jira.upexgalaxy.com/browse/BK-43)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** -

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

- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Tests (14)

- [BK-234](https://jira.upexgalaxy.com/browse/BK-234): BK-43-TDS01: New defect auto-syncs when integration enabled _(Candidate)_
- [BK-235](https://jira.upexgalaxy.com/browse/BK-235): BK-43-TDS02: Fire-and-forget sync on network failure _(Candidate)_
- [BK-236](https://jira.upexgalaxy.com/browse/BK-236): BK-43-TDS03: Failed sync auto-retries and eventually succeeds _(Candidate)_
- [BK-237](https://jira.upexgalaxy.com/browse/BK-237): BK-43-TDS04: Sync-failed state after persistent failure _(Candidate)_
- [BK-238](https://jira.upexgalaxy.com/browse/BK-238): BK-43-TDS05: External update does not flow back to Bunkai _(Candidate)_
- [BK-239](https://jira.upexgalaxy.com/browse/BK-239): BK-43-TDS06: No sync when integration not configured _(Candidate)_
- [BK-240](https://jira.upexgalaxy.com/browse/BK-240): BK-43-TDS07: Re-sync does not create duplicate external item _(Candidate)_
- [BK-241](https://jira.upexgalaxy.com/browse/BK-241): BK-43-TDS08: Permanent auth failure stops retries _(Candidate)_
- [BK-242](https://jira.upexgalaxy.com/browse/BK-242): BK-43-TDS09: Synced defect update triggers re-sync _(Candidate)_
- [BK-243](https://jira.upexgalaxy.com/browse/BK-243): BK-43-TDS10: Deleting synced defect does not remove external item _(Candidate)_
- [BK-244](https://jira.upexgalaxy.com/browse/BK-244): BK-43-TDS11: Rate limit backoff recovers and syncs _(Candidate)_
- [BK-245](https://jira.upexgalaxy.com/browse/BK-245): BK-43-TDS12: Field mapping accuracy across severity levels _(Candidate)_
- [BK-246](https://jira.upexgalaxy.com/browse/BK-246): BK-43-TDS13: Workspace isolation keeps defects in correct projects _(Candidate)_
- [BK-247](https://jira.upexgalaxy.com/browse/BK-247): BK-43-TDS14: Synced defect carries external link back to Bunkai _(Candidate)_

### Story (1)

- [BK-40](https://jira.upexgalaxy.com/browse/BK-40): TMS-Defect Filing | File a defect from a failing run step _(Ready For QA)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 7/30/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-07-03, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
