# BK-35 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-35)

## ATP DRAFT — BK-35: TMS-Run Execution | Mark each step pass, fail, or block

### Coverage Summary

| Type | Count |
| --- | --- |
| Positive | 10 |
| Negative | 6 |
| Boundary | 3 |
| Integration | 4 |
| ***Total**** | ****23*** |

***Risk level***: HIGH — non-trivial state machine (8 ATC verdict combinations), real-time push, guard conditions, last-write-wins semantics, no backend yet.

---

### Positive Outlines

1. ***Should record a passed result on a pending step with note and evidence link***

1. ***Should record a passed result with no note or evidence (optional fields omitted)***

1. ***Should record a failed result on a pending step***

1. ***Should record a blocked result on a pending step***

1. ***Should set ATC verdict to passed when all steps are marked passed***

1. ***Should set ATC verdict to failed when any step is marked failed***

1. ***Should set ATC verdict to blocked when blocked and no failed steps***

1. ***Should set ATC verdict to failed when both failed and blocked steps exist***

1. ***Should advance run progress percentage as steps resolve***

1. ***Should replace previous step result when a step is re-marked with a different status***

---

### Negative Outlines

1. ***Should reject step result recording on a finished Run***

1. ***Should reject step result recording on an aborted Run***

1. ***Should reject step marking by a user without project membership*** — NEEDS PO CONFIRMATION

1. ***Should reject evidence link with invalid URL format*** — NEEDS PO CONFIRMATION

1. ***Should reject an empty string evidence link treated as null*** — NEEDS PO CONFIRMATION

1. ***Should reject re-marking a step to pending status*** — NEEDS PO CONFIRMATION

---

### Boundary Outlines

1. ***Should record step result when run has exactly 1 step (minimum steps)***

1. ***Should record run progress at exactly 100% when the last pending step is marked***

1. ***Should store a note at maximum allowed character length*** — NEEDS PO CONFIRMATION on limit

---

### Integration Outlines

1. ***Should reflect step result and ATC verdict update in real time for a concurrent observer*** — NEEDS PO/DEV CONFIRMATION on transport + SLA

1. ***Should correctly read the BK-34 step snapshot (not live ATC definition) when recording results***

1. ***Should block step marking when the Run is moved to finished state mid-session (BK-39 race)***

1. ***Should expose step result data in a format consumable by BK-40 defect filing*** — NEEDS PO/DEV CONFIRMATION on defect-filing data contract

---

### Key Blockers Before Sprint Entry

> ***ERROR:*** 8 open questions must be answered before this story enters a sprint.
- ***PO***: Q1 (partial verdict), Q2 (error messages), Q3 (auto-finish trigger), Q4 (auth model)
- ***Dev***: Q5 (realtime transport + SLA), Q6 (endpoint shape), Q7 (mutable vs append), Q8 (evidence link type)

***Estimated SP****: 1 (current) → recommend re-estimate to ****SP 5+*** given 23 outlines, 15 HIGH/CRITICAL edge cases, and undefined backend.

---
_Synced from Jira by sync-jira-issues_
