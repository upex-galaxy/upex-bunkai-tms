# BK-47 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-47)

# Shift-Left Refinement — [https://jira.upexgalaxy.com/browse/BK-47#icft=BK-47](https://jira.upexgalaxy.com/browse/BK-47#icft=BK-47)

## TMS-Coverage | Compute time-to-green per user story from run and bug history

***Date:*** 2026-07-24
***Refined by:*** QA — Juan Ignacio Marmo
***Prior refinement:*** Nahuel Gomez, 2026-06-29 (reference: comments.md)
***Status:*** Phase 2 complete — awaiting Phase 3 Jira handoff

---

## 1. Critical Analysis

### 1.1 Core behavior

The feature computes a "test cycle time" per user story: the elapsed duration from the story's first failing run to the first run where all test coverage for that story passes. Stories still failing display an in-progress elapsed time; stories that have never failed display a "no cycle" state.

### 1.2 System architecture

The computation requires traversing the following entity chain:

```
user_stories
    +--[atc FK]---> atcs
    |                   +--[test*steps.atc*id]--> tests
    |                                                 +--[runs.test_id]--> runs
    |                                                                         +---> run_atcs
    |                                                                         +---> run_steps
    +--[acceptance*criteria]--> atcs (via atc*acceptance_criteria)
```

All business logic lives in SECURITY DEFINER RPCs (`bunkai***`). The cycle-time computation has no confirmed RPC in the current DB inventory — it would need to be implemented as a new `bunkai***` function or a materialized view queried through an existing RPC pattern. The UI surface (the "cycle-time clock" view) has no confirmed route or component in the current codebase.

The data flow for the metric:

```
DB seed: user_story -> atcs -> tests -> runs (with timestamps)
    |
    v
RPC: [new bunkai_* — not yet confirmed] (traverse chain, compute clock start/stop)
    |
    v
REST API: [new endpoint — unconfirmed] or SSR page read
    |
    v
UI: "cycle-time clock" view (unconfirmed component/route)
```

### 1.3 Data dependencies

For the metric to be computable, the following must pre-exist:

1. At least one `user_stories` row (with a project and module parent)
2. At least one `acceptance_criteria` row linked to that story
3. At least one `atcs` row linked to that story via `atc*acceptance*criteria`
4. At least one `tests` row that includes that ATC via `test_steps`
5. At least one `runs` row linked to that test, with `status = 'failed'` — this marks clock start (`created*at` or a `started*at` field on `runs`)
6. A `runs` row (same or later) where all `run_atcs` for the story's ATCs have passing outcomes — this marks clock stop

***Additional dependency (Business Rule 2):**** The story must have a resolved defect linked to the failing run before a subsequent all-passing run counts as "recovered." The `runs` entity does not have a confirmed defect-link FK in the data map — this dependency mechanism is a ****NEEDS PO/DEV CONFIRMATION*** item (see AC-4 and open questions).

***Clock granularity dependency:**** The time computation relies on timestamps stored on `runs`. The data map confirms `runs` has `created*at` (immutable), but a `started*at` field is not confirmed — this affects precision of the "clock start" event. ****NEEDS DEV CONFIRMATION.***

### 1.4 Feasibility assessment

***Current blockers (as of 2026-07-24):***

| ***Blocker**** | ****Severity**** | ****Detail*** |
| --- | --- | --- |
| No confirmed RPC for cycle-time computation | HIGH | No `bunkai*compute*time*to*green` or equivalent found in DB RPC inventory. This story depends on a new DB function being authored. |
| Run REST routes not confirmed in code scan | HIGH | `POST /api/v1/runs`, finish, abort, step-recording routes are documented in data map (Flow 5) but route files not found. The cycle-time metric requires runs to exist — if the run execution flow is not yet testable via REST, seeding test data requires direct DB manipulation via `qa*inspector*rw`. |
| No UI route or component confirmed | HIGH | The "cycle-time clock" view has no confirmed route under `app/` or component in the feature map. The story cannot be E2E-tested without this surface. |
| Defect-to-run link mechanism unconfirmed | MEDIUM | Business Rule 2 ("a resolved defect must exist") references a relationship between `runs` and defects that has no confirmed FK or bridge table in the current schema. |
| Run timestamp precision unconfirmed | LOW | Whether the clock uses `runs.created_at` (creation time) or a separate start timestamp is not stated in the ACs or business rules. |

***Verdict:*** This story is NOT independently testable end-to-end today. The RPC, REST endpoint, and UI surface are all unconfirmed. Testing can begin only at the DB-seeding + RPC-call layer once the computation function is implemented. Full E2E testing is gated on the UI route being built and the run REST routes being confirmed.

### 1.5 Test approach

Given the RPC-centric architecture, the recommended test approach is a three-layer strategy:

```
Layer 1 — DB state seeding (via qa*inspector*rw or REST API)
    |   Seed: user_story -> atc -> test -> runs (failed + passed)
    v
Layer 2 — RPC / API call
    |   Call the cycle-time computation RPC or REST endpoint
    |   Assert: returned duration matches expected elapsed time
    v
Layer 3 — UI verification (once route exists)
        Open the cycle-time view for the story
        Assert: displayed time / state matches Layer 2 result
```

For negative cases (never failed, still failing), seed only the relevant subset of the chain and assert the correct state label is returned. Workspace isolation tests require seeding a parallel workspace and confirming the metric is scoped to the correct workspace.

---

## 2. Story Quality Analysis

### 2.1 Prior gaps — resolution status

| ***#**** | ****Gap (Nahuel, 2026-06-29)**** | ****Severity**** | ****Resolution**** | ****Evidence*** |
| --- | --- | --- | --- | --- |
| 1 | No ACs exist | HIGH | RESOLVED | `acceptance-criteria.md` now contains 3 Gherkin scenarios |
| 2 | No DoD | HIGH | PARTIALLY RESOLVED | Business rules define the recovery condition (resolved defect + all-passing run), but no explicit DoD checklist or "done" criteria for the UI display format or data freshness SLA exist |
| 3 | "Failing" undefined (per-step / per-ATC / run verdict?) | HIGH | PARTIALLY RESOLVED | Business rules say "first failing run" which aligns with `runs.status = 'failed'`, but AC-1 says "a failing run" without specifying whether the run verdict or individual run_step outcomes drive the classification; the distinction matters for partial failures |
| 4 | "Passing" undefined | HIGH | PARTIALLY RESOLVED | AC-1 says "all of the story's test coverage passes" and business rules say "all-passing run" — better than before, but "all test coverage" does not define whether blocked (`blocked`) or skipped (`skipped`) run_atcs count as passing |
| 5 | Bug impact on metric unclear | HIGH | PARTIALLY RESOLVED | Business Rule 2 introduces the "resolved defect" requirement, but the mechanism linking defects to runs is not defined in the story artifacts or data map |
| 6 | Calendar vs business hours | MEDIUM | STILL OPEN | No AC or business rule addresses this; duration format ("elapsed time") is vague |
| 7 | Multi-Test US consolidation | MEDIUM | STILL OPEN | When a user story has ATCs included in multiple different tests, and those tests have runs at different times, the AC does not define whether the clock uses the earliest failure across all tests or is per-test |
| 8 | Never-passing scenario | MEDIUM | RESOLVED | AC-2 explicitly covers "story still failing" with "not yet green" + elapsed time so far |
| 9 | Only-passing scenario | MEDIUM | RESOLVED | AC-3 explicitly covers "story never failed" with "no cycle to measure" |

***Summary:*** 3 RESOLVED, 2 PARTIALLY RESOLVED (with new sub-gaps), 2 STILL OPEN, 2 NEW gaps introduced by the current ACs.

### 2.2 Open questions — current status

#### For PO:

| ***#**** | ****Original Question (Nahuel)**** | ****Status**** | ****Answer / Still open*** |
| --- | --- | --- | --- |
| 1 | Failing boundary: run status=failed OR any run where at least one ATC failed? | PARTIALLY ANSWERED | Business rules say "first failing run" — implies `runs.status = 'failed'` (run-level verdict). However, whether a run where some ATCs pass and some fail counts as "failing" is still ambiguous. The run verdict (`passed`/`failed`) is set at finish time by the caller, not auto-derived from step outcomes. ***Still open:**** ****does a run finished with**** `verdict=failed` ****qualify even if only one of ten ATCs failed?*** |
| 2 | Bug reopening: does re-opening a bug after a "passing" run reset the clock? | STILL OPEN | Not addressed in any current artifact. Business Rule 2 requires "a resolved defect" before recovery counts — but the inverse (a reopened defect invalidating a prior recovery) is undefined. |
| 3 | Multi-Test consolidation: union (earliest fail → latest pass) or per-Test rollup? | STILL OPEN | Not addressed. Covered in new gap analysis in §2.3. |
| 4 | Blocked steps: do blocked run*steps count as "failing" for the metric? | STILL OPEN | Not addressed. AC-1 says "all of the story's test coverage passes" — whether `blocked` run*atcs satisfy "passing" is undefined. |
| 5 | Calendar or business hours for duration computation? | STILL OPEN | Not addressed. AC says "elapsed time" with no unit or calendar model specified. |

#### For Dev:

| ***#**** | ****Original Question (Nahuel)**** | ****Status**** | ****Answer / Still open*** |
| --- | --- | --- | --- |
| 1 | Query path: US→ATC→test*steps→runs, or add a direct FK (run.user*story*id)? | STILL OPEN | No confirmed RPC or schema change in the data map. The indirect path through `test*steps` is the only confirmed route. A direct FK would require a schema change. |
| 2 | Materialized view or live computation? | STILL OPEN | Not addressed. Has significant testability implications: materialized view requires a refresh trigger to be tested; live computation needs performance testing at scale. |
| 3 | Aborted runs: excluded or counted as neutral? | STILL OPEN | Not addressed. `bunkai*abort*run` sets all pending steps to `skipped`. An aborted run has `status` unspecified in the run state machine shown in the data map — confirmed terminal states are only `passed` and `failed`. Aborted runs with `status=aborted` are neither passing nor failing but their timestamp exists. |

### 2.3 New gaps found in current ACs

The following gaps were identified through State-Transition, BVA, Decision Table, and Error Guessing analysis performed on the current artifacts.

#### State-Transition analysis — Run state machine

The `runs` state machine has terminal states `passed`, `failed`, and `aborted`. The current ACs only reason about `passed` and `failed`. The `aborted` state creates an unmodeled scenario:

| ***Gap**** | ****Technique**** | ****Severity**** | ****Outline derived*** |
| --- | --- | --- | --- |
| Aborted run between first failure and eventual pass — should it be ignored, counted as in-progress time, or reset the clock? | State-Transition | HIGH | TTC-16 |
| A run that starts as `running` and is never closed (permanent `running` state — no auto-timeout confirmed in data map) — should the metric treat it as in-progress? | State-Transition | MEDIUM | TTC-17 |

#### State-Transition analysis — User Story state machine

The `user*stories` state machine has states `draft`, `ready*to*test`, and `archived`. The AC only tests a story in `ready*to_test` state. New gaps:

| ***Gap**** | ****Technique**** | ****Severity**** | ****Outline derived*** |
| --- | --- | --- | --- |
| A story archived after it accumulated run history — does the cycle-time view still show its historical metric, or is it excluded? | State-Transition | MEDIUM | TTC-18 |
| A story in `draft` status that somehow has run history (ATCs ran before the story was marked `ready*to*test`) — is this possible given schema constraints, and what does the metric show? | State-Transition | LOW | (edge case — may be architecturally impossible; flag for Dev) |

#### BVA on the time computation

| ***Gap**** | ****Technique**** | ****Severity**** | ****Outline derived*** |
| --- | --- | --- | --- |
| First failing run and first all-passing run have identical `created_at` timestamps (e.g., clock resolution is coarse, or a test fixture created both runs in the same transaction) — what does elapsed time display? Zero? An error? | BVA | MEDIUM | TTC-12 |
| Story with exactly one run that both fails and is the "recovery" run simultaneously (impossible by business rule — requires a resolved defect AND an all-passing run — but worth confirming the RPC rejects this) | BVA | LOW | TTC-13 |
| Very large elapsed time (e.g., > 365 days between first failure and recovery) — does the display format handle this gracefully, or does it overflow? | BVA | LOW | TTC-19 |

#### Decision Table — Three AC scenarios vs. reality

The three ACs define three branches: recovered / still failing / never failed. But there are additional combinations not modeled:

| ***Condition set**** | ****AC-1 (recovered)**** | ****AC-2 (still failing)**** | ****AC-3 (never failed)**** | ****Modeled?*** |
| --- | --- | --- | --- | --- |
| Has fail runs + has pass runs + defect resolved | YES | NO | NO | YES (AC-1) |
| Has fail runs + no pass runs | NO | YES | NO | YES (AC-2) |
| No fail runs + has pass runs | NO | NO | YES | YES (AC-3) |
| No runs at all (story exists, ATCs exist, no runs executed) | NO | NO | NO | ***NO — GAP*** |
| Has fail runs + has pass runs + defect NOT resolved | NO | NO | NO | ***NO — GAP*** |
| Has fail runs + has pass runs + no defect linked at all | NO | NO | NO | ***NO — GAP*** |
| Has fail runs + has ONLY aborted runs (no pass, no fail subsequent) | NO | NO | NO | ***NO — GAP*** |

| ***Gap**** | ****Technique**** | ****Severity**** | ****Outline derived*** |
| --- | --- | --- | --- |
| Story with ATCs but zero runs executed — what state is shown? | Decision Table | MEDIUM | TTC-14 |
| Story has a failing run + a subsequent passing run BUT no resolved defect — does it show "recovered" or "not yet green"? | Decision Table | HIGH | TTC-15 |
| Story has failing runs + all subsequent runs are aborted — no clear terminal verdict | Decision Table | HIGH | TTC-16 (merged with aborted-run gap above) |

#### Error Guessing — DB-layer computation

| ***Gap**** | ****Technique**** | ****Severity**** | ****Outline derived*** |
| --- | --- | --- | --- |
| RPC / computation function returns null for a story that should have cycle time (e.g., data linkage gap in the ATC→test→run chain) — does the UI gracefully degrade or show an error? | Error Guessing | HIGH | TTC-20 |
| All runs for the story exist in a different workspace (data isolation bug) — does the metric leak cross-workspace data? | Error Guessing | HIGH | TTC10 (existing; maps to workspace isolation) |
| ATC linked to the story is removed from all tests after runs were executed — the run history exists but the current ATC chain no longer covers the story — does the metric still use historical runs? | Error Guessing | MEDIUM | TTC-21 |
| `run_atcs` snapshot for a run contains ATCs from multiple user stories — does the metric correctly scope only the ATCs relevant to the target story? | Error Guessing | MEDIUM | TTC-22 |

---

## 3. Refined Acceptance Criteria

### AC-1: Cycle time for a recovered user story (REFINED)

```
Given a user story in `ready*to*test` status
  AND the story has at least one ATC linked to one of its acceptance criteria
  AND that ATC was included in at least one Test
  AND that Test has at least one Run with verdict `failed` (the "clock start" run)
  AND a defect linked to that failing run exists and is in resolved status
  AND there is a subsequent Run (created after the clock-start run) for the same Test
    where all run_atcs for the story's ATCs have outcome `pass` (the "clock stop" run)
When the QA Lead opens the cycle-time view for that story
Then the view displays the elapsed time between the `created_at` of the clock-start run
  and the `created_at` of the clock-stop run
  formatted as [HH:MM or D:HH:MM — format NEEDS PO CONFIRMATION]
  and the story is labeled "Recovered"
```

### AC-2: User story still failing (REFINED)

```
Given a user story in `ready*to*test` status
  AND the story has at least one ATC with at least one Run that returned verdict `failed`
  AND no subsequent Run exists where all run_atcs for the story's ATCs have outcome `pass`
When the QA Lead opens the cycle-time view for that story
Then the view displays the label "Not yet green"
  AND shows the elapsed time from the `created_at` of the first failing Run to the current timestamp
  formatted as the same time unit as AC-1
```

### AC-3: User story never failed (REFINED)

```
Given a user story in `ready*to*test` status
  AND all Runs for Tests containing this story's ATCs have verdict `passed`
    (or the story has executed Runs but none returned `failed`)
When the QA Lead opens the cycle-time view for that story
Then the view displays the label "No cycle"
  AND shows no elapsed time value (empty / N/A — exact display NEEDS PO CONFIRMATION)
  AND no clock-start timestamp is referenced
```

### AC-4: Story with zero runs — no data state (NEW — NEEDS PO/DEV CONFIRMATION)

```
Given a user story in `ready*to*test` status
  AND the story has at least one ATC linked to it
  AND no Run has ever been executed for any Test containing this story's ATCs
When the QA Lead opens the cycle-time view for that story
Then the view displays a "No data" or "Not run yet" state
  [exact label NEEDS PO CONFIRMATION]
  AND no elapsed time or "no cycle" label is shown
  AND the story is excluded from cycle-time aggregates
```

### AC-5: Passing run exists but defect is not resolved — clock does not stop (NEW — NEEDS PO/DEV CONFIRMATION)

```
Given a user story that has a failing run (clock started)
  AND a subsequent run where all run_atcs pass
  AND the defect linked to the failing run is still in an open/unresolved state
When the QA Lead opens the cycle-time view for that story
Then the view shows the story as "Not yet green"
  AND the elapsed time counts from the first failing run to the current timestamp
  AND the passing run is NOT treated as the clock-stop event
```

### AC-6: Aborted run does not affect the cycle clock (NEW — NEEDS PO/DEV CONFIRMATION)

```
Given a user story that has a failing run (clock started)
  AND one or more subsequent runs for the same Test were aborted (status = aborted)
  AND no passing run exists
When the QA Lead opens the cycle-time view for that story
Then the view shows the story as "Not yet green"
  AND aborted runs are excluded from both clock-start and clock-stop computation
  AND the elapsed time counts from the first failing run to the current timestamp
```

---

## 4. ATP DRAFT — Outlines

### Coverage summary

| ***Category**** | ****Count*** |
| --- | --- |
| Positive | 8 |
| Negative | 7 |
| Boundary | 3 |
| Integration | 4 |
| ***Total**** | ****22*** |

---

### AC-1 Coverage: Cycle time for a recovered story

- TTC01 — Should display elapsed time from first failing run to first all-passing run when story has resolved defect and subsequent passing run [Positive]
- TTC02 — Should select the earliest failing run as the clock start when the story has multiple failing runs before recovery [Positive]
- TTC07 — Should include the defect resolution window in the cycle time breakdown when a bug was filed and resolved between the failing and passing runs [Positive]
- TTC12 — Should display zero or a defined minimum duration when the clock-start run and clock-stop run share the same `created_at` timestamp [Boundary]
- TTC13 — Should reject or gracefully handle a state where a single run is simultaneously the clock-start and clock-stop event [Boundary]
- TTC15 — Should NOT treat a subsequent passing run as recovery when the linked defect is still open [Negative]

### AC-2 Coverage: Story still failing

- TTC04 — Should display "Not yet green" with elapsed time so far when the story's latest run still has verdict failed and no recovery exists [Positive]
- TTC08 — Should reset the "not yet green" elapsed time display if a defect is reopened after an apparent recovery [Negative — NEEDS PO/DEV CONFIRMATION on behavior]
- TTC16 — Should display "Not yet green" when all runs after the first failure are aborted and no passing run exists [Negative]

### AC-3 Coverage: Never failed

- TTC03 — Should display "No cycle" / N/A when all executed runs for the story have verdict passed and none ever failed [Positive]
- TTC11 — Should display "No cycle" when the story has exactly one run and it passed [Positive]

### AC-4 Coverage: No runs executed (NEW)

- TTC14 — Should display "No data" or "Not run yet" state when the story has ATCs but zero runs have been executed [Positive]

### AC-5 Coverage: Passing run without resolved defect (NEW)

- TTC15 — (listed under AC-1 coverage above — negative case for AC-1, positive case for AC-5)

### AC-6 Coverage: Aborted runs excluded (NEW)

- TTC16 — (listed under AC-2 coverage above)
- TTC17 — Should treat an open run (status = running, never closed) as neither passing nor failing for metric computation [Negative]

### Edge cases / cross-AC

- TTC05 — Should exclude aborted runs from both clock-start and clock-stop selection when computing cycle time for a recovered story [Negative]
- TTC06 — Should compute cycle time using the union of all Tests covering the story's ATCs (earliest failure across all tests → earliest all-pass across all tests) when the story is covered by multiple Tests [Integration — NEEDS PO CONFIRMATION on multi-test consolidation rule]
- TTC09 — Should reflect the updated cycle time immediately after a new run is recorded (data freshness / cache invalidation) [Integration]
- TTC10 — Should scope the cycle-time metric to the current workspace and not expose run data from other workspaces [Integration]
- TTC18 — Should continue to display historical cycle-time data for an archived story, or explicitly exclude it, with consistent behavior [Negative — NEEDS PO CONFIRMATION]
- TTC19 — Should gracefully display elapsed time when the cycle duration exceeds 365 days [Boundary]
- TTC20 — Should display a graceful degradation state when the computation RPC returns null for a story with expected run history [Negative]
- TTC21 — Should use historical run data for the metric even when the ATC has since been removed from all Tests [Integration — NEEDS DEV CONFIRMATION on query design]
- TTC22 — Should correctly scope run_atcs to only the ATCs belonging to the target story when a single Run includes ATCs from multiple user stories [Integration]

---

## 5. Open Questions for PO

1. ***Display format for elapsed time**** — What time unit and format should the cycle-time clock display? Options include hours:minutes (HH:MM), days + hours (Xd Yh), or human-readable ("2 days, 4 hours"). The AC says "elapsed time" with no format specified. **(impacts AC-1, AC-2, outlines TTC01, TTC04, TTC12)*

1. ***"No cycle" display label**** — Should a story that never failed show the label "No cycle", "N/A", or a blank state? The scope document says "no cycle to measure" but the UI copy is unspecified. **(impacts AC-3, outline TTC03, TTC11)*

1. ***"No data" state**** — When a story has ATCs but zero runs, should it appear in the cycle-time view at all, or be hidden? If shown, what label? **(impacts AC-4 NEW, outline TTC14)*

1. ***Multi-Test consolidation rule**** — When a user story's ATCs are spread across multiple Tests with independent run histories, which run is the "first failing run"? Option A: the earliest failure across all Tests (global union). Option B: per-Test independent clocks, then aggregate (average / min / max). **(impacts AC-1, outline TTC06, still open from Nahuel's Q3)*

1. ***Bug reopening resets clock**** — If a previously resolved defect is reopened after the story showed "Recovered", does the story revert to "Not yet green"? Does the clock restart or resume? **(impacts AC-2, outline TTC08, still open from Nahuel's Q2)*

1. ***Blocked / skipped run*atcs and "all passing"**** — Do run*atcs with outcome `blocked` or `skipped` satisfy the "all passing" condition, or must they be `pass`? **(impacts AC-1 recovery condition, outlines TTC01, TTC16, still open from Nahuel's Q4)*

1. ***Calendar vs. business hours**** — Is the elapsed time computed in wall-clock calendar time or business hours only? **(impacts AC-1, AC-2, still open from Nahuel's Q5)*

1. ***Archived stories**** — Should the cycle-time view display historical metrics for stories with `archived_at` set, or exclude them entirely? **(impacts AC-N/A, outline TTC18)*

---

## 6. Open Questions for Dev

1. ***Query path**** — Will the cycle-time computation traverse `user*story → atc*acceptance*criteria → atcs → test*steps → tests → runs`, or will a direct FK (`run.user*story*id`) be added to the schema? The indirect path is the only confirmed route in the data map; a direct FK is a schema change that requires migration. **(impacts all outlines, still open from Nahuel's Q1)*

1. ***Materialized view or live computation**** — Will the metric be computed live per request (via a new `bunkai_**` RPC) or cached in a materialized view refreshed on run events? Live computation has race conditions; materialized views require a refresh trigger and a test for staleness. **(impacts outline TTC09, still open from Nahuel's Q2)**

1. ***Aborted run handling**** — `runs` terminal states confirmed in data map are `passed` and `failed`; `aborted` is a third terminal state (`bunkai*abort*run` sets it). The computation must explicitly decide whether aborted runs are excluded, treated as neutral, or treated as in-progress time. **(impacts AC-6 NEW, outlines TTC05, TTC16, still open from Nahuel's Q3)*

1. ***Run timestamp field for clock**** — Does the clock use `runs.created*at` (snapshot creation time) or a separate `started*at` field? The data map does not confirm a `started*at` column on `runs`. If `created*at` is used, the clock includes the time between the run being created and the first step being recorded. **(impacts AC-1, AC-2, outline TTC01 precision)*

1. ***Defect-to-run link mechanism**** — Business Rule 2 requires "a resolved defect" linked to the failing run. The current data map has no confirmed FK or bridge table between `runs` and defects/bugs. How will this relationship be stored and queried? **(impacts AC-1, AC-5 NEW, outlines TTC07, TTC15)*

---

## 7. Risk Assessment

| ***Risk**** | ****Likelihood**** | ****Impact**** | ****Mitigation*** |
| --- | --- | --- | --- |
| New `bunkai_*` RPC not yet implemented — story cannot be tested until DB function exists | HIGH | HIGH | Block story from entering dev until RPC design is confirmed with Dev. Add a tech-story for RPC authoring if not already created. |
| Run REST routes unconfirmed — test data seeding requires direct DB access | HIGH | MEDIUM | Use `qa*inspector*rw` DB role for test seeding; document seeding scripts in the test plan |
| Multi-Test consolidation rule undefined — incorrect implementation once PO answers could invalidate TTC06 entirely | HIGH | MEDIUM | Escalate PO question before implementation starts; block TTC06 until answered |
| Defect-to-run link mechanism missing from schema — AC-1 recovery condition cannot be tested without this | HIGH | HIGH | Block story or add prerequisite schema migration; confirm with Dev before writing TTC07, TTC15 |
| "All passing" definition ambiguity — blocked/skipped run_atcs may silently satisfy the condition | MEDIUM | HIGH | PO must answer Q6 before implementation; incorrect definition makes TTC01 unverifiable |
| Aborted runs silently extending "not yet green" elapsed time | MEDIUM | MEDIUM | Confirm Dev intent on aborted run exclusion; add TTC16 to smoke suite |
| Workspace isolation gap — cross-workspace run data leak | LOW | HIGH | TTC10 must be included in regression suite; add DB-layer isolation check |
| Zero-run story state not handled in UI — renders null or crashes | MEDIUM | MEDIUM | TTC14 covers this; ensure graceful degradation is specified in AC-4 |
| Materialized view staleness — metric not updated after a new run | MEDIUM | MEDIUM | If materialized view chosen, TTC09 becomes a mandatory integration test |

---

## 8. Recommendation

***Status:**** ****NOT READY FOR ESTIMATION. Block on 3 items before moving to Estimation.***

This story received significant improvement since Nahuel's 2026-06-29 refinement — the three ACs and three business rules address 3 of 9 original gaps and eliminate the two most critical "undefined" gaps (never-failed and only-passing scenarios). However, the story cannot safely enter Estimation because three blockers remain that would force the dev team to make product decisions mid-sprint:

1. ***No confirmed DB mechanism*** — The computation RPC and the defect-to-run link in the schema are both missing. Development cannot start without knowing the query path and schema changes required. A prerequisite tech-story may be needed.

1. ***Multi-Test consolidation (PO Q4) and defect-link mechanism (Dev Q5)*** are both HIGH-severity gaps that directly shape AC-1's recovery condition. If either is answered incorrectly, the implementation will need to be reworked.

1. ***Three new ACs (AC-4, AC-5, AC-6)*** were derived from gap analysis and are not yet in Jira. They must be reviewed and either accepted or rejected by PO before the story's scope is stable enough to estimate.

***Recommended next step:*** Route PO questions 1, 4, 5, 6, and 7 to the PO and Dev questions 1, 3, 4, and 5 to the Dev team. Add AC-4, AC-5, AC-6 to Jira as proposed ACs for PO review. Once all blocking questions are answered, this story is straightforward to estimate at medium complexity (new RPC + new UI view + 22 test outlines).

---
_Synced from Jira by sync-jira-issues_
