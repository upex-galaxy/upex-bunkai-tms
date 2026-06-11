# Comments for BK-35

[View in Jira](https://jira.upexgalaxy.com/browse/BK-35)

---

### Benjamin Segovia - 6/8/2026, 11:35:12 PM

Shift-Left QA Refinement handoff comment — test from acli

---

### Benjamin Segovia - 6/8/2026, 11:35:39 PM

## Shift-Left QA Refinement — DRAFT ready for review

The ATP DRAFT content is in the comment body below. Story BK-35 has been refined pre-sprint.

***Risk level******:*** HIGH
***Refined on******:*** 2026-06-08

***Summary******:***

- 8 gaps found (G1–G8)
- 7 ambiguities found (A1–A7)
- 23 test outlines drafted (10 Positive / 6 Negative / 3 Boundary / 4 Integration)
- 8 open questions for PO + Dev

***Blockers before Ready For Dev******:***

- Q1 (PO): ATC verdict behavior when steps remain pending — state machine matrix is incomplete without this
- Q5 (Dev): Real-time transport mechanism + latency SLA — integration outlines cannot be written without this

***Story Points******:*** Current estimate is SP=1. QA assessment: this story contains a state machine (8 step-combination scenarios), real-time sync, and race condition handling. Recommend re-estimating at SP=5 or higher.

***Note******:*** Custom field updates (AC / ATP fields) and status transitions require elevated project permissions. The full refined content is captured in the shift-left-refinement.md file locally at `.context/PBI/epics/EPIC-BK-30-manual-execution-runs/stories/STORY-BK-35-tms-run-execution-mark-each-step-pass-fail-or-bloc/shift-left-refinement.md`.

Next step: when this story reaches **Ready For QA**, run /sprint-testing — it will short-circuit Phases 1-3 thanks to the shift-left refinement already completed.

---

### Benjamin Segovia - 6/8/2026, 11:48:15 PM

@@Ely hola! Estoy trabajando en el shift-left de BK-35 (TMS-Run Execution | Mark each step pass/fail/block). Hice el análisis de refinamiento pero mi cuenta (`benjasegoviafsa@gmail.com`) no tiene permisos para editar el ticket ni hacer transiciones en el proyecto BK.

¿Podés otorgarme `EDIT*ISSUES` y `TRANSITION*ISSUES` para poder subir el ATP DRAFT y mover BK-35 de Backlog a Shift-Left QA?

Gracias!

---


_Synced from Jira by sync-jira-issues_
