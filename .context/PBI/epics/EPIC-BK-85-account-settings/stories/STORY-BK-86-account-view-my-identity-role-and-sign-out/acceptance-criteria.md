# BK-86 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-86)

## Scenario 1 — Signed-in identity is visible from any screen

```gherkin
Scenario: Signed-in identity is visible from any screen
  Given Elena is signed in with email "elena@bunkai.io" and an active membership
        with role "admin" in her active workspace
   When she views any page within the authenticated app shell
        (the persistent account affordance defined for this story —
         page list per Definition of Done, see SQ-2)
   Then she sees an account affordance displaying [her initials derived from
        her email local-part / her display name — per SQ-1 resolution]
    And opening the affordance reveals her exact email "elena@bunkai.io"
        and her role label for the active workspace, displayed as
        [the confirmed label for "admin" — e.g. "Admin", per SQ-3 resolution]
    And no other user's identity or role is ever shown
```

## Scenario 2 — Sign out ends the session and returns to sign-in

```gherkin
Scenario: Sign out ends the session and returns to sign-in
  Given Elena has the account menu open
   When she selects "Sign out"
   Then the Supabase session is invalidated server-side (the next request
        carrying the prior session cookie to a protected route is rejected
        by the auth check and redirected to sign-in)
    And she lands on the sign-in screen
    And navigating back to a protected screen — via browser back button
        or by entering the URL directly — does not restore the session
        and redirects to sign-in
```

## Scenario 3 — Account menu is keyboard accessible and dismissible

```gherkin
Scenario: Account menu is keyboard accessible and dismissible
  Given Elena has focused the account affordance
   When she opens the menu with the keyboard and presses Escape
   Then the menu closes
    And focus returns to the account affordance
```

## New Scenario A — Role display reflects the active workspace, including on switch

```gherkin
Scenario: Role display updates when Elena switches her active workspace
  Given Elena belongs to two workspaces — "upex-team" (role "admin")
        and "qa-guild" (role "viewer") — with "upex-team" currently active
   When she switches her active workspace to "qa-guild" via the workspace switcher
   Then the account affordance now shows her role as "viewer" for "qa-guild"
    And it no longer shows "admin" for "upex-team"
```

***NEEDS PO/DEV CONFIRMATION*** — Scenario 1 exemplifies role display with a single static value ("Admin") for the active workspace; it says nothing about whether the displayed role updates live on workspace switch. Given the persona's stated motivation ("confirm I'm in the right account before doing work"), a stale role badge after switching workspaces would be a direct contradiction of the story's purpose — but this scenario is QA's inference of intended behavior, not a stated requirement, and needs PO confirmation that workspace-switch is in scope for this story (vs. a follow-up).

## New Scenario B — Identity/role surface for a user with no active workspace

```gherkin
Scenario: Account affordance handles a user with no workspace membership
  Given Elena has just signed in for the first time and has no workspace
        memberships yet (no active workspace resolved)
   When she opens the account affordance
   Then her email is still shown
    And the role section shows an explicit empty-state ("No workspace yet"
        or equivalent) rather than a blank, "undefined", or broken value
```

***NEEDS PO/DEV CONFIRMATION*** — neither existing scenario states what the affordance shows when `active*workspace*id` is null (a real, reachable state per `/api/v1/me`'s own response shape — e.g., immediately post-signup, before onboarding). This scenario proposes QA's best-guess default; it needs PO confirmation both on the exact empty-state copy and on whether the affordance is even reachable pre-onboarding (if "global chrome" excludes the onboarding route per SQ-2, this scenario may not apply there).

## New Scenario C — Sign-out failure is surfaced, not silent

```gherkin
Scenario: Sign-out failure is surfaced and the session is preserved
  Given Elena selects "Sign out" while the network is unavailable
        or the auth provider returns an error
   When the sign-out request fails
   Then she sees a clear error message telling her the sign-out did not complete
    And she remains signed in with her session intact
    And no partial sign-out state (half-redirected, half-authenticated) occurs
```

***NEEDS PO/DEV CONFIRMATION*** — none of the 3 existing scenarios mention a failure path; Scenario 2 only covers the happy path. `AuthProvider.signOut()` already returns `{ error }` from `supabase.auth.signOut()`, so a failure path is technically reachable, but the story is silent on what Elena should see when it happens. This scenario names QA's expected behavior (visible error, no silent failure, no partial state); exact copy/presentation (toast vs inline) is a Dev/Design decision to confirm.

## New Scenario D — Sign-out terminates the session across other open tabs

```gherkin
Scenario: Signing out in one tab ends the session everywhere
  Given Elena is signed in to the same account in two browser tabs
   When she signs out from the account menu in the first tab
   Then the second tab also detects the session has ended
        (via the existing auth-state subscription)
    And attempting any action in the second tab redirects her to sign-in
```

***NEEDS PO/DEV CONFIRMATION**** — this scenario is the most direct test of the parent user story's explicit "shared machine" framing: a sign-out that only affects the active tab leaves a live session in any other open tab on the same shared machine, which is precisely the risk Elena is described as trying to avoid. None of the 3 existing scenarios test multi-tab/multi-surface propagation. `AuthProvider` already subscribes to `onAuthStateChange`, which suggests the underlying mechanism may exist — but whether it is **relied upon* for this guarantee, and whether it's considered in-scope for THIS story versus a hardening follow-up, needs explicit PO/Dev confirmation.

---
_Synced from Jira by sync-jira-issues_
