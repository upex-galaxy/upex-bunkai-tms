# Comments for BK-36

[View in Jira](https://jira.upexgalaxy.com/browse/BK-36)

---

### Juan Leites - 6/23/2026, 9:18:02 AM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

ATP DRAFT (resumen ejecutivo) está en el campo ***Acceptance Test Plan*** de esta historia.

Refinement completo: `shift-left-refinement.md` (disponible en el repo QA).

---

***Highlights del análisis Shift-Left******:***

- :warning: ***DATA-FEASIBILITY-RISK CRÍTICO*** — entidades `runs` y `run_steps` no existen en el schema de DB. Story bloqueada hasta que exista la migración y BK-34 esté shippeada.
- :x: ***AC3 incompleta*** — solo cubre el estado `passed`; los estados `failed` y `aborted` también deben rechazar un abort.
- :x: ***AC2 sin BVA completo*** — solo testea 1 char; faltan casos de 2 chars y string vacío.
- :warning: ***Riesgo arquitectural (CON-1)*** — si Dev usa `atcs.status` en lugar de `run_steps.result`, abortar un run corrompe el ATC para todos los runs futuros.
- 5 preguntas críticas para PO (ver campo ATP)
- 6 preguntas técnicas para Dev (ver campo ATP)
- 26 outlines de test identificados (Positive:6 · Negative:6 · Boundary:4 · State-Transition:6 · Integration:4)

Labels agregados: `shift-left-reviewed`, `shift-left-2026-06-23`

---

### Juan Leites - 6/23/2026, 9:30:12 AM

# Shift-Left Refinement: BK-36 — TMS-Run Execution | Abort a run in progress with a reason

***Status***: Refined — Awaiting PO Estimation
***Mode***: Shift-Left (pre-sprint, batch grooming)
***Refined on***: 2026-06-20
***Refined by***: QA — Shift-Left batch session
***Modality***: Jira-native

---

## Phase 1 — Critical Analysis

### Business context

QA engineers executing manual test runs in Bunkai TMS need a clean, traceable way to stop a run mid-flight when something blocks them — environment outages, missing test data, or other uncontrollable factors. Without a formal abort mechanism, a blocked run either stays open indefinitely (polluting "in progress" counts) or is force-closed without capturing why it stopped, destroying audit trail quality.

Abort-with-reason solves this by:

1. Transitioning the run to a terminal `aborted` state, removing it from the active-run count.
2. Auto-skipping all unexecuted steps so the run record is complete (no `pending` orphans).
3. Preserving already-recorded step results so partial work is not lost.
4. Attaching a mandatory short reason so historical records explain the closure.

This story delivers the abort path of the run lifecycle. It depends on — and can only be tested against — a running run, which is created by BK-34 (Start a run). It is blocked until BK-34 ships and the `runs` + `run_steps` DB migration exists.

### Technical context

> ***DATA-FEASIBILITY-RISK******:****** CRITICAL***

The `runs` entity and `run_steps` entity are ***absent from the current DB schema*** (`supabase/migrations/0001–0012`). Neither table exists. This story cannot be implemented or meaningfully tested until:

1. A DB migration creates `runs` (with `id, atc*id, environment, started*by*user*id, started*at, finished*at, status, abort*reason`) and `run*steps` (with `id, run*id, atc*step*id, result, executed*at`).
2. BK-34 (Start a run) ships and can create a run record in `in_progress` state.
3. BK-36 can then exercise the `in_progress → aborted` transition.

***Dependency chain (hard blockers)******:*** `runs` migration → BK-34 ships → BK-36 can be implemented and tested.

Known technical elements relevant to this story:

- `AtcStatus`*** enum*** (`lib/types.ts`): `unrun | running | pass | fail | blocked | skipped`. Exists in code but no server action transitions it. The `runs` entity is what drives lifecycle transitions.
- `AtcStep` (`id, atc*id, position, content, input*data, expected`): Steps are defined here; `run_steps` will hold per-execution results.
- ***Auth model***: Supabase Auth (magic link OTP); middleware protects `/projects` + `/onboarding`; RLS on all tables; PAT available for API routes. Any abort action must validate the caller owns or is authorized on the run.
- ***Staging***: `https://staging-upexbunkai.vercel.app/` — not usable for BK-36 until the `runs` migration is deployed to staging.
- ***Server actions or API route*** for abort must be implemented; currently no such endpoint exists.
- The abort reason will be stored on the `runs` row (`abort_reason` column or equivalent); its minimum length constraint (3 chars) can be enforced at both client and server/DB level.

### Story complexity

***Low-Medium.*** The business logic is well-bounded: one state transition, one validation rule, one bulk update (pending steps → skipped). Complexity is front-loaded into infrastructure that does not yet exist (`runs` migration + BK-34). Once those are in place, the abort action itself is straightforward. UI is minimal (modal or inline form with a reason textarea + confirm button).

### Epic-level inheritance

Epic BK-30 covers the full Manual Execution & Runs lifecycle. This story sits between:

- ***BK-34*** (Start a run) — creates the `runs` record in `in_progress` state. Hard dependency.
- ***BK-020 / BK-35*** (Record step results) — populates `run_steps` mid-run. Already-recorded results must survive abort.
- ***BK-024*** (Finish a run — passed/failed) — the other terminal paths; shares the "already closed → reject" logic.

Run status state machine (inferred from epic context — ***NEEDS DEV CONFIRMATION***):

```
[pending/created]
      |
      v start (BK-34)
  in_progress
     /     \
    /       \
abort        finish (BK-024)
(BK-36)      /     \
    \      passed  failed
     v
  aborted
(terminal)   (terminal) (terminal)
```

All three terminal states share the same invariant: a closed run cannot be re-opened or re-aborted.

---

## Phase 2 — Story Quality Analysis

### Ambiguities

***AMB-1 — Maximum reason length not specified.***
AC2 sets a minimum of 3 characters but no maximum is defined anywhere in the story. DB column sizing, UI textarea limits, and truncation behavior in history view are all undefined. A reason of 5,000 characters would be technically valid under the current ACs.

***AMB-2 — Who can abort a run?***
The story says "Elena is executing a running run" — implying the runner is the one aborting. It is silent on whether a project admin or another team member can also abort a run someone else started. RLS policy and the UI affordance (show Abort button only to the runner? to all project members?) are not addressed.

***AMB-3 — UI surface for the abort action not specified.***
No mockup or wireframe is referenced. It is unclear whether abort is: (a) a button on the run execution view with an inline reason input, (b) a confirmation modal, (c) a dropdown action. The UX affects what "the run stays open" means in AC2 (modal closes? page stays? inline error?).

***AMB-4 — "Shown on the run" — exact location not defined.***
AC1 says the reason is "shown on the run" and AC4 says it is "visible" in history. It is unclear whether this means: a dedicated reason field on the run detail page, a tooltip, a badge, a collapsible section, or inline text in the history list row.

***AMB-5 — Step result ****`blocked`**** not mentioned.***
The domain model includes `AtcStatus.blocked` as a valid step result. AC1 only tests `passed` steps being preserved. If a step is marked `blocked` at the time of abort, should it be preserved as `blocked` or overwritten to `skipped`? The story says "already-executed step results are preserved" — but whether `blocked` counts as "already-executed" is not stated.

***AMB-6 — ****`failed`**** steps at time of abort.***
Same as AMB-5 but for `failed` steps. AC1 only shows `passed + pending` at abort time. A run where some steps are `failed` and some are `pending` when abort is triggered is not covered.

### Gaps (missing info)

***GAP-1 — ****`failed`**** and ****`aborted`**** closed-run states not tested in AC3.***
AC3 only validates that a `passed` run rejects an abort attempt. The business rules say "only a run that is still in progress can be aborted" — which implies `failed` and `aborted` runs must also reject. These two cases are entirely absent from the ACs.

***GAP-2 — Empty reason (0 chars) not covered by AC2.***
AC2 tests a 1-character reason. An empty string (0 chars) is a distinct equivalence class: it may be intercepted by HTML `required` attribute, client-side validation, or server-side validation — and the error message to display is not specified. May differ from the "at least 3 characters" message.

***GAP-3 — 2-character reason not tested.***
AC2 tests length=1. The boundary at 2 chars (still invalid, one below the valid minimum of 3) is not covered. Both 1 and 2 must produce the same validation error — but this is not confirmed.

***GAP-4 — Concurrent abort / double-submit not addressed.***
No AC or business rule covers what happens if the QA engineer clicks "Abort" twice in quick succession (double-submit), or if two users attempt to abort the same run simultaneously. The run must end in `aborted` exactly once; duplicate abort handling (idempotency, optimistic lock, or last-write-wins) is not defined.

***GAP-5 — Abort action authorization (non-owner) not defined.***
See AMB-2. If authorization rules are not specified before dev starts, they will be implemented as a guess.

***GAP-6 — History pagination / ordering not defined.***
AC4 confirms the aborted run "appears in the list" but gives no detail on list ordering, pagination behavior (what if there are 100 runs?), or filtering (can the user filter by `aborted` status?). Out of scope for this story or implicitly assumed to be covered elsewhere?

***GAP-7 — ****`abort_reason`**** column name and DB schema not confirmed.***
The DB schema for `runs` does not exist yet. The column name, type, length constraint, and nullability for the abort reason field are design decisions that need to be captured in a migration PR before implementation starts.

### Edge cases not in Story

***EC-1 — Abort a run that has ALL steps already executed (none pending).***
If the runner marks the last step result and then immediately triggers abort (e.g., a race condition or a UI that allows both actions), there are 0 pending steps to mark skipped. The run should still close as `aborted`, not `passed`/`failed`. What happens here is not specified.

***EC-2 — Abort a run that has NO steps executed yet (all pending).***
The inverse: Elena starts a run but aborts immediately before recording any step result. All steps go to `skipped`. This is valid per the business rules but not exercised by any AC.

***EC-3 — Reason is exactly 3 characters (boundary valid minimum).***
The valid lower boundary — not tested by either AC1 (which uses a long reason) or AC2 (which uses 1 char). Must be explicitly confirmed to succeed.

***EC-4 — Reason contains only whitespace.***
A reason of `"   "` (3+ spaces) passes the character-count check but is semantically empty. Should it be accepted or rejected with a "reason must not be blank" message?

***EC-5 — Abort during an ongoing step result save.***
If the runner is mid-save of a step result (network call in flight) and simultaneously triggers abort, there is a race between the step-save and the abort action. The step result could be lost, double-saved, or correctly preserved depending on transaction semantics.

***EC-6 — Abort after network loss / session expiry.***
If the user's session expires mid-run and they try to abort, the action is rejected by auth middleware. The error surfaced should be a session/auth error, not a validation error about reason length.

***EC-7 — Reason at maximum practical length (e.g., 1000+ characters).***
Without a defined maximum, the system must gracefully handle very long inputs. DB column truncation vs. client-side cap vs. server-side 400 error are three different behaviors; the correct one is unspecified.

### Contradictions

***CON-1 — "Steps not yet executed are marked skipped" vs. ****`AtcStatus`**** vs. ****`run_steps.result`****.***
The story says pending steps are "marked skipped." In the current domain model, `AtcStatus` is on the `atc` entity (a template-level status), not the run-level step result. If the intent is that `run_steps.result = 'skipped'` for pending steps, this is correct run-level tracking. But if an implementation uses `AtcStatus` on the `atc` row itself, aborting one run would corrupt the `atc` status for all future runs. This architectural distinction must be confirmed with Dev before implementation.

No other direct contradictions found between ACs and business rules.

### Testability validation

| AC | Testable as written? | Notes |
| --- | --- | --- |
| AC1 | Yes — once `runs` migration + BK-34 exist | Requires a seeded run with 4 passed + 6 pending steps |
| AC2 | Partially — 1-char case only | Missing: 0-char, 2-char, whitespace-only cases |
| AC3 | Partially — `passed` state only | Missing: `failed` state, `aborted` state |
| AC4 | Yes — once history view exists | Ordering/pagination not specified |

Overall: ACs are testable in principle but incomplete in boundary and state coverage. Story is ***refinable*** — not blocked, but needs PO/Dev answers on GAP-1, GAP-2, AMB-2, CON-1 before sprint entry.

---

---

### Juan Leites - 6/23/2026, 9:30:28 AM

## Phase 3 — Refined Acceptance Criteria

### AC1 — Abort a run mid-flight and skip the rest

***Original scenario covered******:***

- Run with 4 passed + 6 pending steps; abort with valid reason → run = `aborted`, pending steps = `skipped`, passed steps preserved, reason visible.

***Additional scenarios derived (1******:******N expansion)******:***

***AC1-B — All-pending run aborted (no steps executed yet)***

```
Scenario: Abort a run where no steps have been recorded yet
  Given Elena has started a run of "Login smoke" with 5 steps, all still pending
  When she aborts the run with the reason "Wrong environment"
  Then the run is closed as "aborted"
  And all 5 steps are marked "skipped"
  And the reason "Wrong environment" is visible on the run
```

NEEDS PO/DEV CONFIRMATION — abort with 0 executed steps is not covered by the original ACs.

***AC1-C — Run with failed steps at time of abort***

```
Scenario: Abort a run that has both failed and pending steps
  Given Elena is executing a run with 3 passed, 2 failed, and 5 pending steps
  When she aborts the run with the reason "Blocking defect found"
  Then the run is closed as "aborted"
  And the 5 pending steps are marked "skipped"
  And the 3 passed steps remain "passed"
  And the 2 failed steps remain "failed"
  And the reason "Blocking defect found" is visible on the run
```

NEEDS PO/DEV CONFIRMATION — story only specifies preservation of "passed" steps; "failed" steps are not mentioned.

***AC1-D — Run with blocked steps at time of abort***

```
Scenario: Abort a run that has blocked steps
  Given Elena is executing a run with 2 blocked steps and 8 pending steps
  When she aborts the run with the reason "Test data unavailable"
  Then the run is closed as "aborted"
  And the 8 pending steps are marked "skipped"
  And the 2 blocked steps remain "blocked"
```

NEEDS PO/DEV CONFIRMATION — `blocked` is a valid step result; its treatment on abort is not specified.

***AC1-E — Reason at exact minimum length (3 characters) succeeds***

```
Scenario: Abort with a reason of exactly 3 characters
  Given Elena is executing a running run of "Smoke suite"
  When she aborts the run with the reason "Out"
  Then the run is closed as "aborted"
  And the reason "Out" is shown on the run
```

NEEDS PO/DEV CONFIRMATION — boundary valid minimum not exercised by original ACs.

### AC2 — Reason that is too short is rejected

***Original scenario covered******:***

- 1-character reason → rejected with `"Please give a reason of at least 3 characters"`.

***Additional scenarios derived (1******:******N expansion)******:***

***AC2-B — Empty reason (0 characters) is rejected***

```
Scenario: Abort with an empty reason is rejected
  Given Elena is executing a running run of "Checkout happy path"
  When she tries to abort with an empty reason
  Then the run stays open and in progress
  And she sees an appropriate validation message
```

NEEDS PO/DEV CONFIRMATION — error message for empty input vs. too-short input may differ; confirm whether `"Please give a reason of at least 3 characters"` covers this case or a separate `"Reason is required"` message applies.

***AC2-C — 2-character reason is rejected***

```
Scenario: Abort with a 2-character reason is rejected
  Given Elena is executing a running run of "Checkout happy path"
  When she tries to abort with the reason "ab"
  Then the run stays open and in progress
  And she sees the message "Please give a reason of at least 3 characters"
```

***AC2-D — Whitespace-only reason is rejected***

```
Scenario: Abort with a whitespace-only reason is rejected
  Given Elena is executing a running run of "Checkout happy path"
  When she tries to abort with the reason "   " (3 spaces)
  Then the run stays open and in progress
  And she sees a validation message rejecting blank reasons
```

NEEDS PO/DEV CONFIRMATION — trimming behavior and error message for whitespace-only input not specified.

### AC3 — Cannot abort a run that already finished

***Original scenario covered******:***

- Run finished as `passed` → abort rejected with `"This run is already closed and cannot be aborted"`.

***Additional scenarios derived (1******:******N expansion)******:***

***AC3-B — Cannot abort a run that finished as failed***

```
Scenario: Cannot abort a run that already finished as failed
  Given the run of "Checkout happy path" already finished as failed
  When Elena tries to abort it with the reason "Stopping early"
  Then the run stays finished as failed
  And she sees the message "This run is already closed and cannot be aborted"
```

NEEDS PO/DEV CONFIRMATION — AC3 only tests the `passed` closed state; business rules imply `failed` must also reject, but this is not explicitly stated.

***AC3-C — Cannot abort a run that is already aborted***

```
Scenario: Cannot abort a run that is already aborted
  Given the run of "Checkout happy path" was previously aborted with reason "Environment down"
  When Elena tries to abort it again with the reason "Stopping early"
  Then the run stays aborted
  And she sees the message "This run is already closed and cannot be aborted"
```

NEEDS PO/DEV CONFIRMATION — idempotent abort on an already-aborted run is not covered. Business rules say aborting is terminal; re-aborting should be rejected consistently.

***AC3-D — Abort button/action not available on closed runs (UI gate)***

```
Scenario: Abort action is not available on a closed run
  Given Elena is viewing a run that has already finished as passed
  Then the "Abort Run" button (or action) is not visible or is disabled
```

NEEDS PO/DEV CONFIRMATION — the ACs describe what happens when a user "tries" to abort a closed run, implying the action is still reachable. Whether the UI should proactively hide/disable the action vs. show it and return an error is a UX decision not specified in the story.

### AC4 — Aborted run stays in the Test's history

***Original scenario covered******:***

- Aborted run appears in history list with outcome `aborted` and reason visible.

***Additional scenarios derived (1******:******N expansion)******:***

***AC4-B — History distinguishes multiple run outcomes***

```
Scenario: History shows mixed outcomes across runs
  Given "Checkout happy path" has 3 runs: one passed, one failed, one aborted
  When Elena opens the Test's run history
  Then each run shows its respective outcome label
  And the aborted run shows its abort reason
  And the other runs do not show an abort reason field
```

NEEDS PO/DEV CONFIRMATION — how non-aborted runs render the reason field (hidden? empty? N/A?) is not specified.

***AC4-C — Reason is visible on the run detail view (not just history list)***

```
Scenario: Abort reason is accessible from the run detail page
  Given Elena aborted a run of "Checkout happy path" with the reason "Staging down"
  When she opens the run detail page for that specific run
  Then the abort reason "Staging down" is clearly displayed on the run detail
```

NEEDS PO/DEV CONFIRMATION — AC4 references history list; AC1 says reason is "shown on the run." Whether both the run detail view and the history list row display the reason is not confirmed.

---

---

### Juan Leites - 6/23/2026, 9:30:43 AM

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| Type | Count |
| --- | --- |
| Positive (happy path + valid variations) | 6 |
| Negative (validation rejection) | 6 |
| Boundary (BVA on reason length) | 4 |
| State-Transition (run status machine) | 6 |
| Integration (cross-entity side effects) | 4 |
| ***Total**** | ****26*** |

### Outline list

***Positive***

1. `[P-01]` Abort an in-progress run with a valid reason — all pending steps become skipped, passed steps preserved, run = aborted, reason visible
2. `[P-02]` Abort a run where no steps have been executed yet — all steps become skipped
3. `[P-03]` Abort a run that has failed steps — failed steps preserved, pending steps become skipped
4. `[P-04]` Abort a run that has blocked steps — blocked steps preserved, pending steps become skipped
5. `[P-05]` Abort reason is exactly 3 characters — accepted, run closes as aborted
6. `[P-06]` Abort reason is a long but valid string (e.g., 250 chars) — accepted

***Negative***

1. `[N-01]` Abort with 1-character reason — rejected, error message shown, run stays in_progress
2. `[N-02]` Abort with 2-character reason — rejected, error message shown, run stays in_progress
3. `[N-03]` Abort with empty reason — rejected, run stays in_progress
4. `[N-04]` Abort with whitespace-only reason — rejected, run stays in_progress
5. `[N-05]` Abort a run that already finished as failed — rejected with closed-run message
6. `[N-06]` Abort a run that is already aborted — rejected with closed-run message

***Boundary***

1. `[B-01]` Reason length = 0 (empty) — invalid
2. `[B-02]` Reason length = 2 — invalid (below minimum)
3. `[B-03]` Reason length = 3 — valid (minimum)
4. `[B-04]` Reason length = maximum allowed — valid (requires max to be defined) **(NEEDS PO/DEV CONFIRMATION)**

***State-Transition***

1. `[ST-01]` `in_progress → aborted` (main transition) — run closes, steps updated, reason stored
2. `[ST-02]` `passed → abort attempt` — rejected (terminal state, no transition)
3. `[ST-03]` `failed → abort attempt` — rejected (terminal state, no transition)
4. `[ST-04]` `aborted → abort attempt` — rejected (terminal state, no transition)
5. `[ST-05]` Abort with invalid reason — `in_progress` state preserved (no transition occurs)
6. `[ST-06]` Abort UI affordance hidden/disabled on terminal-state runs **(NEEDS PO/DEV CONFIRMATION)**

***Integration***

1. `[I-01]` Step results in `run_steps` for pending steps are updated to `skipped` on abort — verified at DB level
2. `[I-02]` Step results in `run_steps` for already-executed steps are not overwritten on abort — verified at DB level
3. `[I-03]` Aborted run appears in the Test's run history list with outcome `aborted` and reason visible
4. `[I-04]` Aborted run's reason is visible on the run detail page **(NEEDS PO/DEV CONFIRMATION)**

---

## Phase 5 — Edge Cases (DRAFT)

***EC-1 — All steps already executed before abort is triggered.***
Run has 10 steps, all marked (passed/failed/blocked), none pending. Abort is triggered. Expected: run closes as `aborted` (not `passed`/`failed`), 0 steps changed to `skipped`, reason stored. Status machine must not apply finish logic just because all steps have results.

***EC-2 — Double-submit / rapid re-click of the Abort button.***
User clicks "Abort" twice before the first request completes. Backend must be idempotent or use an optimistic lock: the run closes as `aborted` exactly once; the second request either returns the already-aborted run or a "run already closed" error. No duplicate abort_reason values or step updates.

***EC-3 — Concurrent abort by two different users.***
Two project members open the same run and both click "Abort" at the same moment. Race condition: the second abort must be rejected (run already closed). Data consistency (step statuses, reason) must reflect only one winner.

***EC-4 — Network failure mid-abort.***
Server receives the abort request, begins the transaction (updates run status + step results), but the client loses connectivity. The run must not be left in a partially-aborted state (some steps skipped, status still `in_progress`). Requires a DB transaction wrapping all abort side effects.

***EC-5 — Reason field contains only whitespace that sums to ≥3 chars.***
`"   "` (3 spaces) passes naive `length >= 3` check but is meaningless. Server-side trim-and-validate must catch this.

***EC-6 — Session expiry during abort.***
Supabase session expires between page load and abort submission. The abort POST/action is rejected by RLS / middleware with a 401/403. User should see a session-expired message, not a validation error.

***EC-7 — Abort reason contains special characters or markdown.***
Reason like `"<script>alert('x')</script>"` or `"# heading\n\n* list"`. Must be stored and displayed safely (XSS prevention; rendering as plain text vs. parsed markdown is a display decision).

***EC-8 — Abort a run from the history view vs. the active execution view.***
If the UI exposes an abort action on the history list (for runs that are `in_progress`), not just on the execution page, the same validation and state-machine rules must apply in both surfaces.

---

---

### Juan Leites - 6/23/2026, 9:31:01 AM

## Story Quality Assessment

| Dimension | Score | Notes |
| --- | --- | --- |
| Clarity | 3 / 5 | ACs are clear on the happy path and basic validation; silent on who can abort, UI surface, and reason max length |
| Completeness | 2 / 5 | Missing 2-char BVA, empty-reason case, `failed`/`aborted` closed-state rejection, and concurrent-abort handling |
| Testability | 3 / 5 | Testable once the DB migration + BK-34 ship; ACs as written are executable but under-specified on boundaries |
| Feasibility | 1 / 5 | ***BLOCKED*** — `runs` + `run_steps` DB entities do not exist; story cannot ship without them |
| Risk | HIGH | Infrastructure dependency is pre-sprint blocker; ambiguities in authorization and whitespace handling are sprint risks |

***Overall******:****** Story is NOT ready for sprint entry until the ****`runs`**** migration is committed and BK-34 is in a testable state.***

---

## Critical Questions for PO

***PQ-1 — Who is authorized to abort a run?***
Can only the QA engineer who started the run abort it, or can any project member (or admin) abort any in-progress run? This affects RLS policy and the UI affordance.

***PQ-2 — Should the Abort button/action be hidden or disabled on closed runs?***
AC3 describes what happens when Elena "tries" to abort a finished run — implying the action is still reachable. Should the UI proactively remove or disable the abort action for closed runs, or show it and return the error message?

***PQ-3 — What is the maximum allowed reason length?***
No upper bound is specified. A practical maximum (e.g., 255 or 500 chars) is needed to size the DB column and the UI textarea.

***PQ-4 — How should the abort reason be displayed in the history list vs. the run detail?***
AC4 says reason is visible in history. AC1 says it is "shown on the run." Should it appear on both the list row (e.g., as a tooltip or truncated inline) and the detail page? How do non-aborted runs render the reason field?

***PQ-5 — Is abort a project-member-level action or does it require a specific role?***
No role/permission check is mentioned. If Bunkai has QA roles vs. viewer roles, viewers should presumably not be able to abort runs.

---

## Technical Questions for Dev

***DQ-1 — ****`runs`**** and ****`run_steps`**** DB migration******:****** what is the migration plan and which PR delivers it?***
This is the hard blocker. The `runs` table needs at minimum: `id, atc*id, started*by*user*id, status (in*progress | aborted | passed | failed), abort*reason, started*at, finished*at`. The `run*steps` table needs: `id, run*id, atc*step*id, result (pending | passed | failed | blocked | skipped), executed*at`. Confirm column names and constraints (especially nullability of `abort*reason` and max length).

***DQ-2 — Abort must be wrapped in a DB transaction — correct?***
The abort action updates `runs.status`, `runs.abort*reason`, and N rows in `run*steps`. If any part fails, the run must not be left in a partially-updated state. Confirm that Supabase server action uses a transaction or Postgres function.

***DQ-3 — How is "pending" defined for step selection during abort?***
The abort must mark "not yet executed" steps as `skipped`. Is the criterion `run*steps.result = 'pending'`? Or steps where no `run*steps` row exists yet? The distinction matters for implementation.

***DQ-4 — Does ****`atcs.status`**** change when a run is aborted?***
The domain model has `AtcStatus` on the `atc` row (template-level). Changing it on abort would corrupt other runs' histories. Confirm that `run_steps.result` is the per-execution record and `atcs.status` is either not touched on abort or updated independently via a separate rule.

***DQ-5 — Whitespace trimming******:****** client, server, or DB?***
Should the reason be trimmed before the 3-character minimum check? If yes, who is responsible — client form validation, server action, or a DB constraint? The answer determines where the "whitespace-only" edge case is caught.

***DQ-6 — Idempotency on double-submit******:****** optimistic lock or last-write-wins?***
What is the intended behavior if the same abort request arrives twice concurrently? Options: (a) first wins, second returns 409/error; (b) idempotent — second is a no-op returning the already-aborted run. Which pattern is Bunkai using for run mutations?

---

---

### Juan Leites - 6/23/2026, 9:31:15 AM

## Suggested Story Improvements

1. ***Add AC for the ****`failed`**** closed-run rejection*** (symmetric with AC3): explicitly test that a `failed` run cannot be aborted. This is implied by business rules but absent from ACs — and it is a non-trivial test case because it exercises a different terminal path.

1. ***Add AC for ****`aborted`**** closed-run rejection***: an already-aborted run should also reject a second abort attempt. Confirms the "terminal is terminal" contract.

1. ***Add BVA row for 2-character reason***: AC2 tests 1-char. A 2-char case belongs in the same scenario group to confirm the boundary is at 3, not 2.

1. ***Specify maximum reason length*** in the business rules and add a corresponding AC or note: "Reasons longer than X characters are truncated/rejected."

1. ***Clarify authorization rule*** (owner-only vs. project-member): add a business rule line: "Any [role] member of the project can abort a run, regardless of who started it" (or the inverse).

1. ***Add a note on whitespace behavior*** to the business rules: "Reasons consisting solely of whitespace characters are treated as blank and rejected."

1. ***Reference CON-1 in implementation notes***: explicitly state "abort marks `run_steps.result = 'skipped'` for pending steps; `atcs.status` is NOT modified by abort."

---

## Data feasibility flags

> ***RISK LEVEL******:****** HIGH — INFRASTRUCTURE MISSING***

| Flag | Severity | Detail |
| --- | --- | --- |
| `runs` table absent from DB schema | CRITICAL | No run can be started, aborted, or finished until this migration ships |
| `run_steps` table absent from DB schema | CRITICAL | Per-execution step results cannot be stored without this table |
| BK-34 (Start a run) is a hard pre-requisite | HIGH | BK-36 requires an `in_progress` run to abort; that run is created by BK-34 |
| `abort_reason` column spec undefined | MEDIUM | Type, length, nullability not yet decided; blocks migration authoring |
| `atcs.status` vs `run_steps.result` ambiguity (CON-1) | MEDIUM | Risk of corrupting template-level ATC status if wrong field is updated |
| No server action or API route for abort | MEDIUM | Must be implemented from scratch; not an extension of existing code |
| RLS policy for `runs` table not designed | MEDIUM | Authorization rules (who can abort) must be defined before RLS can be written |

***Testing pre-conditions that must be true before QA can execute any test for BK-36******:***

1. `runs` + `run_steps` DB migration deployed to staging.
2. BK-34 shipped (or a seed script exists that creates an `in_progress` run with steps).
3. A test user with a project and at least one ATC with ≥2 steps available on staging.

---

## Recommended testing strategy

***Primary technique******:****** State-Transition testing*** — the run status machine is the core of this story. Derive one test per valid transition and one per invalid transition from each terminal/closed state.

***Secondary******:****** BVA on reason length*** — the 3-character minimum is a hard boundary. Test 2 (invalid), 3 (valid min), and max (once defined).

***Secondary******:****** Equivalence Partitioning on closed-run states*** — closed states form one EP class (`passed`, `failed`, `aborted`) all of which must reject abort. Test all three members explicitly.

***Exploratory focus areas******:***

- Concurrent abort (two users, same run)
- Abort with all steps already executed
- Whitespace-only reason handling
- Session expiry mid-abort

***Test environment note******:*** All E2E tests for BK-36 require `runs` migration on staging + BK-34 as a setup action. API-level tests can be written against the migration directly (bypassing UI) for faster feedback on the state-machine and validation logic. UI tests are the integration layer on top.

---

## Risks & mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| `runs` migration not ready before sprint | HIGH | BLOCKS entire story | Confirm migration PR exists and is merged before BK-36 enters sprint |
| BK-34 not shipped when BK-36 is picked up | HIGH | No way to create in_progress run for testing | Sequence BK-34 before BK-36 in sprint planning; provide seed script fallback |
| `atcs.status` overwritten on abort (CON-1) | MEDIUM | Corrupts ATC template-level data | Dev must confirm which field abort touches; add regression test for `atcs.status` unchanged |
| Concurrent abort race condition | MEDIUM | Run left in invalid state | DB transaction required; confirm with Dev (DQ-6) |
| Authorization unspecified | MEDIUM | Incorrect RLS ships to production | Resolve PQ-1 before sprint entry |
| Missing BVA cases for reason length | LOW | Boundary defect escapes to prod | Add 2-char and 0-char cases to AC2 before sprint |

---

## Next steps

- [ ] PO to answer PQ-1 through PQ-5 before sprint entry
- [ ] Dev to confirm `runs` + `run_steps` migration PR exists (DQ-1) and is targeted to land before BK-36
- [ ] Dev to confirm DB transaction wrapping abort side effects (DQ-2)
- [ ] Dev to confirm `atcs.status` is NOT modified on abort (DQ-4)
- [ ] Dev to confirm whitespace trimming approach (DQ-5)
- [ ] Dev to confirm idempotency strategy for double-submit (DQ-6)
- [ ] PO to add maximum reason length to business rules (GAP-1 from AMB-1)
- [ ] Confirm BK-34 is sequenced before BK-36 in sprint planning
- [ ] Add seed script for `in_progress` run with steps (test environment pre-condition)
- [ ] Story re-estimation recommended if `runs` migration scope is larger than 1 SP implies

---

### Juan Leites - 6/23/2026, 10:02:24 AM

## PO Response — Shift-Left Questions (BK-36)

**Answers provided by the Product Owner on the Shift-Left analysis questions raised by QA.**

---

***PQ-1 — Who is authorized to abort a run?***

Any project ***member**** or ****admin*** can abort any in-progress run within the project, regardless of who started it. A viewer-only account cannot abort.

Rationale: QA engineers work in teams. If the person who started a run is blocked, unavailable, or in a different timezone, a colleague must be able to cleanly close a stale run. Restricting abort to the original runner would create operational dead ends.

---

***PQ-2 — Should the Abort button be hidden or disabled on closed runs?***

The abort action should be ***hidden*** on closed runs (passed, failed, or already aborted). We do not want to show an action that will always fail — that creates confusion and support noise.

Implementation note: the UI should evaluate the run's current status before rendering the abort affordance. If the run is in any terminal state, do not render the button at all.

---

***PQ-3 — What is the maximum allowed reason length?***

***500 characters*** maximum. This gives testers enough room to explain context (blocking environment, CI failure, coverage gap) without turning the abort reason into a free-form notes field.

DB column: `VARCHAR(500)` — not nullable when status = 'aborted', nullable otherwise (non-aborted runs have no reason).

UI textarea: show a live character counter (e.g., "142 / 500"). Disable the confirm button if the count exceeds 500.

---

***PQ-4 — How should the abort reason be displayed?***

Two surfaces, different treatment:

- ***Run detail page***: show a dedicated "Abort Reason" field, visible in full below the status badge. Non-aborted runs should not show this field at all.
- ***Run history list*** (within a test's run list): show a truncated inline label (max ~80 chars, with "..." if longer). On hover or tap, show a tooltip with the full reason.

The reason should be styled differently from regular status text — a muted italic or a distinct info callout — so it reads as context, not as a status label.

---

***PQ-5 — Is abort a role-gated action?***

Yes. Access levels:

- ***Admin***: can abort any run in the workspace.
- ***Member***: can abort any run within projects they are a member of.
- ***Viewer***: read-only — cannot abort.

This aligns with Bunkai's general principle that viewers cannot mutate data. The abort action must be gated at the server action level, not just hidden in the UI.

---

### Juan Leites - 6/23/2026, 10:02:36 AM

## Dev Response — Shift-Left Technical Questions (BK-36)

**Implementation decisions from the Dev side on the technical questions raised by QA Shift-Left analysis.**

---

***DQ-1 — ****`runs`**** and ****`run_steps`**** migration******:****** which PR, when?***

The migration will be delivered as part of ***BK-34*** (Start a manual run). Both tables are co-designed since `run_steps` has no meaning without a parent `runs` row.

Planned schema:

```sql
-- runs
CREATE TABLE runs (
  id             UUID PRIMARY KEY DEFAULT gen*random*uuid(),
  atc_id         UUID NOT NULL REFERENCES atcs(id) ON DELETE CASCADE,
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment    TEXT NOT NULL,
  started_by     UUID NOT NULL REFERENCES auth.users(id),
  status         TEXT NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress', 'passed', 'failed', 'aborted')),
  abort_reason   VARCHAR(500),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at    TIMESTAMPTZ
);

-- run_steps
CREATE TABLE run_steps (
  id           UUID PRIMARY KEY DEFAULT gen*random*uuid(),
  run_id       UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  atc*step*id  UUID NOT NULL REFERENCES atc_steps(id) ON DELETE CASCADE,
  result       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (result IN ('pending', 'passed', 'failed', 'blocked', 'skipped')),
  executed_at  TIMESTAMPTZ
);
```

RLS: project-scoped — only members of the run's project can read/write. Viewers excluded from INSERT/UPDATE.

BK-36 is hard-blocked until this migration merges and BK-34 ships.

---

***DQ-2 — DB transaction wrapping the abort side effects?***

Yes. The abort will be implemented as a ***Postgres function*** (similar to `bunkai*save*atc`), called from a Next.js server action.

The function will atomically:

1. Verify the run is still `in_progress` (optimistic check — raises an exception if not, triggering rollback).
2. UPDATE `runs` SET `status = 'aborted'`, `abort*reason = $reason`, `finished*at = NOW()`.
3. UPDATE `run*steps` SET `result = 'skipped'`, `executed*at = NOW()` WHERE `run*id = $run*id AND result = 'pending'`.

If the step-update fails for any reason, the entire transaction rolls back. The run is never left in a partially-updated state.

---

***DQ-3 — How is "pending" defined for step selection during abort?***

`result = 'pending'` in the `run*steps` table. All steps are inserted as `run*steps` rows with `result = 'pending'` when a run starts (BK-34). There are no "missing rows" — every `atc*step` of the ATC gets a corresponding `run*steps` row on run creation.

This means the abort's UPDATE targets: `WHERE run_id = $1 AND result = 'pending'`. No subquery needed.

---

***DQ-4 — Does ****`atcs.status`**** change when a run is aborted?***

***No.**** `atcs.status` is a template-level field representing the outcome of the **last completed run* (passed or failed). It is updated only when a run finishes normally.

An aborted run:

- Sets `runs.status = 'aborted'`
- Sets `run_steps.result = 'skipped'` for pending steps
- Does ***NOT*** touch `atcs.status`

If `atcs.status` were updated on abort, every abort would corrupt the ATC's historical status for future runs — this is the CON-1 risk flagged by QA. Confirmed: abort does not touch `atcs.status`.

---

***DQ-5 — Whitespace trimming******:****** client, server, or DB?***

***Both client and server.*** The reason text is trimmed with `.trim()` at two points:

1. ***Client (form validation)***: before enabling the "Abort" confirmation button. A whitespace-only input is treated as empty. The client shows the inline validation message "Please provide a reason of at least 3 characters."
2. ***Server action***: the server action trims before the length check as a safety net, in case the client validation is bypassed (direct API call, browser extension, etc.).

The DB column does NOT enforce a `CHECK (LENGTH(TRIM(abort_reason)) >= 3)` constraint — that level of validation belongs in the application layer where we can return meaningful error messages.

---

***DQ-6 — Double-submit idempotency******:****** 409 or no-op?***

***First-wins, 409 on the second attempt.*** The Postgres function checks `runs.status = 'in_progress'` as its first step. If the run is already `aborted` (because the first request landed), the function raises an exception and the server action returns a structured error.

The UI must:

1. Disable the "Confirm Abort" button immediately after the first click (optimistic UI).
2. Display the 409 response as a non-blocking toast: "This run has already been aborted."

We do not implement idempotent no-op for abort because an abort is a terminal action — a second identical request is a client bug, not normal retry behavior.

---

### Juan Leites - 6/23/2026, 10:02:47 AM

## Design / UX Response — Shift-Left UI Ambiguities (BK-36)

**UI/UX decisions on the interface questions raised by QA Shift-Left analysis.**

---

***AMB-3 — Where does the abort action live in the UI?***

The abort action appears in the ***run execution view toolbar***, as a secondary-danger button labelled "Abort Run", placed to the left of the primary "Finish Run" button.

Interaction flow:

1. User clicks "Abort Run" button in the toolbar.
2. A ***confirmation modal*** appears with:
3. On confirm: modal closes, spinner overlay on the run view, then status badge updates to "Aborted".

The textarea has `minlength=3`, `maxlength=500`. Client-side validation fires on `blur` and on every `input` event.

---

***AMB-4 — Where is the abort reason displayed after aborting?***

Two locations, different fidelity:

***Run detail page (primary)******:***

After abort, the status badge changes to a red "Aborted" lozenge. Directly below the badge, a new section appears:

```
Abort Reason
────────────
[full reason text, plain paragraph, muted color]
```

This section is conditional — it only renders when `runs.abort_reason` is non-null. For passed or failed runs, this section is absent entirely (no empty field, no "N/A").

***Run history list (secondary)******:***

In the list of runs for a test (e.g., the run history panel within a test's detail view), aborted runs show:

- Status badge: "Aborted" (red)
- Below the timestamp: a truncated reason string (max 80 chars, `…` suffix if longer)
- Hovering the truncated text shows a tooltip with the full reason

Non-aborted runs (passed, failed, in_progress) show no reason field in the list view.

---

***AC3-D — Should the Abort button be hidden or visible with an error on closed runs?***

***Hidden.*** The abort button is not rendered at all when the run is in a terminal state (`passed`, `failed`, or `aborted`).

Rationale: showing a button that will always fail trains users to expect errors. It also increases the cognitive load of the execution view with an action that is never useful in that state. The PO confirmed this decision (see PQ-2 above).

Implementation guidance: evaluate `run.status` before rendering the action toolbar. If `status !== 'in_progress'`, render only the "View Results" affordance (or equivalent read-only controls). The abort button component should not be in the DOM.

---

***AMB-5 / AMB-6 — Visual treatment of blocked and failed steps at time of abort***

At the moment abort is confirmed, the step list updates as follows:

| Step state at abort time | Post-abort display |
| --- | --- |
| `pending` (not yet executed) | Result badge changes to "Skipped" (grey, neutral) |
| `passed` (already executed) | Unchanged — "Passed" (green) preserved |
| `failed` (already executed) | Unchanged — "Failed" (red) preserved |
| `blocked` (already executed) | Unchanged — "Blocked" (amber) preserved |
| `skipped` (already marked) | Unchanged — "Skipped" (grey) preserved |

The abort summary at the top of the run detail shows a breakdown:

```
Run aborted
  ✓ Executed: 3 steps  (1 passed · 1 failed · 1 blocked)
  → Skipped:  4 steps  (not executed)
```

The color and icon for "Skipped" (resulting from abort) should be visually distinct from a user-intentional skip made during execution. Proposal: use a lighter grey + an "x" icon (vs. a standard skip icon) — open for design review.

---


_Synced from Jira by sync-jira-issues_
