# BK-34 — Mockup

> Jira field: `customfield_10120` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-34)

# BK-34 Acceptance Test Plan

## Executive Summary

BK-34 must receive Full Sprint Testing Stage 1 coverage before Stage 2 execution. The story creates the entry point for manual Run execution: a QA user or automation caller starts a Run from an existing Test, selects a Project Environment, receives a pending execution checklist, and can recover safely from retries.

Coverage intentionally goes beyond the acceptance criteria floor. The ATP covers the seven Jira ACs plus risk-beyond-AC for request idempotency, the 24-hour domain token boundary, PAT scope enforcement, cross-workspace and non-visible IDs, duplicate-click/retry behavior, and snapshot immutability.

No Jira-native Test issues are created in Stage 1. The TC entries below are outlines only; Stage 4 owns persistent Jira-native Test issue creation after ROI/regression-worthiness analysis.

## Triage and Risk

| Item | Result | Evidence |
| --- | --- | --- |
| Veto | Full ATP required | The story touches Run creation, API/DB data integrity, PAT/session auth, workspace boundary, and state initialization. |
| Risk score | 13 | New feature +3, dynamic API/DB data +3, explicit ACs +2, user-facing +2, high effort/story points 8 +2, multi-component +1, priority Medium +0. |
| Risk level | High | Score is 8 or higher, so extended edge cases are required. |
| Stage boundary | Planning only | Do not transition BK-34, do not execute tests, and do not create Jira Test issues in Stage 1. |

## Business and Technical Context

| Area | Context |
| --- | --- |
| Business value | A QA Engineer can begin manual execution from a prepared Test and a selected Project Environment without editing the underlying Test definition. |
| User journey | Test Repository or Test detail context -> choose environment -> start Run -> land on or open the Run checklist -> execute later stories BK-35 through BK-43. |
| In scope | Run start, environment selection, pending checklist snapshot, step order, retry reuse within 24 hours, executor mode, run history visibility. |
| Out of scope | Updating step results, aborting, final verdict, reports, defect flows, and creating or editing Tests. |
| API | `POST /api/v1/runs` requires auth, `run:execute`, `Idempotency-Key`, valid body, and calls `bunkai*create*run`. `GET /api/v1/runs/{id}` returns the expanded Run checklist. |
| DB | `runs`, `run*atcs`, `run*steps`, `project*environments`, `tests`, `test*steps`, `atcs`, and `atc*steps`; `bunkai*create_run` snapshots chain/step data. |
| Auth | Cookie sessions derive executor mode `human`; PAT callers may send `human`, `agent`, or `ci` and must hold `run:execute`. |
| Workspace boundary | Bearer tokens carry workspace binding; missing, foreign, or non-visible Run reads collapse to non-disclosing not-found behavior. |

## Story Quality Analysis

| Finding | Impact | Stage 1 handling |
| --- | --- | --- |
| Expired `start_token` behavior remains open. | Product retry semantics are not fully confirmed. Current implementation creates a new Run after 24 hours; shift-left recommendation proposed rejecting expired tokens. | Include a boundary outline and mark expected behavior as NEEDS PO/DEV CONFIRMATION. |
| Success UX is still open. | UI assertions cannot be final without Design confirmation. | Stage 2 should validate API/DB first and treat redirect/toast wording as NEEDS DESIGN CONFIRMATION. |
| Executable-source wording still needs PO confirmation. | The AC says executable steps; old handoff discussed ATCs/manual steps. | Treat reachable executable `atc_steps` as the implementation gate; mark manual-only behavior as out of scope unless PO clarifies. |
| Snapshot field set needs Dev confirmation. | Auditability depends on copied step content/order/input/expected values. | Include snapshot immutability as a risk outline and confirm against DB in Stage 2. |
| BK-30 vs BK-70 source mismatch exists. | Handoff artifact path differs from current Jira parent. | Use BK-30 as canonical Jira truth; use BK-70 only as legacy evidence. |

## Refined Acceptance Criteria

### AC1 - Successful human Run start

Given an authenticated workspace member with member-or-higher access, an executable Test, a configured Project Environment, a unique `start_token`, and a valid `Idempotency-Key`, when the user starts a manual Run, then the API creates exactly one Run, links it to the Test and Environment, snapshots the Test title, ATC titles, step content/input/expected data, initializes every Run ATC and Run step to `pending`, preserves source order, stores executor mode `human`, emits run-start history/audit data, and returns the created Run.

### AC2 - Test with zero executable steps is blocked

Given an authenticated member and a Test that has no reachable executable `atc*steps`, when the caller starts a Run with a configured Environment, then Run creation is rejected with a clear no-executable-steps error and no `runs`, `run*atcs`, or `run_steps` records are created.

### AC3 - Invalid or foreign Environment is blocked

Given an authenticated member and an executable Test, when the selected Environment is not configured for the Test's Project or is not visible to the caller's workspace, then Run creation is rejected with an invalid-environment or non-disclosing authorization result and no Run records are created.

### AC4 - Same start token within 24 hours returns existing Run

Given a Run already exists for the same Test and `start*token` and was started less than 24 hours ago, when the caller starts the same Test with the same `start*token`, then the existing Run is returned, the response indicates replay semantics, and no duplicate Run checklist is created.

### AC5 - Different start token creates separate Run

Given a Run already exists for the Test with `start*token` A, when the caller starts the same Test with `start*token` B and a valid request idempotency key, then a new separate Run is created and the original Run remains unchanged.

### AC6 - Executor mode and visibility are correct for automation callers

Given an executable Test and a configured Environment, when a PAT caller with `run:execute` starts a Run using executor mode `agent` or `ci`, then the Run stores the requested executor mode and remains visible to authorized Project members. If the PAT lacks `run:execute`, no Run is created.

### AC7 - New Run appears in history/read surfaces

Given a Run is started successfully, when an authorized teammate or API caller reads the Run/history surface, then the Run is visible with environment, executor mode, start timestamp, initial `running` status, ordered ATCs, and ordered pending steps. Non-visible Run IDs must not disclose existence.

## Test Design Matrix

| AC | Technique fired | Derived coverage |
| --- | --- | --- |
| AC1 | EP, State Transition, Integration, Error Guessing | Valid executable Test partition, Run state `created -> running`, API-to-DB snapshot, duplicate click risk. |
| AC2 | EP, BVA, State Transition | Invalid zero-step partition; boundary at 0 executable steps vs 1 executable step; no partial state transition. |
| AC3 | EP, Decision Table, Security | Valid Environment vs wrong Project vs foreign workspace/non-visible ID; authorization and environment containment interact. |
| AC4 | BVA, State Transition, Error Guessing | Same token before 24-hour boundary; existing Run returned; no duplicate checklist. |
| AC5 | EP, State Transition | Different token partition creates a new independent Run while original state remains unchanged. |
| AC6 | Decision Table, Pairwise, Security | Auth method x executor mode x scope combinations: cookie/human, PAT/human, PAT/agent, PAT/ci, missing scope. Pairwise applied to avoid full role x mode x token cartesian product. |
| AC7 | State Transition, Integration, Security | Created Run must be readable in authorized history/read surface; non-visible/missing IDs collapse to non-disclosing not-found. |
| Cross-cutting | BVA, Error Guessing | `start_token` empty/too long, missing/invalid `Idempotency-Key`, repeated key with same/different payload, snapshot immutability after Test changes. |

## TC Outlines

| ID | Title | Type | Priority | Level | Preconditions | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| BK-34-TC-01 | Should start a human Run with pending checklist from executable Test | Positive | Critical | API + DB + UI smoke | Seed workspace, project, environment, executable Test, member session or token, unique `start_token`, valid `Idempotency-Key`. | HTTP 201; one Run exists with status `running`, executor mode `human`, selected Environment, Test link, ordered pending Run ATCs/steps, and no step result values. |
| BK-34-TC-02 | Should reject Run start when Test has zero executable steps | Negative | Critical | API + DB | Test data generated or discovered for a Test with zero reachable `atc*steps`. | Error reason `no*executable_steps`; no Run, Run ATC, or Run Step rows are inserted. |
| BK-34-TC-03 | Should reject Run start with Environment outside the Test Project | Negative | Critical | API + DB | Executable Test in target Project and an Environment ID from another Project. | Error reason `environment_invalid` or non-disclosing authorization result; no Run rows inserted. |
| BK-34-TC-04 | Should return existing Run for same start token within 24 hours | Boundary | Critical | API + DB | Existing Run for same Test and `start_token` started inside the last 24 hours. | HTTP 200 replay; existing Run ID returned; Run/ATC/step counts unchanged. |
| BK-34-TC-05 | Should create a separate Run for different start token | Positive | High | API + DB | Existing Run for the Test with token A; new request uses token B. | HTTP 201; new Run ID created; original Run remains unchanged. |
| BK-34-TC-06 | Should store executor mode for human, agent, and ci callers | Positive | High | API + DB + Auth | Cookie session and PAT callers with `run:execute`; modes `human`, `agent`, `ci`. | Cookie-created Run stores `human`; PAT-created Runs store requested mode; omitted PAT mode defaults to `human`. |
| BK-34-TC-07 | Should show newly started Run in authorized Run history/read surface | Positive | High | API + UI + DB | Successfully created Run and authorized Project member/teammate. | Read/history surface shows environment, executor mode, start timestamp, initial status, Run ATCs, and pending steps. |
| BK-34-TC-08 | Should reject PAT without run execute scope | Security negative | Critical | API + Auth + DB | PAT caller authenticated but missing `run:execute`. | HTTP 403 forbidden; no Run records created; error does not create idempotency success snapshot. |
| BK-34-TC-09 | Should prevent cross-workspace or non-visible ID disclosure | Security negative | Critical | API + Auth + DB | Caller uses Test, Environment, or Run ID outside visible workspace/project boundary. | Create path returns forbidden or invalid environment without creating records; read path collapses missing/foreign Run to non-disclosing not-found. |
| BK-34-TC-10 | Should handle same start token after 24 hours according to confirmed product rule | Boundary | High | API + DB | Existing Run with same Test and `start_token` older than 24 hours. | NEEDS PO/DEV CONFIRMATION: current implementation creates a new Run; shift-left recommendation was expired-token rejection. |
| BK-34-TC-11 | Should collapse duplicate click or retry with same Idempotency-Key and same payload | Boundary | High | API + DB | Same caller sends duplicate POST with same `Idempotency-Key` and same request payload. | First request creates or returns Run; duplicate receives stored response; no second business write. |
| BK-34-TC-12 | Should reject reused Idempotency-Key with different payload | Negative | High | API + DB | Same caller reuses an `Idempotency-Key` with a different body. | HTTP 409 conflict; no additional Run for the second payload. |
| BK-34-TC-13 | Should preserve Run snapshot when source Test changes after creation | Exploratory integration | High | DB + API | Run created from an executable Test; source Test/ATC/step text or order is changed after creation in controlled data. | Existing Run keeps original snapshot fields/order. NEEDS DEV CONFIRMATION for exact snapshot field set and mutation-safe data setup. |
| BK-34-TC-14 | Should reject missing or invalid Idempotency-Key before Run creation | Negative | High | API + DB | Valid body but missing or malformed `Idempotency-Key`. | Error reason `idempotency*key*required` or `idempotency*key*invalid`; no Run rows inserted. |
| BK-34-TC-15 | Should reject invalid executor mode value | Negative | Medium | API + DB | PAT caller sends executor mode outside `human`, `agent`, `ci`. | Validation error before RPC; no Run rows inserted. |

### Parametrization

| Outline | Parameters | Reason |
| --- | --- | --- |
| BK-34-TC-06 | `human`, `agent`, `ci`, omitted PAT mode | Same action and assertion shape; only executor-mode input varies. |
| BK-34-TC-09 | foreign Test ID, foreign Environment ID, foreign Run ID, random UUID | Same security assertion: no unauthorized existence disclosure and no write. |
| BK-34-TC-14 | missing key, too short key, key with invalid character | Same request-level validation assertion. |

## Data Feasibility and Test Data

| AC / outline group | Current data readiness | Pattern | Evidence / notes |
| --- | --- | --- | --- |
| Successful executable Run | Ready | Discover | Workspace `a222895a-a22a-4193-9c7f-70c43e78bede`, Project `f3260d03-f2ca-4db3-bd97-265cc2bf3830`, Environment `a0b5f094-bb53-430e-a018-13fbb3931f63`, Test `09d28d3c-ad29-45d9-a014-dbb7ba6ccbb2`. DBHub confirms the Test has executable steps and the seed Run has 1 Run ATC and 2 pending Run steps. |
| Same token within 24 hours | Ready for read/replay planning | Discover | Existing Run `b7bc0422-7d42-4fe5-9c45-7bcc76bee136` uses token `bk34-seed-20260622020948`, status `running`, executor mode `agent`. Stage 2 must avoid mutating this record unless execution approval is given. |
| Invalid Environment | Partially ready | Discover or Generate | DBHub found foreign Environment IDs. Stage 2 should prefer a controlled same-workspace wrong-project Environment if available, or use a clearly foreign ID only for non-disclosure validation. |
| Zero executable steps | Needs generated fixture | Generate | DBHub did not find a zero-step Test in the target workspace during planning. Stage 2 needs a controlled API/UI fixture or pre-seeded Test with no executable `atc_steps`. |
| Insufficient scope | Needs token fixture | Generate | Requires PAT missing `run:execute`; do not reuse privileged Stage 1 token. |
| Cross-workspace / non-visible IDs | Partially ready | Discover | Foreign IDs exist; expected exact response depends on create vs read path. Treat no-disclosure expectation as required, but status code shape must be verified. |
| Snapshot immutability | Needs controlled mutable source data | Generate | Requires source Test/ATC/step mutation after Run creation; Stage 2 should only do this in disposable seed data. |

## Edge Cases and Open Confirmations

- NEEDS PO/DEV CONFIRMATION: same `start_token` after 24 hours currently creates a new Run; shift-left recommendation proposed rejecting expired tokens.
- NEEDS DESIGN CONFIRMATION: successful UI state after Run creation: redirect, toast copy, and visible pending checklist.
- NEEDS PO CONFIRMATION: executable-source gate is treated as reachable executable `atc_steps`; manual-only Test behavior remains unclear.
- NEEDS DEV CONFIRMATION: exact Run snapshot fields that must remain immutable after source Test edits.
- NEEDS DEV CONFIRMATION: final response envelope/status mapping for cross-workspace create attempts vs read attempts.
- NEEDS QA DATA SETUP: zero-executable Test, insufficient-scope PAT, and mutable snapshot fixture should be created or identified before Stage 2.

## Expert Panel Notes

- [Jira] QA Lead: Minimum coverage must include success, zero executable steps, invalid environment, same-token retry, different-token new Run, executor mode, authorization, and history visibility.
- [Repo] Technical Architect: The implementation uses `POST /api/v1/runs`, `bunkai*create*run`, `runs`, `run*atcs`, and `run*steps`; snapshot behavior is implementation-backed but still needs field-set confirmation.
- [Jira] Product/UX: Success state remains open; validate API/DB first and treat UI copy/navigation as confirmation-dependent.
- [Repo] AppSec: Bearer token path requires PAT shape, scope checks, expiry/revoke handling, and workspace binding; include insufficient-scope and cross-workspace tests.
- [DBHub] Workflow/Jira: Current jira-native Stage 1 creates ATP/ATR field content only; no Jira Test work items are allowed in Stage 1.
- [Inference] Skeptical Reviewer: The seven shift-left outlines were not enough for a high-risk story because they did not fully cover request idempotency, cross-workspace visibility, insufficient scope, after-24h boundary, or snapshot immutability.
- [Engram] Engram Curator: No prior exact Engram memory was found for the BK-34 Stage 1 ATP; save the completed planning decision after publication.

## Test-Design Checklist

| Check | Result | Justification |
| --- | --- | --- |
| P1 - Beyond every AC passes | YES | Added risk-beyond-AC for scope, workspace boundary, request idempotency, expired token boundary, and snapshot immutability. |
| P2 - ACs treated as floor | YES | Matrix separates AC-conformance from cross-cutting risk coverage. |
| P3 - Concrete exploration | YES | Each outline names concrete data state, auth mode, token behavior, response/DB expectation, and postcondition. |
| P4 - Non-trivial ACs exploded | YES | Seven ACs expanded into 15 outlines; no non-trivial AC collapsed to one case. |
| P5 - Boundary/exception/anomaly cases | YES | Covers zero steps, invalid Environment, same token inside/outside 24 hours, idempotency-key reuse, duplicate click, and non-visible IDs. |
| EP - Partitions identified | YES | Valid executable, zero-step, invalid environment, token reuse, different token, scope missing, non-visible IDs, and invalid executor partitions covered. |
| BVA - Ranges/limits/date windows | YES | 24-hour token window and `Idempotency-Key` length/pattern are covered; `start_token` length boundary remains recommended for Stage 2 if time permits. |
| ST - Stateful entity transitions | YES | Run creation to `running`, pending checklist initialization, replay existing Run, new Run after different token, and read/history visibility covered. |
| DT - Interacting conditions | YES | Auth method, executor mode, scope, Test visibility, and Environment containment interactions are planned. |
| PW - Three-plus factors | YES | Pairwise applied to auth method x executor mode x scope/visibility factor set. |
| PARAM - Same behavior variants parameterized | YES | Executor modes, non-visible IDs, and invalid idempotency-key variants are parameterized inside single outlines. |
| RISK - Prioritized and no silent drops | YES | Critical and High outlines run before Medium; no derived risk is silently dropped. |

## Stage 2 Execution Charter

1. Start with API/DB smoke: verify staging is reachable, token is valid, and seed workspace/project/environment/test remain visible.
2. Execute critical API + DB outlines first: successful start, zero executable steps, invalid environment, same-token replay, insufficient scope, and cross-workspace/non-visible IDs.
3. Validate DB state after every create/reject path: Run row count, Run ATC count, Run Step count, statuses, order, selected Environment, executor mode, and unchanged original Run where applicable.
4. Exercise request idempotency separately from domain `start_token`: same `Idempotency-Key` plus same payload, reused key plus different payload, and duplicate-click retry behavior.
5. Run UI smoke only after API/DB behavior is stable: start flow entry point, environment selection, success state, and history/read visibility. Treat unresolved copy/navigation as confirmation-dependent.
6. Do not execute BK-35 through BK-43 behavior: no step result updates, no abort, no final verdict, no reports, and no defect sync flows.

---
_Synced from Jira by sync-jira-issues_
