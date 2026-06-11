# BK-2 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-2)

# Acceptance Test Plan — BK-2

***Story:*** Sign up and sign in with email (magic-link)
***Jira:*** [BK-2](https://jira.upexgalaxy.com/browse/BK-2)
***Epic:*** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) — Tenancy & Identity
***Sprint:*** Bunkai (67) Sprint 1 (active, 2026-05-11 → 2026-06-08)
***TMS Modality:*** `jira-native` (no Xray) — user-confirmed 2026-05-27
***Environment:*** `staging`
***Web URL:*** `https://staging-upexbunkai.vercel.app`
***API URL:*** `https://staging-upexbunkai.vercel.app/api`
***Drafted on:*** 2026-05-27
***Drafter:*** Sprint Testing (orchestration mode, Stage 1)
***Source ATP DRAFT:*** `shift-left-refinement.md` §6 (17 outline TCs, promoted to draft here)

---

## 1. Scope

### IN — must verify as part of BK-2 (quoted from shift-left §8)

- Magic-link send via `/api/v1/auth/magic-link` (exists).
- Magic-link callback at `/auth/callback` (exists, needs error-code mapping refactor).
- Redirect chain `callback → /onboarding → (guard) → /projects | form` (needs callback change).
- Onboarding form with pre-filled name + slug suggestions (form exists, needs pre-fill).
- Bootstrap RPC `bunkai*bootstrap*workspace` (exists, no change).
- Specific error codes (`INVALID*EMAIL`, `TOKEN*USED`, `TOKEN*EXPIRED`, `MISSING*CODE`, `RATE*LIMITED`, `UPSTREAM*ERROR`) (needs implementation).
- RFC 5321 254-char enforcement client + server (shipped 2026-05-27 commit `69669d2`).
- Open-redirect guard on `next` param (already in callback).
- UX 5.1 (resend cooldown 60s), 5.3 (contextual error banners), 5.5 (onboarding pre-fill), 5.7 (a11y focus + aria).
- Ops checklist: confirm Supabase `auth.otp_exp = 900` on testing + staging + production projects.

### OUT — deferred to other Stories or follow-up polish (quoted from shift-left §8)

- OAuth (GitHub / Google) — BK-3.
- Invite acceptance flow + bypass branch — BK-5.
- Workspace switching — [https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6](https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6).
- Multiple workspaces per user — [https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6](https://jira.upexgalaxy.com/browse/BK-6#icft=BK-6).
- UX 5.2 (provider deep-links), 5.4 (email memory), 5.6 (welcome toast), 5.9 (branded email template) — follow-up "Auth UX Polish" Story.
- Token-invalidation-on-resend (security upgrade B) — separate Story if PO greenlights it.
- Self-hosted instance card behavior — out of MVP unless wired.
- Branded magic-link email template — separate ops Story.

---

## 2. Risk + Triage verdict

***Verdict: FORCE-FULL retest.*** No scope-cut possible. Auth surfaces bypass risk-score per sprint-testing veto rules.

| Trigger  | Active?  | Why  |
| --- | --- | --- |
| --------- | --------- | ----- |
| Money / billing  | NO  | n/a  |
| Data integrity on core entities  | YES  | bootstrap RPC writes `workspaces` + `workspace_members` atomically  |
| Auth / authorization  | YES  | Supabase magic-link sign-up + sign-in is the entire surface  |
| External integration  | YES  | Supabase Auth + SMTP mailer  |
| Multi-tenancy seeding  | YES  | first workspace + first member row are seeded here  |
| State machine  | YES  | `auth.users` + `magic*link*tokens` lifecycle  |

Risk-score (informational only — veto wins): new feature (+3), dynamic data (+3), ACs present (+2), user-facing (+2), high effort (+2), multi-component (+1) = ***13 (HIGH)***.

***Formal blocked gate:*** `formal*blocked*gate: true` per `.agents/project.yaml` — Stage 3 FAILED Story dispatches `defect*reported` (in*test → blocked).

***Flag C carry-forward:*** dev comment 2026-05-27 says replay enforcement is Supabase-native (no custom `TOKEN*USED` envelope). `TC-OUT-NEG-03` keeps its expected `?error=TOKEN*USED` per shift-left §3 + adds an "Observed (Stage 2)" placeholder so Stage 2 can record divergence as gap-vs-bug.

---

## 3. Test environment

| Item  | Value  |
| --- | --- |
| ------ | ------- |
| Env  | `staging` (default per `.agents/project.yaml` `testing.default_env`)  |
| Web URL  | `https://staging-upexbunkai.vercel.app`  |
| API base  | `https://staging-upexbunkai.vercel.app/api`  |
| DB MCP  | `staging-dbhub`  |
| API MCP  | `staging-openapi`  |
| Inbox provider  | Resend CLI (`/resend-cli` skill — auth already active)  |
| Browser automation  | Playwright CLI (`/playwright-cli` skill)  |
| Credentials  | Read from `.env` only — `STAGING*USER*EMAIL`, `STAGING*USER*PASSWORD`, `RESEND*API*KEY`. Never hardcode.  |
| Magic-link TTL  | 15 min (Supabase `auth.otp_exp = 900` — ops-managed; verify in TC-OUT-BND-04)  |

---

## 4. Test data strategy

- ***Fresh email per scenario:*** mint via Resend CLI with deterministic slug prefix `qa-bk2-<scenario>-<ts>@<resend-domain>` (e.g. `qa-bk2-pos01-1716845000@…`). Keeps retries clean — Resend mailbox is per-address.
- ***No DB seeding required for happy paths:*** sign-up creates state. Returning-user test (TC-OUT-POS-02) reuses the first successful sign-up's mailbox.
- ***Boundary email strings:***

- 254-char valid: build a local-part of `'a' × 240 + '@bunkai.test'` (length = 252) and pad to exactly 254.
- 255-char invalid: add one extra char to the above.

- ***Workspace slug strategy for bootstrap tests:*** use `qa-bk2-<scenario>-<ts>` to avoid collisions across retries.
- ***Cleanup:*** Stage 2 leaves data in place during the session for traceability; cleanup queries (DELETE FROM auth.users WHERE email LIKE 'qa-bk2-%') queued for end of run if owner approves.

---

## 5. Test cases

> 17 draft TCs promoted from outlines. Each block references its source AC scenario from `shift-left-refinement.md` §3 and notes the layer + priority + tool.
> ***Layer breakdown:**** UI = 5, API = 4, DB = 1, UI+API = 5, UI+DB = 1, UI+API+DB = 1. ****Priority:*** P1 = 10, P2 = 5, P3 = 2.

### Positive (3)

#### TC-BK-2-01 — First-time sign-up: link send → click → land on onboarding form

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | UI+API+DB  |
| Priority  | P1  |
| Source AC  | shift-left §3 → Scenario "Successful first-time email magic-link sign-up"  |
| Tool  | `[AUTOMATION*TOOL]` Playwright CLI + `resend` CLI + `[DB*TOOL]` DBHub MCP  |
| Preconditions  | Fresh email `qa-bk2-pos01-<ts>@<resend-domain>` not in `auth.users`. Supabase `auth.otp_exp = 900`.  |
| Test data shape  | one fresh email; expect one magic-link email to arrive within 30s  |
| Steps  | 1. Open `/login`. 2. Enter email, click "Send magic link". 3. Assert "Check your inbox" UI state. 4. Poll Resend inbox for email subject "Sign in to Bunkai" (timeout 30s). 5. Extract `?code=...` from email body. 6. Hit `/auth/callback?code=...`. 7. Follow redirect chain.  |
| Expected  | POST `/api/v1/auth/magic-link` → 200 `{ok:true`}. Email arrives <30s. Callback exchange succeeds → session cookie set → redirect to `/onboarding` → form rendered with workspace-name pre-filled `"qa-bk2-pos01-<ts>'s workspace"` and slug pre-filled `qa-bk2-pos01-<ts>s-workspace`.  |
| Notes  | If pre-fill is missing → flag as gap (PO Q2) not bug. Magic-link form is the Suspense-wrapped client form at `app/(auth)/login/magic-link-form.tsx`.  |

#### TC-BK-2-02 — Returning user with existing workspace: link → straight to /projects

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | UI+API  |
| Priority  | P1  |
| Source AC  | shift-left §3 → Scenario "Successful returning-user sign-in (workspace exists)"  |
| Tool  | `[AUTOMATION_TOOL]` Playwright CLI + `resend` CLI  |
| Preconditions  | User exists in `auth.users` AND has ≥1 row in `workspace_members` with `status='active'`. Reuse `qa-bk2-pos01-<ts>` mailbox after running TC-BK-2-01 to completion (workspace bootstrapped).  |
| Test data shape  | reused email from TC-BK-2-01 happy completion  |
| Steps  | 1. Sign out (clear session cookie). 2. Open `/login`. 3. Submit same email. 4. Poll inbox for fresh magic link. 5. Click link / hit `/auth/callback?code=...`. 6. Observe redirect target.  |
| Expected  | `/auth/callback` exchanges code → redirects to `/onboarding` → guard short-circuits to `/projects` (because membership exists). User lands on `/projects` directly without seeing the create-workspace form.  |
| Notes  | Tests the `/onboarding` server-side guard branch. If user lands on the form despite having a workspace → bug.  |

#### TC-BK-2-03 — Workspace bootstrap via onboarding form succeeds (atomic insert)

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | UI+DB  |
| Priority  | P1  |
| Source AC  | shift-left §3 → Scenario "Successful first-time email magic-link sign-up" (final 3 Given/Then lines covering bootstrap RPC)  |
| Tool  | `[AUTOMATION*TOOL]` Playwright CLI + `[DB*TOOL]` DBHub MCP  |
| Preconditions  | Fresh user signed in (e.g. continuation of TC-BK-2-01) with no `workspace_members` rows.  |
| Test data shape  | accept the pre-filled name+slug suggestions  |
| Steps  | 1. On `/onboarding` form, accept pre-filled defaults. 2. Click "Create workspace". 3. Wait for redirect to `/projects`. 4. Query DB via DBHub: `SELECT ** FROM workspaces WHERE owner*user*id = '<new-user-id>'`. 5. Query DB: `SELECT ** FROM workspace*members WHERE user*id = '<new-user-id>'`.  |
| Expected  | RPC `bunkai*bootstrap*workspace` returns `workspace*id`. `workspaces` row exists with `owner*user*id` = the new user. `workspace*members` row exists with `role='owner'` AND `status='active'`. User redirected to `/projects`. Both inserts performed atomically (no partial state).  |
| Notes  | RPC is SECURITY DEFINER in `supabase/migrations/0006*bootstrap*workspace.sql`. Atomicity = no orphaned workspace row if member insert fails.  |

### Negative (6)

#### TC-BK-2-04 — Invalid email rejected client-side (button stays disabled)

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | UI  |
| Priority  | P2  |
| Source AC  | shift-left §3 → Scenario "Invalid email format rejected client-side"  |
| Tool  | `[AUTOMATION_TOOL]` Playwright CLI  |
| Preconditions  | Visitor on `/login`, not signed in.  |
| Test data shape  | invalid string `notanemail`  |
| Steps  | 1. Open `/login`. 2. Type `notanemail` into email field. 3. Observe submit button state. 4. Confirm no network POST is dispatched (network panel / Playwright request spy).  |
| Expected  | "Send magic link" button stays disabled. No POST to `/api/v1/auth/magic-link`. No toast, no UI change.  |
| Notes  | Tests `magic-link-form.tsx` client regex + `isValid` predicate.  |

#### TC-BK-2-05 — Invalid email rejected server-side with code `INVALID_EMAIL`

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | API  |
| Priority  | P1  |
| Source AC  | shift-left §3 → Scenario "Invalid email format rejected server-side"  |
| Tool  | `[API_TOOL]` curl + OpenAPI MCP (`staging-openapi`)  |
| Preconditions  | Direct API access (bypass client).  |
| Test data shape  | body `{"email": "no-at-symbol"`}  |
| Steps  | 1. POST `https://staging-upexbunkai.vercel.app/api/v1/auth/magic-link` with `Content-Type: application/json` and body `{"email":"no-at-symbol"`}. 2. Capture response status + body.  |
| Expected  | HTTP 400. Envelope shape: {{{ok:false, error: |
| Steps  | 1. Complete a happy-path sign-in (capture the `?code=` value). 2. Without signing out, hit `/auth/callback?code=<same-code>` again. 3. Observe redirect target + query params. 4. Inspect `/login` page banner.  |
| Expected (per AC)  | Callback redirects to `/login?error=TOKEN_USED`. `/login` renders banner "This link was already used — request a new one".  |
| Observed (Stage 2 fills)  | ***TBD*** — dev comment 2026-05-27 says replay is Supabase-native; actual envelope may differ. Stage 2 records verbatim.  |
| Notes  | ***Flag C.*** If observed != expected, Stage 2 decides bug vs scope-cut. Likely Supabase returns a generic `flow*state*not*found` or `otp*already_used` — see PO Q10 + Dev Q6.  |

#### TC-BK-2-07 — Expired magic link yields `?error=TOKEN_EXPIRED` + UX banner

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | UI+API  |
| Priority  | P1  |
| Source AC  | shift-left §3 → Scenario "Magic-link token expired"  |
| Tool  | `[AUTOMATION_TOOL]` Playwright CLI + `resend` CLI  |
| Preconditions  | A magic link generated >15 min ago AND never clicked. Supabase `auth.otp_exp = 900`.  |
| Test data shape  | one mailbox, one link, 15+ min wait  |
| Steps  | 1. Trigger magic-link send via UI. 2. Capture link from Resend inbox immediately. 3. Wait ≥15 min 01 sec. 4. Hit the captured `/auth/callback?code=...`. 5. Observe redirect target + banner.  |
| Expected  | Callback redirects to `/login?error=TOKEN_EXPIRED`. `/login` renders "Your link expired — request a new one" banner, with email field pre-filled.  |
| Notes  | Time-consuming TC — only one per run. Cannot mock clock from outside without test hooks (see Flag D — `/qa` page may expose a fixture).  |

#### TC-BK-2-08 — Callback without `?code=` redirects to `/login?error=MISSING_CODE`

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | API  |
| Priority  | P1  |
| Source AC  | shift-left §3 → Scenario "Callback missing the `code` query parameter" |
| Tool | `[API*TOOL]` curl + browser via `[AUTOMATION*TOOL]` for UI assert |
| Preconditions | Anonymous request. |
| Test data shape | bare GET to callback with no query string |
| Steps | 1. GET `https://staging-upexbunkai.vercel.app/auth/callback` (no `?code=`). 2. Follow 3xx redirect. 3. Confirm landing URL + `error` query param. |
| Expected | 302/303 redirect → `/login?error=MISSING_CODE`. UI on `/login` renders a toast or reset state acknowledging the error. |
| Notes | Pure route-level guard test in `app/auth/callback/route.ts`. | |
| Test data shape  | append `&next=https://evil.example.com/steal` to callback URL  |
| Steps  | 1. Send magic link with `?next=https://evil.example.com/steal` injected. 2. Capture callback URL from inbox. 3. Hit callback. 4. Observe final landing URL.  |
| Expected  | User does NOT land on `evil.example.com`. Final URL is `/onboarding` or `/projects` (same-origin default).  |
| Notes  | Tests the open-redirect guard already present in `app/auth/callback/route.ts`.  |

#### TC-BK-2-15 — `workspace_members` row created atomically with `workspaces` row (bootstrap RPC)

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | DB  |
| Priority  | P1  |
| Source AC  | shift-left §3 → Scenario "Successful first-time email magic-link sign-up" (atomicity assertion)  |
| Tool  | `[DB_TOOL]` DBHub MCP (`staging-dbhub`)  |
| Preconditions  | Authenticated user via callback (continuation of TC-BK-2-01/03).  |
| Test data shape  | DB queries only — no UI  |
| Steps  | 1. Before bootstrap: `SELECT COUNT(*) FROM workspaces WHERE owner*user*id = <new-user>` → 0; same for `workspace*members`. 2. Trigger bootstrap form submit. 3. After submit: re-query both tables. 4. Verify timestamps `created*at` are within ~50ms of each other (atomicity heuristic).  |
| Expected  | Both rows present after bootstrap. Both rows absent before. If only one row appears → atomicity bug.  |
| Notes  | Complements TC-BK-2-03 (which is UI+DB). This is DB-only verification of the RPC contract. Migration `0006*bootstrap*workspace.sql`.  |

#### TC-BK-2-16 — Middleware redirects unauthenticated `/projects` → `/login?next=/projects`, restores `next` after callback

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | UI+API  |
| Priority  | P1  |
| Source AC  | shift-left §3 → ((implied via §3 background + redirect chain — not a named scenario; promoted from §1 "middleware.ts" mention))  |
| Tool  | `[AUTOMATION_TOOL]` Playwright CLI + `resend` CLI  |
| Preconditions  | Fresh anonymous browser session.  |
| Test data shape  | direct nav to protected route  |
| Steps  | 1. Anonymously navigate to `https://staging-upexbunkai.vercel.app/projects`. 2. Observe redirect URL (expect `/login?next=/projects`). 3. Submit magic-link form. 4. Capture link from inbox. 5. Click link; expect `/auth/callback?code=...&next=/projects` or equivalent state. 6. Observe final landing.  |
| Expected  | Step 2: redirected to `/login?next=/projects`. Step 6: after callback, user lands at `/projects` (or `/onboarding` first if no workspace, then `/projects`). The `next` query param survives the magic-link round-trip.  |
| Notes  | Tests `middleware.ts` guard + `next` param preservation. If `next` is lost between send and callback → bug.  |

#### TC-BK-2-17 — Session cookie attributes (`Secure`, `HttpOnly`, `SameSite=Lax`)

| Field  | Value  |
| --- | --- |
| --- | --- |
| Layer  | UI  |
| Priority  | P1  |
| Source AC  | shift-left §3 → Scenario "Session cookie set with secure attributes"  |
| Tool  | `[AUTOMATION_TOOL]` Playwright CLI (cookie inspection API)  |
| Preconditions  | Successful callback exchange in `staging` (HTTPS) — reuse TC-BK-2-01 final state.  |
| Test data shape  | session cookie inspection  |
| Steps  | 1. After successful sign-in (TC-BK-2-01 completion), call Playwright `context.cookies()`. 2. Locate the Supabase-managed session cookie (typically `sb-<project-ref>-auth-token` or `sb-access-token`). 3. Assert `secure: true`, `httpOnly: true`, `sameSite: 'Lax'`. 4. Confirm subsequent navigation to `/projects` succeeds (cookie usable by middleware).  |
| Expected  | Cookie present with all three attributes correctly set. Protected route accessible.  |
| Notes  | `staging` is HTTPS so `Secure` flag must be set. If staging serves over HTTP → bug (HTTPS required).  |

---

## 6. Execution order (Stage 2 will follow this sequence)

1. ***Smoke first (3 P1 happy paths, UI):*** TC-BK-2-01, TC-BK-2-02, TC-BK-2-03. Anchors the system in a known-good state.
2. ***API negatives (fast, no inbox wait):*** TC-BK-2-05, TC-BK-2-08, TC-BK-2-09.
3. ***Boundary contract tests:*** TC-BK-2-10, TC-BK-2-11.
4. ***DB integration:*** TC-BK-2-15.
5. ***UI negatives / integration:*** TC-BK-2-04, TC-BK-2-06 (Flag C — capture observed), TC-BK-2-14, TC-BK-2-16, TC-BK-2-17.
6. ***Time-traveling (last; long waits):*** TC-BK-2-07, TC-BK-2-12, TC-BK-2-13. Batch the 15-min waits to share a single elapsed window.
7. ***Stage 1 explore opportunity:*** check `/qa` route (Flag D) during smoke for QA fixtures that may upgrade TC-BK-2-12/13 from manual to automated.

---

## 7. Exit criteria

| Result  | Verdict  |
| --- | --- |
| -------- | --------- |
| All 10 P1 PASS  | GO (Stage 3 transitions `qa*sign*off`: in*test → qa*approved)  |
| All P1 PASS + ≤1 P2 FAIL with documented mitigation  | CAUTION (manual escalation to PO; Stage 3 either GO with note or NO-GO at PO discretion)  |
| Any P1 FAIL  | NO-GO (Stage 3 transitions `defect*reported`: in*test → blocked; bug filed)  |
| P3 BLOCKED by tooling (no time-mock)  | Acceptable as KNOWN — record in ATR Defects/Notes  |

Severity classification per `.agents/jira-required.yaml` Bug fields: any FAIL of P1 = `critica` or `mayor`; FAIL of P2 = `moderada`; FAIL of P3 = `menor`/`trivial`.

---

## 8. Open questions still pending (from shift-left §7 + dev comment 2026-05-27)

### For PO

1. Resend semantics — MVP = both tokens valid + 60s cooldown. Confirm during QA review.
2. Workspace-name default — pre-fill `"{email-prefix}'s workspace"` — observe in onboarding form during TC-BK-2-01.
3. Modern UX scope — verify which of §5.1-5.9 actually landed; document gaps in ATR.
4. `/home` route — AC mentions it; code uses `/projects`/`/onboarding`. Test answers.
5. Magic-link email template — default GoTrue template ships; note any branding gaps.

### For Dev

1. Supabase error code mapping — observe actual codes returned by `exchangeCodeForSession` on (a) replay (b) expiry. Record verbatim.
2. `auth.otp_exp = 900` ops checklist — verify on staging by sending a link + waiting >15 min (TC-BK-2-07).
3. Bootstrap RPC race — double-click `/onboarding` "Create workspace" → expected `23505` surfacing as "slug taken" UI message.
4. `workspace_members.status='active'` invariant — confirm guard filter behavior.

### New (raised by dev 2026-05-27 implementation comment)

1. Replay enforcement strategy — Supabase-native handling; what is the actual error envelope returned to UI? Does it map to `?error=TOKEN_USED` (shift-left §2.3) or is there a UX gap? ***Answered partly by TC-BK-2-06 observed value.***
2. Where is `MVP-NOTES.md`? Dev referenced `.context/PBI/epics/EPIC-BK-1-tenancy-identity/MVP-NOTES.md` on the target repo. Best-effort fetch via `../upex-bunkai-tms/...` during Stage 2 if testability depth requires it.
3. `/qa` route + Epic [https://jira.upexgalaxy.com/browse/BK-29#icft=BK-29](https://jira.upexgalaxy.com/browse/BK-29#icft=BK-29) testability guide — explore during Stage 2 smoke for QA testability shortcuts (data-testid map, seed users, clock-mock).

---

## 9. Traceability matrix

| TC ID  | Source AC scenario (shift-left §3)  | ATR results section (filled Stage 2)  |
| --- | --- | --- |
| ------- | ----------------------------------- | -------------------------------------- |
| TC-BK-2-01  | Successful first-time email magic-link sign-up  | `acceptance-test-results.md` row TC-BK-2-01  |
| TC-BK-2-02  | Successful returning-user sign-in (workspace exists)  | row TC-BK-2-02  |
| TC-BK-2-03  | Successful first-time email magic-link sign-up (bootstrap RPC final lines)  | row TC-BK-2-03  |
| TC-BK-2-04  | Invalid email format rejected client-side  | row TC-BK-2-04  |
| TC-BK-2-05  | Invalid email format rejected server-side  | row TC-BK-2-05  |
| TC-BK-2-06  | Magic-link token replay blocked  | row TC-BK-2-06 (Flag C — observed vs expected)  |
| TC-BK-2-07  | Magic-link token expired  | row TC-BK-2-07  |
| TC-BK-2-08  | Callback missing the `code` query parameter  | row TC-BK-2-08  |
| TC-BK-2-09  | Rate-limited resend (Supabase 429)  | row TC-BK-2-09  |
| TC-BK-2-10  | Email exceeds RFC 5321 length limit (inverse — 254 must succeed)  | row TC-BK-2-10  |
| TC-BK-2-11  | Email exceeds RFC 5321 length limit  | row TC-BK-2-11  |
| TC-BK-2-12  | Magic-link token expired (boundary 14:59)  | row TC-BK-2-12  |
| TC-BK-2-13  | Magic-link token expired (boundary 15:01)  | row TC-BK-2-13  |
| TC-BK-2-14  | Open-redirect attempt via `next` parameter blocked  | row TC-BK-2-14  |
| TC-BK-2-15  | Successful first-time sign-up (atomicity assertion)  | row TC-BK-2-15  |
| TC-BK-2-16  | Implied — middleware redirect chain + `next` round-trip  | row TC-BK-2-16  |
| TC-BK-2-17  | Session cookie set with secure attributes  | row TC-BK-2-17  |

ATR mirror file: [`acceptance-test-results.md`|./acceptance-test-results.md] — scaffold ready; results filled by Stage 2, summary finalized by Stage 3.

---

**Single source of truth: this file. Jira mirror: customfield** `acceptance*test*plan` **on BK-2 + Stage 1 announce comment. Stage 2 reads this; Stage 3 reads the ATR.**

---
_Synced from Jira by sync-jira-issues_
