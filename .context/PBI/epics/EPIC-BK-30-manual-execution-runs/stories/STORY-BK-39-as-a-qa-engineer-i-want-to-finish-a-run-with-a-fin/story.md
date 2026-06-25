# TMS-Run Execution | Finish a run with a final verdict

**Jira Key:** [BK-39](https://jira.upexgalaxy.com/browse/BK-39)
**Epic:** [BK-30](https://jira.upexgalaxy.com/browse/BK-30) (Manual Execution & Runs)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://staging-upexbunkai.vercel.app/

---

## Overview

# BK-39: TMS-Run Execution | Finish a run with a final verdict

## Metadata Snapshot

- Jira key: BK-39
- Status: Estimation
- Priority / points: Medium / not set
- Reporter / assignee: unknown / jesusgpythondev
- Labels: shift-left-reviewed, shift-left-2026-06-13
- Last updated: 2026-06-13 shift-left re-refinement

## User Story

As a QA Engineer, I want to finish a Run when the work is done, recording a final verdict of passed or failed, so that the Run is closed with a clear outcome and any still-pending steps are marked skipped.

## Source & Evidence

- Source spec: BK-024
- Parent epic/module: BK Test Repository / TMS Run Execution
- Evidence used: BK-39 Jira fields, BK-39 previous shift-left package, BK-39 dependency link, BK-34 shift-left refinement, BK-70 Test Repository context, expert-panel-review findings.
- Evidence labels used: Jira, Repo, Engram, Inference.

## Shift-Left Review Status

- Verdict: Ready for estimation
- Summary: BK-39 is a focused terminal-state Story for closing an already-started Run. It is ready for estimation because the user-visible outcome, state transitions, skip handling, and dependency on BK-34 are testable. PO/Dev should still confirm concurrency, state model, and authorization details before development starts.

## Expert Review Summary

| Role | Finding | Recommendation | Confirmation |
| --- | --- | --- | --- |
| PO | The business outcome is closure with a clear final result. | Keep final verdict limited to `passed` and `failed` for BK-39. | Needs PO confirmation |
| Dev | Finish changes Run state and step-result state together. | Treat finish as an atomic operation: verdict, finish time, and pending-to-skipped updates must not partially apply. | Needs Dev confirmation |
| QA | The test surface is mostly state transition and regression protection. | Cover happy path, mixed step states, terminal-state blocking, missing verdict, concurrency, and human/AI/CI parity. | Confirmed |
| UX | Pending steps become skipped, which is a terminal user action. | Show a confirmation when pending steps exist and show final verdict/finish time afterward. | Needs UX/PO confirmation |
| Security/Ops | AI Agent and CI finish calls must not bypass access control. | Use the same authorization model as human execution, with traceable actor or executor mode. | Needs Security/Dev confirmation |
| Workflow/Jira | Previous simple mirror should not remain duplicated. | Delete old comment mirror and keep Jira description as primary source plus one updated ATP/comment mirror. | Confirmed |

## Scope

### In Scope

- Finish an in-progress Run with final verdict `passed` or `failed`.
- Persist final verdict and finish time.
- Convert every still-pending Run step result to `skipped` when the Run is finished.
- Preserve already-executed step results unchanged.
- Block finish attempts for Runs that are already finished or aborted.
- Apply the same observable finish handling for human, AI Test Agent, and CI pipeline callers.
- Show the Run's final verdict and finish time after completion.
- Keep the Run linked to its original Test, environment, executor mode, and step-result history from BK-34.

### Out of Scope

- Starting a Run; covered by BK-34.
- Updating individual step results before finish; covered by run execution step-result Stories.
- Aborting a Run; covered by BK-36.
- Run history filtering and reporting totals; covered by BK-37 and BK-38.
- Defect filing, listing, heatmap, or Jira sync; covered by BK-40 through BK-43.
- Reopening or amending a finished Run.
- Creating or editing the underlying Test definition.

### Deferred / Follow-up Stories

- Reopen or amend a finished Run if business users need correction workflows later.
- Required defect linkage for failed verdicts if PO decides `failed` cannot stand alone.
- Audit-log UI for terminal Run actions if needed beyond stored actor/executor mode.

## Dependency Map

| Dependency | Type | Impact | Owner | Status |
| --- | --- | --- | --- | --- |
| BK-34 Start a manual Run | Formal Jira dependency | BK-39 assumes a Run already exists with initialized step results, environment, executor mode, and history visibility. | Dev / QA | Ready For Dev |
| BK-70 Test Repository | Functional model dependency | Defines Test, Run, Run step results, defects, workspace access, and separation between Test definition and execution instance. | Dev / PO | Backlog context, already refined |
| BK-36 Abort Run | Scope boundary | Abort is another terminal action and must not be mixed with finish behavior. | PO / Dev | Separate Story |
| BK-37 / BK-38 Run history and reports | Scope boundary | BK-39 only shows final verdict and finish time after finish; reporting totals remain outside scope. | PO / QA | Separate Stories |
| BK-40 through BK-43 Defects | Deferred dependency | Failed verdict does not require defect lifecycle in BK-39 unless PO changes scope. | PO / QA | Separate Stories |

## Key Contract Decisions

| Decision | Rationale | Source | Confirmation |
| --- | --- | --- | --- |
| Finish applies only to an in-progress, non-terminal Run. | Current Story explicitly blocks already finished or aborted Runs. | Jira | Confirmed |
| Final verdict values for BK-39 are `passed` and `failed`. | Current Story requires choosing final verdict passed or failed; extra values would expand scope. | Jira | Needs PO confirmation |
| Pending steps become `skipped` at finish. | Current Story says still-pending steps are marked skipped. | Jira | Confirmed |
| Already-executed step results remain unchanged. | Current Story requires preserving executed results. | Jira | Confirmed |
| Finish must be atomic across Run final state, final verdict, finish time, and pending-step updates. | Partial state would create a finished Run with open pending steps. | Inference | Needs Dev confirmation |
| First terminal action wins when finish conflicts with finish, abort, or step update. | Prevents race conditions and terminal-state drift. | Inference | Needs PO/Dev confirmation |
| Human, AI Agent, and CI finish use the same observable rules. | Current Story requires same verdict and skipped-step handling for AI/CI and humans. | Jira | Confirmed |
| AI Agent and CI must not bypass Project/workspace authorization. | BK-70 access model implies mutations follow workspace/project access. | Repo / Inference | Needs Security/Dev confirmation |
| Failed verdict does not require defect linkage in BK-39. | Defect lifecycle is delegated to BK-40 through BK-43. | Repo / Inference | Needs PO confirmation |

## AC Reconciliation

| Original AC / source claim | Evidence | Refined outcome | Reason | Owner |
| --- | --- | --- | --- | --- |
| Engineer can finish a Run that is in progress. | BK-39 Jira description. | Kept and expanded into happy path AC. | Core user outcome. | PO / QA |
| Finishing requires final verdict passed or failed. | BK-39 Jira description. | Kept with allowed values in business rules. | Prevents ambiguous terminal outcomes. | PO |
| Pending steps are marked skipped. | BK-39 Jira description. | Kept and made separate state-transition AC. | High-risk behavior needs direct coverage. | QA |
| Already-executed results are preserved. | BK-39 Jira description. | Kept and made separate regression AC. | Prevents evidence loss. | QA / Dev |
| Final verdict and finish time are shown afterward. | BK-39 Jira description. | Kept in happy path and UI rules. | Observable user feedback. | UX / QA |
| Already finished or aborted Run is blocked. | BK-39 Jira description; BK-36 owns abort. | Kept as terminal-state guard AC. | Prevents duplicate or invalid terminal mutations. | Dev / QA |
| AI Agent or CI finished Run records same verdict and skip handling. | BK-39 Jira description; BK-34 stores executor mode. | Kept as parity AC. | Avoids automation drift from human behavior. | Dev / QA |
| Final verdict is excluded from BK-34 and owned by BK-39. | BK-34 Out Of Scope says final run verdict is BK-39. | Added as dependency/scope rule. | Prevents BK-39 from redefining Run creation. | PO / Dev |
| Defect creation on failed verdict. | BK-40 through BK-43 cover defects. | Deferred unless PO requires it. | Keeps BK-39 focused and estimable. | PO |

## Refined Acceptance Criteria

```gherkin
Background:
  Given an authenticated workspace member with access to the Project
    And a Test exists in that Project
    And a Run was started from that Test
    And the Run has initialized step results

# Happy path

Scenario: Finish an in-progress Run with a final verdict
  Given the Run is in progress
    And the user selects final verdict "passed" or "failed"
  When the user finishes the Run
  Then the Run is closed with the selected final verdict
    And the Run finish time is recorded
    And the final verdict and finish time are visible afterward

# State transition

Scenario: Pending steps are skipped when the Run is finished
  Given the Run is in progress
    And the Run has one or more pending steps
  When the user finishes the Run with final verdict "passed" or "failed"
  Then every still-pending step is marked "skipped"
    And the finished Run has no remaining pending steps

Scenario: Already-executed step results are preserved
  Given the Run is in progress
    And at least one step already has an executed result
    And at least one step is still pending
  When the user finishes the Run
  Then the already-executed step results remain unchanged
    And only pending steps are changed to "skipped"

# Negative path

Scenario: Missing final verdict blocks finish
  Given the Run is in progress
  When the user attempts to finish the Run without selecting "passed" or "failed"
  Then the action is blocked
    And a clear message explains that final verdict is required
    And no Run or step-result data changes

Scenario: A terminal Run cannot be finished again
  Given the Run is already finished or aborted
  When a user attempts to finish the Run
  Then the action is blocked
    And a clear message explains that the Run cannot be finished from its current state
    And no Run or step-result data changes

# Boundary / concurrency

Scenario: Concurrent finish attempts do not create conflicting terminal state
  Given the Run is in progress
  When two callers attempt to finish the same Run at nearly the same time
  Then only one finish action is applied
    And the final Run state remains internally consistent
    And already-executed step results remain unchanged
    And pending steps are skipped at most once

# Integration

Scenario: Human, AI Agent, and CI finish handling are consistent
  Given the Run is in progress
    And the caller is a human user, AI Test Agent, or CI pipeline
  When the caller finishes the Run with final verdict "passed" or "failed"
  Then the same final-verdict handling is applied
    And pending steps are marked "skipped" using the same rule
    And already-executed step results remain unchanged
    And the executor mode or actor remains traceable afterward
```

## Business Rules

- BK-39 operates on a Run execution instance, not on the Test definition.
- A Run can be finished only from an in-progress, non-terminal state.
- Allowed final verdicts for this Story are `passed` and `failed`.
- Pending step results become `skipped` when the Run is finished.
- Already-executed step results must not be overwritten by the finish action.
- Finish should be atomic: final verdict, finish time, and pending-to-skipped updates must not leave partial state.
- Once a Run is finished or aborted, another finish attempt must not mutate it.
- Human, AI Agent, and CI callers must produce the same observable final state.
- Run visibility and mutation permissions follow the existing Project/workspace access model.
- Defect creation is not required for failed verdict in BK-39 unless PO changes scope.

## Edge Cases & Risk Matrix

| Severity | Edge case | Expected behavior | Mitigation | Coverage |
| --- | --- | --- | --- | --- |
| High | Finish with missing verdict | Block action; no Run or step-result mutation. | Require explicit `passed` or `failed`. | AC missing verdict / ATP-04 |
| High | Run has mixed executed and pending steps | Executed results preserved; only pending steps become skipped. | Apply status update only to pending step results. | AC preservation / ATP-02, ATP-03 |
| High | Already finished or aborted Run is finished again | Block action; no data mutation. | Terminal-state guard before update. | AC terminal guard / ATP-05 |
| High | Concurrent finish attempts | Only one terminal mutation wins; no partial state. | Conditional update or transaction. | AC concurrency / ATP-06 |
| High | AI/CI finishes without normal permissions | Reject unauthorized caller; no data mutation. | Same Project/workspace authorization as human execution. | ATP-07 |
| Medium | Run has all steps already executed | Finish records verdict/time without changing step results. | Pending-to-skipped update affects zero rows safely. | ATP-03 |
| Medium | Failed verdict without defect | Finish allowed unless PO requires defect linkage. | Keep defect lifecycle in BK-40..BK-43. | Open clarification |
| Medium | User finishes with pending steps accidentally | Confirmation should warn pending steps will become skipped. | UX confirmation when pending steps exist. | Open clarification / ATP-08 |
| Medium | Finish time differs between client and server clocks | Persist server-side finish time. | Server timestamp as source of truth. | Open clarification |
| Low | Final result display does not refresh | User should see final verdict and finish time after completion. | Redirect/refresh Run detail after finish. | AC happy path / ATP-01 |

## ATP Draft Matrix

| ID | Type | Scenario | Coverage target | Priority | Automation hint |
| --- | --- | --- | --- | --- | --- |
| BK-39-ATC-01 | Happy | Finish in-progress Run with `passed` verdict | Final verdict + finish time visible | High | UI + API + DB |
| BK-39-ATC-02 | State transition | Finish Run with pending steps | Pending steps become `skipped` | High | API + DB |
| BK-39-ATC-03 | Regression | Finish Run with executed and pending steps | Executed results remain unchanged | High | API + DB |
| BK-39-ATC-04 | Negative | Attempt finish without verdict | Blocked; no mutation | High | UI + API |
| BK-39-ATC-05 | Negative | Attempt finish on finished or aborted Run | Blocked; no mutation | High | API + DB |
| BK-39-ATC-06 | Boundary | Concurrent finish attempts | One terminal outcome, consistent data | High | API + DB |
| BK-39-ATC-07 | Integration | AI Agent / CI finish uses same handling | Human/agent/ci parity | Medium | API |
| BK-39-ATC-08 | UX | Finish with pending steps prompts confirmation | Prevent accidental skipped steps | Medium | UI |
| BK-39-ATC-09 | Scope guard | Failed verdict without defect | Allowed unless PO changes scope | Medium | API |

## Open Clarifications With Expert Recommendations

### Dev - Final State Model

- Question: Should the Run store terminal lifecycle state separately from final verdict, or should the verdict itself act as the state?
- Expert recommendation: Keep lifecycle state and business verdict conceptually separate. A Run can be terminal while final verdict remains `passed` or `failed`; do not force physical field names until implementation design.
- Pending confirmation: Dev

### Dev - Atomic Finish Operation

- Question: How will the system guarantee that final verdict, finish time, and pending-step skip updates are applied together?
- Expert recommendation: Apply the finish operation transactionally or through an equivalent conditional update so BK-39 cannot leave a Run finished with pending steps still open.
- Pending confirmation: Dev

### PO/Dev - Double Finish And Concurrency

- Question: If two callers try to finish the same Run at nearly the same time, should the second call return the current terminal state or fail with an already-finished message?
- Expert recommendation: First terminal action wins. The second attempt should not mutate data and should return a clear already-terminal outcome.
- Pending confirmation: PO and Dev

### PO/QA - Authorization To Finish

- Question: Who can finish a Run: only the starter, any authorized Project member, or specific roles?
- Expert recommendation: For MVP, allow authorized Project members according to the existing workspace/Project access model; add stricter role rules only if PO explicitly requires them.
- Pending confirmation: PO and QA

### Security/Dev - AI And CI Actor Identity

- Question: What identity and permission model do AI Test Agent and CI pipeline callers use when finishing a Run?
- Expert recommendation: AI and CI should not bypass authorization. They should use a traceable actor or executor mode and apply the same finish rules as human callers.
- Pending confirmation: Security and Dev

### PO - Failed Verdict Without Defect

- Question: Can a Run be finished as `failed` without creating or linking a defect?
- Expert recommendation: Yes for BK-39. Defect lifecycle belongs to BK-40 through BK-43; BK-39 should not require defect creation unless PO explicitly changes the scope.
- Pending confirmation: PO

### UX/PO - Confirmation Before Skipping Pending Steps

- Question: Should the UI ask for confirmation before finishing a Run that still has pending steps that will become skipped?
- Expert recommendation: Show a confirmation when pending steps exist, because finish is a terminal action that changes remaining pending steps to skipped.
- Pending confirmation: UX and PO

## Implementation Readiness Gates

| Gate | Status | Evidence | Blocker / Next action |
| --- | --- | --- | --- |
| PO contract | Needs | Final verdict values and failed-without-defect scope need PO confirmation. | Confirm verdict values and defect independence. |
| Dev feasibility | Needs | Atomic finish, terminal-state model, and concurrency contract need implementation decision. | Confirm transaction/conditional update approach. |
| QA testability | Pass | ACs and ATP rows cover happy, negative, state transition, boundary, and integration paths. | None. |
| Data/API | Needs | BK-70 defines Runs and step results, but BK-39 physical state fields are not confirmed. | Confirm persisted lifecycle/verdict/finish-time fields. |
| UX | Needs | Final verdict display is explicit; confirmation before skipping pending steps is recommended. | Confirm confirmation UX and message strategy. |
| Security/Ops | Needs | Human/AI/CI parity is explicit; actor identity/authorization model needs confirmation. | Confirm automation identity and permission checks. |

## Handoff Notes

- For PO: Confirm final verdict values, failed-without-defect scope, and whether pending-step skip confirmation is required.
- For Dev: Confirm terminal state model, atomic finish operation, concurrency behavior, finish time source, and actor identity for AI/CI.
- For QA: Minimum ATP must cover final verdict, pending-to-skipped, executed-result preservation, terminal-state block, missing verdict, concurrency, AI/CI parity, and failed-without-defect scope.
- For Automation: Strong candidates are API + DB checks for state transitions and UI checks for confirmation/final-result display.
- Not requested / not done: No Jira/Xray test cases created, no sprint execution, no QA evidence captured.

## Publication Checklist

- Description updated: yes
- AC field updated: not requested
- ATP DRAFT or comment mirror updated: yes
- Labels applied: `shift-left-reviewed`, `shift-left-2026-06-13` yes
- Transition status: already in Estimation
- Rendered verification: re-read Jira/rendered content yes
- Ownership handback: PO / Dev / QA

## References

- BK-34: TMS-Run Execution | Start a manual run in a chosen environment
- BK-70: BK Test Repository entity definition
- BK-36: Abort Run scope boundary
- BK-37 / BK-38: Run history and reporting scope boundaries
- BK-40 through BK-43: Defect lifecycle scope boundary
- Formal Jira dependency: BK-39 depends on BK-34
- Expert-panel-review applied before re-publication

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)

---

## Traceability

### Story (1)

- [BK-34](https://jira.upexgalaxy.com/browse/BK-34): TMS-Run Execution | Start a manual run in a chosen environment _(QA Approved)_

---

## Metadata

- **Created:** 5/28/2026
- **Updated:** 6/13/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** shift-left-2026-06-13, shift-left-reviewed

---

_Synced from Jira by sync-jira-issues_
