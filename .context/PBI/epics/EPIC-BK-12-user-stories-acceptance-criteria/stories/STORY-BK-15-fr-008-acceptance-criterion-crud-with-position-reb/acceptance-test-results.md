# BK-15 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-15)

# Acceptance Test Results — BK-15

***Story***: TMS-AC | Manage criteria under a user story
***Environment***: Staging — https://staging-upexbunkai.vercel.app
***Date***: 2026-06-18
***QA Engineer***: Maibeth

## Executive Summary

28/36 TCs PASSED (77.8%). 1 TC FAILED (BUG-1: byte cap decimal vs binary). 1 SKIPPED (TC-30, blocked on BK-18). 3 NEEDS_CONFIRMATION resolved as expected behavior. Feature is stable and meets all Critical and High AC requirements.

## Result Matrix

| Category | Total | Passed | Failed | Obs | Skip |
| --- | --- | --- | --- | --- | --- |
| Positive | 9 | 9 | 0 | 0 | 0 |
| Negative | 10 | 9 | 0 | 1 | 0 |
| Boundary | 7 | 5 | 1 | 1 | 0 |
| Integration | 5 | 5 | 0 | 0 | 0 |
| API | 5 | 4 | 0 | 1 | 0 |
| ***Total**** | ****36**** | ****28**** | ****1**** | ****4**** | ****1*** |

Observations: TC-07 (edit works as designed), TC-09 (add to ready*to*test does not change status), TC-19 (409 on re-archive — NEEDS_CONFIRMATION), TC-21 (edge arrows disabled — confirmed working as designed).

## Critical AC Coverage

| AC | Scenario | Result |
| --- | --- | --- |
| AC1 | Add first AC — position 1 | PASSED |
| AC2 | Insert preserves order, contiguous | PASSED |
| AC3 | Reorder re-numbers, no gaps | PASSED |
| AC4 | Zero ACs blocks ready-to-test (409) | PASSED |
| AC5 | Title < 3 chars rejected (422) | PASSED |
| AC6 | Remove last AC — story auto-reverts to draft | PASSED |

## Defects Found

- ***BUG-1*** (pending filing): Description byte cap uses 50,000 bytes (50 x 1000) instead of 51,200 bytes (50 x 1024). Medium severity. TC-25 FAILED.
- ***BUG-2*** (NEEDS*CONFIRMATION): Re-archive returns 409 `already*archived` instead of expected 404. May be intentional design. Awaiting Dev/PO confirmation.

## NEEDS_CONFIRMATION Items Resolved

- TC-07 (edit AC via PATCH): works, same validation applies — resolved, no AC change needed
- TC-09 (add AC to ready*to*test story): status unchanged — confirmed working as designed
- TC-21 (edge arrows): disabled at boundary positions — confirmed working as designed
- TC-19 (re-archive 409 vs 404): actual = 409 `already_archived`. Awaiting Dev confirmation
- TC-34 (GET archived AC): 404 confirmed — matches ATP expectation

## DB Validation

DEFERRED — DBHUB** connection not configured. API response fields used as indirect validation (archived*at, position, user*story*reverted, status all verified via API layer).

## Evidence

9 screenshots captured in `evidence/`. Key evidence:

- BK-15-smoke-panel-open.png
- BK-15-TC10-gate-blocked-zero-acs-pass.png
- BK-15-TC06-gate-allowed-with-acs.png
- BK-15-TC27-auto-revert-to-draft-pass.png
- BK-15-TC21-edge-arrows-disabled-pass.png

---
_Synced from Jira by sync-jira-issues_
