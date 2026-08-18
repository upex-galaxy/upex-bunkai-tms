# BK-269 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-269)

# Shift-Left Refinement: BK-269 — Automatically abort abandoned runs after inactivity

***Status***: Refined — Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint, batch grooming)
***Refined on***: 2026-08-17
***Refined by***: QA — Shift-Left batch session
***Modality***: Jira-native

---

## Phase 1 — Critical Analysis

### Business context

- ***Primary persona affected***: QA Lead (monitors active runs, needs accurate dashboards)
- ***Secondary personas (if any)***: QA Engineer (abandoned runs inflate active count), Dev Lead (coverage reports distorted)
- ***Business value proposition***: Dashboards, coverage, and progress reports reflect reality — not runs someone forgot to finish
- ***KPI(s) influenced***: Active run count, time-to-green, coverage %, test plan progress
- ***User journey position***: Background process — no direct user interaction; affects Home widget + Run history + reporting views

### Technical context

- ***Frontend***: Home "active test runs" widget (FEAT-038), Run history (BK-37), Run reporting (BK-38)
- ***Backend***: `runs` table (status, updated*at, finish*time, reason), existing abort endpoint (BK-36), scheduled job infrastructure (cron or similar)
- ***External services***: None — internal sweep only
- ***Integration points specific to this Story***: `runs` table, `run*atcs`/`run*steps` (cascade on abort), Home widget API, run history query, materialized view `module*defect*stats` (refresh trigger)

### Story complexity

| Axis | Rating | Why |
| --- | --- | --- |
| Business logic | Low | Reuses existing abort logic; sweep is a timer-based query + batch update |
| Integration | Low | No external APIs; internal DB sweep only |
| Data validation | Low | No user input; threshold config is out-of-scope per Story |
| UI | None | No UI changes; affects existing widgets via data change |

***Estimated test effort***: Low (1-2 hours manual exploration + API verification)

### Epic-level inheritance

- ***Risks restated***: Run lifecycle is CRITICAL per master-test-plan; step-mark rollup, terminal guards, and idempotency are proven patterns from BK-34/35/36/39
- ***Integration points inherited***: `runs` table, abort logic (BK-36), Home widget, run history
- ***PO/Dev answers already given***: Abort reuses existing logic (business-rules.md "Alternatives considered")
- ***Test strategy inherited***: Same as epic — lifecycle testing + terminal guards + cross-workspace isolation

---

## Phase 2 — Story Quality Analysis

### Ambiguities

| # | Location in Story | Question for PO/Dev | Impact on testing | Suggested clarification |
| --- | --- | --- | --- | --- |
| 1 | Scope: "configurable inactivity threshold" vs Out-of-Scope: "choosing the threshold value" | The threshold is configurable but the value is out-of-scope — does this mean the sweep reads from a config table/env var with a hardcoded default, or is the config UI also deferred? | Cannot test threshold behavior without knowing the default value and where it's configured | Clarify: "The threshold is read from [config source] with a default of [X hours]. Config UI is out-of-scope for this Story." |
| 2 | Scope: "sweep runs across every Workspace in a single pass" | Is the sweep a cron job, a serverless function, or triggered by an API call? What's the execution frequency? | Affects how we test timing and concurrency | Specify trigger mechanism and frequency |
| 3 | AC7: "reason shown identifies the closure as an automatic sweep" | What is the exact text of the system-generated reason? Is it a fixed string or includes timestamp/threshold? | Cannot assert exact reason text in test | Provide the exact reason template |
| 4 | AC9: "Workspace A's idle Run is closed... Workspace B's Run remains running" | How does the sweep identify workspace boundaries — `runs.workspace*id` FK? | Confirms data model assumption | Confirm `runs` has `workspace*id` column |

### Gaps (missing info)

| # | Type | Why critical | What to add | Risk if omitted |
| --- | --- | --- | --- | --- |
| 1 | Technical | No mention of how "no step activity recorded" is determined — is it `runs.updated*at`, `run*steps.updated*at`, or a dedicated `last*step*activity*at`? | Specify the timestamp column used for inactivity check | Wrong column = sweep never triggers or triggers too early |
| 2 | Technical | What happens to `run*atcs` and `run*steps` rows when sweep aborts? Same cascade as manual abort (BK-36)? | Confirm cascade behavior matches manual abort | Partial cleanup leaves orphan rows |
| 3 | Business Rule | Is the sweep idempotent by design or by implementation? AC8 says "running repeatedly has no further effect" — is this enforced by status guard or by timestamp comparison? | Clarify idempotency mechanism | Double-abort attempts could cause errors |

### Edge cases not in Story

| # | Scenario | Expected behavior (best guess) | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Sweep runs while a step is being marked (race condition) | Step mark wins, sweep skips — or sweep wins, step mark rejected with terminal guard | High | ***NEEDS PO/DEV CONFIRMATION*** — add concurrency handling AC |
| 2 | Run was "running" but the last step was marked "blocked" (not "pass" or "fail") | Sweep should still close it — "blocked" counts as inactive | Medium | Add to AC (blocked runs are also abandoned) |
| 3 | Run has 0 steps marked (just started, no activity at all) | Sweep should close it — no activity = abandoned | High | ***NEEDS PO/DEV CONFIRMATION*** — confirm 0-step runs qualify |
| 4 | Sweep fails mid-batch (server crash after closing 5 of 10 runs) | Next sweep run should pick up the remaining 5 | Medium | Confirm sweep is resumable / idempotent |
| 5 | Run was created but never started (status "pending" or "created") | Sweep should NOT touch it — only "running" status qualifies | Medium | Confirm scope is "running" only |
| 6 | Threshold is 0 (misconfigured) | Sweep would close ALL running runs immediately — is there a minimum threshold guard? | Low | ***NEEDS PO/DEV CONFIRMATION*** — minimum threshold validation |
| 7 | Run's `updated*at` is set by the sweep itself on abort | Next sweep execution must not see the freshly-aborted run as "recently active" | High | Confirm sweep updates `finish*time` but NOT `updated_at`, or use a dedicated timestamp |

### Contradictions

- Scope says "configurable inactivity threshold" but Out-of-Scope says "choosing or hard-coding the threshold value" is deferred. The threshold must exist SOMEWHERE for the sweep to work — this is a scope gap, not a contradiction, but needs clarification.

### Testability validation

***Verdict***: Partial

Issues:

- Default threshold value unknown — cannot design time-based test scenarios
- Sweep trigger mechanism unknown — cannot trigger sweep manually for testing
- System-generated reason text unknown — cannot assert exact string
- Race condition handling unspecified — cannot design concurrency test

---

## Phase 3 — Refined Acceptance Criteria

### Original AC1 — An idle Run past the inactivity threshold is closed by the sweep

#### Scenario 1.1: Should abort a running run with no step activity beyond the inactivity threshold (Type: Positive, Priority: Critical)

- ***Given***: A Run in "running" status with `last*step*activity_at` older than the configured inactivity threshold
- ***When***: The scheduled sweep executes
- ***Then***:

#### Scenario 1.2: Should NOT abort a running run with recent step activity within the threshold (Type: Negative, Priority: Critical)

- ***Given***: A Run in "running" status with a step marked within the inactivity threshold
- ***When***: The scheduled sweep executes
- ***Then***: Run status remains "running", no reason added, no `finish_time` set

### Original AC2 — A Run that already finished with a verdict is untouched

#### Scenario 2.1: Should skip a passed run (Type: Negative, Priority: High)

- ***Given***: A Run with status "passed"
- ***When***: Sweep executes
- ***Then***: Run status, finish_time, reason unchanged

#### Scenario 2.2: Should skip a failed run (Type: Negative, Priority: High)

- ***Given***: A Run with status "failed"
- ***When***: Sweep executes
- ***Then***: Run status, finish_time, reason unchanged

### Original AC3 — A Run a person already aborted is untouched

#### Scenario 3.1: Should skip a manually aborted run (Type: Negative, Priority: High)

- ***Given***: A Run with status "aborted" and a person-typed reason
- ***When***: Sweep executes
- ***Then***: Run status, finish_time, reason unchanged (person's reason preserved)

### Original AC4 — A swept Run disappears from Home active-runs list

#### Scenario 4.1: Should remove swept run from active-runs widget (Type: Positive, Priority: High)

- ***Given***: A Run appears in Home "active test runs" widget (status "running")
- ***When***: Sweep closes that Run
- ***Then***: On next page load, Run no longer appears in widget

#### Scenario 4.2: Should decrement active-runs count by one (Type: Positive, Priority: High)

- ***Given***: Home widget shows count N of running Runs (one is idle past threshold)
- ***When***: Sweep closes that idle Run
- ***Then***: Widget count → N-1 on next page load

### Original AC5 — Running sweep repeatedly has no further effect

#### Scenario 5.1: Should be idempotent on already-swept run (Type: Boundary, Priority: High)

- ***Given***: A Run was closed by sweep on previous execution
- ***When***: Sweep executes again
- ***Then***: Run status, finish_time, reason unchanged from first sweep

### Original AC6 — Swept Run's reason is distinguishable from person-aborted

#### Scenario 6.1: Should show system-generated reason with sweep identifier (Type: Positive, Priority: Medium)

- ***Given***: A Run closed by sweep
- ***When***: QA Lead opens Run detail
- ***Then***: Reason text contains "automatic sweep" or equivalent system identifier, visually distinguishable from free-text abort reason

### Original AC7 — Sweep never closes a Run outside its Workspace

#### Scenario 7.1: Should scope sweep to workspace boundaries (Type: Positive, Priority: Critical)

- ***Given***: Workspace A has idle Run past threshold; Workspace B has active Run within threshold
- ***When***: Sweep executes
- ***Then***: Workspace A's Run → "aborted"; Workspace B's Run → "running" unchanged

### New scenarios surfaced from Phase 2 edge cases — NEEDS PO/DEV CONFIRMATION

#### Scenario E1: Should handle sweep-step mark race condition (Type: Edge, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred — confirm before sprint planning
- ***Given***: Sweep is executing while a step is being marked on the same Run
- ***When***: Both operations target the same Run simultaneously
- ***Then***: Either (a) step mark wins, sweep skips, or (b) sweep wins, step mark rejected with terminal guard — confirm which

#### Scenario E2: Should close runs with 0 steps marked (Type: Edge, Priority: High)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred — confirm before sprint planning
- ***Given***: A Run was created but no steps were ever marked (no activity at all)
- ***When***: Sweep executes after inactivity threshold
- ***Then***: Run is closed as "aborted" — 0 steps = no activity = abandoned

#### Scenario E3: Should NOT close runs in "pending" or "created" status (Type: Negative, Priority: Medium)

- ***NEEDS PO/DEV CONFIRMATION***: behavior inferred — confirm before sprint planning
- ***Given***: A Run in "pending" or "created" status (not yet started)
- ***When***: Sweep executes
- ***Then***: Run untouched — sweep only targets "running" status

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 5 | Happy path: abort idle, remove from widget, show reason, scope by workspace, idempotent |
| Negative | 4 | Skip passed, skip failed, skip manually aborted, skip non-running |
| Boundary | 2 | Idempotency (double sweep), 0-step run |
| Integration | 1 | Sweep-step mark race condition |
| API | 0 | No new API endpoint (sweep is internal) |
| ***Total**** | ****12*** | Low complexity, mostly state-guard testing |

***Rationale***: BK-269 is a state-machine extension (running → aborted via system trigger). The existing abort logic (BK-36) is proven; the sweep adds a timer-based trigger and workspace scoping. Most outlines verify state guards and isolation — low logic complexity, high reliability requirement.

### Outline list (NAMES ONLY — preconditions in 1 line, expected in 1 line)

#### Positive

- ***Should abort idle running run when sweep executes*** — Pre: Run "running" with last activity > threshold. Expected: status "aborted" + finish_time set + system reason.
- ***Should remove swept run from Home active-runs widget*** — Pre: Run visible in widget. Expected: Run disappears on next load.
- ***Should decrement active-runs count after sweep*** — Pre: Widget shows N runs. Expected: count N-1 after sweep.
- ***Should show distinguishable system reason for swept run*** — Pre: Run closed by sweep. Expected: reason contains sweep identifier, not free text.
- ***Should scope sweep to workspace — close only idle runs in target workspace*** — Pre: 2 workspaces, 1 idle run each (different thresholds). Expected: only qualifying workspace's run closed.

#### Negative

- ***Should NOT abort running run with recent activity within threshold*** — Pre: Run "running" with step marked < threshold. Expected: status "running" unchanged.
- ***Should NOT touch passed run during sweep*** — Pre: Run "passed". Expected: unchanged.
- ***Should NOT touch failed run during sweep*** — Pre: Run "failed". Expected: unchanged.
- ***Should NOT touch manually aborted run during sweep*** — Pre: Run "aborted" with person reason. Expected: reason preserved.
- ***Should NOT touch pending/created run during sweep*** — Pre: Run not yet started. Expected: untouched.

#### Boundary

- ***Should be idempotent — second sweep on same closed run changes nothing*** — Pre: Run closed by sweep on prior execution. Expected: all fields unchanged.
- ***Should close run with 0 steps marked after threshold*** — Pre: Run "running" with 0 step marks. Expected: closed as abandoned.

#### Integration

- ***Should handle concurrent sweep and step mark gracefully*** — Pre: Sweep executing while step mark in progress. Expected: no data corruption, one operation wins.

> NOT included here (deferred to in-sprint): parametrization tables, per-outline test-data JSON, numbered steps, Faker recipes.

---

## Phase 5 — Edge Cases (DRAFT)

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | Sweep-step mark race condition | No | High | ***NEEDS PO/DEV CONFIRMATION*** — add concurrency AC |
| 2 | 0-step run (created but never started marking) | No | High | ***NEEDS PO/DEV CONFIRMATION*** — confirm qualifies as abandoned |
| 3 | Sweep fails mid-batch (server crash) | No | Medium | Confirm idempotency covers partial execution |
| 4 | Threshold misconfigured to 0 | No | Low | ***NEEDS PO/DEV CONFIRMATION*** — minimum threshold guard? |
| 5 | Sweep updates `updated*at` causing self-reference on next run | No | High | Confirm sweep uses `finish*time`, not `updated_at` for inactivity check |
| 6 | Run "blocked" status (step blocked, not pass/fail) | No | Medium | Confirm "blocked" runs qualify as inactive |

---

## Story Quality Assessment

***Verdict***: Needs Improvement

***Key findings***:

- Story is clear on WHAT (abort idle runs) and WHY (accurate dashboards) but lacks HOW details critical for testing
- 3 PO open questions BLOCK sprint planning: threshold value, sweep trigger mechanism, exact reason text
- 1 data-model question: timestamp column for inactivity check
- Edge cases around race conditions and 0-step runs need explicit ACs

---

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***What is the default inactivity threshold value?***

1. ***What is the exact system-generated reason text?***

1. ***How is the sweep triggered — cron, serverless, or API call? What's the frequency?***

---

## Technical Questions for Dev

> These do not block PO but block implementation.

1. ***Which timestamp column is used for inactivity check — ****`runs.updated*at`****, ****`run*steps.updated*at`****, or a dedicated ****`last*step*activity*at`****?***

1. ***Does the sweep reuse the exact same abort logic as BK-36 (manual abort), or is there a separate code path?***

1. ***What is the cascade behavior on sweep abort — same as manual abort (BK-36)?***

---

## Suggested Story Improvements

| # | Current state | Suggested change | Benefit |
| --- | --- | --- | --- |
| 1 | "configurable inactivity threshold" (scope) + "choosing threshold value" (out-of-scope) | Explicitly state: "Threshold read from [config] with default of [X]h. Config UI deferred." | Eliminates ambiguity for Dev + QA |
| 2 | "no step activity recorded" (AC1) | Specify: "no step marked and `last*step*activity_at` older than threshold" | Eliminates timestamp source ambiguity |
| 3 | "reason shown identifies closure as automatic sweep" (AC7) | Provide exact reason template string | Enables precise test assertion |

---

## Data feasibility flags

No data feasibility risks identified. The `runs` table with status, timestamps, and workspace_id FK exists and is well-tested (BK-34/35/36/39 all shipped).

---

## Recommended testing strategy

### Pre-implementation

- Review BK-36 (manual abort) test coverage — sweep reuses same logic
- Confirm `runs` table schema has `workspace_id` and appropriate timestamp columns

### During implementation

- API-level testing: trigger sweep endpoint (or mock cron), verify run status transitions
- Workspace isolation: two workspaces, verify sweep scopes correctly
- Idempotency: run sweep twice on same set, verify no double-abort errors

### Post-implementation (in-sprint by /sprint-testing)

- Home widget integration: verify swept run disappears from active list
- Run history: verify swept run appears with correct reason
- Edge cases: race condition, 0-step run, mid-batch failure

---

## Risks & mitigation

| # | Risk | Likelihood | Impact | Mitigated by which outlines |
| --- | --- | --- | --- | --- |
| 1 | Sweep uses wrong timestamp column, never triggers | Medium | High | Outlines: abort idle run, 0-step run |
| 2 | Race condition between sweep and step mark | Low | High | Outline: concurrent sweep + step mark |
| 3 | Sweep affects runs outside target workspace | Low | Critical | Outline: workspace scoping |

---

## Next steps

- [ ] PO answers Critical Questions (threshold value, reason text, trigger mechanism) before sprint planning
- [ ] Dev answers Technical Questions (timestamp column, abort code path, cascade behavior) before estimation
- [ ] Story enters sprint at status `ready*for*dev` once estimated
- [ ] When Story reaches `ready*for*qa`, `/sprint-testing` will short-circuit refinement (label `shift-left-reviewed` detected)

---
_Synced from Jira by sync-jira-issues_
