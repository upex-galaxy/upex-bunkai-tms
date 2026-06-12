# BK-27 — Spec Compliance Matrix

> Stage 3 gate artifact (dev-authored, non-Jira). One row per AC scenario, mapping each to the evidence that proves it works. Status legend: `covered` | `manual` | `exempt` | `review-approved` | `uncovered`.
>
> Review context: per-chunk adversarial multi-agent reviews (workflows `wf_1aa96338-5d4`, `wf_7d0b4ad1-284`, `wf_d94bf331-6c6`, `wf_b4b38747-f27`) + owner review approval (Ely, 2026-06-12, review bypass authorized as repo owner/reviewer).

| AC scenario (Gherkin) | covered_by | evidence | status |
|---|---|---|---|
| 1.1 Create a Test with three ATCs in the selected order (+ activity log) | test:sql-rollback-suite; test:rls-isolation | `BK27_VERIFICATION_OK` DO-block run vs live DB (order 1-2-3, trimmed title, `activity_log` `test.created` row asserted); `lib/tests/rls-isolation.test.ts` 3 pass / 16 asserts | covered |
| 1.2 Preserve a chain referencing the same ATC twice | test:sql-rollback-suite | DO-block dup case: `[A,B,A]` → 3 positions, A at 1 and 3 | covered |
| 2.1 Block save when no ATC selected (server-enforced) | test:sql-rollback-suite; test:lib/tests/validation.test.ts | 45120 raised below HTTP layer; Zod `.min(1)`; UI hint + disabled submit (frozen copy) | covered |
| 2.2 Reject empty/whitespace-only title | test:sql-rollback-suite; test:lib/tests/validation.test.ts | 45121 after trim; Zod trim-then-validate cases green | covered |
| 2.3 Accept 200-char title, reject 201 | test:sql-rollback-suite; test:lib/tests/validation.test.ts | both layers boundary-tested (200 pass / 201 fail) | covered |
| 3.1 Exactly one Test on a double-submit | review-approved:adversarial-workflow + test:helper-contract | idempotency begin/replay wired (`app/api/v1/tests/route.ts`); concurrency race fixed (pending → 409, CAS reclaim, 23505 → 409); UI: one key per form session + pending-disable; runtime replay to be exercised by QA on staging (TC-12) | review-approved |
| 3.2 Headless agent retry with same key → cached response | review-approved:adversarial-workflow | same wiring as 3.1; snapshot replay returns stored status+body; QA staging check (TC-16) | review-approved |
| 4.1 Foreign-workspace ATC rejected without disclosing existence | test:sql-rollback-suite; test:rls-isolation | uniform 45122 byte-identical for foreign vs nonexistent (asserted equal code+message); RLS INSERT containment policy; 404 envelope carries no details | covered |
| E1 Viewer cannot create via headless API (403) | test:sql-rollback-suite; test:rls-isolation | 42501 raised before ATC resolution; route maps to 403 `forbidden`; scope gate `atc:write` | covered |
| E2 Test binds to workspace active at creation instant | review-approved:adversarial-workflow | binding resolved server-side at submit (explicit `workspace_id` wins; cookie fallback; PAT without workspace_id → 422); ADR-0001-conformant | review-approved |

## ATP coverage note

All 19 synced ATP TCs map to implementation steps in `implementation-plan.md` §Traceability. TC-12/16 (idempotency runtime replay) and TC-17 (member happy path over HTTP) are the rows above marked `review-approved` — statically verified + DB-layer proven; HTTP-layer replay is the QA staging checklist item. No row is `uncovered`.

## Deliberate gaps flagged for QA / follow-up

- `tests` INSERT RLS policy allows a direct PostgREST insert that bypasses the activity-log audit row (plan-specified policy; non-cross-tenant; flagged by security lens, accepted).
- OpenAPI error-enum hardcoded list — follow-up chore suggested: derive from `API_ERROR_CODES` to make drift impossible (pre-existing drift was repaired in this story).
- Builder submit lives in the topbar (NewAtcEditor precedent) vs the plan ASCII's bottom row — contract internally conflicted, precedent chosen.
