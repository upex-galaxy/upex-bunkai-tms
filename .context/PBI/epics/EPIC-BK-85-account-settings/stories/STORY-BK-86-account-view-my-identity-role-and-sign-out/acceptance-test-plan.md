# BK-86 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-86)

# Acceptance Test Plan (ATP) — BK-86

> Story: Account | View my identity, role, and sign out
Sprint: In-Sprint QA | Env: Staging | Modality: jira-native
Shift-Left: 2026-06-08 (short-circuit — Phases 1-3 done pre-sprint)

## Test Analysis

| Axis | Rating | Rationale |
| --- | --- | --- |
| Business logic | Medium | Identity display + session lifecycle + RBAC role resolution |
| Integration | Medium | Supabase auth + `/api/v1/me` + workspace_members join |
| Data validation | Low | Email-derived initials, role enum capitalization |
| UI complexity | Medium | Global sidebar account block, dropdown menu, keyboard/ARIA |

***Risk score***: 12 (HIGH) — new feature (+3), dynamic data (+3), explicit ACs (+2), user-facing (+2), high effort (+2). Extended edge cases warranted.

## Implementation Notes (Code Exploration 2026-06-23)

> ***ERROR:*** Pre-execution code exploration found significant gaps between ACs and current implementation. These will be verified in Stage 2 — TCs are authored against the SPEC, not the code.

| Gap | Impact | ACs affected |
| --- | --- | --- |
| `/api/v1/me` does NOT return `role` field | Role cannot be displayed in UI | Sc1, ScA, ScB |
| UI shows "Signed in" hardcoded, not workspace role | Role display is absent | Sc1, ScA |
| No redirect-on-SIGNED_OUT handler for other tabs | Multi-tab propagation incomplete | ScD |
| Missing `role="menu"`, `aria-haspopup`, `aria-expanded` | ARIA semantics absent | Sc3 |
| No focus trap or arrow-key navigation | Keyboard accessibility incomplete | Sc3 |
| Workspace switch discards `role` from response | Role won't update on switch | ScA |
| `UserMenu.tsx` is dead code (zero importers) | Orphaned component — cleanup needed | — |

## Data Feasibility

| Precondition | Pattern | Notes |
| --- | --- | --- |
| User with admin role in workspace | Discover | Staging test user (from `.env`) |
| User with viewer role | Generate | Need second workspace membership or test account |
| User with no workspace | Generate | Fresh signup, pre-onboarding state |
| Two workspaces with different roles | Modify | Requires multi-workspace setup in staging |
| Network failure during sign-out | Simulate | Playwright request interception |

## Technique Annotations

| AC / Scenario | Techniques applied |
| --- | --- |
| Sc1 (identity visible) | EP (email formats), BVA (local-part length), Pairwise (page × role) |
| Sc2 (sign-out) | State-Transition (session lifecycle), EP (post-signout access methods) |
| Sc3 (keyboard) | EP (keyboard interactions), Error Guessing (rapid open/close) |
| ScA (role on switch) | State-Transition (workspace switch), Decision Table (source-role × target-role) |
| ScB (no workspace) | State-Transition (pre-onboarding state) |
| ScC (sign-out failure) | EP (failure modes), Error Guessing (partial failure) |
| ScD (multi-tab) | State-Transition (cross-tab session), EP (tab actions post-signout) |

---

## TC Outlines

### Group 1 — Identity and Role Display

***TC-01******:****** Should display account affordance with user initials on every authenticated page***

- Related: Scenario 1
- Type: Positive | Priority: P0 | Level: UI
- Preconditions: Elena signed in with `elena@bunkai.io`, admin in active workspace
- Steps:
- Expected: Initials chip visible on every `(app)` route, derived from email local-part
- Parametrization:

| Email | Expected Initial | Page |
| --- | --- | --- |
| elena@bunkai.io | E | /projects |
| elena@bunkai.io | E | /onboarding |
| elena@bunkai.io | E | /workspaces/[id]/members |
| 123test@bunkai.io | 1 | /projects |
| a@b.co | A | /projects |

***TC-02******:****** Should reveal exact email and active-workspace role label when affordance is opened***

- Related: Scenario 1
- Type: Positive | Priority: P0 | Level: UI + API
- Preconditions: Elena signed in, member of active workspace with known role
- Steps:
- Expected: Email exact match, role = capitalized enum value
- Parametrization (EP on role values):

| Role (DB) | Expected Label | Workspace |
| --- | --- | --- |
| admin | Admin | upex-team |
| owner | Owner | upex-team |
| member | Member | upex-team |
| viewer | Viewer | qa-guild |

***TC-03******:****** Should never display another user's identity or role***

- Related: Scenario 1 (multi-tenant isolation)
- Type: Positive (isolation guard) | Priority: P1 | Level: UI
- Preconditions: Two users in the same workspace — Elena (admin) and Carlos (member)
- Steps:
- Expected: Complete session isolation — no cross-user data leakage

***TC-04******:****** Should update displayed role immediately after switching active workspace***

- Related: New Scenario A
- Type: Integration | Priority: P1 | Level: UI + API
- Preconditions: Elena belongs to two workspaces with different roles
- Steps:
- Expected: Role updates synchronously with workspace switch
- Parametrization (Decision Table: source → target):

| From Workspace | From Role | To Workspace | To Role | Expected Label |
| --- | --- | --- | --- | --- |
| upex-team | admin | qa-guild | viewer | Viewer |
| qa-guild | viewer | upex-team | admin | Admin |

***TC-05******:****** Should show empty-state placeholder for role when user has no active workspace***

- Related: New Scenario B
- Type: Boundary | Priority: P1 | Level: UI
- Preconditions: Newly signed-in user with zero workspace memberships
- Steps:
- Expected: Graceful empty state, not a crash or blank field

### Group 2 — Sign-out Effect

***TC-06******:****** Should invalidate session server-side, redirect to sign-in, and block back-navigation***

- Related: Scenario 2
- Type: Positive | Priority: P0 | Level: E2E (UI + API)
- Preconditions: Elena signed in with valid session
- Steps:
- Expected: Full session invalidation — client-side redirect + server-side cookie rejection
- Parametrization (EP on post-signout access methods):

| Access Method | Expected |
| --- | --- |
| Browser back button | Redirect to /login |
| Direct URL entry (/projects) | Redirect to /login |
| Direct URL entry (/workspaces/[id]) | Redirect to /login |
| API call with old session cookie | 401 Unauthorized |

***TC-07******:****** Should surface visible error and preserve session when sign-out fails***

- Related: New Scenario C
- Type: Negative | Priority: P1 | Level: UI
- Preconditions: Elena signed in, network intercepted to block auth requests
- Steps:
- Expected: Visible error, no silent failure, no partial state

***TC-08******:****** Should terminate session in all open tabs when signed out from one***

- Related: New Scenario D
- Type: Integration | Priority: P1 | Level: E2E
- Preconditions: Elena signed in, same account in two browser tabs
- Steps:
- Expected: Cross-tab session termination — no orphaned live sessions

***TC-09******:****** Should not duplicate sign-out flow on rapid repeated triggers***

- Related: Error Guessing (EC-4)
- Type: Edge | Priority: P2 | Level: UI
- Preconditions: Elena signed in with account menu open
- Steps:
- Expected: Idempotent sign-out — first click wins, subsequent ignored

### Group 3 — Account Menu Accessibility

***TC-10******:****** Should open via keyboard, close on Escape, and return focus to affordance***

- Related: Scenario 3
- Type: Positive | Priority: P1 | Level: UI
- Preconditions: Elena signed in, sidebar visible
- Steps:
- Expected: Full keyboard open/close cycle with focus management

***TC-11******:****** Should trap keyboard focus within open menu (no escape into background)***

- Related: EC-6
- Type: Integration | Priority: P1 | Level: UI
- Preconditions: Account menu open via keyboard
- Steps:
- Expected: Focus trap — Tab/Shift+Tab cycle within menu boundaries

***TC-12******:****** Should expose correct ARIA semantics to assistive technology***

- Related: EC-7
- Type: Integration | Priority: P1 | Level: UI (a11y inspection)
- Preconditions: Account menu rendered
- Steps:
- Expected: ARIA `menu`/`menubutton` pattern compliant with WAI-ARIA APG

---

## Coverage Estimate

| Type | Count | Outlines |
| --- | --- | --- |
| Positive | 5 | TC-01, TC-02, TC-06, TC-10 + TC-03 (isolation guard) |
| Negative | 1 | TC-07 |
| Boundary | 1 | TC-05 |
| Integration | 4 | TC-04, TC-08, TC-11, TC-12 |
| Edge | 1 | TC-09 |
| ***Total**** | ****12*** | Across 7 scenarios + 3 edge cases |

Coverage = AC-conformance (floor: 7/7 scenarios covered) + risk-beyond-AC (boundaries: email formats, no-workspace state, rapid triggers, focus trap, ARIA semantics).

## Test-Design Checklist

- [x] P1: Went beyond "every AC passes" — added boundary/edge/a11y cases
- [x] P2: ACs treated as floor — 5 risk-beyond-AC outlines (TC-03, TC-05, TC-09, TC-11, TC-12)
- [x] P3: Each TC is a concrete exploration with specific data, not an AC restatement
- [x] P4: Non-trivial ACs exploded (Sc1 → TC-01+TC-02+TC-03, Sc2 → TC-06, Sc3 → TC-10+TC-11+TC-12)
- [x] P5: Boundary/exception/anomaly cases added (TC-05, TC-07, TC-09)
- [x] EP: Partitions identified — email formats, role values, post-signout access methods, failure modes
- [x] BVA: Email local-part length boundaries in TC-01 parametrization (single char, numeric)
- [x] ST: Session lifecycle (signed-in → signing-out → signed-out) in TC-06, TC-08; workspace switch in TC-04
- [x] DT: Source-role × target-role in TC-04 parametrization
- [x] PW: N/A — < 3 combinable factors per AC
- [x] PARAM: Same-behavior variants collapsed into parametrization tables (TC-01 pages, TC-02 roles, TC-06 access methods)
- [x] RISK: P0 (TC-01, TC-02, TC-06) > P1 (TC-03, TC-04, TC-05, TC-07, TC-08, TC-10, TC-11, TC-12) > P2 (TC-09)

## Test Data Strategy

| Data | Source | Generation |
| --- | --- | --- |
| Primary test user (admin) | `.env` STAGING*USER*EMAIL/PASSWORD | Discover |
| Role enum values | DB `workspace_members.role` | Discover (viewer, member, admin, owner) |
| No-workspace user | Fresh signup | Generate (if staging allows self-signup) |
| Multi-workspace user | Staging data | Discover or Modify |
| Network failure | Playwright `page.route()` interception | Simulate |
| Multi-tab | Playwright `browser.newPage()` | Simulate |

---
_Synced from Jira by sync-jira-issues_
