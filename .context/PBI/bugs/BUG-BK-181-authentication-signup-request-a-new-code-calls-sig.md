# BUG: Authentication: Signup: "Request a new code" calls signup instead of resend, leaks raw validation error

**Jira Key:** [BK-181](https://jira.upexgalaxy.com/browse/BK-181)
**Priority:** High
**Status:** Open
**Components:** Tenancy & Identity
**Severity:** Mayor
**Error Type:** Functional
**Test Environment:** Staging
**Fix Type:** Bugfix

---

## Description

**SUMMARY**
On the email-verification screen of BK-166's signup flow, the "Request a new code" control does not call a resend-verification endpoint. It instead calls `POST /api/v1/auth/signup` again, which fails with a 422 validation error, and the raw backend validation message is rendered directly in the UI alert instead of a user-friendly resend confirmation or error.

---

**STEPS TO REPRODUCE**

#### Step 1 - Precondition: no active session, on staging (`https://staging-upexbunkai.vercel.app`)
#### Step 2 - Navigation: complete the sign-up form (email + password) and reach the email-verification / enter-code screen
#### Step 3 - Action: click "Request a new code"
#### Step 4 - Observe: the app fires `POST /api/v1/auth/signup` (not a resend-code endpoint); response is 422 with a raw validation message, rendered verbatim in the UI alert

---

**TECHNICAL ANALYSIS**

- **Network****:** `POST /api/v1/auth/signup` -> `422 {"error":{"code":"validation_failed","details":[{"path":["password"],"message":"Invalid input"}],"message":"Request body failed validation."}}`
- **Console****:** raw backend validation message surfaced directly in the UI alert, no user-friendly wrapping

---

**IMPACT**

- Users who need a fresh verification code (e.g. original code expired) cannot get one through this control — it silently fails the resend intent and shows a confusing technical error instead
- Found incidentally while probing BK-23's staging-login blocker; not yet confirmed whether it blocks signup completion entirely or only the resend convenience action
- Raw backend validation text in a user-facing alert is a minor information-disclosure smell (exposes internal field/validation naming to end users)

---

**RELATED STORIES**

- Related: BK-166

---

## 🐞 Actual Result

Clicking "Request a new code" calls `POST /api/v1/auth/signup` and returns HTTP 422 with a raw backend validation message rendered in the UI alert.

---

## ✅ Expected Result

Clicking "Request a new code" should call a resend-verification-code endpoint and show a user-friendly confirmation (e.g. "A new code has been sent to your email"), not re-trigger signup.

---

## 🔍 Root Cause

**Category:** Code Error

---

## 🚩 Workaround

Use the original code from the first signup email before it expires; if expired, restart the signup flow from scratch with the same email.

---

## 🧫 Evidence

Network log captured 2026-06-25 during the BK-23 staging probe:

```
POST /api/v1/auth/signup -> 422
{"error":{"code":"validation_failed","details":[{"path":["password"],"message":"Invalid input"}],"message":"Request body failed validation."}}
```

No UI screenshot captured for this specific finding.

---

## Metadata

- **Created:** 6/25/2026
- **Updated:** 7/6/2026
- **Reporter:** Benjamin Segovia
- **Assignee:** Benjamin Segovia
- **Labels:** auth, bug, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
