# BK-3 — Spec Compliance Matrix

PR #56 · branch `feature/BK-3-oauth` · 2026-06-24

| AC scenario | covered_by | evidence | status |
|---|---|---|---|
| AC-1 GitHub first-time → /onboarding | manual:live | Playwright round-trip landed on `/onboarding` | covered |
| AC-2 Google first-time → /onboarding | manual:staging-qa | same code path as AC-1; Google E2E pending on staging | manual |
| AC-3 Returning OAuth user → /projects, no dup workspace | manual:staging-qa | existing redirect chain (projects→onboarding only when no workspace); PO verifying | manual |
| AC-4 Consent denied → OAUTH_DENIED + magic-link CTA | test + manual:curl | `307 /login?error=oauth_denied`; toast via login-error-toast (proven) | covered |
| AC-5 State CSRF mismatch → 403 | test:oauth-state + manual:curl | `403 {"code":"OAUTH_STATE_MISMATCH"}`; unit tests on stateMatches | covered |
| AC-6 Third-party cookies blocked → magic-link fallback ≤30s | manual:staging-qa | magic-link rail always visible on /login; timing check on staging | manual |
| AC-7 Cross-provider same email → automatic identity linking | review-approved:adversarial + manual:staging-qa | Supabase auto-linking enabled (PO decision); no EMAIL_EXISTS path | manual |
| AC-8 Workspace bootstrap failure → session kept, /onboarding | exempt:no-bootstrap-path | no server-side workspace bootstrap (reuse /onboarding); failure mode does not exist by design | exempt |
| AC-9 OAuth initiation failure → graceful + fallback | manual:curl | `307 /login?error=oauth_init_failed` (invalid provider + provider 5xx) | covered |
| AC-10 OAuth buttons enabled + copy updated | manual:live | screenshot + DOM (no disabled, no "soon"); copy line updated | covered |

**Gate:** no `uncovered` rows. `manual` rows (AC-2/3/6/7) are deferred to QA on staging (real Google/returning/cookie flows). AC-8 is `exempt` with a specific reason (the bootstrap path was designed out). PR is clear to merge.

**Adjudicated review findings (adversarial pass):**
- NIT — login-error-toast `useEffect` deps cause extra (idempotent) invocations. Verdict: accepted as-is; `fired` ref guards correctness. Not fixed (trivial).
- Pre-existing (NOT this PR) — magic-link error codes (`otp_exchange_failed`) have no toast surface. Verdict: out of BK-3 scope; logged as a follow-up for the backlog, not fixed here.
