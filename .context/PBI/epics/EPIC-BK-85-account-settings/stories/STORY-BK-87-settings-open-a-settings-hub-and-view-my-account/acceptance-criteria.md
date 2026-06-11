# BK-87 — Acceptance Criteria

> Jira field: `customfield_10063` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-87)

## Phase 1 — Critical Analysis

### Business context

- ***Primary persona affected***: Full-Stack Developer (Sara Iglesias) — every signed-in user
- ***Secondary personas (if any)***: Viewers (read-only), workspace owners (will need admin-level settings later)
- ***Business value proposition***: Single predictable place to view identity, role, and workspace membership — reduces support burden from users who cannot find where they belong
- ***KPI(s) influenced***: User autonomy (fewer "where is my account?" questions), workspace-switch adoption (enabler for BK-89, BK-90)
- ***User journey position***: Persistent chrome — accessible from any post-login page. Settings hub is the container; this Story delivers the Account section within it.

### Technical context

- ***Frontend***: Next.js App Router — new route under `app/(app)/settings/` (greenfield, no existing settings pages). Needs:
- ***Backend***: Minimal — identity is already available client-side via `AuthProvider` (`useAuth() → user.email, user.user*metadata`). Workspace membership queried from `workspace*members` (Supabase). No new API endpoints required for read operations.
- ***External services***: Supabase Auth (identity source)
- ***Integration points specific to this Story***: Supabase Auth session + workspace_members RLS policy (data access)

### Story complexity

| Axis | Rating | Why |
| --- | --- | --- |
| Business logic | Low | Pure read-display of auth + membership. No mutations, no calculations. |
| Integration | Low | Uses existing Supabase Auth + workspace_members query (already used in onboarding + projects pages) |
| Data validation | Low | Read-only — validation applies only to route guards (must be signed in) |
| UI | Medium | Requires new settings chrome (layout, tab navigation, responsive), identity card component, workspace membership list |

***Estimated test effort***: Medium — 5-8 test outlines. Main complexity is navigation (can user reach settings from everywhere?) + correct data display per role.

### Epic-level inheritance (if applicable)

- Risks restated at Story level: N/A — this is the first Story in the epic being elaborated
- Integration points inherited: Supabase Auth session, workspace_members RLS (both already proven in onboarding + projects pages)
- PO/Dev answers already given at epic level: N/A
- Test strategy inherited: No epic-level test plan available

---

## Phase 2 — Story Quality Analysis

### Ambiguities

| # | Location in Story | Question for PO/Dev | Impact on testing | Suggested clarification |
| --- | --- | --- | --- | --- |
| 1 | "Settings area with an Account section" | Is Account ONE section within a multi-section Settings hub (future sections: PATs, workspace), or is Account the entire MVP of Settings? | Test scope: if Settings is multi-section, need layout + nav between sections + empty states for not-yet-implemented sections | Clarify Settings hub roadmap: which sections ship with this Story vs later? |
| 2 | "showing my identity" | What constitutes "identity" — email only? Name from `user_metadata`? Avatar? Created date? Last login? | Assertion complexity: each displayed field needs a test case | Specify identity fields: email (always), name (if available), role in current workspace |
| 3 | "the workspaces I belong to" | Is this a simple list of workspace names, or does it include role per workspace, member count, last activity? | Test data: need multi-workspace membership scenario to verify list renders correctly | Specify workspace list columns: name + role + maybe "current" badge |
| 4 | "one predictable place" | Is Settings accessible ONLY via a new Topbar user menu, or also via direct URL (`/settings`), sidebar link, and keyboard shortcut? | Navigation coverage: every access path must be tested | Specify all entry points to the Settings hub |

### Gaps (missing info)

| # | Type | Why critical | What to add | Risk if omitted |
| --- | --- | --- | --- | --- |
| 1 | AC | Zero acceptance criteria defined — only a user story statement | Write ACs covering: view identity, view workspace list, access settings, sign out, empty state (no workspaces), error state (auth session expired) | Team cannot estimate or verify; feature ships with untested edge cases |
| 2 | Technical detail | No specification for where Settings link lives in the UI | Define chrome location — Topbar user menu (gear icon or avatar dropdown) | Settings is unreachable; feature delivers no value |
| 3 | Business rule | No mention of RLS/authorization — can any signed-in user access Settings? | Clarify: all authenticated users can view Settings. Workspace membership is NOT required (user may be mid-onboarding). | User with no workspace cannot see their identity — violates "one predictable place" |
| 4 | AC | Sign-out action is mentioned only in sibling story BK-86 but BK-87 says "view my account" — does sign-out belong here or in BK-86? | Clarify boundary between BK-86 (Account - view identity, role, sign out) and BK-87 (Settings - open hub, view account). Is sign-out in both or only in BK-86? | Duplicate or missing sign-out implementation; BC test mismatch |
| 5 | AC | No mention of loading / error / empty states | Define loading skeleton, error toast (fetch failed), empty workspace list message | Flaky UX when data loads slowly or fails |

### Edge cases not in Story

| # | Scenario | Expected behavior (best guess) | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | User signed in but has NO workspace membership (mid-onboarding) | Settings shows identity info + "You don't belong to any workspaces yet" message | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 2 | User session expires while viewing Settings | Auto-redirect to `/login` OR show "Session expired — please sign in again" message | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 3 | User belongs to 10+ workspaces | Workspace list should handle overflow (scroll or paginate, not break layout) | Medium | Test only — don't add AC |
| 4 | User metadata has null/empty displayName | Fallback: show email as primary identity label | Medium | Test only — don't add AC |
| 5 | Settings accessed via direct URL while not authenticated | Redirect to `/login` with returnUrl for post-auth redirect back to Settings | High | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 6 | User with `viewer` role sees same Account section as `owner` | Identity display is role-agnostic (read-only data). Workspace role is shown but all roles see identical Account section. | Low | Test only |
| 7 | Network failure loading workspace list | Show cached identity (from auth context) + "Could not load workspaces — [retry] " | Medium | Add to AC (NEEDS PO/DEV CONFIRMATION) |
| 8 | Browser back/forward navigation in Settings | Settings should handle browser history gracefully (no broken state) | Medium | Test only |

### Contradictions

No contradictions found — Story has only a user story statement with no ACs, description, or comments to contradict.

### Testability validation

***Verdict***: Partial

Issues:

- "showing my identity" and "workspaces I belong to" have no field-level specification (which fields, what format)
- No loading/error/empty state definitions
- Sign-out boundary with BK-86 unclear
- No entry-point specification (how does user reach Settings?)
- Once clarified: highly testable (read-only display, deterministic data from auth + workspace_members)

---

## Phase 3 — Refined Acceptance Criteria

This story has zero original ACs. All scenarios below are inferred from the user story statement.

### User Story statement — "Settings area with an Account section showing my identity and the workspaces I belong to"

#### Scenario 1.1: Should display user identity when viewing Account section in Settings (Type: Positive, Priority: Critical)

- ***Given***: A signed-in user with `user_metadata.name = "Sara Iglesias"` and `email = "sara@example.com"` who belongs to at least one workspace
- ***When***: The user navigates to Settings → Account section
- ***Then***:

#### Scenario 1.2: Should list workspaces the user belongs to in Account section (Type: Positive, Priority: Critical)

- ***Given***: A signed-in user who belongs to 3 workspaces ("Bunkai Core", "QA Sandbox", "Docs Team")
- ***When***: The user navigates to Settings → Account section
- ***Then***:

#### Scenario 1.3: Should allow accessing Settings from the global navigation (Type: Positive, Priority: High)

- ***Given***: A signed-in user on any post-login page (e.g., project ATC list)
- ***When***: The user clicks the Settings entry point (gear icon in Topbar, or user menu)
- ***Then***: The user is redirected to `/settings` and sees the Account section

#### Scenario 1.4: Should redirect unauthenticated users to login when accessing Settings directly (Type: Negative, Priority: Critical) — NEEDS PO/DEV CONFIRMATION

- ***Given***: An unauthenticated browser session
- ***When***: The user navigates directly to `/settings`
- ***Then***: The user is redirected to `/login` with a `returnUrl=/settings` parameter

#### Scenario 1.5: Should handle session expiry gracefully in Settings (Type: Edge, Priority: High) — NEEDS PO/DEV CONFIRMATION

- ***Given***: A signed-in user viewing the Account section
- ***When***: The Supabase Auth session expires or is revoked
- ***Then***: The user is redirected to `/login` OR shown "Session expired — please sign in again"

#### Scenario 1.6: Should display empty workspace state for users with no workspaces (Type: Edge, Priority: High) — NEEDS PO/DEV CONFIRMATION

- ***Given***: A signed-in user who has been invited but has NOT yet joined any workspace (or just signed up)
- ***When***: The user navigates to Settings → Account section
- ***Then***: Identity info is shown. Workspace section displays "You don't belong to any workspaces yet" with a link/button to create or join one.

#### Scenario 1.7: Should handle network failure when loading workspace list (Type: Negative, Priority: Medium) — NEEDS PO/DEV CONFIRMATION

- ***Given***: A signed-in user with workspace membership(s)
- ***When***: The user navigates to Settings → Account section but the workspace_members query fails (network error)
- ***Then***: Identity info (from client-side auth context) is still displayed. Workspace section shows a retriable error message: "Could not load workspaces — [Retry]"

### Roles and permissions

| Role | Can view Account section? | Can see identity? | Can see workspace list? |
| --- | --- | --- | --- |
| Owner | Yes | Yes | Yes (all workspaces) |
| Admin | Yes | Yes | Yes |
| Member | Yes | Yes | Yes |
| Viewer | Yes | Yes | Yes |

---

## Phase 4 — Test Outlines (DRAFT — outline names only)

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 3 | Identity display, workspace list, settings navigation |
| Negative | 3 | Unauthenticated access, session expiry, network failure |
| Boundary | 2 | Empty workspace list, 10+ workspaces overflow |
| Integration | 1 | Supabase Auth session lifecycle within Settings |
| API | 0 | Pure client-side reads from Auth context + Supabase query |
| ***Total**** | ****9*** | (drives PO estimation) |

***Rationale***: Read-only UI feature with low business logic complexity but moderate UI complexity (new chrome + multiple states). Positive paths are straightforward (3 outlines). Negative paths cover auth gating (critical for security). Boundary covers empty state and data volume. Integration covers Supabase Auth session lifecycle.

### Outline list (NAMES ONLY — preconditions in 1 line, expected in 1 line)

#### Positive

- ***Should display user identity fields when viewing Account section*** — Pre: signed-in user with name + email. Expected: email shown as primary label, name shown if available, role displayed.
- ***Should list workspaces with role and current-workspace indicator*** — Pre: user belongs to 3+ workspaces. Expected: each workspace listed with name + role; current workspace identified.
- ***Should navigate to Settings from Topbar user menu entry point*** — Pre: signed-in user on project page. Expected: clicking Settings entry redirects to `/settings`.

#### Negative

- ***Should redirect to login when unauthenticated user accesses /settings directly*** — Pre: no session. Expected: redirect to `/login?returnUrl=/settings`.
- ***Should handle session expiry with login redirect or in-page message*** — Pre: user on Settings, session revoked. Expected: redirect to `/login` or show session-expired message.
- ***Should display retriable error on workspace list fetch failure*** — Pre: workspace_members query fails. Expected: error message + retry button; identity still visible.

#### Boundary

- ***Should show empty-state message when user has zero workspace memberships*** — Pre: user with no workspace. Expected: identity displayed + "You don't belong to any workspaces yet".
- ***Should handle large workspace membership list without layout breakage*** — Pre: user belongs to 10+ workspaces. Expected: scrollable list, no overflow/cutoff.

#### Integration

- ***Should display identity from Supabase Auth session consistently*** — Pre: user signs in via magic-link. Expected: AuthContext.user populated; Settings shows same email as session.

---

## Phase 5 — Edge Cases (DRAFT)

| # | Edge case | In original Story? | Criticality | Action |
| --- | --- | --- | --- | --- |
| 1 | User with no workspace membership views Settings | No | High | Add to AC (PO confirm) |
| 2 | Session expires while on Settings page | No | High | Add to AC (PO confirm) |
| 3 | Direct URL access to /settings while not authenticated | No | High | Add to AC (PO confirm) |
| 4 | Network failure fetching workspace list | No | Medium | Add to AC (PO confirm) |
| 5 | 10+ workspaces in membership list | No | Medium | Test only |
| 6 | user_metadata.name is null/empty — fallback to email only | No | Medium | Test only |
| 7 | Browser back/forward from Settings | No | Medium | Test only |
| 8 | Viewer role sees identical Account section as Owner | No | Low | Test only |

---

## Story Quality Assessment

***Verdict***: Needs Improvement

***Key findings***:

- Zero acceptance criteria defined — only a user story statement
- Boundary between BK-86 (Account — view/sign out) and BK-87 (Settings — open hub) is unclear around sign-out ownership
- No specification of Settings entry point in the global navigation/chrome
- No loading, error, empty, or edge states described

---

## Critical Questions for PO

> These BLOCK sprint planning until answered.

1. ***What is the exact boundary between BK-86 and BK-87?***
2. ***Where does the Settings entry point live in the app chrome?***

---

## Technical Questions for Dev

> These do not block PO but block implementation.

1. ***How is the "current workspace" determined in the workspace list context?*** — The app currently uses single-workspace routing. Is there a `currentWorkspaceId` in the auth context or URL params? The workspace list in Settings needs to mark the current one.
2. ***Does the workspace membership list need a new Supabase query or can it reuse existing patterns from ****`projects/page.tsx`****?*** — The projects page already queries `workspace_members` — can Settings reuse/extend this query, or does it need a separate endpoint?
3. ***How should ****`user*metadata`**** be populated?*** — Supabase Auth `user*metadata` is empty by default. Is there a plan to let users set their display name, or is email always the primary identity label?

---

## Suggested Story Improvements

| # | Current state | Suggested change | Benefit |
| --- | --- | --- | --- |
| 1 | No ACs defined | Add 3 core ACs: view identity, list workspaces, access Settings from nav | Enables estimation, test design, and verification |
| 2 | Settings entry point unspecified | Specify Topbar user menu (gear icon or avatar dropdown) as the entry point | Ensures feature is reachable and testable |
| 3 | Sign-out ownership ambiguous | Clarify BK-86 delivers sign-out action; BK-87 shows identity only | Prevents duplicate work or gap |
| 4 | No error states | Define: session expired, network failure, empty workspace list | Covers real-world UX scenarios |

---

## Data feasibility flags

No data feasibility risks identified.

- All data needed (user identity from Supabase Auth, workspace membership from `workspace_members`) is already queried in the existing codebase
- No new tables, API endpoints, or fixtures required
- RLS policies for `workspace_members` are already active

---

## Recommended testing strategy

### Pre-implementation

- Confirm ACs with PO (critical questions above)
- Finalize Settings entry point location in Topbar
- Clarify BK-86/BK-87 boundary

### During implementation

- Verify identity display with both populated and empty `user_metadata`
- Verify workspace list renders for 1, 3, and 10+ workspaces
- Verify auth-gated access (unauthenticated → redirect)
- Verify navigation from multiple pages

### Post-implementation (in-sprint by `/sprint-testing`)

- Full smoke on Settings hub + Account section
- Auth edge cases: session expiry mid-session, direct URL access, back/forward navigation
- Cross-browser: verify Settings chrome renders correctly (Topbar integration)
- RLS: confirm viewer role sees same Account section as owner

---

## Risks & mitigation

| # | Risk | Likelihood | Impact | Mitigated by which outlines |
| --- | --- | --- | --- | --- |
| 1 | Settings entry point late-bound (not decided until implementation starts) | Medium | High — feature unreachable | Positive #3 (navigation outline); requires PO answer before sprint |
| 2 | BK-86/BK-87 overlap on sign-out | Medium | Medium — duplicate or missing feature | PO Critical Question #1; refined ACs clarify scope |
| 3 | `user_metadata` empty for existing users | High | Low — email-only fallback works | Test-only edge case #6 |
| 4 | Workspace list query does not scale (>50 workspaces) | Low | Low — MVP scale | Test-only edge case #3 |

---

## Next steps

-  PO answers Critical Questions before sprint planning
-  Dev answers Technical Questions before estimation
-  Story enters sprint at status `estimation` once refined
-  When Story reaches `ready*for*qa`, `/sprint-testing` will short-circuit refinement (label `shift-left-reviewed` detected)

---
_Synced from Jira by sync-jira-issues_
