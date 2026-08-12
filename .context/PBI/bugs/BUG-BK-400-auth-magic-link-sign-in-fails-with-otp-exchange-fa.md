# BUG: Auth: Magic link: sign-in fails with otp_exchange_failed when the emailed link is opened on another device or browser

**Jira Key:** [BK-400](https://jira.upexgalaxy.com/browse/BK-400)
**Priority:** High
**Status:** Ready For QA
**Components:** None
**Fix Type:** Bugfix

---

## Description

## Summary

Magic-link sign-in fails whenever the emailed link is opened on a ***different device or browser*** than the one that requested it — which is the primary way people use magic links (request on a laptop, open the mail on a phone).

The email is delivered correctly and quickly. Clicking the link bounces the user back to `/login` ***with no visible error message at all***, and a raw Supabase SDK error string leaked into the URL.

> ***WARNING:**** This is not a delivery problem. `POST /api/v1/auth/magic-link` works, Supabase sends the mail, and the mail arrives in seconds with a valid link. The failure is in the ****verification*** step.

## Steps to Reproduce

1. Have a confirmed account (e.g. created via `/api/v1/auth/signup` + `/api/v1/auth/confirm`).
2. On staging, open `/login`, expand ***"Email me a link instead"***, enter that address and submit.
3. Confirm the UI shows ***"Check your inbox"**** and the mail arrives (subject: **Your sign-in link*).
4. Open that link in a ***different browser or device*** than the one used in step 2 — for example, open the mail on your phone.

## Actual Result

The browser lands on:

```
/login?error=otp*exchange*failed&reason=PKCE%20code%20verifier%20not%20found%20in%20storage.%20This%20can%20happen%20if%20the%20auth%20flow%20was%20initiated%20in%20a%20different%20browser%20or%20device...
```

The user is ***not signed in****, sees the plain login page, and gets ****no message explaining what went wrong*** — the `otp*exchange*failed` code is emitted but never rendered anywhere (see Technical Analysis).

## Expected Result

Opening a valid, unexpired magic link signs the user in, on any device, and lands them on `next` (default `/projects`). A genuinely invalid or expired link shows a clear, human-readable message.

## Technical Analysis

********Root cause******:****** the magic-link rail is built on the PKCE flow, which is device-bound by construction.****

- `POST /api/v1/auth/magic-link` (`app/api/v1/auth/magic-link/route.ts:36,44`) builds its client with `createClient()` from `lib/supabase/server.ts:10`, which is `@supabase/ssr`'s `createServerClient`.
- `@supabase/ssr`*** hard-codes ****`flowType: "pkce"`**** on every ****`createServerClient`**** instance**** — confirmed in the library source. So `signInWithOtp` generates a PKCE challenge and stores the ****code verifier in a browser cookie*** (`sb-<ref>-auth-token-code-verifier`, verified present after a UI request).
- The emailed link therefore carries a `pkce_`-prefixed token and redirects to `/auth/callback?code=...`.
- `app/auth/callback/route.ts:51` completes sign-in with `exchangeCodeForSession(code)`, which ***requires that verifier cookie to be present in the browser making the request***.
- Open the mail anywhere else and the cookie does not exist → the exchange throws `PKCE code verifier not found in storage`.

********Aggravating factor******:****** the failure is silent.***** **`otp*exchange*failed`** is produced at **`app/auth/callback/route.ts:61`** and is ******never consumed*** — a repo-wide search for the string finds only that one line, with no handler in any login page or toast map. The user gets a bare login page.

********Scope confirmed by testing (staging)******:****

| Scenario | Result |
| --- | --- |
| Request and open the link in the ***same*** browser | :white*check*mark: signs in, lands on `/onboarding` |
| Request in one browser, open in ***another*** (clean profile) | :x: `otp*exchange*failed`, not signed in, no message |
| Email delivery | :white*check*mark: arrives in ~15s via Resend SMTP relay |

## Impact

- ***Affected users******:*** anyone who opens the sign-in mail on a different device or browser than they requested it from — the normal magic-link use case, and the one the feature exists to serve.
- ***Blocked functionality******:*** magic-link is one of the three advertised sign-in methods (BK-2). Password and OAuth are unaffected and were verified working.
- ***Business impact******:*** a user who cannot sign in and is given no error message has no path forward and no reason to suspect the device switch is the cause. High friction on a first-run experience.
- ***Not a security issue******:*** no session is created, nothing leaks. The raw SDK message in the query string is noise, not a disclosure.

## Proposed Fix

Move the magic-link rail off the browser-bound PKCE exchange and onto Supabase's ***stateless ****`token_hash`**** verification***, which is the documented pattern for server-side email-link verification and works from any device:

1. `/auth/callback` also accepts `token*hash` + `type` and completes sign-in with `verifyOtp({ type, token*hash })` — no cookie required. The existing `code` branch stays for OAuth, which is legitimately same-browser.
2. The magic-link route sends the mail through a non-PKCE client, so no pointless verifier cookie is minted.
3. The Supabase ***magic-link email template*** links to `{{ .RedirectTo }}&token*hash={{ .TokenHash }}&type=magiclink` instead of `{{ .ConfirmationURL }}`. Using `.RedirectTo` (not `.SiteURL`) keeps the link environment-correct, since `site*url` on this project is pinned to `http://localhost:3000` while one project backs local, staging and production.
4. Render `otp*exchange*failed` / an invalid-link state in the login UI so a failure is never silent again.

> ***NOTE:**** Step 3 is Supabase ****dashboard/API configuration shared by every environment***, so it must not be flipped until the code in steps 1-2 is live in production — otherwise production magic links break in the window between.

## Related findings (separate from this defect, found while testing)

- `rate*limit*email_sent` was set to ***2 per hour, project-wide*** — the entire product could send only two auth emails per hour, and signup returned `429 email rate limit exceeded` under trivial load. Raised to 30 (Supabase's own default for custom SMTP) during this investigation.
- The signup confirmation email reads **"Enter this 6-digit code"** while `mailer*otp*length` is ***8***, so it delivers an 8-digit code. Copy/config mismatch.

---

## Metadata

- **Created:** 8/12/2026
- **Updated:** 8/12/2026
- **Reporter:** Ely
- **Assignee:** Ely
- **Labels:** auth, magic-link, pkce, staging

---

_Synced from Jira by sync-jira-issues_
