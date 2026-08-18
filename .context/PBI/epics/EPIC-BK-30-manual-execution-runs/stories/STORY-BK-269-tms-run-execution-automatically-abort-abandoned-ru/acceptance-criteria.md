# BK-269 — Acceptance Criteria

> Jira field: `customfield_10097` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-269)

## Refined Acceptance Criteria

### Original AC1 — An idle Run past the inactivity threshold is closed by the sweep

#### Scenario 1.1: Should abort a running run with no step activity beyond the inactivity threshold (Type: Positive, Priority: Critical)

- ***Given***: A Run in running status with last*step*activity_at older than the configured inactivity threshold
- ***When***: The scheduled sweep executes
- ***Then***: Run status becomes aborted, finish_time set to sweep timestamp, reason set to system-generated text

#### Scenario 1.2: Should NOT abort a running run with recent step activity within the threshold (Type: Negative, Priority: Critical)

- ***Given***: A Run in running status with a step marked within the inactivity threshold
- ***When***: The scheduled sweep executes
- ***Then***: Run status remains running, no reason added, no finish_time set

### Original AC2 — A Run that already finished with a verdict is untouched

#### Scenario 2.1: Should skip a passed run (Type: Negative, Priority: High)

- ***Given***: A Run with status passed
- ***When***: Sweep executes
- ***Then***: Run status, finish_time, reason unchanged

#### Scenario 2.2: Should skip a failed run (Type: Negative, Priority: High)

- ***Given***: A Run with status failed
- ***When***: Sweep executes
- ***Then***: Run status, finish_time, reason unchanged

### Original AC3 — A Run a person already aborted is untouched

#### Scenario 3.1: Should skip a manually aborted run (Type: Negative, Priority: High)

- ***Given***: A Run with status aborted and a person-typed reason
- ***When***: Sweep executes
- ***Then***: Run status, finish_time, reason unchanged

### Original AC4 — A swept Run disappears from Home active-runs list

#### Scenario 4.1: Should remove swept run from active-runs widget (Type: Positive, Priority: High)

- ***Given***: A Run appears in Home active test runs widget (status running)
- ***When***: Sweep closes that Run
- ***Then***: On next page load, Run no longer appears in widget

#### Scenario 4.2: Should decrement active-runs count by one (Type: Positive, Priority: High)

- ***Given***: Home widget shows count N of running Runs (one is idle past threshold)
- ***When***: Sweep closes that idle Run
- ***Then***: Widget count becomes N-1 on next page load

### Original AC5 — Running sweep repeatedly has no further effect

#### Scenario 5.1: Should be idempotent on already-swept run (Type: Boundary, Priority: High)

- ***Given***: A Run was closed by sweep on previous execution
- ***When***: Sweep executes again
- ***Then***: Run status, finish_time, reason unchanged from first sweep

### Original AC6 — Swept Run reason is distinguishable from person-aborted

#### Scenario 6.1: Should show system-generated reason with sweep identifier (Type: Positive, Priority: Medium)

- ***Given***: A Run closed by sweep
- ***When***: QA Lead opens Run detail
- ***Then***: Reason text contains automatic sweep identifier, visually distinguishable from free-text abort reason

### Original AC7 — Sweep never closes a Run outside its Workspace

#### Scenario 7.1: Should scope sweep to workspace boundaries (Type: Positive, Priority: Critical)

- ***Given***: Workspace A has idle Run past threshold; Workspace B has active Run within threshold
- ***When***: Sweep executes
- ***Then***: Workspace A Run becomes aborted; Workspace B Run remains running

### New scenarios — NEEDS PO/DEV CONFIRMATION

#### Scenario E1: Should handle sweep-step mark race condition (Type: Edge, Priority: High)

- NEEDS PO/DEV CONFIRMATION
- ***Given***: Sweep is executing while a step is being marked on the same Run
- ***When***: Both operations target the same Run simultaneously
- ***Then***: Either step mark wins and sweep skips, or sweep wins and step mark rejected

#### Scenario E2: Should close runs with 0 steps marked (Type: Edge, Priority: High)

- NEEDS PO/DEV CONFIRMATION
- ***Given***: A Run was created but no steps were ever marked
- ***When***: Sweep executes after inactivity threshold
- ***Then***: Run is closed as aborted

#### Scenario E3: Should NOT close runs in pending or created status (Type: Negative, Priority: Medium)

- NEEDS PO/DEV CONFIRMATION
- ***Given***: A Run in pending or created status (not yet started)
- ***When***: Sweep executes
- ***Then***: Run untouched

---
_Synced from Jira by sync-jira-issues_
