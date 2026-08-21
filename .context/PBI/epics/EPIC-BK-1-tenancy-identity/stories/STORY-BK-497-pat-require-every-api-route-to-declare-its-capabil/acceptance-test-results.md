# BK-497 — Acceptance Test Results (QA)

> Jira field: `customfield_10124` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-497)

## BK-497 TEST RESULTS

***Tested******:*** 2026-08-19
***Environment******:*** Staging
***Tester******:*** Luis Eduardo Flores Villarroel
***Result******:*** PASSED WITH ISSUES (15/17 TCs; 1 BLOCKED with substitute coverage, 1 FAILED non-blocking)

### SUMMARY

Verified BK-497's core claim: migrating all 87 API route handlers to a mandatory `auth` posture (`public` / `cookie-only` / `authenticated` / `required`) is behaviour-neutral for every route except the two token-management routes (issue/revoke a PAT), where hand-rolled Bearer rejection was deliberately lifted into the shared gateway as a first-class `cookie-only` posture. Executed a Decision Table over AC-04/AC-05/AC-06 (capability-scoped PAT rejections), a BVA/compile-time fixture proving the "no posture = compile error" property, a 4-row parametrized proof of the `cookie-only` lift (real handlers, real minted tokens, DB-confirmed no-op on rejection paths), two manual UI smokes (issue + revoke a PAT from Settings), and two Error Guessing charters (auth-resolution ordering, cross-posture spot-check). 15 of 17 outlines passed outright. One outline (TC-03 / AC-06) could not be live-reproduced this session due to an environment/tooling limitation, not a product defect, and was covered instead by a closely-related substitute check that passed. One outline (TC-08) surfaced a non-blocking test-suite robustness gap, filed as an Improvement ([BK-542](https://jira.upexgalaxy.com/browse/BK-542)).

***Overall outcome******:*** No regression found in the 86 behaviour-neutral handlers. The one deliberate behavioural change (cookie-only lift on token issue/revoke) is proven correct, including verbatim pre-lift rejection messages and DB-confirmed no-op on both rejection paths. The Story ships GO-with-debt: one QA-process observation (AC-06 live-reproduction gap, already covered by the dev's own automated suite) and one non-blocking DX finding in the coverage-check test file.

### TEST CASES

| TC | Description | Status |
| --- | --- | --- |
| TC-01 | AC-04 — `atc:read`-only PAT rejected creating an invite (403, no invite created) | PASSED |
| TC-02 | AC-05 — `atc:write`+`run:execute` PAT (no admin) rejected revoking an invite (403, invite unchanged) | PASSED |
| TC-03 | AC-06 — admin-scoped PAT with no resolvable workspace context rejected on a workspace-admin action | ***BLOCKED*** — see Observations. Substitute check (cross-workspace admin PAT rejection) run instead: PASSED |
| TC-04 | Positive control — correctly-scoped, workspace-bound admin PAT → `PATCH /workspaces/{id}` → 200 (also smoke) | PASSED |
| TC-05 | BVA — `withApiHandler` compile-time rejection: missing `auth` entirely / empty `{}` options (sub-case TC-05b) | PASSED |
| TC-06 | BVA — `requires: []` (empty capability array) compile-time rejection | PASSED |
| TC-07 | BVA — invalid capability literal compile-time rejection | PASSED |
| TC-08 | `route-capability-coverage.test.ts` crashes with an unhandled error (not a graceful per-handler failure) on a route with `auth` options fully omitted | ***FAILED*** — non-blocking, Severity Minor. Filed as [BK-542](https://jira.upexgalaxy.com/browse/BK-542), see Bugs Found |
| TC-09 | Baseline run of the unmodified coverage-check suite against all 87 real handlers (6 pass / 0 fail / 82 assertions) | PASSED |
| TC-10 | Cookie-only lift — Bearer PAT rejected issuing a token (403, verbatim pre-lift message, 0 rows created) | PASSED |
| TC-11 | Cookie-only lift — Bearer PAT rejected revoking a token (403, verbatim pre-lift message, target token unrevoked) | PASSED |
| TC-12 | Cookie-only lift — Bearer PAT allowed to list tokens (read-only, unaffected by the lift) (also smoke) | PASSED |
| TC-13 | Cookie-only lift — session cookie issues / lists / revokes tokens (201 / 200 / 204) (also smoke) | PASSED |
| TC-14 | Manual smoke — issue a PAT from Settings (UI) | PASSED |
| TC-15 | Manual smoke — revoke a PAT from Settings (UI); revoked token confirmed rejected via API (401) | PASSED |
| TC-16 | Error Guessing — invalid/garbage Bearer token returns 401 (identity resolution), not 403 (posture check) — proves auth-resolution ordering | PASSED |
| TC-17 | Error Guessing — spot-check across `public` / `authenticated` / `required:atc:read` postures not otherwise exercised | PASSED |

### TEST DATA

- PAT: `atc:read`-only (TC-01), revoked at cleanup
- PAT: `atc:write`+`run:execute`, no admin (TC-02), revoked at cleanup
- PAT: `workspace:admin`, bound to `BK-264 QA Sandbox` (TC-03 substitute / TC-04), revoked at cleanup
- PAT: `bk497-manual-smoke-tc14` (TC-14/15, manual UI smoke), self-revoked as part of the test
- Workspace: `BK-264 QA Sandbox` (`6646f244-a28c-441e-8486-9af33bdb5c11`)
- Pending invite created and revoked for TC-02's precondition

### BUGS FOUND

- None classified as Bug or Defect. One Improvement filed (non-blocking, does not gate this Story's sign-off): [BK-542: PAT/API Auth: route-capability-coverage.test.ts crashes ungracefully when auth options are fully omitted](https://jira.upexgalaxy.com/browse/BK-542) — Severity Minor.

### OBSERVATIONS

1. ***TC-03 (AC-06) — environment/tooling limitation, not a product defect.**** The exact precondition (a `workspace:admin`-scoped PAT with ****no resolvable workspace binding***) could not be reproduced live this session: issuance of such a token is blocked by design (`assertTokenIssuanceAuthorized`, BK-135/ADR-0005's own closed gap), the QA DB role is strictly read-only (cannot simulate the legacy state by nulling a token's `workspace_id`), the 10 live legacy candidates found on staging only store a SHA-256 hash (never the raw secret, so unusable to authenticate), and the fallback path (mint bound, then remove the caller's own membership) is blocked server-side because the caller is the workspace's sole owner, with no alternate non-owner admin identity available among the configured `.env` accounts. A closely-related branch of the same guard function (`assertWorkspaceContext`) was exercised instead and passed: an admin-scoped PAT bound to one workspace, used against a different workspace, was correctly rejected (403, "This token is scoped to a different workspace."). This is a live-reproduction gap for this QA pass only — AC-06's exact scenario is already covered by the dev's own automated `workspace-context` suite (0 skips, confirmed in the dev's Jira evidence). Recommend a scoped DB-write QA role or a dedicated non-owner admin seed account with 2+ workspace memberships if this precondition needs live regression coverage again.
2. ***Compile-time property has no dedicated regression test today.*** The Story's headline property — "a route with no declared posture fails to compile" — was verified live this session via a scratch `tsc --noEmit` fixture (not committed), per an explicit QA-owner decision, since no Jira AC covers it and the team deliberately did not invent one during delivery. Recommend (non-blocking) a committed type-only test (`tsd` / `expectTypeOf`) so this property is regression-protected going forward without relying on a manual QA pass.
3. Full regression posture unaffected: dev's own evidence (1555 pass / 1 fail — the 1 failure pre-existing/unrelated to this Story, BK-34) plus this session's independent execution found zero regressions across the 86 behaviour-neutral handlers.

### RECOMMENDATIONS

- Automate the `cookie-only` lift proof (TC-10/TC-11/TC-13) and the auth-resolution-ordering check (TC-16) as regression ATCs — both are cheap, deterministic, and protect a real behavioural change.
- Consider the committed type-only test suggested in Observations #2 to lock in the compile-time posture-mandatory property.
- Track the Improvement filed for TC-08 (coverage-check crash-vs-graceful-failure) as low-priority follow-up; not a blocker to this Story's release.

---
_Synced from Jira by sync-jira-issues_
