# Comments for BK-373

[View in Jira](https://jira.upexgalaxy.com/browse/BK-373)

---

### Ely - 8/11/2026, 6:05:07 AM

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

### Acceptance test cases re-parented from BK-43

Four, per the coverage split in ruling 12170: BK-236 (TDS03), BK-237 (TDS04), BK-241 (TDS08), BK-244 (TDS11).

Two of them assert the opposite of what was ruled and must be re-scoped before they run:

| ATC | Change |
| --- | --- |
| BK-237 (TDS04) | Expects a manual retry control. Ruling 12170 decided there is none — badge plus failure-reason card only. |
| BK-241 (TDS08) | Titled "Permanent auth failure stops retries" and expects retries to stop after a threshold. Ruling 12177 decision 2 resolved this against the draft: retries decay to an interval ceiling and never stop while the failure could still clear; only a failure classified as unable to clear stops them. A credential failure is **not** in that class, because the frozen copy promises it self-heals once fixed in Settings. |

Both amendments are already reflected in this story's Acceptance Test Plan field. Three further outlines (TDS15-TDS17) are drafted there for panel rendering and interrupted-attempt adoption, and still need ATCs authored.

### TDS08 amendment applied

Ruling 12177 flagged the TDS08 wording as a follow-up for QA and nobody applied it. It is applied here, in this story's Acceptance Test Plan field and in AC-2 and AC-3.

### The mockup is the contract here

This is the slice that renders the External tracker panel. Ruling 12170 froze its four states and their literal copy, and ruling 12177 decision 5 recorded the one §5 divergence: the mockup has no in-flight state, but an asynchronous send necessarily has one, so the in-flight case reuses the existing in-flight grammar rather than inventing copy. UI-only, no backend cost, corrected toward fidelity per Rule #15.

There is no manual retry control anywhere in this feature. Do not add one.

---

The rulings this story implements are recorded in full on BK-43. Read comment 12170 for the product decisions and comment 12177 for the architecture. Nothing was re-decided while materializing this ticket.

---


_Synced from Jira by sync-jira-issues_
