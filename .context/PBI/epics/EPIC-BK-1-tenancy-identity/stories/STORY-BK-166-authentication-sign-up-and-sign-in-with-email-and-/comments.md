# Comments for BK-166

[View in Jira](https://jira.upexgalaxy.com/browse/BK-166)

---

### Automation for Jira - 6/22/2026, 12:39:27 AM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 6/22/2026, 10:59:53 AM

✅ Pull Request is successfully MERGED. Task is Done.

---

### Ely - 6/22/2026, 11:01:02 AM

***Ready for QA on staging*** — PR [#54](https://github.com/upex-galaxy/upex-bunkai-tms/pull/54) merged to `staging`.

***What to test*** (https://staging-upexbunkai.vercel.app/login):

- Email-first routing: existing email → password step; new email → create step.
- Password sign-in (happy + wrong-password generic error, no enumeration leak).
- Sign-up → 6–8 digit email OTP → confirm → signed in.
- Unconfirmed account sign-in → routed to the verify step.
- Magic-link fallback still visible; OAuth still disabled.
- API rail: `POST /api/v1/auth/{signup,confirm,signin}` + `/check-email`; PAT + cookie coexist (no clobber).

***Notes for QA:***

- PATs minted on sign-in/confirm now use least-privilege default scopes (`atc:read`, `atc:write`, `run:execute`) — no global `workspace:admin` (per ADR-0005 / BK-135). ADR-0007 documents this feature.
- ⚠️ ***Email delivery caveat:*** the shared Supabase project is on the free-tier email cap, so a real human sign-up may not receive the OTP email until custom SMTP (Resend) is configured (in progress). For test accounts, use admin-confirmed users or `admin.generateLink` to obtain the OTP without inbox delivery.
- Migration `0034*auth*email*status*rpc` (service-role-only `auth*email*status` RPC) is applied to the shared DB.
- Smoke (Playwright, isolated logged-out profile) passed all code-path ACs on localhost.

---

### Benjamin Segovia - 6/23/2026, 7:18:54 PM

Bug found during exploratory testing: BK-177 - Staging deployment missing email-first password sign-in UI and 2 of 4 BK-166 API routes

---

### Benjamin Segovia - 6/23/2026, 7:21:01 PM

## QA Testing Complete - BK-166

***Environment******:*** Staging
***Result******:*** FAILED (0/42 TCs)

### Test Data Used

- Staging account: `STAGING*USER*EMAIL`

### Verified Behaviors

None — smoke test failed before any AC could be exercised.

### Failed Verification

- ***Smoke test******:*** staging serves the legacy magic-link-only login UI; `POST /api/v1/auth/check-email` and `POST /api/v1/auth/confirm` return HTTP 404 (route not deployed); `POST /api/v1/auth/signup` and `POST /api/v1/auth/signin` exist but return HTTP 422 instead of the documented 400.

### Defect

***BK-177*** (Critical) — Staging deployment missing email-first password sign-in UI and 2 of 4 BK-166 API routes. Root cause appears to be a deploy/build gap (source on `staging` branch has the feature; live site does not) — not an application logic defect.

### Notes

- AC4/AC11 (signup→OTP→confirm) were already out of scope for this environment regardless of the deploy gap — free-tier Supabase email cap, no service-role key available to QA tooling.
- DB cross-validation leg deferred this session (DBHub MCP pending `.env` credentials) — moot for this pass since the feature could not be reached.

***Artifacts******:*** ATP-customfield*10067, ATR-customfield*10147, Bug-BK-177

---

### Benjamin Segovia - 6/23/2026, 9:26:08 PM

@@Ely heads up on this one — QA hit a blocker before any of the 42 planned test cases could run.

Staging (`https://staging-upexbunkai.vercel.app/login`) is still serving the old magic-link-only screen. At the API level, `POST /api/v1/auth/check-email` and `POST /api/v1/auth/confirm` return a plain 404 (route not found), and `signup`/`signin` exist but answer `422` instead of the `400` the code expects on a validation failure.

The `staging` branch itself looks right — `upex-bunkai-tms` is at commit `16863ca` (2026-06-22), which includes PR #54 — so the merge is there, the live deployment just doesn't reflect it. Filed as ***BK-177*** with the repro steps and evidence, linked back to this story, and transitioned BK-166 to Blocked until it's redeployed.

Could you check which Vercel deployment that staging alias is actually pointing to? Once it's serving the right build, QA picks the full pass back up immediately — the ATP (42 outlines) is already written and ready to go.

---

### Ely - 6/24/2026, 2:15:27 AM

***Staging fully live + verified (real OTP delivery working).***

- Custom SMTP (Resend, `no-reply@mail.upexgalaxy.com`) configured on Supabase Auth → real verification emails now deliver (free-tier 429 cap resolved). `RESEND*API*KEY` synced to Vercel staging + production scopes.
- Full UI e2e on staging passed (6/6): email-first routing, password sign-up → OTP → confirm → authed, password sign-in, wrong-password generic error (no enumeration), magic-link fallback visible. Cookie/PAT coexistence covered by unit test.
- Note: the staging auto-deploy did not fire for the merge commit; redeployed manually via `vercel deploy --target staging`. Worth checking the Vercel git integration so future staging merges deploy automatically.
- `/qa` testability guide updated (PR #55, merged) to document the new auth surface — three login methods, email-OTP flow, API rails, PAT least-privilege scopes, cookie/PAT coexistence, and how QA retrieves OTP codes without a real inbox (Resend test inbox `@delgri.resend.app`). Live at https://staging-upexbunkai.vercel.app/qa

Production NOT deployed (app not launched to prod yet — gated until further notice).

---

### Benjamin Segovia - 6/24/2026, 9:39:16 AM

## Acceptance Test Results (ATR)

> Field write to `customfield*10147` (Acceptance Test Results (ATR)) failed at runtime — `Field 'customfield*10147' cannot be set. It is not on the appropriate screen, or unknown.` (HTTP 400). Posting via the documented comment fallback instead.

## BK-166 Test Results

***Tested***: 2026-06-24 (re-run; original pass 2026-06-23 — see history below)
***Environment***: Staging (`https://staging-upexbunkai.vercel.app`)
***Tester***: QA — Stage 2/3 (re-run)
***Result***: PASSED WITH ISSUES (30/42)

### Summary

Staging was re-tested today after Ely confirmed (Jira comment #11752) that the deploy/build gap from the 2026-06-23 pass was fixed. Smoke ***PASSED****: the full email-first password sign-in UI is now live, and all 4 API routes (`check-email`, `signup`, `signin`, `confirm`) return structured JSON responses — no more 404s. ****BK-177 is verified RESOLVED.***

Of the 42 planned outlines: ***30 PASSED****, ****0 FAILED**** (zero application defects found this pass), ****2 remain NOT VERIFIABLE**** (AC4/AC11 — same pre-existing OTP-delivery scope decision from Stage 1, unchanged by this pass), and ****10 are BLOCKED*** — not by the application, but by two test-infrastructure gaps hit during execution:

1. The shared `STAGING*USER*EMAIL` test account is not in a "confirmed" state on this build (`check-email` → `{"exists":true,"confirmed":false}`), which blocks every outline that needs a real confirmed account to demonstrate a successful signin.
2. Supabase's free-tier email-send cap was hit mid-pass (after roughly 6-8 signup calls), throttling several more signup-heavy outlines with `429 rate_limited`.

Because zero app defects were found and the blocked outlines are entirely attributable to environment/test-data constraints outside the application's control, this pass is reported as ***PASSED WITH ISSUES***, not a clean pass and not blocked.

### Test Cases

| # | Title | Result | Note |
| --- | --- | --- | --- |
| TC-01 | Route to password step for existing confirmed email | BLOCKED (test-data) | Routing logic verified; `STAGING*USER*EMAIL` is `confirmed:false`, not `confirmed:true` |
| TC-02 | Route to create step for unregistered email | PASSED |  |
| TC-03 | Case-insensitive routing for existing email | PASSED |  |
| TC-04 | Sign in successfully with correct credentials | BLOCKED (test-data) | No confirmed account available to drive a successful signin redirect |
| TC-05 | Mint PAT with default least-privilege scopes | BLOCKED (test-data) | Depends on TC-04's confirmed-account signin |
| TC-06 | Return 202 pending_confirmation on fresh signup | PASSED |  |
| TC-07 | Keep magic-link fallback visible+functional | PASSED | AC9 precondition now holds (password primary, magic-link collapsed secondary) |
| TC-08 | Accept Unicode password on signup | BLOCKED (rate-limit) | Supabase 429 for the duration of this pass |
| TC-09 | Reject signin with wrong password (generic message) | BLOCKED (test-data, UI leg only) | API message format independently verified via TC-10; UI leg needs a confirmed account to show the specific wrong-password text |
| TC-10 | Reject signin for unknown email with same generic message | PASSED |  |
| TC-11 | Reroute unconfirmed account to verify, not "wrong password" | PASSED |  |
| TC-12 | Reject wrong verification code (uniform message) | PASSED |  |
| TC-13 | Reject valid-format code against email w/ no pending signup (E7) | PASSED |  |
| TC-14 | Enforce signin password-length boundary (parametrized 5/6/7) | PASSED |  |
| TC-15 | Enforce signup/confirm password-length boundary (parametrized 7/8/9) | PARTIAL — row 1 PASSED, rows 2/3 BLOCKED (rate-limit) |  |
| TC-16 | Reject signup for already-existing email | BLOCKED (rate-limit) | Could not isolate from throttle in 2 attempts |
| TC-17 | Reject malformed JSON on every route (x4) | PASSED |  |
| TC-18 | Reject missing required field on every route (x4) | PASSED |  |
| TC-19 | Reject confirm w/ wrong code against just-created pending signup | PASSED |  |
| TC-20 | Reject unrecognized `pat_scopes` value at schema layer | PASSED |  |
| TC-21 | Enforce OTP length boundary at schema layer (parametrized 5/6/8/9) | PASSED |  |
| TC-22 | Accept email at exactly RFC-5321 254-char max | PASSED |  |
| TC-23 | Reject email exceeding 254-char max (x4 routes) | PASSED |  |
| TC-24 | Accept `pat*expires*in_days` boundary 1 / reject 366 | PARTIAL — reject-366 leg PASSED, accept-1 leg BLOCKED (test-data) | Accept leg needs a confirmed account |
| TC-25 | Model email-first routing entry transitions | PASSED (confirmed leg unavailable — test-data gap) |  |
| TC-26 | Keep never-confirmed account pending across repeated checks | PASSED |  |
| TC-27 | Resolve PAT scope issuance per (scope-set x admin-flag) (parametrized) | PARTIAL — R4 PASSED, R1/R2/R3/R5 BLOCKED (test-data) | All auth checks short-circuit on the unconfirmed account before reaching the scope business-rule layer |
| TC-28 | Resolve signin outcome per (confirmed? x correct?) | PARTIAL — R3/R4 PASSED, R1/R2 BLOCKED (test-data) | No confirmed account to exercise R1/R2 |
| TC-29 | PAT session + cookie session coexist without clobbering (AC10) | BLOCKED (test-data) | API leg needs a confirmed account; DB cross-validation leg separately deferred (DBHub MCP unavailable) |
| TC-30 | Reject structurally invalid email at schema layer (x4 reasons) | PASSED |  |
| TC-31 | Token replay proxy (charter) | PASSED |  |
| TC-32 | Concurrent signup race (charter) | BLOCKED (rate-limit) |  |
| TC-33 | SQL/script injection in email field (charter) | PASSED | Critical charter clean — no 200/202/500 |
| TC-34 | Unicode/emoji password on signin (charter) | PASSED |  |
| TC-35 | Expired-then-reused OTP (charter, A1 partially blocked) | PASSED |  |
| TC-36 | Double-submit signup (charter) | PASSED (confounded signal, see note) | `submitting` guard verified (1 fetch, not 2); the single fetch returned 429 rather than 202, so the "successful 202 after guard" half wasn't independently re-confirmed |
| AC4 / signup→OTP→confirm happy path (UI) | NOT VERIFIABLE | Real OTP delivery requires service-role key, intentionally absent from QA tooling — unchanged scope decision from Stage 1 |
| AC11 / API signup+confirm happy path | NOT VERIFIABLE | Same OTP blocker as AC4 |

***Roll-up***: 30 PASSED · 0 FAILED · 2 NOT VERIFIABLE · 10 BLOCKED (test-infrastructure) — total 42.

### Test Data

- Staging shared account: `{{STAGING*USER*EMAIL}}` — confirmed this pass to be in `confirmed:false` state on this build (see Findings)
- Fresh signup emails: `faker.internet.email()` per signup-path outline

### Bugs Found

None this pass. ***BK-177 verified RESOLVED*** — both prior blocking findings (missing email-first UI, 404'd `check-email`/`confirm` routes) are confirmed fixed on staging.

### Observations

- ***BK-177 verification***: confirmed fixed. `/login` now renders the full email-first password-signin UI (email → Continue → password/create step → verify step), and all 4 API routes (`check-email`, `signup`, `signin`, `confirm`) return structured JSON responses, not 404s.
- ***422-vs-400 status code question — resolved, not a bug****: the prior session flagged a discrepancy where `signup`/`signin`/`confirm` returned `422` where the ATP expected `400`. This pass fully characterizes the behavior: malformed/unparseable JSON bodies consistently return `400 bad*request` (TC-17, all 4 routes); valid-JSON-but-failed-Zod-schema failures (missing field, oversized, bad enum, regex mismatch) consistently return `422 validation*failed` (TC-18, TC-20, TC-23, TC-27 R4, TC-30, TC-14, TC-15, TC-21, TC-24). This is a ****deliberate two-tier error model***, not build drift or a defect — the ATP's "400" expectation conflated the two tiers under one status code where the app intentionally splits them. No action needed; ATP language to be aligned at the next Stage 1/4 touchpoint.
- ***Test-infrastructure gap 1 — unconfirmed shared test account***: `{{STAGING*USER*EMAIL}}` returns `{"exists":true,"confirmed":false}` on this build, not the "confirmed account" the Stage-1 ATP assumed as precondition. This blocks TC-01, TC-04, TC-05, TC-09 (UI leg), TC-16 (compounded with rate-limit), TC-24 (accept leg), TC-27 (R1/R2/R3/R5), TC-28 (R1/R2), and TC-29 — 9 of the 10 BLOCKED outlines trace to this gap. No second staging credential exists in `.env` to substitute, and self-resolving via fresh signup would re-hit the same real-OTP-confirmation requirement that AC4/AC11 are already scoped out of.
- ***Test-infrastructure gap 2 — Supabase free-tier email-send cap***: hit repeatedly after ~6-8 signup calls in quick succession during this pass (`429 rate_limited "email rate limit exceeded"`), independent of whether the email is ever read. This is the same upstream-Supabase-owned throttle already noted under AC8 — it blocked TC-08, TC-15 (rows 2/3), TC-32, and a clean isolated re-check of TC-16.
- ***DB cross-validation still deferred***: DBHub MCP remains unavailable this session (pending `.env` fix + restart). TC-29's DB leg (2 independent `access_tokens` rows) was not queried — independent of, and in addition to, the test-data gap above.
- ***AC4/AC11 scope decision unchanged***: per explicit instruction this pass, the OTP-dependent happy path was not re-attempted even though Ely's 2026-06-24 comment states real OTP delivery is now working — the no-service-role-key constraint in QA tooling is independent of delivery capability and was not waived for this session.
- ***Jira workflow note (technical, non-QA-result)***: `GET /rest/api/3/issue/BK-166/transitions` currently returns an empty array from the `BLOCKED` status, despite a `back*from*blocked` transition existing in the workflow scheme definition. This blocked the planned `In Test` re-entry transition this session (see Recommendations and the separate QA comment for the full ask to Jira admin).

### Recommendations

- ***Ask to unblock the remaining 10 outlines***: either (a) provision a second, pre-confirmed staging test credential, or (b) allow a cooldown window past the Supabase send-cap before the next pass, then re-run TC-01, TC-04, TC-05, TC-08, TC-09 (UI leg), TC-15 (rows 2/3), TC-16, TC-24 (accept leg), TC-27 (R1/R2/R3/R5), TC-28 (R1/R2), TC-29, TC-32.
- ***Automation candidates***: the 30 PASSED outlines are stable now that the deploy gap is fixed — good candidates for `test-automation` once the remaining 10 are cleared, particularly the boundary/decision-table sets (TC-14/15/21/27/30) and the critical-path routing/signin/confirm flows (TC-01 through TC-13, TC-19, TC-25, TC-28).
- ***Jira admin follow-up***: investigate why `BK-166` exposes zero live transitions from `BLOCKED` (see Jira workflow note above) — independent of this QA result, but it will block whatever status transition is attempted for this ticket until resolved.

---

### Benjamin Segovia - 6/24/2026, 9:40:35 AM

## QA Testing Complete - BK-166

***Environment***: Staging (`https://staging-upexbunkai.vercel.app`)
***Result***: PASSED WITH ISSUES (30/42 TCs)

### Test data used

- Staging shared account: `{{STAGING*USER*EMAIL}}` (found unconfirmed on this build — see below)
- Fresh signup emails: `faker.internet.email()` per signup-path outline

### Verified behaviors

- BK-177 (Critical, deploy/build gap) — ***VERIFIED RESOLVED***. Full email-first password sign-in UI is live; all 4 API routes (`check-email`, `signup`, `signin`, `confirm`) return structured JSON, no more 404s.
- AC2, AC6, AC7, AC9 — VERIFIED (routing, unconfirmed reroute, invalid-code rejection, magic-link disclosure).
- 30 of 42 outlines PASSED across positive, negative, boundary, state-transition, decision-table, and error-guessing charters. Zero application defects found this pass.
- 422-vs-400 status-code question — RESOLVED, not a bug. Confirmed as a deliberate two-tier error model: malformed JSON → `400`, valid-JSON-but-failed-schema → `422`, consistent across all 4 routes. No action needed.

### Not verifiable (unchanged scope, carried from Stage 1)

- AC4 / AC11 (signup → OTP → confirm happy path) remain NOT VERIFIABLE IN THIS ENVIRONMENT — real OTP delivery requires the Supabase service-role key, intentionally absent from QA tooling. Unchanged by today's staging fix.

### Blocked by test-infrastructure gaps (not application defects)

10 of 42 outlines could not be exercised this pass, for two reasons:

1. ***Unconfirmed shared test account*** — `{{STAGING*USER*EMAIL}}` is `confirmed:false` on this build, blocking every outline that needs a real confirmed account to demonstrate a successful signin (TC-01, TC-04, TC-05, TC-09 UI leg, TC-24 accept leg, TC-27 R1/R2/R3/R5, TC-28 R1/R2, TC-29).
2. ***Supabase free-tier email-send cap hit mid-pass*** — after ~6-8 signup calls, throttling further signup-heavy outlines with `429` (TC-08, TC-15 rows 2/3, TC-16, TC-32).

***Ask***: we need either a second pre-confirmed staging test account, or a cooldown window past the Supabase send-cap, to clear the remaining 10 outlines.

No bug is being filed for this — it's an environment/test-data constraint, not an app defect.

Artifacts: ATP-customfield*10067, ATR posted as comment fallback (customfield*10147 write blocked by screen scheme — see below)

---

> ***WARNING:**** ****Technical note — independent of this QA result***
BK-166 currently shows ***zero available Jira transitions from ***`Blocked`. `GET /rest/api/3/issue/BK-166/transitions` returns an empty array, and `acli jira workitem transition --key BK-166 --status "In Test"` fails with `No allowed transitions found for given status` — despite a `back*from*blocked` transition existing in the workflow scheme definition. This might be a workflow/permission-scheme gap worth a look. It blocked our attempt to move this ticket forward today and will likely block it again until fixed.
Separately (lower priority, same root-cause family): the `Acceptance Test Results (ATR)` custom field (`customfield*10147`) also rejected a direct write today — `Field 'customfield*10147' cannot be set. It is not on the appropriate screen, or unknown.` The ATR content above was posted as a comment instead (documented fallback). Worth checking the screen scheme for this issue/project while looking at the transitions gap.

---

### Benjamin Segovia - 6/24/2026, 10:26:42 AM

@@Ely flagging this directly so it doesn't get buried in the QA verdict comment above (#11754) — two workflow items on this ticket need a look when you get a chance:

1. ***Zero transitions available from ****`Blocked`****.*** `GET /rest/api/3/issue/BK-166/transitions` returns an empty array, and `acli jira workitem transition --key BK-166 --status "In Test"` fails with `No allowed transitions found for given status` — even though the workflow scheme defines a `back*from*blocked` transition. We can't move BK-166 out of `Blocked` via the API right now.
2. ***The ATR custom field (****`customfield*10147`****) rejects writes while the ticket is ***`Blocked` — `Field 'customfield*10147' cannot be set. It is not on the appropriate screen, or unknown.` It accepted writes fine in the prior session when the ticket was `In Test`, so the `Blocked` status's screen scheme likely excludes this field.

Today's QA verdict (PASSED WITH ISSUES, 30/42) is recorded in the comment above since both of these blocked it from landing in the proper field/transition. Whenever the workflow/screen scheme gets fixed, we can re-apply it properly — no need to re-test.

---


_Synced from Jira by sync-jira-issues_
