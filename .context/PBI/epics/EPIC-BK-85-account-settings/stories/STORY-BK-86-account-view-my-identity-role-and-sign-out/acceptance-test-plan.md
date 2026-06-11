# BK-86 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-86)

## ATP DRAFT — Test Outlines (Shift-Left)

> Outline names + one-line precondition only — full parametrization deferred to in-sprint test planning. Organized by the 3 functional groups the refined scenarios fall into.

### Group 1 — Identity & Role Display (Scenario 1 + New A/B)

1. ***Should display the account affordance with the user's name/initials on the account menu*** — Precondition: Elena signed in, viewing any page within the defined global-chrome scope (Scenario 1, pending SQ-1/SQ-2)
2. ***Should reveal exact email and active-workspace role label when the affordance is opened*** — Precondition: Elena is `admin` of her active workspace `upex-team` (Scenario 1, pending SQ-3)
3. ***Should never display another user's identity or role*** — Precondition: two distinct authenticated sessions in the same workspace (Scenario 1 refinement — multi-tenant guard)
4. ***Should update the displayed role immediately after switching active workspace*** — Precondition: Elena belongs to `upex-team` (admin) and `qa-guild` (viewer) (New Scenario A — NEEDS PO/DEV CONFIRMATION)
5. ***Should show an empty-state placeholder for role when the user has no active workspace*** — Precondition: newly signed-in user with zero workspace memberships (New Scenario B — NEEDS PO/DEV CONFIRMATION)

### Group 2 — Sign-out Effect (Scenario 2 + New C/D)

1. ***Should invalidate the session server-side, redirect to sign-in, and block back-navigation*** — Precondition: Elena has the account menu open with a valid session (Scenario 2 refinement)
2. ***Should surface a visible error and preserve the session when sign-out fails*** — Precondition: network unavailable or auth provider returns an error during sign-out (New Scenario C — NEEDS PO/DEV CONFIRMATION)
3. ***Should terminate the session in all open tabs when signed out from one*** — Precondition: same account open in two tabs, sign-out triggered in tab A (New Scenario D — NEEDS PO/DEV CONFIRMATION)
4. ***Should not duplicate the sign-out flow on rapid repeated triggers*** — Precondition: Elena double-clicks/double-taps "Sign out" (EC-4)

### Group 3 — Account Menu Accessibility (Scenario 3 + Edge Cases)

1. ***Should open via keyboard, close on Escape, and return focus to the affordance*** — Precondition: Elena has focused the account affordance (Scenario 3, as-is — no change needed)
2. ***Should trap keyboard focus within the open menu (no escape into background content)*** — Precondition: account menu is open via keyboard (EC-6)
3. ***Should expose correct ARIA semantics to assistive technology*** — Precondition: account menu rendered, tested with screen-reader / accessibility tree inspection (EC-7)

### Coverage Estimate

| Type | Count | Notes |
|---|---|---|
| Positive | 5 | Outlines 1, 2, 6, 10, plus 3 (multi-tenant isolation, asserted as a positive "shows only own data" guard) — happy-path identity/role display, sign-out effect, keyboard open/close |
| Negative | 2 | Outlines 7, 9 — sign-out failure surfaced, duplicate-trigger guard |
| Boundary | 1 | Outline 5 — no-active-workspace empty state |
| Integration | 4 | Outlines 4, 8, 11, 12 — workspace-switch role refresh, multi-tab session termination, focus-trap, ARIA/assistive-tech semantics |

***Total: 12 outlines*** across 3 refined existing scenarios + 4 new inferred scenarios + 7 identified edge cases (some folded into outlines above rather than each spawning a dedicated outline).

---
_Synced from Jira by sync-jira-issues_
