# BK-166 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-166)

# Acceptance Test Plan (ATP) — BK-166

********Story*****:*** Authentication | Sign up and sign in with email and password
********Epic*********:***** BK-1 — Tenancy & Identity
****Env********: Staging (`https://staging-upexbunkai.vercel.app`)
********Modality*****:**** Jira-native (ATP → **`customfield_10067`*)
********Date*********:***** 2026-06-23
****Tester********: QA — Stage 1 Planning

---

## Test Analysis

### Risk Triage

| Factor | Result |
| --- | --- |
| Veto: Auth/authorization | TRIGGERED — password sign-in/sign-up rail governs account access |
| Veto: Money-adjacent | TRIGGERED — minted PATs carry write scopes against billable resources |
| Decision | ***VETO-REQUIRE → Full ATP.*** No `shift-left-reviewed` label at session start; Phases 1-4 run in full. |

### Data Feasibility

| AC | Pattern | Notes |
| --- | --- | --- |
| AC1 exists→password step | Discover | `{{STAGING*USER*EMAIL}}` confirmed account |
| AC2 new→create step | Generate | `faker.internet.email()` |
| AC3 signin happy path | Discover | same confirmed account |
| AC4 signup→OTP→confirm | ***Blocked*** | needs a real delivered OTP — see warning below |
| AC5 wrong password | Discover | same account, wrong string |
| AC6 unconfirmed signin | Generate | sign up fresh email, never confirm — `pending_confirmation` state itself is reachable w/o real OTP |
| AC7 invalid/expired code | Generate | wrong/garbage code submittable without a **valid** OTP existing |
| AC8 rate limit | Discover/Generate | exercises Supabase GoTrue throttle, not a Bunkai limiter |
| AC9 magic-link visible | Discover | static UI check |
| AC10 PAT+cookie coexist | Discover | same confirmed account, two channels |
| AC11 API signup+confirm | ***Blocked*** | same OTP blocker as AC4 |

> ***WARNING:**** ****AC4 and AC11 are NOT VERIFIABLE IN THIS ENVIRONMENT.*** Shared Supabase project is on the free-tier email cap; signup OTP may not reach an inbox until custom SMTP (Resend) ships. The workaround (`admin-confirmed` user / `admin.generateLink`) needs the Supabase service-role key, intentionally absent from this QA repo's `.env` — user declined to request it this session (`test-session-memory.md`, 2026-06-23). Stage 2 must report this gap explicitly, not omit it. Sub-behaviors NOT requiring a delivered code (`pending_confirmation` state, wrong-code rejection, signup's 202 shape) ARE covered via AC6/AC7 and the signup-response outlines.

---

## Phase 1 — Critical Analysis

***Business***: Sara (Full-Stack Dev) wants password sign-in without waiting on magic-link email or a 3rd-party IdP. Karim (API/CLI) needs a PAT in the same call as auth, without disturbing his or anyone else's session. This is the first identity-proving step in the funnel — nothing downstream (workspace access, RLS reads) works without it. Sits under the epic's CRITICAL "Authentication & Tenancy" flag (`master-test-plan.md`).

***Technical — Frontend**** (`email-first-form.tsx`, verified by reading code): `EMAIL*REGEX = /^[^\s@]+@[^\s@][^\s.@]**\.[^\s@]+$/` (rejects `a@.com`, does not itself enforce RFC-5321 254 or restrict TLD shape — relies on the API's `.max(254)`). `OTP*REGEX = /^\d{6,8}$/` matches the API exactly. `MIN*PASSWORD*LENGTH = 8` gates ONLY the create-account submit button — the signin password step has no length gate (`disabled={!password}` only), so a 1-7 char password reaches the network and gets a uniform 401, never a client validation message. `accountConfirmed` (from `check-email`'s `confirmed`, default `true`) is the sole mechanism turning a `signin` 401 into "go verify" — purely client-side; the API returns the same 401 either way.

***Technical — Backend*** (4 routes, all `auth:'public'`):

| Route | Zod validation | Success | Key negatives |
| --- | --- | --- | --- |
| `/check-email` | `email: .email().max(254)` | 200 `{exists, confirmed}` | `429 rate*limited`; `502 upstream*error` |
| `/signup` | `email .email().max(254)`, `password .min(8).max(128)` | 202 `{status:'pending_confirmation', email}` | `409 conflict` (explicit + obfuscated `identities:[]` path); `429`; `400` generic |
| `/signin` | `email`, `password .min(6).max(128)`, optional `pat*name(1-80)`, `pat*scopes(enum)`, `pat*expires*in*days(int 1-365)` | 200 `{user:{id,email}, session:{access*token,refresh*token,expires*at,token*type}, pat:{token,id,name,scopes,expires*at}, warning}` | uniform `401 "Invalid email or password."` (no enumeration) |
| `/confirm` | `email`, `token /^\d{6,8}$/`, same optional PAT fields | 200, identical shape to signin | `429` (checked first); uniform `401 "Invalid or expired verification code."` |

`lib/api/pat.ts`: `DEFAULT*PAT*SCOPES=[atc:read, atc:write, run:execute]`; `assertNoGlobalAdminScope()` → `403 forbidden` if `workspace:admin` requested from either headless route (business-rule check, AFTER Zod accepts it as a syntactically valid enum value). PAT format `bk*pat*<12char-prefix>.<secret>`. DB CHECK requires `scopes` non-empty AND `⊆ {atc:read,atc:write,run:execute,workspace:admin}`. `check-email` has no app-level rate limiter (ADR-0007 tradeoff, confirmed absent in code).

***Complexity***: Business logic High (4-step state machine, enumeration-tradeoff routing, dual credential issuance) · Integration High (FE↔4 routes↔Supabase Auth↔SECURITY DEFINER RPC↔2 tables) · Data validation Medium-High (cross-route password-length asymmetry) · UI Medium.

***Epic inheritance (BK-1)****: RFC-5321 254-char email cap + 15-min token expiry (`auth.otp*exp=900`) are epic-level (`master-test-plan.md`). ****Discrepancy***: the signup-confirmation OTP (`\d{6,8}`) is a different mechanism from the magic-link OTP the epic note describes (BK-2) — do not assume it shares the 900s expiry; flagged as Ambiguity A1. RLS/tenant isolation is CRITICAL epic-wide, but BK-166's PATs are `workspace*id IS NULL` (global) — out of this story's direct RLS surface; its contribution to that risk is the scope ceiling (`workspace:admin` blocked), covered below. BK-4's ATP already covers `workspace_members`/RLS — not re-derived. Cookie+PAT non-clobbering and the signin/signup password asymmetry are unique to this story.

---

## Phase 2 — Story Quality Analysis

***Ambiguities*** (NEEDS PO/DEV CONFIRMATION):

- ***A1*** — Does the signup OTP expire on the epic's 15-min window, or a different Supabase default? Cannot build a true expiry test without knowing this.
- ***A2*** — Is there a roadmap item for a Bunkai-side rate limiter (and threshold), or is today's upstream-only throttle the accepted state? Affects what attempt-count Stage 2 can assert.
- ***A3*** — If an API caller skips `check-email` and calls `signin` directly on an unconfirmed account, is a plain indistinguishable-from-wrong-password 401 the intended API contract, or should `signin` signal "unconfirmed" distinctly?

***Gaps***:

- ***G1*** — `resendCode()` re-calls `signup`; on an existing pending account that may hit `409 conflict` OR genuinely re-send (202) depending on which Supabase/route branch fires — code reading alone can't resolve this; the UI treats both 202 and 409 as success. Needs an empirical Stage 2 probe before trusting the "new code on its way" toast.
- ***G2*** — No stated TTL for a never-confirmed account itself (separate from the OTP code TTL) — does the email become reusable, or permanently squat? Affects signup test-data hygiene long-term.

***Edge cases not in story*** (added to refined ACs / outlines below): case-insensitive email (E1) · Unicode/emoji password (E2) · injection string in email field (E3, Critical) · double-submit signup (E4) · token replay proxy (E5, partial — true replay untestable without a real OTP) · concurrent cookie+PAT (E6, = AC10) · wrong code against a non-pending email (E7) · duplicate/unrecognized `pat_scopes` (E8).

***Testability***: Partial. All 11 ACs testable in principle; AC4/AC11 blocked by environment/tooling only (not story ambiguity). No vague AC language found — every original scenario already carries concrete actors/emails. The 3 ambiguities concern downstream mechanism, not whether the AC itself is testable.

---

## Phase 3 — Refined Acceptance Criteria

> Original 11 Gherkin scenarios are in `acceptance-criteria.md` (`customfield_10063`) — not duplicated here verbatim. Concrete data + Phase-2 edge scenarios added below.

| AC | Refined Given/When/Then (concrete data) |
| --- | --- |
| ***AC1*** | Given confirmed `{{STAGING*USER*EMAIL}}` exists · When Sara enters it + Continue · Then password field shown (`data-testid=login-password`), create-step never rendered, `check-email` returned `200 {exists:true,confirmed:true}` |
| ***AC1b*** (new, E1) | Given same account stored lowercase · When Sara enters `SARA@EXAMPLE.COM` · Then routes identically to AC1 (server `.trim().toLowerCase()`) |
| ***AC2*** | Given no account for `faker.internet.email()` output · When entered + Continue · Then create-password field shown, signin field never rendered, `200 {exists:false,confirmed:false}` |
| ***AC3*** | Given confirmed `{{STAGING*USER*EMAIL}}`/`{{STAGING*USER*PASSWORD}}` · When email→Continue→correct password submitted · Then redirected to `/projects` (NEEDS PO/DEV CONFIRMATION: does AC's "Workspace home" = `/projects`?); `signin` 200 with `user`,`session`,`pat`(default scopes),`warning` |
| ***AC4**** | ****NOT VERIFIABLE IN THIS ENVIRONMENT*** — needs a real delivered OTP. Sub-behaviors not requiring it: 202 `pending_confirmation` response, the unconfirmed state itself (→ AC6) |
| ***AC5*** | Given confirmed account · When wrong password `"wrong-password-1!"` submitted · Then `401 {error:```}`, UI "That email or password is incorrect.", no cookie set, no PAT row |
| ***AC6*** | Given account signed up via API, never confirmed · When email entered (routes to password, `exists:true`) + any ≥6-char password submitted, 401 returned · Then client `accountConfirmed===false` reroutes to verify step with "Verify your email with the code we sent before signing in." (not the generic wrong-password text) |
| ***AC7*** | Given pending-signup email on verify step · When wrong code `"000000"` submitted · Then `401 {message:"Invalid or expired verification code."}`, UI "That code is invalid or expired.", account stays unconfirmed, resend stays available. Sub-case E7: same wrong code against an email with NO pending signup → identical 401 (can't distinguish by design). Expiry leg (A1) deferred — needs PO/DEV confirmation + a real OTP to construct. |
| ***AC8*** | Given confirmed account · When N consecutive wrong passwords submitted (N unknown — Supabase's own threshold, NEEDS PO/DEV CONFIRMATION) · Then eventually `429 rate_limited`, UI "Too many attempts..." — recalibrated to Medium priority since this is upstream behavior, not a Bunkai feature |
| ***AC9*** | Given login screen, password primary · When looking for a non-password alternative · Then collapsed "email me a link instead" disclosure visible, expands to working `MagicLinkForm`; OAuth buttons present-but-disabled |
| ***AC10*** | Given Karim signs in via API (PAT) + Sara signed in via browser (cookie), same account · When both make authenticated calls, interleaved · Then both succeed as same `user.id`; neither revokes the other; re-probe both after interleaving confirms persistence |
| ***AC11**** | ****NOT VERIFIABLE IN THIS ENVIRONMENT*** — same OTP blocker as AC4. The 202 shape and wrong-code-401 ARE covered elsewhere. |

---

## Phase 4 — Test Design

### Technique-driven derivation

| AC / area | Technique(s) | Why |
| --- | --- | --- |
| AC1/AC2 routing | EP, State-Transition | exists-vs-not partitions; `email→password|create` entry transition |
| AC3/AC5 signin | EP, BVA, Decision Table | valid/invalid credential partitions; password-length boundary differs by route; (confirmed?×correct?) interaction |
| AC4/AC11 signup→confirm | EP, BVA, State-Transition | blocked for the valid-OTP leg only; password-length BVA + `pending_confirmation` transition ARE covered |
| AC6 unconfirmed signin | State-Transition, Decision Table | real account state; 2-condition outcome |
| AC7 invalid code | EP, BVA | code-format partition × correctness partition |
| AC8 rate limit | Error-Guessing charter | no deterministic threshold known |
| AC9 magic-link visible | EP (trivial) | single boolean — ***collapsed******:****** trivially atomic*** |
| AC10 PAT+cookie | Integration, Error-Guessing | "neither revokes the other" is the anomaly-class risk |
| email field (cross-cutting) | BVA | RFC-5321 254-char cap explicit in both Zod schemas + epic doc |
| `pat_scopes` (cross-cutting) | Decision Table | scope-set × admin-flag interacts at Zod layer then business-rule layer |
| Error-guessing charters | Error-Guessing | token replay, concurrent signup race, injection, Unicode password, expired-then-reused code, double-submit — required for a CRITICAL auth story |

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 8 | happy routing, signin, signup-response, magic-link, case-insensitive, default PAT scopes |
| Negative | 11 | wrong password/code, missing fields, malformed/oversized email, weak password both routes, duplicate signup, bad scope, admin-scope rejection |
| Boundary | 7 | email 254/255, signin pw 5/6/7, signup pw 7/8/9, OTP 5/6/8/9-digit |
| State-Transition | 4 | routing entry, pending_confirmation persistence, unconfirmed reinterpretation, confirmed-but-wrong-code |
| Decision Table | 3 | confirmed×correct (signin); scopes×admin-flag (PAT); code-length×correctness |
| Integration | 3 | PAT+cookie coexistence, FE↔API routing contract, confirm/signin shape parity |
| Error-Guessing | 6 | replay, concurrent race, injection, Unicode, expired-reuse, double-submit |
| ***Total**** | ****42*** | CRITICAL veto-required story — explode-default applied in full, not target-fitted |

Rationale: High business-logic/integration complexity + CRITICAL epic risk justify exhaustive EP+BVA+state+decision-table+charter coverage. AC4/AC11's blocked "real-OTP happy path" leg would otherwise add ~3-4 more (full round trip, expiry boundary) — logged as an explicit gap, not dropped silently.

### Parametrization

| Group | Varying data | Expected (per row) | Outline |
| --- | --- | --- | --- |
| Email-format negative | `"not-an-email"`,`"missing-at.com"`,`"trailing.dot.@x.com"`,`"a@.com"` | 400 `validation_failed` (4 distinct invalid-format reasons, one partition) | TC-30 |
| Signin password length | 5/6/7 chars | 5→400 schema reject · 6,7→401 (reaches auth check) | TC-14 |
| Signup/confirm password length | 7/8/9 chars | 7→400 · 8,9→202 | TC-15 |
| OTP length | 5/6/8/9 digits | 5,9→400 schema reject · 6,8→401 (reaches Supabase) | TC-21 |
| `pat_scopes` value | `[atc:read]`,`[bogus:scope]`,`[workspace:admin]`,`[]` | valid→200 · bogus→400 enum · admin→403 forbidden · empty→***NEEDS PO/DEV CONFIRMATION*** (DB CHECK vs earlier layer) | TC-27 |

5 parameterized artifacts replace ~17 single-data-point outlines — same partitions/boundaries, fewer artifacts (doctrine Part 2.5).

### Outline set

> Format `Should <BEHAVIOR> <CONDITION>`. Compact table: full step detail expands per the doctrine's "explore something a sibling does not" test — every row below maps to a distinct partition/boundary/state/rule.

#### Positive

| # | Title | Priority | Level | Precondition → Steps | Expected | Data |
| --- | --- | --- | --- | --- | --- | --- |
| TC-01 | Should route to password step for existing confirmed email | Critical | UI+API | confirmed acct exists → enter email, Continue | 200 `{exists:true,confirmed:true}`; password field shown | `{email:"{{STAGING*USER*EMAIL}}"}` |
| TC-02 | Should route to create step for unregistered email | Critical | UI+API | none → enter fresh email, Continue | 200 `{exists:false,confirmed:false}`; create field shown | `{email:"<faker>"}` |
| TC-03 | Should route case-insensitively for existing email | Medium | API | confirmed acct lowercase → `check-email` w/ uppercase | 200 identical to lowercase | `{email:"<UPPER>"}` |
| TC-04 | Should sign in successfully with correct credentials | Critical | UI+API | confirmed acct → email→Continue→correct password | redirect `/projects`; 200 `{user,session,pat,warning}`, `pat.scopes=[atc:read,atc:write,run:execute]` | `{email,password}` from `.env` |
| TC-05 | Should mint PAT with default least-privilege scopes | High | API | confirmed acct, no `pat_scopes` sent | 200, `pat.scopes` deep-equals default triple, no `workspace:admin` | same as TC-04 |
| TC-06 | Should return 202 pending*confirmation on fresh signup | Critical | API | never-used email → `POST /signup` | 202 `{status:'pending*confirmation', email}` | `{email:"<faker>", password:"Sup3rSecret!23"}` — feeds TC-09/19/20 as precondition |
| TC-07 | Should keep magic-link fallback visible+functional | Medium | UI | on `/login` → expand disclosure | visible collapsed by default; expands to working `MagicLinkForm`; OAuth visible-disabled unaffected. ***Collapsed******:****** trivially atomic*** (single boolean) | — |
| TC-08 | Should accept Unicode password on signup | Low | API | fresh email → signup with `"Pásswörd日本語!"` | 202, same shape as TC-06 | `{email:"<faker>", password:"Pásswörd日本語!"}` |

#### Negative

| # | Title | Priority | Level | Precondition → Steps | Expected | Data |
| --- | --- | --- | --- | --- | --- | --- |
| TC-09 | Should reject signin with wrong password (generic message) | Critical | UI+API | confirmed acct → submit wrong password | 401 uniform message; UI "incorrect"; no enumeration | `{email,"wrong-password-1!"}` |
| TC-10 | Should reject signin for unknown email with SAME generic message | Critical | API | unknown email → `signin` directly (skip check-email) | 401 byte-identical to TC-09 — confirms no enumeration on `signin` itself | `{email:"<faker,unregistered>", password:"Whatever123"}` |
| TC-11 | Should reroute unconfirmed account to verify, not "wrong password" | Critical | UI+API | acct from TC-06, unconfirmed → email→Continue (sets `accountConfirmed=false`)→submit any ≥6-char password | API still 401; UI shows verify-step message specifically, not generic incorrect text | `{email from TC-06, password:"AnyPassword123"}` |
| TC-12 | Should reject wrong verification code (uniform message) | High | UI+API | pending acct from TC-06 → submit `"000000"` | 401 `"Invalid or expired verification code."`; stays unconfirmed; resend still enabled | `{email from TC-06, token:"000000"}` |
| TC-13 | Should reject valid-format code against email with no pending signup (E7) | Medium | API | never-signed-up email → `confirm` with `"123456"` | 401, same uniform message as TC-12 | `{email:"<faker>", token:"123456"}` |
| TC-14 | Should enforce signin password-length boundary (parametrized) | High | API | confirmed acct → `signin` with pw len 5/6/7 | 5→400 `validation_failed`; 6,7→401 (reaches auth, still wrong pw) | see Parametrization table |
| TC-15 | Should enforce signup/confirm password-length boundary (parametrized) | High | API | fresh email per row → `signup` with pw len 7/8/9 | 7→400; 8,9→202 | see Parametrization table |
| TC-16 | Should reject signup for already-existing email (explicit+obfuscated paths) | Critical | API | `{{STAGING*USER*EMAIL}}` exists → `signup` same email | 409 `````, email NOT echoed | `{email:"{{STAGING*USER*EMAIL}}", password:"Whatever123"}` |
| TC-17 | Should reject malformed JSON on every route (parametrized x4) | Medium | API | none → POST unclosed JSON to all 4 routes | 400 ````` on all 4 | raw `'{"email":"x"'` |
| TC-18 | Should reject missing required field on every route (parametrized x4) | High | API | none → omit required field per route | 400 `validation_failed` on each | check-email `{}`; signup `{email}`; signin `{password}`; confirm `{email}` |
| TC-19 | Should reject confirm w/ wrong code against a just-created pending signup | High | API | fresh signup immediately before → `confirm` w/ wrong 6-digit code | 401, identical to TC-12 (kept distinct: fresh fixture vs reused) | chained from TC-06 pattern |
| TC-20 | Should reject unrecognized `pat*scopes` value at schema layer | Medium | API | confirmed acct → `signin` w/ `pat*scopes:["bogus:scope"]` | 400 `validation*failed` (Zod enum, before business logic) | `{email,password,pat*scopes:["bogus:scope"]}` |

#### Boundary

| # | Title | Priority | Level | Precondition → Steps | Expected | Data |
| --- | --- | --- | --- | --- | --- | --- |
| TC-21 | Should enforce OTP length boundary at schema layer (parametrized) | High | API | pending email (for in-range rows) → `confirm` w/ token len 5/6/8/9 | 5,9→400 regex fail; 6,8→401 (reaches Supabase) | see Parametrization table |
| TC-22 | Should accept email at exactly RFC-5321 254-char max | Medium | API | none → `check-email` w/ 254-char valid email | 200 | `{email:"<254-char>"}` |
| TC-23 | Should reject email exceeding 254-char max (parametrized x4 routes) | Medium | API | none → POST 255-char email to all 4 routes | 400 `validation_failed` on all 4 (`.max(254)` identical across schemas) | `{email:"<255-char>@example.com", ...other required}` |
| TC-24 | Should accept `pat*expires*in*days` at boundary 1 / reject 366 | Low | API | confirmed acct → `signin` w/ `pat*expires*in*days:1` then `366` | 1→200, `expires*at`≈now+1d; 366→400 `validation*failed` (max 365) | `{...,pat*expires*in_days:1}` / `366` |

#### State-Transition

| # | Title | Priority | Level | Precondition → Steps | Expected | Data |
| --- | --- | --- | --- | --- | --- | --- |
| TC-25 | Should model email-first routing entry transitions | Critical | Integration | 1 confirmed + 1 unconfirmed + 1 nonexistent email prepared → `check-email` each | confirmed→`password`; unconfirmed→`password` then reroutes to `verify` only AFTER a signin 401 (flag, not immediate redirect); nonexistent→`create` | 3 emails |
| TC-26 | Should keep never-confirmed account pending across repeated checks | Medium | API | acct from TC-06, unconfirmed → `check-email` twice, minutes apart | both `{exists:true,confirmed:false}` — no silent self-confirm/expiry within a short window (long-TTL = G2, NEEDS PO/DEV CONFIRMATION) | same email twice |

#### Decision Table

| # | Title | Priority | Level | Decision table | Data |
| --- | --- | --- | --- | --- | --- |
| TC-27 | Should resolve PAT scope issuance per (scope-set × contains-admin?) (parametrized) | Critical | API | R1 omitted→200 default triple · R2 `[atc:read]`,no admin,valid→200 `scopes=[atc:read]` · R3 `[atc:read,workspace:admin]`,admin,valid→403 forbidden (schema accepts, business rule rejects) · R4 `[bogus:scope]`,no admin,***invalid enum****→400 `validation*failed` · R5 `[]`→****NEEDS PO/DEV CONFIRMATION*** (DB CHECK vs earlier layer — record actual behavior) | confirmed acct, vary `pat*scopes` |
| TC-28 | Should resolve signin outcome per (confirmed? × password-correct?) | Critical | Integration | R1 confirmed+correct→200, signed in · R2 confirmed+wrong→401 "incorrect" · R3 unconfirmed+(eventual-real-pw, untestable here)→401 "verify your email" · R4 unconfirmed+wrong→401 "verify your email" (same UX as R3 — `accountConfirmed` branch fires regardless of password) | R3 = functionally AC6/TC-11; table makes all 4 cells explicit, not a new execution |

#### Integration

| # | Title | Priority | Level | Precondition → Steps | Expected | Data |
| --- | --- | --- | --- | --- | --- | --- |
| TC-29 | Should let PAT session + cookie session coexist without clobbering (AC10) | Critical | Integration | confirmed acct → 1) `signin` (Karim) capture PAT+cookie 2) separate context `signin` (Sara) capture its own cookie 3) authenticated call w/ Karim's Bearer 4) authenticated call w/ Sara's cookie 5) repeat 3-4 interleaved | both resolve to same `user.id`; neither affected by the other's use; no revocation signal. DB cross-validation (2 `access_tokens` rows) ***DEFERRED — DBHub MCP unavailable this session***; validated via response-body `user.id` equality instead | two independent `signin` calls, same account |
| TC-30 | Should reject structurally invalid email at schema layer (parametrized x4 reasons) | Medium | API | none → `check-email` w/ each malformed value | 400 `validation_failed` on all 4 (no `@`; no `@`; local-part ends in `.`; empty domain label) | `"not-an-email"`,`"missing-at.com"`,`"trailing.dot.@x.com"`,`"a@.com"` |

#### Error-Guessing Charters

| # | Charter | Priority | Mission |
| --- | --- | --- | --- |
| TC-31 | Token replay proxy | High | Submit the SAME wrong code twice against the same pending signup — confirm identical failure both times, no state leak / accidental confirm. True replay of a valid already-consumed code is untestable without a real OTP (ties to AC4/AC11). |
| TC-32 | Concurrent signup race | High | Fire 2 near-simultaneous `signup` calls for the SAME fresh email — expect one clear "first" outcome, second on 409/obfuscated branch. Flag if both somehow 202 (duplicate-account race bug). |
| TC-33 | SQL/script injection in email field | Critical | Submit `"'; DROP TABLE access_tokens; --@example.com"` and `"<script>alert(1)</script>@example.com"` to `check-email`/`signup`/`signin` — expect uniform 400 from Zod `.email()` before reaching RPC/Supabase. Any 200/202/500 = CRITICAL finding. |
| TC-34 | Unicode/emoji password on signin | Low | Signin with `"🔥Pass🔥word123"` against an account where this is NOT the real password — confirm clean 401, no crash/500. |
| TC-35 | Expired-then-reused OTP (A1, partially blocked) | Medium | Can't manufacture true expiry without a real deliverable OTP. Narrowed scope: wrong code submitted, waited, resubmitted unchanged — confirm still 401s consistently (no time-based state change in the wrong-code path). |
| TC-36 | Double-submit signup | High | Rapid double-click "Create account" — verify the UI's `submitting` guard actually blocks a second `fetch`, not just a second button render. |

---

## Phase 5 — Edge case + Test-data summary

| Edge case | In story? | Added to refined AC? | Outline | Priority |
| --- | --- | --- | --- | --- |
| Case-insensitive email (E1) | No | Yes (AC1b) | TC-03 | Medium |
| Unicode/emoji password (E2) | No | Yes | TC-08, TC-34 | Low |
| Injection in email (E3) | No | Yes | TC-33 | Critical |
| Double-submit signup (E4) | No | Yes | TC-36 | High |
| Token replay (E5) | No | Yes (proxy only) | TC-31 | High |
| Concurrent cookie+PAT (E6) | Yes (AC10) | already an AC | TC-29 | Critical |
| Wrong code, non-pending email (E7) | No | Yes | TC-13 | Medium |
| Duplicate/unrecognized `pat_scopes` (E8) | No | Yes | TC-20, TC-27 | Medium |
| `resendCode()` actual status (G1) | No | Flagged for Stage 2 empirical probe — not yet an outline | (discovery item) | High |

***Test-data categories***: Valid/static (1 reused: `{{STAGING*USER*EMAIL}}`/`{{STAGING*USER*PASSWORD}}`) · Valid/dynamic (~10+ Faker emails for every signup-path row) · Invalid-format (4, TC-30) · Boundary (4 groups: email/signin-pw/signup-pw/OTP length) · Edge/security (3: injection, emoji, double-submit).

***Generation strategy***: `faker.internet.email()` (optionally suffixed `faker.string.alphanumeric(8)` for guaranteed uniqueness across retries) for every fresh signup row; `faker.internet.password({length:12})` adjusted to clear the 8-char signup minimum. Static creds from `.env` reused across all signin-path outlines.

***Cleanup***: signup-path outlines leave unconfirmed `auth.users` rows behind (no DELETE endpoint in scope) — each run uses a fresh email so no collisions occur, but rows accumulate on staging; flagged for Stage 3 ATR, consistent with BK-4's precedent of flagging rather than silently absorbing data accumulation.

---

## Risk Justification

VETO-REQUIRE (auth/authorization + money-adjacent PAT write-scopes), independent of any score. This is the first identity-proving gate for the whole platform — every epic's RLS-scoped access depends on it issuing correct, non-leaking sessions/tokens. No-enumeration-on-`signin` is a deliberate tradeoff (ADR-0007) whose only mitigation (`check-email` rate limiting) is NOT yet shipped (confirmed absent in code) — raises priority of TC-33 (injection) and TC-31/AC8 (rate-limit) above face-value AC wording. The signin/signup password-length asymmetry (min 6 vs min 8) is intentional but exactly the kind of cross-route inconsistency that regresses silently if either schema is touched later — pinned by TC-14/15. The PAT scope ceiling (`workspace:admin` blocked from headless auth) has DB-level CHECK defense-in-depth — TC-27 (R3/R4/R5) is the highest-value decision-table outline. 2 of 11 ACs are environment-blocked, not application-blocked — flagged explicitly, not silently passed over.

## Gaps / Notes for Stage 2

1. AC4/AC11 OTP delivery blocked — re-attempt only if DBHub/service-role access becomes available; otherwise report as a persistent environment gap in the ATR.
2. G1 — probe `resendCode()`'s actual status code (202 vs 409) empirically before trusting the UI's optimistic toast.
3. A1 — do not assume the magic-link's 900s OTP TTL applies to the signup-confirmation code without dev confirmation; TC-35's expiry leg stays a charter stub.
4. A2 — TC-31/AC8 is a discovery charter; record the actual attempt-count N that triggers the first 429 and feed it back as an ATP refinement.
5. DB cross-validation deferred on TC-04/05/29 (`access_tokens` row) — DBHub MCP unavailable this session; validated via API response body only; re-attempt once restored.
6. TC-27 R5 (`pat_scopes:[]`) is a genuine unknown from code reading alone — record which layer actually rejects it.
7. Staging will accumulate unconfirmed test signup accounts (no DELETE endpoint in scope) — acceptable for this pass, flagged for whoever does staging cleanup.

---

---
_Synced from Jira by sync-jira-issues_
