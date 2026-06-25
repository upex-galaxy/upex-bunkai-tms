# BK-39 — Spec Compliance Matrix

Evidence that each AC scenario is satisfied. `covered_by`: `manual:<rpc-e2e>` = live end-to-end exercise of `bunkai_finish_run` on throwaway runs (created + asserted + cleaned up); `review-approved:<reviewer>` = adversarial code review confirmed the code path; `live-ui` = rendered-app validation.

## Canonical AC field (4 — acceptance gate)
| AC scenario | covered_by | evidence | status |
|---|---|---|---|
| Finish fully-executed run as passed → closed passed + finish time | manual:rpc-e2e + live-ui | run D passed, finished_at set; run page shows verdict + finish time | covered |
| Finishing with pending steps marks them skipped (failed) | manual:rpc-e2e | run A: verdict=failed, 5 pending→skipped, 1 executed preserved | covered |
| Cannot finish an already-aborted run → "This run is already closed and cannot be finished." | manual:rpc-e2e | run C: abort then finish → SQLSTATE 45206; stays aborted. errors.ts maps 45206 → 409 AC-exact copy | covered |
| AI Test Agent finishes with the same handling as a human | manual:rpc-e2e | run D: executor_mode=agent, verdict=passed, all pending→skipped, identical record | covered |

## Story-body AC (8 — coverage target; superset)
| AC scenario | covered_by | evidence | status |
|---|---|---|---|
| Finish in-progress run with final verdict; finish time recorded + visible | manual:rpc-e2e + live-ui | run A/D; finished_at stamped; UI final-verdict block | covered |
| Pending steps skipped on finish; no remaining pending | manual:rpc-e2e | run A (5→skipped, 0 pending), run D (6→skipped) | covered |
| Already-executed step results preserved | manual:rpc-e2e | run A: the passed step stays passed; only pending changed | covered |
| Missing/invalid verdict blocks finish, no data changes | manual:rpc-e2e + live-ui | run B: 'maybe' & '' → 45207, run stays running v1; UI Confirm disabled until a verdict + required hint | covered |
| Terminal run cannot be finished again | manual:rpc-e2e | run A re-finish → 45206, no mutation (status/version unchanged) | covered |
| Concurrent finish attempts → one terminal outcome, consistent | review-approved:adversarial-reviewer | `FOR UPDATE` row lock + status gate (first-wins), byte-faithful to the proven abort serialization; loser re-reads terminal status → 45206 | covered |
| Human / AI Agent / CI finish handling consistent | manual:rpc-e2e + review-approved | run D agent parity; same `run:execute` write-gate for cookie/PAT, no bypass; executor_mode/_user_id traceable | covered |
| Failed verdict allowed without a linked defect | review-approved | finish takes only a verdict; no defect coupling (filing bugs out of scope) | covered |

**Gate**: no `uncovered` rows. Merge-eligible.
