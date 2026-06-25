# BK-166 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-166)

## BK-166 Test Results

***Tested******:*** 2026-06-23
***Environment******:*** Staging (`https://staging-upexbunkai.vercel.app`)
***Tester******:*** QA — Stage 2/3
***Result******:*** FAILED (0/42)

### Summary

Stage 1 produced a 42-outline ATP covering the 11 ACs (EP, BVA, State-Transition, Decision Table, Error-Guessing). Stage 2 execution stopped at the mandatory smoke test: staging serves the legacy magic-link-only login UI, with `POST /api/v1/auth/check-email` and `POST /api/v1/auth/confirm` both returning a genuine HTTP 404 (route not deployed). `POST /api/v1/auth/signup` and `POST /api/v1/auth/signin` exist but return HTTP 422 instead of the documented 400 on validation failure. Per the finding-triage rule, a smoke failure is a blocking, env-level finding — deep UI/API/DB exploration was correctly skipped rather than re-confirming the same blocker 42 times.

Root cause is a deployment/build gap, not an application logic defect: the `staging` branch on `upex-bunkai-tms` is at commit `16863ca` (2026-06-22), which includes PR #54 — the merge that should ship this feature — but the live site does not reflect it.

### Test Cases

All 42 Stage-1 outlines closed `BLOCKED — smoke failure: feature not deployed`. Full per-outline detail in `test-session-memory.md`.

### Test Data

- Staging confirmed account: `STAGING*USER*EMAIL` (used for the smoke attempt only — login could not reach a password step)

### Bugs Found

- ***BK-177*** (Critical) — Staging deployment missing email-first password sign-in UI and 2 of 4 BK-166 API routes

### Observations

- DB cross-validation leg (RLS, `access*tokens`/`access*token_secrets` rows) was independently deferred this session — DBHub MCP unavailable (`.env` credentials pending). Moot for this pass since the feature could not be reached at all, but flagging so it isn't assumed covered once the deploy gap is fixed.
- AC4 and AC11 (signup→OTP→confirm) were already pre-flagged NOT VERIFIABLE IN THIS ENVIRONMENT regardless of the deploy gap (Supabase free-tier email cap, no service-role key in QA tooling).

### Recommendations

- Re-run Stage 2 in full once Dev/DevOps confirms the staging deployment actually serves commit `16863ca` or later.
- No automation candidates can be assessed yet — 0% of the planned outlines executed.

---
_Synced from Jira by sync-jira-issues_
