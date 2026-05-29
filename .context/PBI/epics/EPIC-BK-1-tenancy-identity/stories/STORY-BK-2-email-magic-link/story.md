# Authentication | Sign up and sign in with email magic-link

**Jira Key:** [BK-2](https://upexgalaxy67.atlassian.net/browse/BK-2)
**Epic:** [BK-1](https://upexgalaxy67.atlassian.net/browse/BK-1) (Tenancy & Identity)
**Type:** Story
**Status:** QA Approved
**Priority:** Medium
**Story Points:** 5
**Web Link:** https://upexbunkai.vercel.app

---

## Overview

***Source spec:*** FR-001 — Email + OAuth sign-up (email magic-link portion)

## User story

As a visitor, I want to sign up and sign in with email using a magic-link flow so that I can access Bunkai without managing a password.

Implements ***FR-001**** partially — email side only. OAuth side is covered by ****BK-3***.

## Business rules

- Email must be unique in `auth.users` (Supabase enforces).
- First verified sign-in MUST create exactly one default workspace; idempotent on retry.
- Magic-link tokens are signed JWTs (Supabase-managed), single-use, TTL 15 minutes.
- A user who accepted a workspace invite skips the personal-workspace auto-create.

## Workflow

1. Visitor lands on `/login`.
2. Enters email, clicks "Send magic link".
3. Supabase Auth dispatches signed email.
4. Visitor opens email client, clicks link.
5. Browser hits `/auth/callback?token=...`; server validates token via Supabase.
6. On success: user row created or upserted; if first verified login and no pending invite, default workspace created; session cookie set.
7. Redirect to `/home` (Workspace Home).

## Definition of done

- Implementation complete
- Unit tests written
- Code reviewed
- Documentation updated

## Labels

`auth`, `mvp`, `wave-1`

---

## QA Refinements (Shift-Left Analysis)

> Added 2026-05-25 by Shift-Left QA. Full ATP DRAFT lives in custom field 🧪 Acceptance Test Plan (ATP) and mirrored as a comment on this issue. This section captures the slices PO + Dev need before estimation.

### Refined Acceptance Criteria — summary

11 Gherkin scenarios produced (Happy 2 / Negative 5 / Boundary 2 / Integration 2). Key contract decisions:

- Redirect chain: callback → `/onboarding` (uses existing guard that short-circuits to `/projects` when membership exists). The story's `/home` is replaced by this chain because `/home` route does not exist in the codebase.
- Default workspace creation: KEEP the manual `/onboarding` form path (rejecting AC's "auto-create on first sign-in" because slug must be globally unique + user-controlled). Pre-fill workspace name + slug suggestions in the form.
- Error code envelope: extend existing ApiError envelope with `INVALID*EMAIL`, `TOKEN*USED`, `TOKEN*EXPIRED`, `MISSING*CODE`, `RATE*LIMITED`, `UPSTREAM*ERROR`. Callback maps Supabase v2 error codes to these and passes via `?error=...` so `/login` renders contextual UX.
- RFC 5321: enforce 254-char ceiling client + server (`z.string().email().max(254)`).
- TTL 15 min: ops concern — verify `auth.otp_exp = 900` on each Supabase project; document in repo.

Full Gherkin in the comment + ATP field.

### Edge Cases Identified

15 edge cases catalogued (5 High, 7 Medium, 3 Low). High-severity highlights:

- Same email requesting links from two devices/browsers concurrently (resend semantics undefined)
- Magic link clicked on a different device than the one that requested it
- Magic link clicked while user is already signed in as a **different** identity
- Mailbox bounces / undeliverable address handling
- Slug collision on bootstrap (two users want same slug)
- Bootstrap RPC fails mid-flight (partial-state risk; mitigated by SECURITY DEFINER atomicity)
- First-sign-in race (double-click callback parallel)
- Supabase project paused / unreachable

### Clarified Business Rules

- Magic-link tokens single-use; replay → `TOKEN_USED` (NOT silent success).
- Magic-link TTL = 15 minutes (Supabase `auth.otp_exp = 900`) — enforced by GoTrue config, NOT codebase. Must be verified per environment before development starts.
- First-sign-in default workspace = manual onboarding form (with pre-fill UX), NOT automatic background creation.
- Open-redirect guard on `next` parameter retained (callback already validates root-relative path).
- Pending-invite bypass branch belongs to BK-5, NOT BK-2. The onboarding-guard `eq('status', 'active')` already supports the future composition.
- Resend-before-expiry: MVP keeps both tokens valid (Supabase default) + 60s UI cooldown to prevent accidental double-request. Security upgrade (invalidate-on-resend) deferred to a separate Story unless PO greenlights now.

### Open Questions for PO / Dev / Design

For PO (5):

1. Confirm resend semantics: MVP both-valid + 60s cooldown? Or invalidate-on-resend now (+1-2 sprint days)?
2. Workspace-name default pre-fill: acceptable? Or prefer empty field?
3. UX scope cut: confirm IN BK-2 = 5.1 (cooldown) / 5.3 (error pages) / 5.5 (pre-fill) / 5.7 (a11y); deferred = 5.2 (provider deep-links) / 5.4 (email memory) / 5.6 (welcome toast) / 5.9 (branded email)?
4. Confirm `/onboarding → /projects` chain replaces story's `/home`?
5. Magic-link branded email template — separate ops Story?

For Dev (4):

1. Exact Supabase v2 error codes for token-already-used vs token-expired (deterministic mapping needed before tests)?
2. Where does `auth.otp_exp = 900` ops checklist live in repo (`supabase/config.toml`? `docs/ops-runbook.md`?)?
3. Bootstrap RPC race on double-click: rely on `23505` UNIQUE-slug catch, or debounce client-side?
4. `workspace_members.status` enum: what statuses exist beyond `active`? Affects BK-5 composition.

For Design (2):

1. Mockups for contextual error banners on `/login` (`TOKEN*EXPIRED` / `TOKEN*USED` variants).
2. Resend-cooldown UX spec (inline countdown? disabled button + timer? toast?).

### Scope refinement — IN vs OUT of BK-2

***IN BK-2:***

- Magic-link send + callback (already shipped)
- Callback redirect refactor → `/onboarding` (NEW)
- Onboarding pre-fill of name + slug (NEW)
- Specific error codes mapping in API + callback (NEW)
- RFC 5321 254-char enforcement client + server (NEW)
- UX 5.1, 5.3, 5.5, 5.7 from refinement document
- Ops verification of `auth.otp_exp = 900`

***OUT (delegated to other Stories):***

- OAuth → BK-3
- Invite acceptance + bypass branch → BK-5
- Workspace switching → BK-6
- UX 5.2, 5.4, 5.6, 5.9, branded email template → "Auth UX Polish" follow-up Story
- Token-invalidation-on-resend → separate security Story (if PO greenlights)

---

**See custom field 🧪 Acceptance Test Plan (ATP) + Shift-Left comment for the complete refinement (****~****17 test outlines, full Gherkin scenarios, AC↔code reconciliation per divergence).**

---

## Fields

> Each rich-text field is a separate file in this folder.

- [Acceptance Criteria](./acceptance-criteria.md)
- [Business Rules](./business-rules.md)
- [Scope](./scope.md)
- [Out Of Scope](./out-of-scope.md)
- [Workflow](./workflow.md)
- [Mockup](./mockup.md)
- [Acceptance Test Plan (QA)](./acceptance-test-plan.md)
- [Acceptance Test Results (QA)](./acceptance-test-results.md)

---

## Metadata

- **Created:** 5/19/2026
- **Updated:** 5/29/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** auth, mvp, shift-left-2026-05-25, shift-left-reviewed, wave-1

---

_Synced from Jira by sync-jira-issues_
_Last sync: 2026-05-29T07:23:44.078Z_
