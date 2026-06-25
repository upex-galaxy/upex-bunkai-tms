# BK-36 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-36)

# ATP DRAFT — Shift-Left: BK-36 Abort a run in progress

***Status****: Refined — Awaiting PO Estimation | ****Refined****: 2026-06-23 | ****Modality***: Jira-native

> Full refinement document: `.context/PBI/epics/EPIC-BK-30-manual-execution-runs/stories/STORY-BK-36/shift-left-refinement.md`

---

## ⚠️ DATA-FEASIBILITY-RISK: CRITICAL

The `runs` and `run_steps` DB tables ***do not exist*** in the current schema (migrations 0001–0012). This story cannot be implemented or tested until:

1. A DB migration creates `runs` + `run_steps`.
2. BK-34 (Start a run) ships and creates `in_progress` run records.

***Hard dependency chain******:*** `runs` migration → BK-34 ships → BK-36 can be implemented.

---

## Coverage Estimate (26 total outlines)

| Type | Count |
| --- | --- |
| Positive | 6 |
| Negative | 6 |
| Boundary (reason length BVA) | 4 |
| State-Transition (run status machine) | 6 |
| Integration (cross-entity side effects) | 4 |
| ***Total**** | ****26*** |

---

## AC Gaps Identified (must resolve before sprint entry)

- ***GAP-1***: AC3 only covers `passed` closed state — `failed` and `aborted` states not tested
- ***GAP-2***: Empty reason (0 chars) not covered by AC2
- ***GAP-3***: 2-character reason not tested (only 1-char tested)
- ***GAP-4***: Concurrent abort / double-submit not addressed
- ***GAP-5***: Abort authorization (non-owner) not defined
- ***GAP-6***: Run history pagination/ordering not defined
- ***GAP-7***: `abort_reason` column spec undefined

---

## Critical Questions for PO

1. ***Who can abort a run?*** Only the runner, or any project member/admin?
2. ***Should the Abort button be hidden/disabled on closed runs?*** Or visible + error message?
3. ***What is the maximum reason length?*** (no upper bound currently specified)
4. ***Where exactly is the reason displayed?*** History list row? Run detail page? Both?
5. ***Is abort a role-gated action?*** (viewer vs. member vs. admin)

---

## Technical Questions for Dev

1. `runs`*** + ****`run_steps`**** migration PR*** — which PR, when does it land?
2. ***DB transaction*** — abort must wrap run status + N step updates atomically
3. ***"Pending" definition*** — is it `run*steps.result = 'pending'` or missing `run*steps` row?
4. `atcs.status`*** NOT modified on abort*** — confirm only `run_steps.result` is updated
5. ***Whitespace trimming*** — client, server, or DB level?
6. ***Double-submit idempotency*** — first-wins (409) or no-op?

---

## Architectural Risk (CON-1)

If Dev uses `atcs.status` instead of `run_steps.result` to mark steps as `skipped`, aborting one run corrupts the ATC template status for all future runs. Must be confirmed before implementation starts.

---

## Story Quality

| Dimension | Score |
| --- | --- |
| Clarity | 3/5 |
| Completeness | 2/5 |
| Testability | 3/5 |
| Feasibility | 1/5 — BLOCKED on migration |
| Risk | HIGH |

***Story is NOT ready for sprint entry*** until `runs` migration is committed and BK-34 is in a testable state.

---
_Synced from Jira by sync-jira-issues_
