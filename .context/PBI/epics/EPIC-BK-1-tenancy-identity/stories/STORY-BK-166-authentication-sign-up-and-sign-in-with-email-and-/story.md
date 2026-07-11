# Authentication | Sign up and sign in with email and password

**Jira Key:** [BK-166](https://jira.upexgalaxy.com/browse/BK-166)
**Epic:** [BK-1](https://jira.upexgalaxy.com/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For Release
**Priority:** Medium
**Story Points:** -

---

## Overview

***Source spec******:*** FR-001

## User story

As a Full-Stack Developer (Sara Iglesias), I want to sign up and sign in with my email and a password through a single email-first screen so that I can get into Bunkai with the login method I already use everywhere, without waiting for a magic-link email or depending on a third-party identity provider.

This adds password as the ***third*** sign-in method on the login screen, alongside the email magic-link (BK-2) and OAuth (BK-3). Password is the primary method on the screen; magic-link stays visible as a secondary fallback; OAuth buttons remain below. The same account can also be used from automation: an API/CLI consumer (Karim) signs in over the API and receives a personal access token, while a browser session keeps its own cookie — the two coexist without revoking each other.

## Definition of done

- Implementation complete
- Unit tests written (including the cookie-session / token coexistence invariant)
- Code reviewed
- Documentation updated

## QA Refinements (Shift-Left Analysis)

### Refined Acceptance Criteria

> Full Given/When/Then detail with concrete data lives in the ATP (`customfield_10067`, Phase 3). Summary below for description-level traceability.

| AC | Refined with concrete data | Status |
| --- | --- | --- |
| AC1 | Existing confirmed email (`{{STAGING*USER*EMAIL}}`) routes to password step, never offers account creation | Verifiable |
| AC1b (new) | Same routing is case-insensitive (`SARA@EXAMPLE.COM` routes identically to lowercase) | Verifiable — added in refinement |
| AC2 | Unregistered `faker.internet.email()` address routes to the create-account step | Verifiable |
| AC3 | Correct credentials sign in and redirect to `/projects` (NEEDS PO/DEV CONFIRMATION whether AC's "Workspace home" phrasing maps 1:1 to `/projects`) | Verifiable |
| AC4 | Signup → real OTP → confirm happy path | ***NOT VERIFIABLE IN THIS ENVIRONMENT*** — free-tier Supabase email cap, no service-role key in QA tooling. Sub-behaviors not requiring a delivered code (202 response, pending state) ARE covered. |
| AC5 | Wrong password gets a uniform 401 + generic UI message, no enumeration leak | Verifiable |
| AC6 | Unconfirmed account signin reinterpreted client-side as "go verify", not "wrong password" | Verifiable (reachable without a real OTP — signup without confirming is enough) |
| AC7 | Wrong/garbage verification code rejected with uniform message; "request new code" stays available | Verifiable (does not require a **valid** OTP to exist) |
| AC8 | Repeated failed attempts eventually rate-limited | Verifiable, but recalibrated: this is upstream Supabase/GoTrue throttling — no Bunkai-side rate limiter exists (confirmed via code search). Threshold is NEEDS PO/DEV CONFIRMATION. |
| AC9 | Magic-link fallback stays visible (collapsed disclosure) and functional | Verifiable — trivially atomic, single boolean |
| AC10 | API PAT (Karim) and browser cookie (Sara), same account, coexist without revoking each other | Verifiable |
| AC11 | API-only signup+confirm returns session + PAT | ***NOT VERIFIABLE IN THIS ENVIRONMENT*** — same OTP-delivery blocker as AC4 |

### Edge Cases Identified (Phase 2)

- Case-insensitive email handling on `check-email` / `signin` (server normalizes via `.trim().toLowerCase()`).
- Unicode/emoji characters in passwords — no code-level restriction beyond length bounds.
- SQL/script injection strings in the email field — expected to be rejected by Zod's `.email()` before reaching the RPC or Supabase (CRITICAL if not).
- Double-submit signup (rapid double-click) — UI's `submitting` guard should block a second `fetch`; needs empirical confirmation it actually does.
- Token replay — true replay of a valid, already-consumed OTP cannot be tested without a real delivered code (tied to the AC4/AC11 blocker); a wrong-code-resubmitted proxy charter is the closest available coverage.
- Wrong-length vs wrong-value verification code submitted against an email with no pending signup at all — same uniform 401 expected (API cannot distinguish "no such signup" from "wrong code" by design).
- Duplicate or unrecognized `pat*scopes` values — Zod's enum rejects unknown scope strings before `assertNoGlobalAdminScope` ever runs; an empty `pat*scopes` array's exact failure layer is unconfirmed from code alone.

### Clarified Business Rules (Phase 2)

- ***No enumeration on ***`signin`: always a uniform 401 regardless of which credential is wrong. Enumeration is intentionally confined to `check-email` only (ADR-0007 tradeoff) — by design, not a gap.
- ***Asymmetric password minimums***: sign-up/confirm enforce `min(8)`; sign-in keeps `min(6)` so pre-policy legacy passwords continue to authenticate (explicit code comment, BK-166-specific).
- ***Verification-first signup***: `signup` never returns a session or PAT — only `confirm` (after a correct OTP) does. No auto-confirm backdoor.
- ***PAT default scopes***: headless signin/signup/confirm mint `atc:read`, `atc:write`, `run:execute` by default; `workspace:admin` is rejected outright from headless auth (ADR-0005) — that scope requires `POST /api/v1/tokens` against a specific workspace where the caller is admin/owner.
- ***No app-level rate limiting exists today*** for any of the 4 BK-166 routes — all 429 handling is a pass-through of upstream Supabase/PostgREST throttling. AC8 tests Supabase's behavior, not a Bunkai feature; this is confirmed via code search, not inferred.

> Full outline-by-outline detail (42 derived test outlines across EP / BVA / State-Transition / Decision Table / Error-Guessing techniques) lives in the Acceptance Test Plan field (`customfield_10067`).

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Implementation Plan (Dev)](./implementation-plan.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Traceability

### Bug (1)

- [BK-177](https://jira.upexgalaxy.com/browse/BK-177): BK-1: Auth: Staging deployment missing email-first password sign-in UI and 2 of 4 BK-166 API routes _(REJECTED)_

### Story (1)

- [BK-2](https://jira.upexgalaxy.com/browse/BK-2): Authentication | Sign up and sign in with email magic-link _(Ready For Release)_

---

## Metadata

- **Created:** 6/21/2026
- **Updated:** 7/6/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** auth, mvp, shift-left-reviewed, wave-1

---

_Synced from Jira by sync-jira-issues_
