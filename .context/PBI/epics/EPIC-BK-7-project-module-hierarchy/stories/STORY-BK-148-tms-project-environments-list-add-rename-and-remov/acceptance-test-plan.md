# BK-148 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-148)

## Acceptance Test Plan — BK-148: TMS-Project Environments CRUD

***Modality******:**** jira-native (ATP on Story field) · ****Environment******:**** staging · ****Overall risk******:*** 125 CRITICAL

### Feature summary

Project members manage the list of run-target environments (list, add, rename, remove). Environments are project-scoped, isolated by multi-tenant RLS, and cannot be removed while a Run references them. Foundational for the Run Execution pipeline (FEAT-025).

### Acceptance criteria

1. A project member sees every environment for that project.
2. A project member can add, rename, and remove an environment, with uniqueness and trimming enforced.
3. Removing an environment referenced by a Run is blocked with a clear message.
4. Happy-path, validation, and guard scenarios are met on staging.
5. Acceptance criteria validated; no critical or major defects open.

### Business rules (source-validated against ../upex-bunkai-tms)

| # | Rule | Code evidence |
| --- | --- | --- |
| 1 | Name 1–50 chars after trim | `lib/environments/validation.ts:14-22` (Zod), RPC backstop `0032:115-118` |
| 2 | Trimming server-side (`btrim`) | `0032:115,175`; Zod `.trim()` |
| 3 | Uniqueness case-insensitive: unique index `(project*id, lower(name))` → 409 | `0031*runs.sql:38-39` |
| 4 | Delete guard counts ***runs of ANY status*** (not only active) | `0032:244-250` |
| 5 | Write ops require role ≥ member; viewer → 403 | `0021*atc*create_update.sql:49-56` |
| 6 | RLS list: non-member → 200 empty (silent zero, no 403/404) | `0031_runs.sql:46-57`; `route.ts:29-39` |

### AC → Test coverage & ROI verdict

25 candidate scenarios derived by technique (EP, BVA, State-Transition, Decision-Table). Data-variant siblings are folded into one parameterized Test (`Examples`). Persisted regression Tests: ***8 Candidate + 2 Manual***. The remaining 15 are Deferred (not created in TMS) — documented below.

| Test | ACs | Folds | Type | Verdict |
| --- | --- | --- | --- | --- |
| T1 — RLS list isolation | 1 | TC#1 | API | Candidate |
| T2 — write-gate rejects non-authorized actor (403) | 2 | TC#2, TC#3 | API | Candidate |
| T3 — create valid + uniqueness (case-insensitive) | 2 | TC#5, TC#7, TC#8 | API | Candidate |
| T4 — name validation boundaries (BVA) | 2 | TC#9, TC#10, TC#11 | API | Candidate |
| T5 — rename valid + rename conflict | 2 | TC#12, TC#13 | API | Candidate |
| T6 — delete happy + delete guard (all statuses) | 3 | TC#15, TC#16, TC#17, TC#18 | API | Candidate |
| T7 — E2E CRUD UI flow | 1,4 | TC#20, TC#21, TC#22 | E2E | Candidate |
| T8 — UI duplicate-name inline error | 2 | TC#24 | E2E | Candidate |
| M1 — create submit disabled on empty name | 4 | TC#23 | E2E | Manual |
| M2 — environments section loads | 1 | TC#19 | UI | Manual |
| Deferred | — | TC#4, TC#6, TC#14, TC#25 | — | Deferred |

### Refinement notes — ATP-vs-code discrepancies

> The ATP was authored before implementation. Source-code validation corrected these; the persisted Tests reflect the corrected behavior.

1. ***Errors render INLINE, not as toasts.**** Forms use `toast.success` for success only; failures render in `<p data-testid="**-error">`. Assertions target the inline element, not a sonner toast. (`create-environment-form.tsx`, `delete-environment-dialog.tsx`)
2. ***422 empty-name message is generic.**** Zod parses first → `code:"validation_failed"`, message "Request body failed validation.", `details` is an ****array*** of issues. The "between 1 and 50 characters" string only comes from the RPC 45210 backstop, never reached on this path. Assert on `code`, not the exact string. (`handler.ts:116-119`)
3. ***Empty-name 422 unreachable via UI*** — submit is `disabled` while `trimmedName.length < 1`. M1 reframed as a disabled-button assertion. (`create-environment-form.tsx:67,151`)
4. ***Cross-workspace PATCH/DELETE on an EXISTING env → 403, not 404.**** RPCs are `SECURITY DEFINER` and `project*environments` lacks `FORCE ROW LEVEL SECURITY`, so the RPC reads the foreign row (bypassing RLS), resolves its project, then the write-gate rejects the non-member → 42501 → 403 `forbidden`/`not*a_member`. 404 fires only for a genuinely nonexistent id. The prior rpc test only exercised a random UUID, never the real cross-workspace path. ****T2 documents the actual 403.*** Existence-disclosure gap → filed as Improvement (no AC required non-disclosure).
5. ***Delete guard wording.*** BR "≥1 active run" is imprecise — code counts runs of ANY status. T6 asserts the all-status count.
6. ***DELETE success body is double-nested******:*** `{"deleted":{"deleted":true,"id":...}}`, not `{"deleted":true}`. T6 asserts the real shape.

### Pass criteria

- P0: RLS isolation (T1), write-gate (T2), uniqueness (T3), delete guard (T6) — all must pass.
- P2: happy-path UI (T7, T8) — defer only if UI-only and guards pass.

---
_Synced from Jira by sync-jira-issues_
