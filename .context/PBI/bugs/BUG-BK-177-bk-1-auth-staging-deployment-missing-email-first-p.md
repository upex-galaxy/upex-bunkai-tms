# BUG: BK-1: Auth: Staging deployment missing email-first password sign-in UI and 2 of 4 BK-166 API routes

**Jira Key:** [BK-177](https://jira.upexgalaxy.com/browse/BK-177)
**Priority:** Highest
**Status:** REJECTED
**Components:** Tenancy & Identity
**Severity:** Crítica
**Error Type:** Integration
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

## Summary

Staging (`https://staging-upexbunkai.vercel.app`) does not serve the [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) email-first password sign-in feature. The rendered `/login` page is the legacy magic-link-only screen — no Continue/password/create-account/verify step exists, and typing an email triggers zero network calls. At the API layer, `POST /api/v1/auth/check-email` and `POST /api/v1/auth/confirm` return a genuine Next.js 404 (page not found), while `POST /api/v1/auth/signup` and `POST /api/v1/auth/signin` exist and return structured JSON, but with HTTP 422 instead of the 400 documented for a validation failure.

This blocks BK-166's QA pass end to end — all 42 planned Stage-1 test outlines closed `BLOCKED` with zero coverage signal.

## Steps to Reproduce

1. Open `https://staging-upexbunkai.vercel.app/login` in a fresh, unauthenticated session.
2. Observe the rendered form — only an email field and a "Send magic link" button (disabled OAuth buttons below).
3. Type any email address. Observe the Network tab: no request fires.
4. Separately, `curl -X POST https://staging-upexbunkai.vercel.app/api/v1/auth/check-email` and `.../confirm` — both return HTTP 404 with a full Next.js not-found HTML page.
5. `curl -X POST .../signup` and `.../signin` with an empty body — both return HTTP 422 `validation_failed` (route source / ATP documents HTTP 400 for this case).

## Technical Analysis

- ***Files (expected, not observed in the rendered build):*** `app/(auth)/login/email-first-form.tsx`, `app/api/v1/auth/check-email/route.ts`, `app/api/v1/auth/confirm/route.ts`
- ***Network:*** `POST /api/v1/auth/check-email` → 404 · `POST /api/v1/auth/confirm` → 404 · `POST /api/v1/auth/signup` (empty body) → 422 (expected 400) · `POST /api/v1/auth/signin` (empty body) → 422 (expected 400)
- ***Console:*** clean, 0 errors/warnings on `/login` load and after email input
- ***Source cross-check:*** the `staging` branch on `upex-bunkai-tms` (local clone, confirmed against `origin/staging`) is at commit `16863ca` (2026-06-22), which includes PR #54 — the merge that should ship this exact feature. The live site does not reflect that commit's behavior. No GitHub Actions workflow exists in that repo (`.github/workflows/` is empty) — deployment is Vercel's direct Git integration, so this is most likely a stale alias or a silent build failure on Vercel's side, not an application logic defect. QA does not have Vercel dashboard access to confirm which deployment the alias currently serves.

## Impact

- Every user attempting password-based sign-up/sign-in on staging — the feature is entirely unreachable, only magic-link works.
- Blocks [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) QA sign-off completely: 0 of 42 planned test outlines could execute.
- This is the platform's first identity-proving gate (CRITICAL per the master test plan's Authentication & Tenancy flag) — cannot validate before release if it cannot be reached at all.

## Related Stories

- Related: [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) (blocks its QA sign-off)

---

## 🐞 Actual Result

Staging serves the legacy magic-link-only login UI; no password/create-account/verify step ever appears and no network call fires on email input. POST /api/v1/auth/check-email and /confirm return HTTP 404. POST /api/v1/auth/signup and /signin exist but return HTTP 422 instead of the documented 400 on validation failure.

---

## ✅ Expected Result

Staging should serve the [https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166](https://jira.upexgalaxy.com/browse/BK-166#icft=BK-166) email-first password flow merged via PR #54 (commit 16863ca on staging, 2026-06-22): a Continue step routing to password-signin or account-creation, with all 4 /api/v1/auth/* routes reachable and returning their documented contracts.

---

## 🔍 Root Cause

**Category:** Working As Designed (WAD)

---

## 🧫 Evidence

evidence/BK-166-smoke-login.png (attached separately)

---

## Related Issues

- causes: [BK-166](https://jira.upexgalaxy.com/browse/BK-166) - Authentication | Sign up and sign in with email and password

---

## Metadata

- **Created:** 6/23/2026
- **Updated:** 7/8/2026
- **Reporter:** Benjamin Segovia
- **Assignee:** Benjamin Segovia
- **Labels:** auth, bug, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
