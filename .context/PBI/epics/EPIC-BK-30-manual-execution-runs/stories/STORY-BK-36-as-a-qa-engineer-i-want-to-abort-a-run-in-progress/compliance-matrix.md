# Spec Compliance Matrix — BK-36 "Abort a run in progress with a reason"

> Dev-authored (non-Jira). topic_key `pbi/BK-36/compliance-matrix`.
> Stage 3 output. Evidence as of feature/BK-36-abort-run.

| AC scenario (Gherkin) | covered_by | evidence | status |
|---|---|---|---|
| AC1 — Abort mid-flight: run→aborted, 6 pending steps→skipped, 4 passed remain passed, reason shown | manual:db-rollback-test | DB functional test (rolled back): `run=aborted reason="Staging environment went down" passed_step=passed pending_step=skipped atc=skipped` | manual |
| AC2 — Reason too short ("x") rejected, run stays running, message "Please give a reason of at least 3 characters" | review-approved:orchestrator + manual:db-rollback-test | Client guard `RunnerView` `ABORT_REASON_TOO_SHORT_MESSAGE`; server `route.ts` safeParse → `RUN_ABORT_REASON_TOO_SHORT_MESSAGE` (AC-exact, 422); RPC backstop `45205` (DB test: `AC2(short) -> rejected 45205`). Run untouched (RPC raises before any UPDATE). | review-approved |
| AC3 — Cannot abort an already-closed run; message "This run is already closed and cannot be aborted." | manual:db-rollback-test | DB test: `AC3(closed) -> rejected 45204` → `errors.ts` maps `45204`→409 conflict with AC-exact copy. Run unchanged (status guard precedes mutation). | manual |
| AC4 — Aborted run in Test's run history with outcome "aborted" + reason visible | exempt:BK-37 | History list/detail surface is BK-37 (🔒 mockup-gated, out of scope). BK-36 only persists the data: `runs.status='aborted'` + `runs.abort_reason` exposed via `bunkai_run_json` (so any history reader gets it). Run-detail reason display IS shipped (`runner-abort-reason`). | exempt |

## Business-rule coverage (beyond AC)

| Rule | covered_by | evidence | status |
|---|---|---|---|
| reason 3..500, trimmed client+server | review-approved | Zod `.trim().min(3).max(500)`; SQL `btrim` + `runs_abort_reason_chk` CHECK; client `.trim()` + `maxLength=500` | review-approved |
| member+ only; viewers rejected server-side | review-approved | `bunkai_assert_actor_can_write_workspace` in RPC (42501→403); UI `canAbort` only hides the button (secondary) | review-approved |
| atcs.status (Test template) NEVER mutated | manual:db-rollback-test + review-approved | RPC updates `run_steps` + `run_atcs` + `runs` only; no `atcs` write. DB test confirms preserved | manual |
| double-submit first-wins (409 on 2nd) | review-approved | `FOR UPDATE` row lock serializes; loser re-reads `status='aborted'`→45204→409. Client disables Confirm while submitting | review-approved |
| abort is terminal | review-approved | status guard rejects any non-`running` run; no re-open path | review-approved |

## Gate
No `uncovered` rows. AC4 `exempt` is scoped (BK-37 owns the history surface; data is delivered). **PASS.**
