# Comments for BK-39

[View in Jira](https://jira.upexgalaxy.com/browse/BK-39)

---

### jesusgpythondev - 6/13/2026, 9:46:03 PM

# QA Handoff Mirror - BK-39 Shift-Left Review Update

BK-39 was re-refined with the updated Ely-style `/shift-left-refinement` structure and reviewed through `/expert-panel-review` before publication.

The previous simple comment mirror was deleted to avoid duplicate shift-left executions. The Jira description is the primary source of truth; this comment is the single QA/ATP handoff mirror.

## Executive Summary

BK-39 defines how an already-started Run is finished with a final verdict. The key quality concern is state consistency: final verdict, finish time, pending-step skip handling, and preservation of executed results must happen without partial or duplicate terminal state.

## Refinement Delta

| Area | Added / clarified | Why it matters |
| --- | --- | --- |
| Contract decisions | 9 decisions covering final verdict, terminal states, pending-to-skipped, preservation, atomicity, concurrency, AI/CI parity, permissions, and defect scope | Gives Dev an implementable contract, not just Gherkin |
| AC reconciliation | 9 source claims reconciled from the original DoD, BK-34, and BK-70 context | Shows what stayed, expanded, or moved out of scope |
| Risk matrix | 10 edge cases, including 5 High risks | Makes negative/boundary coverage visible before sprint planning |
| ATP draft | 9 ATP rows | Gives QA/test-documentation a direct handoff |
| Readiness gates | QA testability passes; PO, Dev, Data/API, UX, and Security/Ops need confirmation | Prevents a false “ready” signal where decisions remain open |

## ATP Draft Summary

| ID | Type | Scenario | Priority | Surface |
| --- | --- | --- | --- | --- |
| BK-39-ATC-01 | Happy | Finish in-progress Run with `passed` or `failed` verdict and show finish time | High | UI + API + DB |
| BK-39-ATC-02 | State transition | Pending steps become `skipped` on finish | High | API + DB |
| BK-39-ATC-03 | Regression | Already-executed step results remain unchanged | High | API + DB |
| BK-39-ATC-04 | Negative | Missing final verdict blocks finish | High | UI + API |
| BK-39-ATC-05 | Negative | Finished or aborted Run cannot be finished again | High | API + DB |
| BK-39-ATC-06 | Boundary | Concurrent finish attempts keep one consistent terminal outcome | High | API + DB |
| BK-39-ATC-07 | Integration | Human, AI Agent, and CI finish handling stay consistent | Medium | API |
| BK-39-ATC-08 | UX | Pending steps warning / confirmation before finish | Medium | UI |
| BK-39-ATC-09 | Scope guard | `failed` verdict does not require defect unless PO changes scope | Medium | API |

## High And Medium Risks

| Severity | Risk | Expected handling | Coverage |
| --- | --- | --- | --- |
| High | Finish without verdict | Block; no Run or step-result mutation | BK-39-ATC-04 |
| High | Mixed executed + pending steps | Preserve executed results; only pending becomes `skipped` | BK-39-ATC-02 / BK-39-ATC-03 |
| High | Already finished or aborted Run | Block; no mutation | BK-39-ATC-05 |
| High | Concurrent finish attempts | One terminal mutation wins; no partial state | BK-39-ATC-06 |
| High | AI/CI bypassing permissions | Reject unauthorized caller; keep actor traceable | BK-39-ATC-07 |
| Medium | All steps already executed | Finish records verdict/time; no step result changes | BK-39-ATC-03 |
| Medium | `failed` verdict without defect | Allow for BK-39 unless PO changes scope | BK-39-ATC-09 |
| Medium | Accidental finish with pending steps | Confirmation recommended before converting pending to skipped | BK-39-ATC-08 |
| Medium | Client/server clock mismatch | Server-side finish time should be source of truth | Open Dev confirmation |
| Medium | Final result display stale | Show verdict and finish time after completion | BK-39-ATC-01 |

## Open Confirmations

| Owner | Decision needed | Expert recommendation |
| --- | --- | --- |
| PO | Are final verdicts only `passed` and `failed`? | Keep only those two for BK-39; defer extra verdicts to a future Story |
| PO | Can a Run finish as `failed` without a linked defect? | Yes for BK-39; defect lifecycle belongs to BK-40 through BK-43 |
| Dev | How are lifecycle state and final verdict stored? | Keep terminal lifecycle state conceptually separate from business verdict |
| Dev | How is finish applied atomically? | Use transaction or equivalent conditional update |
| PO/Dev | What happens on double finish/concurrent finish? | First terminal action wins; later attempt does not mutate data |
| UX/PO | Should pending-step skip require confirmation? | Yes when pending steps exist |
| Security/Dev | Which identity do AI Agent / CI calls use? | Same authorization model as human callers, with traceable actor/executor mode |

## Dependency Note

BK-39 depends on BK-34 because BK-39 consumes an already-started Run with initialized step results, selected environment, executor mode, and history visibility. BK-39 does not redefine Run creation.

Functional boundaries:

- BK-34: start Run and initialize pending checklist.
- BK-36: abort Run.
- BK-37 / BK-38: run history and reporting totals.
- BK-40 through BK-43: defect lifecycle and Jira sync.
- BK-70: Test Repository model, Run entities, step results, and access model.

## Out Of Scope For BK-39 QA

- Starting a Run.
- Editing individual step results before finish.
- Aborting a Run.
- Run history filtering and aggregate reporting.
- Defect creation, defect listing, defect heatmap, or Jira defect sync.
- Reopening or amending a finished Run.
- Creating or editing the underlying Test definition.

## Publication Status

- Description updated with the Ely-style refinement package.
- QA/ATP handoff mirror updated in this single comment.
- Previous simple mirror deleted to avoid duplication.
- Labels preserved: `shift-left-reviewed`, `shift-left-2026-06-13`.
- Status preserved: Estimation.
- Dependency preserved: BK-39 depends on BK-34.

---


_Synced from Jira by sync-jira-issues_
