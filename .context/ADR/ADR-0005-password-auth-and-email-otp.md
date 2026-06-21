# ADR-0005 — Password-Primary Auth & Mandatory Email-OTP Verification

- **Status:** Proposed <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-06-21 <!-- date the decision was made / last status change -->
- **Deciders:** Dev (drafted), Architect + PO (accept), QA-Lead (test gate)
- **Tags:** authentication, auth-ux, security, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

> This ADR does **NOT** supersede [ADR-0001](./ADR-0001-unified-api-authentication.md) — it **upholds and reaffirms** that ADR's cookie/PAT coexistence invariant. Where ADR-0001 unified *how a request is authenticated* (one `Principal` resolved from either a cookie session or a Bearer PAT), this ADR governs *how an account is created and verified* before either credential is minted, and which auth method the login screen leads with. The coexistence invariant is a constraint on this work, not a casualty of it.

---

## Context

BK-166 (Authentication: sign-up and sign-in with email) opens the **Tenancy & Identity** epic's account-onboarding surface. The frozen mockup and the prior backend force a decision now, on two fronts that are both architectural and hard to reverse once accounts exist in production:

1. **The mockup specifies an auth method the product is not building.** Mockup §4.1 (`login.jsx`) — captured as divergence **D1** in the master design plan — shows **OAuth GitHub + Google as the only auth controls**: there is **no password form and no magic-link form** on the login screen. D1 already ratified that OAuth infra is deferred and the OAuth buttons render disabled/"soon". But that leaves the product with no authored primary auth method on the screen. BK-166 makes **password** the primary, email-first sign-in/sign-up method — a deliberate departure from the OAuth-only mockup that needs ratification beyond the existing D1 (which only covered "keep OAuth visible but disabled").

2. **The prior sign-up route shipped an auto-confirm backdoor that violates the new verification rule.** `app/api/v1/auth/signup/route.ts` used the **admin** auth API with `createUser({ email_confirm: true })` — it auto-confirmed every account, signed the user in, and minted a PAT in one 201 response, with **no real email verification**. The product rule going forward is **verification mandatory on all rails, no public auto-confirm**: a human must prove control of the email before a session or PAT is minted, whether they sign up in the browser or via the headless API. The admin auto-confirm path is a public privilege the product no longer wants to grant.

Constraints in play: the ADR-0001 coexistence invariant is non-negotiable (cookie session and Bearer PAT for the same human must stay independent — minting, using, or expiring one must never revoke the other); the email-first single-field flow needs to route a typed email to the right next step (password vs. create) **before** a password is collected (an AC requirement); frozen §2 design tokens only; additive — `signin` and `magic-link` routes stay as-is, the coexistence gateway (`lib/api/principal.ts → resolveIdentity`) is not modified.

## Decision

**We will make password the primary, email-first auth method on the login screen, require a mandatory 6-digit email OTP to confirm an account on every rail (browser and headless API), remove the admin auto-confirm backdoor, and reaffirm — with a mandatory test — the ADR-0001 cookie/PAT coexistence invariant.**

Concretely:

1. **Email-first routing via a dedicated existence endpoint.** A new public `POST /api/v1/auth/check-email` returns `{ exists, confirmed }`. The single-field email step calls it to decide the next step (existing account → password step; new email → create step) and to interpret a later sign-in failure (an existing-but-**unconfirmed** account routes to the OTP verify step instead of showing "wrong password"). We **accept user-enumeration as the explicit tradeoff** of this endpoint — it is the only way to satisfy the AC that routing happens before a password is collected. The mitigation is **rate-limiting** (see point 5). `signin` itself stays unchanged: it still returns a uniform 401 and leaks nothing on its own.

2. **Mandatory 6-digit email OTP on both rails; admin auto-confirm removed.** The public `signUp` route is rewritten to call `supabase.auth.signUp({ email, password })` and return **202 `{ status: 'pending_confirmation', email }` with no session and no PAT** — account creation no longer logs anyone in. A new public `POST /api/v1/auth/confirm` route accepts `{ email, token (6 digits), pat_* }`, calls `supabase.auth.verifyOtp({ email, token, type: 'signup' })`, and on success mints a PAT and returns the **identical response shape as `signin`** (`{ user, session, pat, warning }`, 200) — the SSR client sets session cookies on the route-handler response. The `createUser({ email_confirm: true })` admin auto-confirm path is **deleted from the public surface**; service-role auto-confirm survives only in test-fixture seeding scripts, never as a route.

3. **Reaffirm the ADR-0001 coexistence invariant (mandatory test).** The cookie session and the Bearer PAT for the same account remain fully independent, resolved by the unchanged `resolveIdentity` gateway. Creating, using, or expiring one credential **never** revokes the other. A new env-guarded coexistence test (`lib/api/auth-coexistence.test.ts`, modeled on `rls-parity.test.ts`) asserts that a Bearer PAT and a cookie session resolve to the **same `userId`** and that exercising/expiring one does not invalidate the other. This is the verification layer that keeps ADR-0001's guarantee true through BK-166's changes.

4. **Password primary, magic-link visible secondary, OAuth disabled.** The login screen leads with the email-first password form. The existing magic-link flow (`magic-link/route.ts`, unchanged) is retained as a **visible secondary** "email me a link instead" path. OAuth stays **disabled** per D1. This is the password-primary departure ratified here and recorded as **D12** in the master design plan §5.

5. **MVP rate-limiting relies on Supabase's built-in throttling.** For the MVP, abuse mitigation (including the enumeration surface of `check-email` and OTP brute-force) relies on **Supabase's built-in auth/OTP throttling**, surfaced to clients as a `429 → rate_limited` mapping. A dedicated app-level rate limiter is a **documented follow-up**, not in this story's scope.

## Consequences

- **Positive:**
  - Real email verification on every rail — no account gets a session or a PAT without proving control of its inbox; the public auto-confirm backdoor is gone.
  - Cross-rail parity: the headless API onboarding (`signUp` → `confirm`) mints exactly the same `{ user, session, pat }` shape as the browser sign-in, so automation and humans follow one verified path.
  - Mockup-faithful-enough: the screen reaches a usable, ratified state while keeping OAuth visually deferred (D1) — the product gets a real primary auth method without OAuth infra.
  - The ADR-0001 coexistence invariant is not just preserved but **pinned by a regression test**, so future auth changes that would clobber a cookie or a PAT fail the build.
- **Negative / trade-offs:**
  - **Enumeration surface accepted.** `check-email` reveals whether an email is registered (and confirmed). This is a deliberate, documented tradeoff demanded by the email-first AC; its only MVP mitigation is throttling.
  - **Uniform-401 ambiguity handled UI-side.** Because `signin` returns a uniform 401, the UI cannot tell "wrong password" from "unconfirmed account" from the sign-in response alone — it resolves the ambiguity by reading the `confirmed` flag from `check-email`. The disambiguation lives in the client, not the auth endpoint.
  - **No enforced custom rate-limiter yet.** MVP leans entirely on Supabase's throttling; until the app-level limiter follow-up ships, the abuse ceiling is whatever Supabase enforces.
- **Neutral / follow-ups:**
  - Dedicated app-level rate limiter (point 5) — documented follow-up, separate story.
  - Supabase dashboard config (email confirmations ON, single-session OFF for coexistence, signup OTP template with a 6-digit `{{ .Token }}`, `test_otp` seeds for automation) gates the end-to-end flow and is a user-dashboard action, not code.
  - Password-policy asymmetry (sign-up/confirm enforce `min 8`; sign-in keeps `min 6` for legacy accounts) is a story-local trade-off documented in code, not an ADR-level invariant.

## Follow-ups (security review BK-166)

An adversarial security review of the BK-166 implementation surfaced the following items. They are **deliberately deferred** (out of this story's scope) and recorded here so they are not lost:

- **PAT issuance defaults to god-scope + non-expiring** on both `signin` and `/confirm` (mirrors `POST /api/v1/tokens`, which requires explicit scopes). Consider least-privilege defaults in a follow-up. Not changed now to preserve `signin`'s existing contract and the "always mint a PAT" product decision.
- **`check-email` enumeration needs an app-level rate limiter.** Supabase's GoTrue auth/OTP throttling does **not** cover this route — it is a direct service-role PostgREST read of `auth.users` that bypasses GoTrue. This is the real mitigation for the accepted enumeration tradeoff (point 5 above).
- **`signin`/`confirm` echo the session `refresh_token` and the PAT in the JSON body** (by design, for CLI parity). Ensure logging / error-reporting middleware scrubs these fields so they never land in logs or error reports.
- **`lib/api/middleware/bearer.ts` hash comparison is non-constant-time** despite a comment implying otherwise (pre-existing infra). Risk is negligible — it compares SHA-256 digests of 256-bit secrets — but a follow-up should align the code or the comment.

## Alternatives considered

- **Attempt-driven unconfirmed detection (no `check-email` endpoint)** — rejected: infer account state from sign-in failures instead of an existence probe. The AC requires the single email field to **route to the right next step (password vs. create) before a password is collected**, which a post-password 401 cannot do. Folding detection into the attempt also could not drive the create-vs-sign-in fork up front.
- **Keep the admin auto-confirm sign-up (`createUser({ email_confirm: true })`)** — rejected: it grants a public, unverified account a session + PAT in one call, directly violating the "verification mandatory on all rails, no public auto-confirm" rule. The whole point of BK-166 is that control of the email is proven before any credential is minted.
- **Magic-link-only verification (no 6-digit code)** — rejected: the AC mandates a **6-digit code** the user enters to confirm. A click-only link path does not satisfy it (and the headless API rail cannot follow a browser link). Magic-link is retained only as a visible *secondary* sign-in convenience, not as the verification mechanism.

## References

- Story plan: `.context/PBI/epics/EPIC-BK-1-tenancy-identity/stories/STORY-BK-166-authentication-sign-up-and-sign-in-with-email-and-/implementation-plan.md` (resolved Stage-1 decisions, A1–A6 backend steps, AC→step traceability, ADR section).
- [ADR-0001](./ADR-0001-unified-api-authentication.md) — Unified API Authentication: the cookie/PAT coexistence invariant and `resolveIdentity` gateway this ADR **reaffirms** (does not supersede).
- Master design plan: `.context/design/master-design-plan.md` §4.1 (Login screen), §5 D1 (OAuth visual-only deferral) and **D12** (password-primary departure ratified by this ADR), §8 (BK-166 → Login row).
- Domain glossary: `.context/business/domain-glossary.md` — auth terminology.
