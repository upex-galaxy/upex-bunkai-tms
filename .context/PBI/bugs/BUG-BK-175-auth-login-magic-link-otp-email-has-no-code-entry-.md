# BUG: Auth: Login: Magic-link OTP email has no code-entry field on staging

**Jira Key:** [BK-175](https://jira.upexgalaxy.com/browse/BK-175)
**Priority:** Highest
**Status:** Open
**Components:** Tenancy & Identity
**Severity:** Crítica
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

**SUMMARY**
The staging magic-link login flow cannot be completed: Supabase Auth sends a 6-digit OTP code by email, but the "Check your inbox" confirmation screen renders no input field to enter that code. This blocks login entirely on staging, preventing all QA work — including BK-23 verification — from proceeding.

---

**STEPS TO REPRODUCE**

#### Step 1 - Precondition: no active session, navigate to https://staging-upexbunkai.vercel.app/login
#### Step 2 - Enter a valid email address and submit "Send magic link"
#### Step 3 - Observe the "Check your inbox" confirmation screen, then check the received email
#### Step 4 - Observe the bug: the email body reads "Enter this 6-digit code to verify your email: <code>" with no clickable link, but the confirmation screen has zero input fields (confirmed via `document.querySelectorAll('input')` returning an empty array). Reloading the page resets the flow back to the email-entry form (client-side state only, not session-backed). Reproduced twice with two independent OTP emails, identical result both times.

---

**TECHNICAL ANALYSIS**

- **File****:** unknown — likely the post-submit "Check your inbox" view component and/or the Supabase Auth email template configuration
- **Function****:** magic-link / OTP email-verification flow
- **Network****:** n/a — email delivery itself succeeds (confirmed via the Resend test inbox for the staging sender domain); the email payload is OTP-code-only, no magic link
- **Console****:** no JS error — the UI is simply missing the expected input control

---

**IMPACT**

- Every user/tester attempting to log in to staging via the magic-link flow
- Blocks 100% of staging-dependent QA work; currently blocking BK-23 (Duplicate ATC) verification
- No manual or automated QA can validate any staging deployment until this is fixed

---

**RELATED STORIES**

- Related: BK-23

---

## 🐞 Actual Result

No input field appears for the OTP code; the user cannot complete login via the email Bunkai actually sends (a 6-digit code, not a clickable link).

---

## ✅ Expected Result

The user should be able to either click a magic link or enter the OTP code shown in the email, and successfully authenticate.

---

## 🔍 Root Cause

**Category:** Code Error

---

## 🧫 Evidence

See attached screenshot `01-login-blocked-no-otp-field.png` — the "Check your inbox" screen with zero `<input>` elements found via `document.querySelectorAll('input')`.

---

## Related Issues

- blocks: [BK-23](https://jira.upexgalaxy.com/browse/BK-23) - TMS-ATC Duplicate | Duplicate an ATC with steps and assertions

---

## Metadata

- **Created:** 6/22/2026
- **Updated:** 7/6/2026
- **Reporter:** Benjamin Segovia
- **Assignee:** Benjamin Segovia

---

_Synced from Jira by sync-jira-issues_
