# BK-166 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-166)

# BK-166 — Spec Implementation Plan (Dev)

> Email-first username/password auth + email OTP verification (UI + API rails), preserving the ADR-0001 cookie/PAT coexistence invariant. Branch: `feature/BK-166-password-auth-ui`. Verify gate: `bun run types:check` + `bun run lint:check` (+ `bun test` for the coexistence test). Smoke: Playwright CLI on `next dev`. Never run a production build (Critical Rule #14).

## Goal

Make password the primary, email-first sign-in/sign-up method on the login screen, with mandatory 6-digit email OTP verification on both the browser and API/automation rails, while keeping a browser cookie session and a Bearer PAT for the same account fully independent (neither clobbers the other).

## Resolved decisions (Stage 1)

1. ***Unconfirmed-account handling*** — `POST /api/v1/auth/check-email` returns `{ exists, confirmed }`. The UI uses `confirmed` to interpret a signin failure (route an existing-but-unconfirmed account to the OTP verify step instead of showing "wrong password"). `signin` stays UNCHANGED (uniform 401, no leak from the endpoint itself).
2. ***Rate-limiting (AC #8)*** — MVP relies on Supabase's built-in auth/OTP throttling + 429→`rate_limited` mapping. A dedicated app-level limiter is a documented follow-up (recorded in ADR-0005), not in this story's scope.
3. ***Password policy*** — sign-up + confirm enforce `min 8`; sign-in keeps `min 6` for legacy accounts (asymmetry documented in code).

## Current-state map

- `app/api/v1/auth/signin/route.ts:24-63` — `signInWithPassword` (SSR client sets cookies) + `mintPat`. Response `{user,session,pat,warning}`. Canonical shape `/confirm` mirrors. UNCHANGED.
- `app/api/v1/auth/signup/route.ts:25-89` — admin `createUser({email_confirm:true})` auto-confirm + sign-in + PAT, 201. ***REWRITE*** (remove auto-confirm backdoor).
- `app/api/v1/auth/magic-link/route.ts` — `signInWithOtp`. UNCHANGED (secondary fallback).
- `app/auth/callback/route.ts` — magic-link code exchange. UNCHANGED.
- `lib/api/principal.ts:45-74` — `resolveIdentity` (Bearer-first then cookie) = coexistence gateway. DO NOT MODIFY; test against it.
- `lib/api/pat.ts:40-83` — `mintPat`. Reuse in `/confirm`.
- `lib/supabase/server.ts` — SSR client; route handlers hit the cookie `setAll` branch → how `/signin` and `/confirm` set session cookies.
- `app/(auth)/login/page.tsx:177-208` — renders `<MagicLinkForm/>` + OR divider + disabled OAuth. Email-first form replaces the magic-link slot as primary; magic-link stays as visible secondary.
- `app/(auth)/login/magic-link-form.tsx` — testids `login-email`/`login-submit`; becomes the secondary "email me a link instead" path.
- `middleware.ts:8-9` — public prefixes include `/api/auth`; `/api/v1/**` self-gates via `withApiHandler`.

## Implementation steps

### A. Backend

- ***A1 — Rewrite ****`signup/route.ts`: `await createClient(); supabase.auth.signUp({ email, password })`. `BodySchema` email + password `min(8)` (drop `pat***` — no PAT at this stage). Map "already registered"→`409 conflict`, 429→`rate*limited`, else `upstream*error`. Return `jsonResponse({ status:'pending*confirmation', email }, { status:202 })`. Remove now-unused admin/mintPat imports. **(AC4, AC11 part 1)**
- ***A2 — Rewrite ****`signup/route.openapi.ts`: response `202 { status:'pending_confirmation', email }`; keep 409/422, add 429. **(AC11)*
- ***A3 — Create ****`app/api/v1/auth/confirm/route.ts` (mirror signin): `auth:'public'`. Body `{ email, token:/^\d{6}$/, pat*name?, pat*scopes?, pat*expires*in*days? }`. `await createClient(); supabase.auth.verifyOtp({ email, token, type:'signup' })`. On error/missing user|session → `ApiError('unauthorized','Invalid or expired verification code.')`; 429→`rate*limited`. Then `mintPat` (admin). Return the ****identical**** signin shape `{user,session,pat,warning}` (200). verifyOtp on SSR client sets cookies. **(AC4 part 2, AC7, AC11 part 2)*
- ***A4 — Create ****`confirm/route.openapi.ts`: body + signin-shaped response; 200/401/422/429. **(AC11)*
- ***A5 — Create ****`app/api/v1/auth/check-email/route.ts`: `auth:'public'`. Body `{ email }`. Admin lookup → `{ exists, confirmed }` (`confirmed` = email*confirmed*at present). Top-of-file comment documenting the accepted enumeration tradeoff + rate-limit mitigation. 429→`rate_limited`. Verify exact `@supabase/supabase-js` admin call at impl (listUsers filter vs query); must stay admin-only. **(AC1, AC2, AC6)*
- ***A6 — Password min asymmetry****: signup/confirm `min(8)`; signin unchanged `min(6)` + code comment. **(business-rules)*

### B. Frontend

- ***B1 — Create ***`app/(auth)/login/email-first-form.tsx` (client). State machine `step: email|password|create|verify` + `email,password,code,submitting,error`, plus `accountConfirmed` from check-email.

  **(AC1,2,3,4,5,6,7,8)**

- ***B2 — Restructure ****`login/page.tsx`: replace magic-link slot with `<EmailFirstForm/>` (primary). Keep OR divider + a VISIBLE secondary "Email me a link instead" disclosure rendering the existing `MagicLinkForm` (`login-magic-link-toggle`). OAuth buttons unchanged (D1). Update subtitle copy to password-primary. **(AC9, OAuth disabled)*
- ***B3 — testid pass**** at point-of-use, kebab-case. **(testability)*

### C. Config (Supabase — VERIFY/APPLY, user-dashboard action where noted)

- ***C1**** Email confirmations ON; single-session mode OFF (coexistence). **(dashboard — user action; cannot read/set from code)*
- ***C2**** Signup OTP email template includes 6-digit `{{ .Token }}`; OTP length 6; sane TTL (~10 min). **(dashboard — user action)*
- ***C3**** `test_otp` seeds for designated test emails (automation). **(dashboard/config — user action)*
- ***C4*** Admin fixture seeding (service-role `createUser({email_confirm:true})`) for test scripts ONLY — never a public route.
- ***C5*** Verify single-session OFF + Supabase auth/OTP throttling enabled.

### D. Tests

- ***D1 — ****`lib/api/auth-coexistence.test.ts` (env-guarded, model `rls-parity.test.ts`): seed confirmed user; mint PAT; assert Bearer resolves same `userId` as cookie identity; assert using/expiring one credential does not revoke the other; `resolveIdentity` returns `via:'bearer'` and `via:'cookie'` for the same `userId`. **(AC10, DoD)*
- ***D2 — confirm-shape check*** (optional, may need `test_otp` user) — else covered by smoke.
- ***D3 — Playwright smoke (CLI, isolated profile, logged-out localhost)****: email-first existing→password happy; new→create→OTP(test_otp)→home; wrong password generic; invalid code + resend; magic-link toggle visible; API+UI coexistence. **(all browser AC)*

### Verify gate

`bun run types:check` && `bun run lint:check` (eslint bans `createClient().auth.getUser()` in `app/api/**`; new routes use `signUp`/`verifyOtp`/`signInWithPassword`/admin lookup — allowed). `bun test` for D1. Smoke on `next dev`.

## AC → step traceability

| # | AC scenario | Steps |
| --- | --- | --- |
| 1 | Email-first → existing → password | A5, B1 |
| 2 | Email-first → new → creation | A5, B1 |
| 3 | Sign in correct password | B1, signin UNCHANGED, C1 |
| 4 | Sign up → 6-digit code → confirm | A1, A3, B1, C1, C2 |
| 5 | Wrong password → generic message | B1, signin 401, A6 |
| 6 | Unconfirmed sign-in blocked → verify prompt | A5 (confirmed flag), B1, C1 |
| 7 | Invalid/expired code + request new | A3, B1 (resend), C2 |
| 8 | Repeated attempts rate-limited | C5 + Supabase throttling; 429 mapping in A3/A5/B1 |
| 9 | Magic-link fallback visible | B2, magic-link UNCHANGED |
| 10 | Token + cookie coexist | resolveIdentity UNCHANGED, D1, C5 |
| 11 | API sign-up → confirm → session+PAT | A1, A3, A4, C2 |

## ADR

ADR-0005 `password-auth-and-email-otp` — ratifies mockup §4.1 departure (D12), email-first enumeration tradeoff, OTP verification on all rails (no public auto-confirm), reaffirms ADR-0001 coexistence invariant. Status Proposed (human accepts).

## Design-plan edits

§5: add D12 (password-primary departure from OAuth-only mockup). §8: add BK-166 row under Tenancy & Identity → Login screen.

## Risks / open questions

- Browser session handoff from a same-origin `fetch` password POST (cookies set on route-handler response, picked up on next navigation) — smoke-verify on `next dev`.
- `check-email` enumeration accepted (business-rules + ADR-0005); only mitigation is throttling.
- Supabase dashboard config (C1/C2/C3/C5) gates the end-to-end OTP flow; cannot be verified from code.
- Exact admin existence-lookup API to confirm at impl.

## Review Workload Forecast

Estimated: ~+550 / −95 code + ~+150 docs/tests = ~+700 total.
400-line budget risk: ***High*** (single PR). 
Chain strategy: single `feature/BK-166-password-auth-ui` branch, ***two reviewable commits*** — (1) Backend + ADR + design + coexistence test (~+330/−95); (2) Frontend email-first form + page (~+300).
Decision needed before apply: ***No*** (the three Stage-1 decisions are resolved above).

---
_Synced from Jira by sync-jira-issues_
