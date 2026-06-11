# TEST EXECUTION: [ATR] BK-18 — ATC create/edit REST API

**Jira Key:** [BK-95](https://jira.upexgalaxy.com/browse/BK-95)
**Status:** ACTIVE
**Components:** None

> Run results / coverage are NOT synced — read those via xray-cli. This file mirrors the issue description.

---

## Description

## BK-18 — Acceptance Test Results (ATR)

> ***ERROR:**** ****Result******:****** FAILED**** — 12 of 13 scenarios PASSED (92%). One happy-path scenario (H2 — PATCH `/atcs/{id}` with a correct `If-Match`) returns ****HTTP 412**** instead of ****200****, failing the acceptance criterion "PATCH returns 200 with version 2". Story is NOT sign-off-able until the response status is corrected. Defect filed: ****BK-96***.

| Field | Value |
| --- | --- |
| Tested | 2026-06-08 |
| Environment | Staging (`https://staging-upexbunkai.vercel.app/api/v1`) |
| Tester | elyermad@gmail.com |
| Result | ***FAILED*** (12/13) |
| Surfaces | API + DB (no UI — UI is BK-19) |
| Auth | openapi-testing PAT, scope `atc:write` (read-only PAT for the scope-gate negative) |

## Summary

Exercised the ATC create/edit REST API (`POST /api/v1/atcs`, `PATCH /api/v1/atcs/{id}`) on staging across 13 scenarios (2 happy, 7 negative, 2 boundary, 2 integration) plus a transactional-integrity DB sweep. The smoke check passed (201, DB-verified). All authorization, validation, anchoring-moat (AC-to-US, module-to-subtree), transactional-rollback, optimistic-lock-conflict and boundary paths behave correctly. The single failure is the happy-path PATCH success response: the update commits correctly server-side but the client receives a `412 PRECONDITION_FAILED` platform error page instead of the documented `200` success body.

## Test Cases

| ID | Scenario | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| H1 (smoke) | Happy POST `/atcs` | 201, v1, 3 steps / 2 assertions, `atc.created` | 201, v1, slug valid, DB rows + event verified | PASSED |
| H2 | Happy PATCH `/atcs/{id}` `If-Match:1`, 2 steps / no assertions | 200, v2, 2 steps / 0 assertions, `atc.updated` | ***412 PRECONDITION******_******FAILED**** to client; DB committed (v2, 2 steps, 0 assertions, `atc.updated`) | ****FAILED*** |
| N1 | POST no Authorization | 401 unauthorized | 401 `unauthorized` | PASSED |
| N2 | POST read-only token | 403 forbidden | 403 `forbidden` "Missing required capability: atc:write" | PASSED |
| N3 | PATCH non-existent id | 404 not*found | 404 `not*found` | PASSED |
| N4 | POST cross-US AC | 422 `ac*outside*user*story` + rollback | 422 `ac*outside*user*story`; zero new rows (rollback verified) | PASSED |
| N5 | POST cross-project module | 422 `module*outside*project*subtree` | 422 `module*outside*project*subtree` | PASSED |
| N6 | POST steps `[1,3,2]` | 422 `steps*position*invalid` + offenders | 422 `steps*position*invalid`, `positions:[2]` | PASSED |
| N7 | POST steps `[2,3,4]` | 422 `steps*position*invalid` | 422 `steps*position*invalid`, `positions:[2]` | PASSED |
| N8 | PATCH stale `If-Match:1` (ATC at v2) | 409 conflict + current version | 409 `conflict`, `current_version:2` | PASSED |
| B1 | POST title "AB" | 422 validation*failed | 422 `validation*failed` (title too_small) | PASSED |
| B2 | POST steps `[]` | 422 validation*failed | 422 `validation*failed` (steps min 1) | PASSED |
| I1 | POST invalid bearer | 401 before DB | 401 `unauthorized` "Invalid token"; zero DB writes | PASSED |

***Tally******:****** 12 PASSED / 1 FAILED / 13 total — 92% pass rate.***

## Defect — H2 (PATCH happy path returns 412)

> ***WARNING:**** `PATCH /api/v1/atcs/{id}` with the ****correct**** `If-Match: 1` (ATC at version 1) returns ****HTTP 412 PRECONDITION*************FAILED**** (non-JSON platform error page) instead of ****200***. The update nonetheless commits fully server-side: version 1 → 2, title updated, steps cascade-replaced (3 → 2), assertions cleared (2 → 0), and an `atc.updated` row written to `activity*log`. N8 independently corroborates the version advanced to 2 (it returned 409 with `current_version: 2`). A contract-following client sees a successful edit as a failure and may retry, causing a double-apply or a 409.

- ***Severity****: Major. ****Blocking***: No (no data corruption, no security exposure; persistence is correct).
- ***Root-cause candidates***: (a) the `If-Match` precondition handler in `app/api/v1/atcs/[id]/route.ts` mis-evaluates a matching version as a precondition failure (or compares against the post-increment version); (b) Vercel edge intercepts the `If-Match` request header and returns 412 around the function.
- ***Downstream impact***: blocks BK-19 (ATC builder UI) and BK-21 / BK-23, which PATCH ATCs.
- ***Defect ticket****: ****BK-96***.
- ***Evidence***: `evidence/h2-patch-412-bug.md`, `evidence/h2-patch-response.json`, `evidence/db-final.txt`.

## DB Integrity

All transactional checks PASSED: baseline counts zero; smoke persistence exact (1/3/2/1 + `atc.created`); H2 persistence exact despite the 412; N4 rollback left zero residue; `activity*log` held exactly the two expected events; the `atcs*project*id*slug*key` UNIQUE (project*id, slug) constraint is present; cleanup cascaded with zero orphan steps/assertions. The transactional boundary and validate-before-commit guarantee hold solidly.

## Test Data

- Project: "Openapi Test Project" (`269850ea-a759-44a1-a45e-3a6187cac5ec`)
- User story: FSX-45 (`b1f68acf-855a-4320-95f0-e81df5e948c3`), happy path uses AC1
- Modules: "Credit Cards" (`8da2b639-...`), "Billing" (`e4e42a7d-...`)
- Cross-subtree negative module: project "BK-9 Module Test Project"

## Observations

- Response returns `assertions[].position` (auto-assigned 1,2) even though POST sends `{content}` only — server assigns position; matches `validation.ts`. Non-issue.
- `affected*test*ids` could not be observed on H2 (412 returned an error page, not the success body); per contract it is `[]` in MVP. Re-verify once BK-96 is fixed.
- N3's 404 collapses three not-found causes into one coarse message — acceptable; worth a doc note, not a bug.

## Recommendation

Do NOT QA Sign-Off until BK-96 (H2 status-code defect) is fixed and H2 re-runs green. The 12 passing scenarios are eligible for ROI evaluation in Stage 4.

---

## Related Issues

- tests: [BK-18](https://jira.upexgalaxy.com/browse/BK-18) - TMS-ATC API | Create and edit ATCs with steps and assertions

---

## Metadata

- **Created:** 6/8/2026
- **Updated:** 6/8/2026
- **Reporter:** Ely
- **Assignee:** Unassigned

---

_Synced from Jira by sync-jira-issues_
