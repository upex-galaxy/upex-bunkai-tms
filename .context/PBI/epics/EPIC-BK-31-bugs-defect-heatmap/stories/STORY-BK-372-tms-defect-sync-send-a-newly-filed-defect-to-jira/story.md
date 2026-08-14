# TMS-Defect Sync | Send a newly filed defect to Jira

**Jira Key:** [BK-372](https://jira.upexgalaxy.com/browse/BK-372)
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
********I want to******** have a defect filed in Bunkai sent to our Jira project automatically, carrying a link back to the full record
****So that******** engineering picks the work up in the tool they already use without anyone re-typing it

## Context

Second of the three slices BK-43 was split into by ruling 12170, and the one that delivers the story's stated value: defects reach engineering. Failures are recorded but sit inert — making them recover is slice c's job.

Depends on the destination configuration from slice a: without it there is no answer to the question "which Jira project does this defect go in".

## Definition of done

- [ ] A defect filed in a Project whose sync is enabled is sent to that Project's Jira destination automatically
- [ ] Filing a defect never waits on, and never fails because of, the send
- [ ] The Jira issue carries a link back to the defect in Bunkai
- [ ] A defect that has already reached Jira is never sent a second time, ever
- [ ] Severity carries across to the Jira issue's priority; the module's full path travels in the issue body
- [ ] A defect filed while its Project's sync is off is never sent and carries no sync state
- [ ] Nothing ever flows from Jira back into Bunkai
- [ ] A send that fails records why, and leaves the defect fully usable in Bunkai

## Provenance

Materialized from BK-43 (ruling 12170, AI Product Owner slicing decision), constrained by ruling 12177 (AI Tech Lead) decisions 1, 3 (classifier), 4 (index, compare-and-set claim, label), 5 (the whole sync-state migration) and 8 (client contract).

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

### Tests (8)

- [BK-234](https://jira.upexgalaxy.com/browse/BK-234): BK-43-TDS01: New defect auto-syncs when integration enabled _(In Automation)_
- [BK-235](https://jira.upexgalaxy.com/browse/BK-235): BK-43-TDS02: Fire-and-forget sync on network failure _(In Automation)_
- [BK-238](https://jira.upexgalaxy.com/browse/BK-238): BK-43-TDS05: External update does not flow back to Bunkai _(In Automation)_
- [BK-239](https://jira.upexgalaxy.com/browse/BK-239): BK-43-TDS06: No sync when integration not configured _(In Automation)_
- [BK-240](https://jira.upexgalaxy.com/browse/BK-240): BK-43-TDS07: Re-sync does not create duplicate external item _(In Automation)_
- [BK-245](https://jira.upexgalaxy.com/browse/BK-245): BK-43-TDS12: Field mapping accuracy across severity levels _(In Automation)_
- [BK-246](https://jira.upexgalaxy.com/browse/BK-246): BK-43-TDS13: Workspace isolation keeps defects in correct projects _(In Automation)_
- [BK-247](https://jira.upexgalaxy.com/browse/BK-247): BK-43-TDS14: Synced defect carries external link back to Bunkai _(In Automation)_

### Storys (4)

- [BK-371](https://jira.upexgalaxy.com/browse/BK-371): TMS-Defect Sync | Point a project at a Jira destination _(Backlog)_
- [BK-373](https://jira.upexgalaxy.com/browse/BK-373): TMS-Defect Sync | Recover a failed sync and show its state _(Backlog)_
- [BK-40](https://jira.upexgalaxy.com/browse/BK-40): TMS-Defect Filing | File a defect from a failing run step _(QA Approved)_
- [BK-337](https://jira.upexgalaxy.com/browse/BK-337): TMS-Defect Detail | Open a defect and read its full record _(Ready For QA)_

---

## Metadata

- **Created:** 8/11/2026
- **Updated:** 8/11/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
