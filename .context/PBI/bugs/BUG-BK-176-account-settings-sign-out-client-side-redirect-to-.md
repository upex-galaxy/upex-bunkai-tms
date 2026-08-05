# BUG: Account Settings: Sign-out: Client-side redirect to /login does not fire after successful server-side sign-out

**Jira Key:** [BK-176](https://jira.upexgalaxy.com/browse/BK-176)
**Priority:** Low
**Status:** Ready For QA
**Components:** Account & Settings

---

## Description

## Summary

After clicking "Sign out" from the account menu, the Supabase session is invalidated server-side (HTTP 204 on `POST /auth/v1/logout?scope=global`), but the client-side redirect to `/login` does not execute. The page remains on the current route (e.g. `/projects`) with the menu still visible showing "Sign out". Only a manual page reload triggers the middleware redirect to `/login`.

The session IS dead server-side — this is a UX issue, not a security vulnerability. The user believes they are still signed in when they are not.

---

## Steps to Reproduce

1. Sign in to staging (`staging-upexbunkai.vercel.app`) with valid credentials
2. Navigate to any authenticated page (e.g. `/projects`)
3. Click the account affordance (initials chip) in the sidebar bottom
4. Click "Sign out" in the dropdown menu
5. Observe: button text changes to "Signing out..." then reverts to "Sign out" — page stays on `/projects`
6. Reload the page manually — now redirects to `/login?next=/projects`

---

## Actual Result

Page stays on the current route after sign-out. No navigation to `/login`. The account menu remains visible with the original user data. Network shows the logout request succeeded (204) and RSC fetched `/login`, but `router.push('/login')` does not materialize as a client-side navigation.

## Expected Result

After successful sign-out, the user should be immediately redirected to `/login`. The authenticated UI should no longer be visible.

---

## Technical Analysis

- ***Network***: `POST /auth/v1/logout?scope=global` → 204 (success), `GET /login?_rsc=...` → 200 (RSC prefetch succeeded)
- ***Hypothesis***: `router.push('/login')` fires after `signOut()` resolves, but the Next.js App Router RSC mechanism may fail to navigate when the middleware now rejects the stale session — a race between cookie clearing and the RSC navigation request. Alternatively, `router.refresh()` may short-circuit the push.
- ***Component***: `AppSidebar.tsx` sign-out handler (the live caller of `AuthProvider.signOut()`)

---

## Impact

- Affected users: all users who sign out via the account menu
- Blocked functionality: none (session is actually invalidated)
- Business impact: low — UX confusion on shared machines where the user expects visual confirmation of sign-out. The "safely end my session" promise from the user story is technically met (session dies) but visually broken (no redirect).

---

## Evidence

- Screenshot: `BK-86-smoke-signout-redirect-to-login.png` (shows /login after manual reload)
- Network: `POST /auth/v1/logout?scope=global` → 204
- Network: `GET /login?_rsc=mM3RqDWErZThD78z` → 200 (RSC fetch, no navigation)

## Related Stories

- Related: BK-86 (Account | View my identity, role, and sign out)

---

## Related Issues

- is caused by: [BK-86](https://jira.upexgalaxy.com/browse/BK-86) - Account | View my identity, role, and sign out

---

## Metadata

- **Created:** 6/23/2026
- **Updated:** 7/31/2026
- **Reporter:** Andrés Daniel Cumare Morales
- **Assignee:** Andrés Daniel Cumare Morales
- **Labels:** account-settings, bug, exploratory-testing

---

_Synced from Jira by sync-jira-issues_
