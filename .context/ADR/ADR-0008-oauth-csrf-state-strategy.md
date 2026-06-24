# ADR-0008 — OAuth CSRF state strategy and sign-in flow

- **Status:** Proposed
- **Date:** 2026-06-24
- **Story:** BK-3 (Sign up and sign in via OAuth — GitHub / Google)
- **Supersedes / relates:** ADR-0007 (password auth + email OTP); reaffirms the PAT/cookie coexistence invariant (ADR-0001).

## Context

BK-3 adds OAuth (GitHub + Google) as a sign-in rail alongside the existing
password-primary, email-first flow. The story's business rules, scope, and AC-5
explicitly require: **"OAuth state MUST be validated server-side; mismatch → 403."**

Supabase Auth with `@supabase/ssr` already runs the **PKCE** flow, which protects
against CSRF via a `code_verifier` cookie that `exchangeCodeForSession` validates.
However, a PKCE failure surfaces as a redirect/exchange error, not the literal
`403 + OAUTH_STATE_MISMATCH` the spec demands, and the verifier is internal to the
SDK — we do not control or observe it to assert a hard 403.

## Decision

Layer an **independent, server-issued CSRF `state` token** on top of Supabase PKCE.

1. **Server-side initiation.** OAuth starts at `GET /auth/oauth/[provider]` (not a
   browser-side `signInWithOAuth` call). This is what lets us mint and store the
   state cookie *before* the browser leaves for the provider.
   - Mint `state = crypto.randomUUID()`; store it in an httpOnly, `SameSite=Lax`,
     short-TTL (10 min) cookie `bk_oauth_state`.
   - Call `signInWithOAuth({ provider, options: { skipBrowserRedirect: true,
     redirectTo: '/auth/callback?bkstate=<state>&next=<next>' } })`; the SDK
     returns the provider URL and persists its own PKCE `code_verifier` cookie via
     the SSR cookie adapter.
   - 302 to the provider authorize URL.
2. **Callback validation order** (`GET /auth/callback`, shared with magic-link):
   - provider `error` param (consent denied) → `302 /login?error=oauth_denied`.
   - `bkstate` present marks the OAuth branch → compare against the `bk_oauth_state`
     cookie with a **constant-time** comparison; delete the cookie (one-time use);
     mismatch/missing → **`403 { code: 'OAUTH_STATE_MISMATCH' }`, no session.**
   - then `exchangeCodeForSession(code)`; on error → `oauth_init_failed` (AC-9).
   - success → 302 to `next` (`/projects`); the existing redirect chain routes a
     first-time user (no workspace) to `/onboarding`.
3. **No PAT at OAuth login.** A 302 redirect cannot return a JSON PAT the way the
   password/OTP rails do. OAuth users get the cookie session only; they mint a PAT
   on demand later via the tokens UI. The PAT/cookie coexistence invariant is
   unaffected.
4. **No server-side workspace bootstrap.** First-time OAuth users reuse the
   existing `/onboarding` workspace-creation flow (same path email signups take).
   This avoids a new backend code path and the AC-8 ghost-user failure mode.
5. **Automatic identity linking (PO decision, 2026-06-24).** Supabase's default
   auto-linking stays **enabled**: identities sharing the same verified email
   (GitHub / Google / password) link to one account and sign in seamlessly. There
   is therefore **no `EMAIL_EXISTS` error path** — AC-7 was reversed by the PO to
   prioritize sign-in UX. Explicit/manual multi-provider management UI stays Phase 2.

## Alternatives considered (CSRF)

- **Supabase PKCE only.** Simplest and industry-standard, but cannot produce the
  literal `403 + OAUTH_STATE_MISMATCH` that the business rule, scope, and AC-5
  require. Rejected as non-compliant with explicit written scope.
- **Client-side `signInWithOAuth` (browser redirect).** Cannot set an httpOnly
  server state cookie before leaving for the provider. Rejected.
- **Mint PAT in the callback.** Requires an extra cookie/redirect dance to hand the
  token to the browser; PAT is a headless/API concern, not needed for a web session.
  Rejected for OAuth.

## Consequences

- **Positive:** Meets the spec's literal server-side 403; CSRF protection is
  explicit and unit-testable (`lib/auth/oauth-state.ts`) independent of SDK
  internals; magic-link rail is untouched; zero schema/auth backend churn beyond
  the new routes.
- **Negative / follow-ups:**
  - Two CSRF layers (our state + PKCE verifier) — intentional redundancy.
  - Automatic identity linking means a single verified email is one account across
    all methods; there is no per-method isolation (accepted by the PO as the
    desired UX). Supabase auto-linking must remain enabled (its default).
  - A literal 403 JSON page on state tampering is an attacker/tamper path, not a
    normal-UX redirect — acceptable per AC-5.

## Compliance / verification

CSRF + provider + error vocabulary covered by `lib/auth/oauth-state.test.ts` and
`lib/auth/oauth.test.ts`. Happy paths and the 30s third-party-cookie fallback are
covered by manual live-UI E2E once the provider apps + Supabase config are in place.
