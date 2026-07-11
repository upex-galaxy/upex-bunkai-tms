# BK-148 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-148)

## Acceptance Test Results — BK-148: TMS-Project Environments CRUD

***Environment******:**** staging · ****Executed******:**** Stage 2 (API) + Stage 3 (UI) · ****Documented******:*** 2026-07-10

### Result summary

| Area | ACs | Result | Evidence |
| --- | --- | --- | --- |
| RLS list isolation | 1 | ✅ PASS | Non-member GET → 200 empty; member sees only own project |
| Uniqueness (exact + case-insensitive) | 2 | ✅ PASS | 409 on duplicate; unique index `(project_id, lower(name))` |
| Name validation (trim / min / max) | 2 | ✅ PASS | 422 on empty and >50; trim persists "Dev" |
| Rename (valid + conflict) | 2 | ✅ PASS | 200 valid; 409 on existing target |
| Delete guard (all statuses) | 3 | ✅ PASS | 409 with run count; counts every status |
| Happy-path UI (create/rename/delete) | 1,4 | ✅ PASS | data-testid-driven; inline errors verified |
| Write-gate cross-workspace (T2) | 2 | ⚠️ PASS w/ correction | ***Actual 403, not the 404 the ATP claimed*** — see below |
| In-use delete via UI (TC#25) | 3 | ⏳ DEFERRED | Blocked on Runs fixture (FEAT-025) |

### Correction to a prior PASS (traceability integrity)

The earlier ATR recorded ***TC#2**** as PASS with the justification "cross-workspace env_id returns 404 (non-disclosing) via RLS filter." Source-code validation shows this inference was ****false****: the RPC (`SECURITY DEFINER`, no `FORCE RLS`) reads the foreign row and the write-gate returns ****403 ****`forbidden`, not 404. The mutation IS blocked (no cross-tenant write — AC #2 holds), but the response ****discloses existence*** (403 = "exists but forbidden" vs 404 = "unknown"). The original test never exercised the real cross-workspace path (only a random UUID). T2 now documents the true 403 behavior.

### Defects / improvements raised

- ***Improvement (Mejora)******:*** cross-workspace `PATCH`/`DELETE` on an existing environment returns 403, disclosing existence, where a non-disclosing 404 would be expected for a multi-tenant surface. No AC mandated non-disclosure → Improvement, not Bug. Linked to BK-148.

### Verdict

Feature meets all acceptance criteria; no critical or major defects. RLS isolation, uniqueness, and delete guard (P0) all pass. One security ***Improvement**** raised (existence disclosure, low severity — mutation is blocked). TC#25 UI path deferred pending a Runs fixture. ****Recommendation******:****** release; track the Improvement and the deferred TC.***

---
_Synced from Jira by sync-jira-issues_
