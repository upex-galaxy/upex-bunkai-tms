# Comments for BK-372

[View in Jira](https://jira.upexgalaxy.com/browse/BK-372)

---

### Ely - 8/11/2026, 6:05:06 AM

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

Eight, per the coverage split in ruling 12170: BK-234 (TDS01), BK-235 (TDS02), BK-238 (TDS05), BK-239 (TDS06), BK-240 (TDS07), BK-245 (TDS12), BK-246 (TDS13), BK-247 (TDS14).

Two of them need re-scoping before they run, because the rulings changed what they assert:

| ATC | Change |
| --- | --- |
| BK-239 (TDS06) | Reads "workspace"; the setting is Project-scoped. Amend to "project", per ruling 12177 finding 3. |
| BK-245 (TDS12) | Expects the module to map to a Jira component and evidence to attachments. Ruling 12170 decided against both: the module travels as full path text in the issue body, and evidence does not leave Bunkai. |

Both amendments are already reflected in this story's Acceptance Test Plan field.

### Dependencies carried over from BK-43

BK-43's two Dependencies edges both land here, because this is the slice that genuinely needs them:

- ***BK-40**** (`TMS-Defect Filing`, QA Approved) — this slice sends a **newly filed* defect, so filing must exist.
- ***BK-337*** (`TMS-Defect Detail`, Shift-Left QA, not yet built) — BK-43's AC-4 backlink needs a defect-detail route to link back to, and AC-4 lands in this slice as AC-3.

BK-373 inherits the BK-337 gate transitively through this story, so the edge is not duplicated there.

### AC-6 amendment applied

BK-43's AC-6 read "Given the workspace has no external tracker integration enabled". Ruling 12177 finding 3 flagged that as wrong — the business rules say project, and the PO handover ruled project-scoped. This story's AC-6 reads ***"Given a Project whose defect sync is not enabled"***. The amendment was flagged in 12177 and never applied; it is applied here.

---

The rulings this story implements are recorded in full on BK-43. Read comment 12170 for the product decisions and comment 12177 for the architecture. Nothing was re-decided while materializing this ticket.

---


_Synced from Jira by sync-jira-issues_
