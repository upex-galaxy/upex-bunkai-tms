# TMS-Defect Sync | Point a project at a Jira destination

**Jira Key:** [BK-371](https://jira.upexgalaxy.com/browse/BK-371)
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
********I want to******** point a Project at a destination Jira project and turn the defect sync on or off
****So that******** the team decides where its defects land before any defect is ever sent

## Context

First of the three slices BK-43 was split into by ruling 12170. It delivers the configuration surface every other slice leans on, and nothing else: ***no defect is sent to Jira by this story***.

BK-43's own Out of Scope disclaimed "configuring or connecting the external tracker integration itself", yet no story on the board delivered it. Ruling 12170 converted that unowned gap into slice 1 of a sequence, which is why this story exists.

## Definition of done

- [ ] A Project can be pointed at a destination Jira project and the sync switched on or off
- [ ] The destination is validated before it is accepted
- [ ] A connection check tells the Lead whether the destination is reachable, and why not when it is not
- [ ] Only administrators can change where a Project's defects flow; everyone who can see the Project can read the setting
- [ ] Turning the sync on, or changing the destination, queues that Project's not-yet-sent defects for another attempt
- [ ] A Project with no configuration has the sync off and no destination

## Provenance

Materialized from BK-43 (ruling 12170, AI Product Owner slicing decision) with the architecture constraints of ruling 12177 (AI Tech Lead), decision 6: the destination lives in project-scoped settings, and credentials stay deployment-level — this story introduces no per-workspace secret storage.

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
