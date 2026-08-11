# TMS-Defect Sync | Recover a failed sync and show its state

**Jira Key:** [BK-373](https://jira.upexgalaxy.com/browse/BK-373)
**Epic:** [BK-31](https://jira.upexgalaxy.com/browse/BK-31) (Bugs & Defect Heatmap)
**Type:** Story
**Status:** Backlog
**Priority:** Medium
**Story Points:** 3
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

***Source spec******:*** BK-028

## User story

********As a**** QA Lead
********I want to******** see whether a defect reached Jira, and have the ones that did not keep trying on their own
****So that******** a Jira outage or a bad credential costs us a delay rather than a lost defect, without anyone chasing it

## Context

Third and last of the three slices BK-43 was split into by ruling 12170. Slice b makes defects reach engineering; this slice is what makes that promise durable and visible.

## Definition of done

- [ ] A defect that failed to reach Jira is retried automatically, with no action from anyone
- [ ] Retries space themselves out rather than hammering a failing destination, and never stop while the failure is one that could still clear
- [ ] A failure that can never clear on its own stops retrying and says so
- [ ] The defect record shows its sync state using the frozen External tracker panel: sent, failed, or no panel at all
- [ ] There is no manual retry control anywhere
- [ ] A defect whose sync failed stays fully usable in Bunkai
- [ ] A send delayed by Jira rate-limiting reads as delayed, never as failed
- [ ] A defect cannot end up with two Jira issues even if an attempt dies halfway through

## Provenance

Materialized from BK-43 (ruling 12170, AI Product Owner slicing decision), constrained by ruling 12177 (AI Tech Lead) decisions 2 (cadence, backoff, no retry ceiling), 3 (cadence policy), 4 (lease reclaim and adoption), 7 (the sweep's authorization posture) and 8 (rate-limit handling).

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Traceability

### Tests (4)

- [BK-236](https://jira.upexgalaxy.com/browse/BK-236): BK-43-TDS03: Failed sync auto-retries and eventually succeeds _(In Automation)_
- [BK-237](https://jira.upexgalaxy.com/browse/BK-237): BK-43-TDS04: Sync-failed state after persistent failure _(In Automation)_
- [BK-241](https://jira.upexgalaxy.com/browse/BK-241): BK-43-TDS08: Permanent auth failure stops retries _(In Automation)_
- [BK-244](https://jira.upexgalaxy.com/browse/BK-244): BK-43-TDS11: Rate limit backoff recovers and syncs _(In Automation)_

### Story (1)

- [BK-372](https://jira.upexgalaxy.com/browse/BK-372): TMS-Defect Sync | Send a newly filed defect to Jira _(Backlog)_

---

## Metadata

- **Created:** 8/11/2026
- **Updated:** 8/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
