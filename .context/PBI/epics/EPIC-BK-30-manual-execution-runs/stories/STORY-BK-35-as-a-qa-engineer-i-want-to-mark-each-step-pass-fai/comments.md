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

### Ely - 6/24/2026, 3:48:24 PM

Re-estimated 1 -> 5 SP per shift-left QA (state machine, real-time sync, race conditions). Provisional — still BLOCKED for Ready For Dev by 2 open questions: Q1 (PO) ATC verdict behavior when steps remain pending; Q5 (Dev) real-time transport mechanism + latency SLA.

---

### Benjamin Segovia - 7/13/2026, 8:54:15 AM

## PO Estimation Session — BK-35

Story Points updated from 5 to ***8*** (provisional), following up on the shift-left refinement from 2026-06-08.

### Resolved

- ***Q1 — ATC verdict while steps remain pending***: verdict stays `unrun` until every step in the ATC is resolved. Verdict (passed/failed/blocked) is only computed once the last pending step is marked.

### Still open

- ***Q5 (Dev)*** — real-time transport mechanism is unconfirmed. SP=8 assumes an existing real-time channel is reused. If BK-35 turns out to be the first real-time use case in the product, this should be re-estimated upward (likely 13).
- ***Q3 (cross-team, BK-39 owner)*** — whether reaching 100% progress auto-triggers the run finish, or stays manual. Not blocking this estimate; flagging for whoever picks up BK-39.

### Next step

Move to Ready For Dev once Dev confirms Q5. Re-estimate if the real-time answer changes the scope.

---

### Benjamin Segovia - 7/13/2026, 9:12:47 AM

> ***WARNING:**** ****Blocker — Q5 unresolved.**** This story stays in ****Estimation*** until Dev answers this. Story Points (8) are provisional and depend on the answer below.

## Q5 — Real-time transport mechanism

***Question******:*** Does a real-time channel (Supabase Realtime, SSE, WebSocket) already exist in the product for another feature, or would BK-35 be the first real-time use case?

***Why it blocks Ready For Dev******:***

- SP=8 assumes an ***existing*** channel gets reused for the "teammate watching the same Run sees updates live" requirement (DoD item 5 / AC4).
- If this is net-new infrastructure for the product, the story is closer to ***13 SP*** — a 5-point swing that would break sprint commitment if discovered mid-sprint instead of now.

***What we need from Dev******:*** confirm whether a real-time transport already exists and is reusable, or flag this as a spike/infra dependency before BK-35 can move to Ready For Dev.

---

### Benjamin Segovia - 7/13/2026, 10:45:12 AM

> ***ERROR:**** ****Escalating — flagged as sprint bottleneck #1.*** Ely's latest sprint status report names BK-35 (along with BK-37, BK-38, BK-90) as stalled 28–45 days despite BK-27 and BK-34 being dev-done and ES3 already unblocked. This story is the one holding back visible sprint progress right now.

## Still blocked on the same open item

***Q5 — real-time transport mechanism*** is the only thing standing between this story and Ready For Dev. Story Points (8, provisional) already account for the "reuse an existing channel" scenario; if that assumption is wrong, this jumps to ~13.

***Ask******:*** given this is now the sprint's top bottleneck per the status report, can Dev confirm Q5 this week so BK-35 can move out of Estimation? Happy to jump on a quick sync if that unblocks it faster than async.

---

### Ely - 7/31/2026, 3:31:54 AM

## Q5 resolved — real-time transport = Supabase Realtime

***Decision**** (delegated to AI advisor by the product owner, 2026-07-31, explicit): use ****Supabase Realtime**** (Postgres Changes on `run*steps`/`runs`, scoped per `run*id`) for AC4's live verdict/progress push. Full reasoning, alternatives considered, and consequences recorded in ****ADR-0010*** (`.context/ADR/ADR-0010-realtime-transport-supabase-realtime.md`), status `Proposed` pending the usual human sign-off — does not block implementation starting now.

Why: this is a Supabase-backed stack with zero existing real-time usage. Supabase Realtime is the lowest-effort option that meets AC4 (no new vendor, reuses existing infra), and becomes the standing mechanism future stories (BK-90, BK-209) reuse instead of each reinventing their own transport.

Mechanics: enable Realtime replication on the relevant table(s) via migration, RLS-scoped subscription client-side. Reconnection/reconciliation-on-reconnect is called out explicitly in the ADR as a real implementation detail for Stage 1 planning, not to be assumed away.

***Not resolved here, non-blocking***: the SP re-estimate question (8 → possibly 13, per the 2026-06-08 shift-left note) and whether the 2026-07-28 Estimation → Ready For Dev transition was intentional. Neither blocks coding — flagging for whoever owns estimation to reconcile separately.

`queue.md` (`avalanche-2026-07`) updated — this ticket is unblocked, proceed with Stage 1 planning.

---


_Synced from Jira by sync-jira-issues_
