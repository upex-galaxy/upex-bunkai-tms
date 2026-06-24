# BK-3 — Implementation Plan (Dev)

> Jira field: `customfield_10095` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

# BK-3 — Spec Implementation Plan (Dev)

OAuth (GitHub + Google) sign-up / sign-in, end-to-end. Greenfield across 3 layers (UI enable, server initiation, callback exchange) reusing the existing session, redirect, and onboarding infrastructure shipped by BK-166/BK-86.

## Decisions ratified with PO (2026-06-24)

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | ***CSRF = custom server-issued ****`state`**** cookie + server initiation route.**** Mismatch at callback → HTTP ****403**** + code `OAUTH*STATE*MISMATCH`, no session. | Business-rule + scope + AC-5 demand literal server-side 403. Independent of (layered on top of) Supabase PKCE. → ****ADR-0008***. |
| D2 | ***PAT = cookie-session only for OAuth.*** No PAT minted at login. | A 302 redirect cannot hand back a JSON PAT; PAT is for headless/API. OAuth users mint on-demand later via tokens UI. |
| D3 | ***Workspace = reuse ****`/onboarding`****.*** No server-side bootstrap in the callback. | First-time user (no active `workspace_members`) → existing redirect chain routes to `/onboarding` (creates workspace there, same as email signup). Matches AC-8. Zero backend divergence (Rule #15). |
| D4 | ***Redirect contract (authoritative AC field)******:*** first-time → `/onboarding`, returning → `/projects`. No `/home`. | Achieved for free: callback redirects to `/projects`; `projects/page.tsx` bounces no-workspace users to `/onboarding`. |
| D5 | ***Flip design master-plan §5 D1**** ("OAuth disabled until infra sequenced") → "delivered in BK-3; buttons enabled". | BK-3 **is* the infra sequencing D1 deferred. Doc update travels with the PR. |

## Flow (PKCE + custom state)

```
[login] click "Continue with GitHub/Google" (client onClick)
   -> GET /auth/oauth/{provider}?next=/projects        (server route)
        gen state (crypto) -> set httpOnly cookie bk*oauth*state (SameSite=Lax, ~10m TTL)
        supabase.auth.signInWithOAuth({ provider, options:{
            redirectTo: `${origin}/auth/callback?bkstate=${state}&next=${next}`,
            skipBrowserRedirect: true }})  -> { url }   (also persists PKCE code_verifier cookie)
        302 -> provider authorize url
   -> provider consent
        approve  -> Supabase -> 302 /auth/callback?bkstate=...&code=...&next=...
        deny     -> Supabase -> 302 /auth/callback?error=access_denied&...
   -> GET /auth/callback   (extend existing magic-link handler)
        1. provider error param present            -> 302 /login?error=oauth_denied            [AC-4]
        2. bkstate present (OAuth branch):
             cookie missing OR != bkstate          -> 403 + ```, no session  [AC-5]
             clear bk*oauth*state cookie
        3. exchangeCodeForSession(code)
             err = identity/email collision         -> 302 /login?error=email_exists            [AC-7]
             other err (provider 5xx, expired code) -> 302 /login?error=oauth*init*failed        [AC-9]
        4. success -> 302 safeNext (/projects) -> chain routes first-time to /onboarding [AC-1/2/3]
   (magic-link branch unchanged: no bkstate, code present, default next /projects)
```

## Tasks (AC-mapped)

1. `lib/auth/oauth-state.ts` (new, pure, unit-tested) — `generateState()` (crypto random), `OAUTH*STATE*COOKIE` const, cookie options builder, `stateMatches(cookieVal, queryVal)`. [AC-5]
2. `lib/auth/oauth.ts` (new, pure) — `OAUTH*PROVIDERS = ['github','google']`, `isOAuthProvider(x)`, `mapOAuthError(supabaseError) -> 'email*exists'|'oauth*init*failed'` (classifier), `OAUTH*ERROR*MESSAGES` map for the login toast. [AC-7/AC-9]
3. `app/auth/oauth/[provider]/route.ts` (new GET) — validate provider (invalid → 302 /login?error=oauth*init*failed), gen+set state cookie, `signInWithOAuth(skipBrowserRedirect)`, 302 to `data.url`. Under `/auth` → already middleware-public. [AC-1/2]
4. `app/auth/callback/route.ts` (extend) — add the OAuth branch above; keep magic-link branch byte-stable. State 403, provider-error + exchange-error mapping, clear state cookie. [AC-4/5/7/9]
5. `app/(auth)/login/oauth-buttons.tsx` (new client component) — enabled GH/Google buttons, faithful to mockup `login.jsx:151-161` (GitHub icon + dark `#0d1117`, Google icon), onClick → `window.location.assign('/auth/oauth/{provider}?next=...')`, per-button pending state. [AC-10]
6. `app/(auth)/login/login-error-toast.tsx` (new client component) — reads `?error=` via `useSearchParams`, fires Sonner toast on mount: `oauth*denied`→"Try a different method" + magic-link hint; `email*exists`→***destructive*** toast "Account already exists" / "This email is registered via a different provider. Contact support to link accounts."; `oauth*init*failed`→graceful retry + magic-link. Strips the param after firing. [AC-4/7/9]
7. `app/(auth)/login/page.tsx` (edit) — replace disabled-buttons block (192-213) with `<OAuthButtons/>`; mount `<LoginErrorToast/>` (in Suspense); update copy line 174 (drop "OAuth and SSO ship next sprint"). [AC-10]
8. `.env.example` (edit) — document the OAuth redirect/callback URLs + that GitHub/Google client IDs/secrets live in the Supabase dashboard (no new app env var). [G5]
9. `.context/ADR/ADR-0008-oauth-csrf-state-strategy.md` (new, Proposed) — custom state-cookie 403 model + provider/redirect contract.
10. `.context/design/master-design-plan.md` (edit) — flip §5 D1; bump §4.1 login row to delivered.
11. ***Unit tests*** (`bun:test`): `lib/auth/oauth-state.test.ts` (state gen uniqueness, match/mismatch/missing), `lib/auth/oauth.test.ts` (provider validation, error classifier/messages).

## AC coverage matrix (preview)

| AC | Covered by |
| --- | --- |
| AC-1/2 first-time GH/Google → /onboarding | route + callback + existing chain; manual E2E |
| AC-3 returning → /projects, no dup ws | existing chain; manual E2E |
| AC-4 consent denied → OAUTH_DENIED + fallback | callback branch 1 + login-error-toast; unit (classifier) |
| AC-5 state mismatch → 403 | callback branch 2; unit (oauth-state) |
| AC-6 3rd-party cookie blocked → magic-link fallback 30s | login copy + magic-link always visible; manual |
| AC-7 EMAIL_EXISTS → destructive toast | callback + toast; unit (classifier) |
| AC-8 ws bootstrap fail → session kept, /onboarding | reuse onboarding (no bootstrap = no failure path); manual |
| AC-9 init failure → graceful + fallback | callback + toast; unit |
| AC-10 buttons enabled + copy | oauth-buttons + page edit; manual live-UI |

## Manual infra (PO / Ely — blocks live E2E, NOT code)

GitHub OAuth App + Google OAuth Client + enable both providers in Supabase dashboard with redirect URLs for localhost + staging, and ***disable automatic identity linking*** (so cross-provider same-email → error, AC-7). Exact steps handed off separately.

## Out of scope (per story)

Other providers (GitLab/Apple/MS), SSO/SAML, multi-provider account linking — all post-MVP.

## Review Workload Forecast

Estimated: ~360 additions + ~25 deletions = ~385 total lines
400-line budget risk: ***Medium***
Chain strategy: single feature-branch PR (`feature/BK-3-oauth` → staging)
Decision needed before apply: No

---
_Synced from Jira by sync-jira-issues_
