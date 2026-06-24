# BK-3 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

SHIFT-LEFT REFINEMENT: BK-3
Refined on: 2026-05-26 | Risk: HIGH | Source: FR-001 (OAuth portion)

== CRITICAL ANALYSIS ==

BK-3 is a COMPLETE GREENFIELD — zero OAuth code in codebase. All 3 layers missing:

- UI: Both OAuth buttons disabled=true, cursor-not-allowed, title='OAuth ships next sprint' (login/page.tsx:136-155)
- Client: auth-context.tsx has only signInWithMagicLink+signOut. No signInWithOAuth anywhere.
- Server: app/auth/callback/route.ts handles magic-link OTP only. No state validation. Default redirect is /projects NOT /home.

== IMPLEMENTATION GAPS (from codebase) ==

G8: app/auth/callback/route.ts — magic-link only, no OAuth handler, redirects to /projects
G9: components/providers/auth-context.tsx — no signInWithOAuth method exists
G10: app/(auth)/login/page.tsx lines 136-155 — buttons disabled, no onClick handler

== CONTRADICTIONS ==

C1: Story says redirect to /home; callback route defaults to /projects. Must align before Dev starts.
C2: Login copy says 'OAuth ships next sprint' + buttons disabled — button enable + copy update are IN SCOPE for BK-3.

== AC GAPS (10 total: 7 original + 3 from codebase) ==

G1: No returning user sign-in scenario
G2: EMAIL_EXISTS — business rule defined but no user-facing AC
G3: Workspace bootstrap failure after successful OAuth
G4: Session cookie attributes and TTL
G5: OAuth initiation failure (provider down)
G6: Rate limiting on OAuth callback
G7: Account linking UX (blocked in MVP — what does user see?)
G8: OAuth callback route strategy (new — from codebase)
G9: OAuth client initiation scope/config (new — from codebase)
G10: OAuth button onClick handlers (new — from codebase)

== AMBIGUITIES (5) ==

A1: 'status 201' on page redirect — HTTP 201 is for resource creation, not browser redirect. Untestable as written.
A2: 'user row upserted in auth.users' — QA has no visibility into auth.users in staging. Observable signal?
A3: 30s fallback timer — starts at button click, provider redirect, or callback arrival?
A4: EMAIL_EXISTS — surfaced in UI, API error, or silent?
A5: 'Default workspace created' — observable evidence? URL, UI element, or DB only?

== REFINED ACs (10 scenarios) ==

AC-1 [GitHub happy path — first sign-up]
Given visitor on Sign-in screen, Continue with GitHub button enabled
When they click it and approve OAuth consent on GitHub
Then Supabase Auth completes code exchange with valid CSRF state token
And user row created in auth.users with provider=github
And default workspace created
And user redirected to /home
And valid session cookie set

AC-2 [Google happy path — first sign-up]
Given visitor on Sign-in screen, Continue with Google button enabled
When they click it and approve OAuth consent on Google
Then Supabase Auth completes code exchange, user created/upserted
And default workspace created
And user redirected to /home

AC-3 [Returning OAuth user] NEEDS PO/DEV CONFIRMATION
Given user who previously signed up via GitHub OAuth
When they click Continue with GitHub and approve consent
Then existing user row upserted (no duplicate)
And no second workspace created
And user redirected to /home with existing workspace

AC-4 [Consent denied]
Given visitor clicks Continue with GitHub or Google
When they deny the OAuth consent screen
Then redirect to /login with error code OAUTH_DENIED
And magic-link fallback CTA visible
And no user record or session created

AC-5 [CSRF state mismatch]
Given OAuth callback with state param not matching issued CSRF token
When server processes callback
Then request rejected with HTTP 403
And error code OAUTH*STATE*MISMATCH returned
And no session created

AC-6 [Third-party cookie restrictions]
Given visitor on browser blocking third-party cookies
When OAuth callback cannot set session cookie within 30 seconds
Then Bunkai surfaces magic-link fallback within 30 seconds
And explanatory copy shown

AC-7 [EMAIL_EXISTS] NEEDS PO/DEV CONFIRMATION
Given user whose email already registered via different OAuth provider
When they attempt sign in via second provider with same email
Then rejected with error code EMAIL_EXISTS
And user redirected to /login with error surfaced in UI
And message explains manual linking requires support
And no duplicate user record created

AC-8 [Workspace bootstrap failure] NEEDS PO/DEV CONFIRMATION
Given first-time OAuth user whose code exchange completes successfully
When server-side workspace creation fails
Then user does not land on broken /home
And recoverable error screen or onboarding screen shown
And session still valid

AC-9 [OAuth initiation failure] NEEDS PO/DEV CONFIRMATION
Given visitor who clicks an OAuth button
When redirect to provider fails
Then error message shown on login screen
And retry option or magic-link alternative presented

AC-10 [UI buttons enabled] NEEDS PO/DEV CONFIRMATION
Given Sign-in screen after BK-3 ships
Then Continue with GitHub button is enabled and clickable
And Continue with Google button is enabled and clickable
And login page no longer contains 'OAuth and SSO ship next sprint'

== ATP DRAFT — 20 TEST OUTLINES ==

POSITIVE (5):
1. GitHub OAuth first-time sign-up — user+workspace created, redirect /home
2. Google OAuth first-time sign-up — user+workspace created, redirect /home
3. GitHub OAuth returning user — no duplicate user or workspace
4. Google OAuth returning user — session refreshed, workspace unchanged
5. OAuth buttons enabled + login copy updated after BK-3 ships

NEGATIVE (7):
6. Consent denied GitHub — OAUTH_DENIED at /login, magic-link CTA visible
7. Consent denied Google — OAUTH_DENIED at /login, magic-link CTA visible
8. CSRF state mismatch — 403, OAUTH*STATE*MISMATCH, no session
9. EMAIL_EXISTS via Google for GitHub-registered email — error surfaced in UI
10. EMAIL_EXISTS via GitHub for Google-registered email — error surfaced in UI
11. OAuth initiation failure (provider unavailable) — error + fallback shown
12. Workspace bootstrap failure — no broken /home, recoverable error

BOUNDARY (3):
13. Third-party cookie restrictions — magic-link fallback within exactly 30s
14. Simultaneous OAuth + magic-link session — no collision
15. OAuth callback with expired code (reuse after TTL) — rejected, no session

INTEGRATION (5):
16. GitHub OAuth full Supabase flow — code exchange, user upsert, session cookie
17. Google OAuth full Supabase flow — code exchange, user upsert, session cookie
18. First OAuth login — workspace row + workspace_members row created in DB
19. OAuth session cookie — httpOnly, secure, SameSite=Lax at network layer
20. Repeated failed CSRF probes — rate-limiting or lockout at /auth/callback

== EDGE CASES ==

HIGH: Browser closed mid-OAuth (dangling state token must expire gracefully)
HIGH: Callback arrives after state token TTL expires
HIGH: GitHub returns unverified email — Supabase enforcement undefined
MEDIUM: Concurrent OAuth from two tabs — state token collision
MEDIUM: Email alias normalization (user+alias@gmail.com vs canonical)
MEDIUM: Network timeout between code exchange and workspace creation

== OPEN QUESTIONS FOR PO/DEV (BLOCK sprint planning) ==

Q1 [BLOCKER - C1]: Canonical post-OAuth redirect — /home or /projects? If /home does not exist yet, what is the interim target?

Q2 [BLOCKER - A5]: Observable evidence of workspace creation — workspace-scoped URL, UI header element, or DB-only?

Q3 [BLOCKER - G2]: EMAIL_EXISTS user-facing behavior — URL param, in-page toast, error page? HTTP status?

Q4 [BLOCKER - G8]: OAuth callback route strategy — extend app/auth/callback/route.ts branching on state param, or create dedicated app/auth/oauth/callback/route.ts? Affects Supabase redirect URI config.

Q5 [BLOCKER - G3]: Workspace bootstrap failure behavior — (a) rollback session + redirect to /login?error=WORKSPACE*CREATION*FAILED, (b) persist session + onboarding screen, or (c) lazy workspace creation on first /home load?

---
_Synced from Jira by sync-jira-issues_
