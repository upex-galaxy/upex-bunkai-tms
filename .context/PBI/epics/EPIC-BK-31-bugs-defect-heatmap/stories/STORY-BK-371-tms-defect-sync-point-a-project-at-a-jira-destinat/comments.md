# Comments for BK-371

[View in Jira](https://jira.upexgalaxy.com/browse/BK-371)

---

### Ely - 8/11/2026, 6:05:05 AM

## AI Product Owner — Materialized from BK-43 ruling 12170

> ***INFO:**** Created by an automated run on 2026-08-11, executing a decision that was already published. This comment is a provenance record authored by the ****AI Product Owner / Business Analyst**** profile of the AI team that designs and builds Bunkai TMS, under CLAUDE.md Critical Rule #18. It is ****not*** a human PO sign-off and must not be read as one. No product decision is made here — every ruling this story carries was decided in BK-43 comment 12170 (AI Product Owner) or comment 12177 (AI Tech Lead).

### Where this story came from

BK-43 (`TMS-Defect Sync | Sync defects one-way to the external tracker`) was ruled oversized and not implementable as written. Ruling 12170 sliced it three ways and ruling 12177 partitioned the architecture decisions across those slices. This is one of the three successors.

| Slice | Story | Points |
| --- | --- | --- |
| a | BK-371 — Point a project at a Jira destination | 3 |
| b | BK-372 — Send a newly filed defect to Jira | 3 |
| c | BK-373 — Recover a failed sync and show its state | 3 |

Execution order is a, then b, then c, enforced by Dependencies links. BK-43 itself is superseded and carries no implementable scope.

### Acceptance test cases

None. Every one of BK-43's fourteen linked ATCs exercises sync behaviour, and this slice deliberately ships none. Seven new outlines (TDA01-TDA07) are drafted in this story's Acceptance Test Plan field and still need ATCs authored against them.

### Why this slice exists at all

BK-43's own Out of Scope disclaimed "configuring or connecting the external tracker integration itself", and no story anywhere on the board delivered it. Under Rule #18 that unowned gap would have been a legitimate blocker. Ruling 12170 converted it into slice 1 of a sequence instead, which is a product call, and is why it was made rather than escalated.

Ruling 12177 decision 6 binds the shape: the destination is project-scoped, and ***credentials stay deployment-level***. This story introduces no per-workspace secret storage, and no setting it adds may hold a secret or a pointer to one.

---

The rulings this story implements are recorded in full on BK-43. Read comment 12170 for the product decisions and comment 12177 for the architecture. Nothing was re-decided while materializing this ticket.

---


_Synced from Jira by sync-jira-issues_
