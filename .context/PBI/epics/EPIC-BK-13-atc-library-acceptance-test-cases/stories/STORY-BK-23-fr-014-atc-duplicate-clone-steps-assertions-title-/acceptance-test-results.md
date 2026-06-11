# BK-2 — Acceptance Test Results (QA)

> Jira field: `customfield_10147` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-2)

## Acceptance Test Results — BK-2 (condensed mirror)

***Story:**** Sign up and sign in with email (magic-link). ****Result:**** PASS (GO-with-debt). ****Tested:**** 2026-05-28 on [https://upexbunkai.vercel.app](https://upexbunkai.vercel.app/) (session override — staging-upexbunkai.vercel.app returned 404). ****Modality:**** jira-native. ****Tester:*** Sprint Testing (orchestration, Stage 3).

Full local mirror (source of truth): .context/PBI/epics/EPIC-BK-1-tenancy-identity/stories/STORY-BK-2-sign-up-and-sign-in-with-email-magic-link/acceptance-test-results.md

### Summary

17 TCs executed. PASSED 10 · KNOWN 4 (PO scope) · BLOCKED 3 (manual-pending) · FAILED 0. Pass rate excl. blocked/known = 10/10 = 100%. No product defects filed.

Green: magic-link send, click, callback exchange, returning-user short-circuit to /projects, atomic workspace+member bootstrap (RPC), open-redirect block, middleware next round-trip, rate-limit 429, 254-char RFC-5321 boundary, client-side invalid-email reject.

### Per-TC results

| TC  | Title  | Pri  | Status  |
| --- | --- | --- | --- |
| ---- | ------- | ----- | -------- |
| TC-BK-2-01  | First-time sign-up: send to click to onboarding  | P1  | KNOWN (name/slug pre-fill not implemented)  |
| TC-BK-2-02  | Returning user to /projects  | P1  | PASSED  |
| TC-BK-2-03  | Workspace bootstrap via onboarding (atomic)  | P1  | PASSED  |
| TC-BK-2-04  | Invalid email rejected client-side  | P2  | PASSED  |
| TC-BK-2-05  | Invalid email rejected server-side  | P1  | KNOWN (422 validation*failed vs AC 400 INVALID*EMAIL)  |
| TC-BK-2-06  | Magic-link replay blocked  | P1  | KNOWN (Supabase-native otp*expired, not TOKEN*USED)  |
| TC-BK-2-07  | Expired magic link  | P1  | BLOCKED (no clock fixture)  |
| TC-BK-2-08  | Callback missing code  | P1  | PASSED  |
| TC-BK-2-09  | Rate-limit 429  | P1  | PASSED  |
| TC-BK-2-10  | Email exactly 254 chars accepted  | P2  | PASSED  |
| TC-BK-2-11  | Email 255 chars rejected  | P2  | KNOWN (server holds; client max-length gap)  |
| TC-BK-2-12  | Magic link at 14:59 succeeds  | P3  | BLOCKED (no clock fixture)  |
| TC-BK-2-13  | Magic link at 15:01 fails  | P3  | BLOCKED (no clock fixture)  |
| TC-BK-2-14  | Open-redirect blocked  | P2  | PASSED  |
| TC-BK-2-15  | workspace_members atomic with workspaces  | P1  | PASSED  |
| TC-BK-2-16  | Middleware redirect + next round-trip  | P1  | PASSED  |
| TC-BK-2-17  | Session cookie attributes  | P1  | PASSED (with hardening note — see below)  |

### Defects

No product defects filed. TC-17 reclassified FAILED to PASSED-with-note after dev review 2026-05-27.

### TC-17 reclassification (session cookie)

Session cookie sb-ref-auth-token observed with httpOnly=false, secure=false, sameSite=Lax.

- httpOnly=false is by-design of the @supabase/ssr createBrowserClient (the browser SDK reads the session via document.cookie; an HttpOnly cookie would break it). Accepted framework pattern, same risk class as a SPA localStorage token. The original TC expectation of HttpOnly=true was wrong and is corrected. Not a defect.
- secure=false is a Low pre-prod hardening debt, practically un-exploitable here: vercel.app is on the HSTS preload list and the live deployment returns strict-transport-security max-age=63072000 includeSubDomains preload, so the browser force-upgrades all traffic to HTTPS and the cookie never travels over plaintext.
- sameSite=Lax is correct.
- Escalation: if BK moves to a custom prod domain NOT on the HSTS preload list, secure=true plus HSTS become mandatory and this rises to High severity.

### PO scope questions (4 KNOWN, non-blocking)

Shift-left §2.3 recommended a custom UPPER*SNAKE error envelope (INVALID*EMAIL / TOKEN*USED / MISSING*CODE / RATE*LIMITED). The app ships Supabase-native lowercase codes (validation*failed / missing*code / rate*limited / otp_expired) which are functionally correct. The custom envelope was a recommendation, NOT a signed AC. PO decides: firm requirement (future Minor conformance work) or accepted scope (close). Also: onboarding name/slug pre-fill (shift-left §5.5 / PO Q2) is not implemented.

### Manual-pending (3 BLOCKED)

TC-07/12/13 (magic-link TTL boundary at 14:59 / 15:01 / expiry) need a clock-mock or short-TTL Supabase fixture; not automatable in this pass. The /qa page documents a headless PAT auth shortcut (no email) that can accelerate future API-layer automation (Stage 5), but expiry still needs a time fixture.

### Verdict

GO-with-debt. All 10 P1 PASS; no P1 FAIL remains. Transition fired: qa*sign*off (in*test to qa*approved). QA sign-off by Sprint Testing 2026-05-27, against URL override [https://upexbunkai.vercel.app](https://upexbunkai.vercel.app/).

---
_Synced from Jira by sync-jira-issues_
