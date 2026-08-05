# BK-6 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-6)

## Acceptance Test Results (ATR) — Re-test 2026-06-12

***BK-6 TEST RESULTS***
Tested: 2026-06-12
Environment: Staging
Result: PASSED (4/4 TCs — 100%)

---

## Summary

TMS-Workspace | Switch between workspaces — all 4 acceptance criteria verified across API, DB, and UI layers.

TC1 originally FAILED on 2026-06-06 due to [https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83](https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83) (API response schema missing `{id, slug, name, role`}). [https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83](https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83) has been fixed and closed. TC1 re-verified on 2026-06-12 — fix confirmed, response schema now matches AC1 specification. Story verdict: ***PASSED***.

---

## Test Cases

| ***TC**** | ****AC**** | ****Scenario**** | ****Status**** | ****Notes*** |
| --- | --- | --- | --- | --- |
| TC1 | AC1 | Happy path — switch + response schema | PASSED | Re-verified 2026-06-12 after [https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83](https://jira.upexgalaxy.com/browse/BK-83#icft=BK-83) fix |
| TC2 | AC2 | Non-member workspace rejected (403) | PASSED | Original 2026-06-06 |
| TC3 | AC3 | Suspended membership rejected (403) | PASSED | Original 2026-06-06 |
| TC4 | AC4 | UI switcher reflects active workspace | PASSED | Original 2026-06-06 |

---

## Test Data

- ***User***: bunkai-staging-userlf@ambuusteln.resend.app (ID: 2742da39-e0ff-4f0c-a0a1-88dae804e14f)
- ***Workspace switch***: Bünkāï QA (a808499e-f437-43b8-9fdb-8cee7dcceb3e) → Extra Test (9a2c3de7-18af-45e5-a36f-e0ef9377af69)
- ***Non-member workspace***: bd947203-5318-4724-9608-7676c7af83c0
- ***Suspended-membership workspace***: BK5 Test Workspace (c828d131-f1c7-413c-9ba4-723fa1c45c00)

---

## Bugs Found

- ***BK-83*** (CLOSED): POST /api/v1/me/active-workspace response missing `{id, slug, name, role`}. Fix verified 2026-06-12. Severity: Moderate.
- ***BK-118*** (OPEN — tech debt): Legacy fields `ok` and `active*workspace*id` still present in response alongside new fields. Additive, non-breaking. Accepted by PO.

---

## Observations

- ***OBS-001***: Error codes for negative paths (AC2, AC3) use generic `forbidden` instead of spec-required `NOT*A*MEMBER` / `MEMBERSHIP_SUSPENDED`. API uses RLS for membership filtering — suspended memberships treated identically to non-memberships at the RLS layer. Accepted by PO as non-blocking.
- ***OBS-002***: Empty workspaces show onboarding modal without the workspace switcher in the header. Expected UX — not a defect.
- ***TC1 Re-verification (2026-06-12)***: Full response body: `{"ok":true,"active*workspace*id":"9a2c3de7...","id":"9a2c3de7...","slug":"extra-test","name":"Extra Test","role":"member"`}. All 4 required fields (`id`, `slug`, `name`, `role`) confirmed present. HTTP 200.

---

## Recommendations

- TC1, TC2, TC3 are strong candidates for API automation (workspace switch + rejection paths are stable, deterministic, fast).
- TC4 (UI switcher) is a candidate for E2E automation with Playwright.

---
_Synced from Jira by sync-jira-issues_
