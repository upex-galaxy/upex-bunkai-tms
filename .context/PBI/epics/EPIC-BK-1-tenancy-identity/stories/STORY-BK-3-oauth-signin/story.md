# Sign up and sign in via OAuth (GitHub / Google)

**Jira Key:** [BK-3](https://upexgalaxy67.atlassian.net/browse/BK-3)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** Ready For Dev
**Priority:** Medium
**Story Points:** 8

---

## Overview

***Source spec:*** FR-001 — Email + OAuth sign-up (OAuth portion)

## User story

As a visitor, I want to sign up and sign in via OAuth (GitHub or Google) so that I can join Bunkai using my existing identity provider.

Implements ***FR-001**** partially — OAuth side only. Email magic-link is covered by ****BK-2***.

## Business rules

- OAuth state token MUST be validated server-side; mismatch → 403.
- An OAuth-only user has NO password and cannot use email magic-link as alternate sign-in unless explicitly linked (Phase 2).
- If a user signs up with both GitHub and Google using the same verified email, the second attempt is rejected with `EMAIL_EXISTS` (manual linking by support in MVP).

## Workflow

1. Visitor clicks "Continue with GitHub" (or Google).
2. Browser is redirected to provider's consent screen with state token attached.
3. User approves on provider.
4. Provider redirects to `/auth/callback?code=...&state=...`.
5. Server validates state, exchanges code with Supabase Auth.
6. On success: user row created or upserted with `provider` field; if first verified login, default workspace created; session cookie set.
7. Redirect to `/home`.
8. On any failure: redirect to `/login` with error code + magic-link fallback CTA.

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

## Labels

`auth`, `mvp`, `wave-1`

## QA Refinements (Shift-Left Analysis)

***Refined on****: 2026-05-26 | ****QA mode***: Shift-Left pre-sprint batch  
***Verdict***: Needs Improvement — 7 AC gaps, 5 ambiguities, 2 contradictions found

---

### Story Quality Summary

| Axis | Rating |
|---|---|
| Business logic | High |
| Integration complexity | High |
| Data validation | Medium |
| UI complexity | Low |

***Test effort estimate***: High — 20 test outlines (5 positive, 7 negative, 3 boundary, 5 integration)

---

### Critical Implementation Gap

***OAuth buttons in ****`login/page.tsx`**** are hardcoded as ***`disabled` (label "soon", `cursor-not-allowed`, `opacity-60`). BK-3 cannot be tested until these buttons are enabled as part of this story's implementation scope.

---

### Ambiguities Found (5)

| # | Question | Impact |
|---|---|---|
| A1 | Who validates OAuth state token — Supabase SDK or custom middleware? | Scope of state-tampering test |
| A2 | Is `provider` upserted to `auth.users.raw*app*meta_data` or a separate Bunkai table? | Determines DB assertions |
| A3 | Is first-login workspace bootstrap synchronous (rollback on fail) or fire-and-forget? | Two different test paths |
| A4 | Canonical post-OAuth redirect: `/home` (story) vs `/projects` (code)? | Success-path assertion target |
| A5 | Is magic-link fallback CTA always visible or dynamically rendered on error? | CTA visibility assertion |

---

### AC Gaps Found (7)

| # | Missing AC | Risk if omitted |
|---|---|---|
| G1 | State token mismatch → 403 + redirect to `/login?error=state_mismatch` | CSRF/session fixation — pre-release checklist item #1 |
| G2 | Provider returns error param (user denies consent) → graceful error redirect | Callback crashes with 500 |
| G3 | Workspace bootstrap fails after token exchange → session NOT set | Ghost user: valid JWT, no workspace, all API calls 403 |
| G4 | Returning user (not first login) → no duplicate workspace created | Workspace duplication on every sign-in |
| G5 | OAuth redirect URI must be documented in spec or `.env.example` | Misconfigured OAuth app = all sign-ins fail silently |
| G6 | `EMAIL_EXISTS`: HTTP status, user-visible message, error URL not specified | Silent failure or account-existence information leak |
| G7 | Rate-limit policy for OAuth initiation not specified | Credential-stuffing via OAuth provider |

---

### Contradictions Found (2)

| # | Contradiction |
|---|---|
| C1 | Story workflow says redirect to `/home`; callback route code defaults to `/projects`. Must reconcile before Dev implements. |
| C2 | `login/page.tsx` comment says "OAuth ships next sprint" — if BK-3 is the OAuth ticket, UI copy AND button enable are in-scope. |

---

### Critical Questions for PO (BLOCK sprint planning)

1. ***Canonical post-OAuth redirect***: `/home` or `/projects`? (C1)
2. `EMAIL_EXISTS`*** exact error code and user-visible message?*** (G6)
3. ***Invited users exempt from default workspace bootstrap?*** (E8 — prevents dual-workspace creation)

---

### Refined ACs (7 new scenarios added)

See comment "Shift-Left Refinement Mirror" on this issue for the full refined AC set, edge case analysis, and test outlines.

---

**Shift-Left label: **`shift-left-reviewed`** **`shift-left-2026-05-26`

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/28/2026
- **Reporter:** Ely
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** auth, mvp, shift-left-2026-05-26, shift-left-reviewed, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T01:06:46.120Z_
