# BK-3 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-3)

## Acceptance Test Plan (ATP) — BK-3 OAuth Sign-up/Sign-in (GitHub/Google)

> ***NOTE:**** ****Fresh ATP — supersedes the 2026-05-26 shift-left draft.**** That draft assumed the old `EMAIL*EXISTS` rejection design for AC-7. PO reversed that decision on 2026-06-24 (ADR-0008): Supabase automatic identity linking is now ON — same verified email across GitHub/Google/password auto-links to one account, no block, no toast. This ATP is scoped to the 10 ****current*** ACs in `customfield*10063` (Refined ACs section below), not the stale draft's 20 outlines.

***Planned****: 2026-07-07 | ****QA mode****: Stage 1 Planning (in-sprint, full phases — `shift-left-reviewed` label is 42 days old, past the 30-day freshness window, short-circuit not applied) | ****TMS modality***: jira-native (no Xray)

---

### Test Analysis — Story Complexity

| Axis | Rating | Notes |
| --- | --- | --- |
| Business logic | High | Redirect-target decision depends on workspace state; identity-linking rule changed mid-cycle (ADR-0008); shared callback route branches OAuth vs magic-link on a single query param |
| Integration complexity | High | Supabase Auth PKCE + `exchangeCodeForSession`, `workspace_members` lookup, provider consent screens (GitHub + Google), shared `app/auth/callback/route.ts` also serving BK-2 magic-link |
| Data validation | Medium | Verified-email matching drives auto-link; state-token / PKCE code validation is the CSRF boundary |
| UI complexity | Low | Two buttons + a toast + an inline onboarding error card; no new design tokens per Design's comment |

***Test effort estimate***: High — 32 test outlines (10 positive, 8 negative, 10 boundary, 4 integration) across 10 ACs, plus 6 parametrized artifacts collapsing 13 data-row executions.

### Epic-level inheritance

No `feature-test-plan.md` exists yet for EPIC-BK-1 and `master-test-plan.md` is not present in `.context/` — proceeding without either (noted as `missing_input`, non-blocking). PO/Dev/Design answers from the 2026-05-27 blocker-resolution thread are reused directly below, not re-derived.

---

### Refined ACs — reference, not rewrite

The current `acceptance-criteria.md` (10 ACs, `customfield_10063`) is already well-formed Gherkin with specific data (exact error codes, exact routes) — Phase 3 rewrite is not needed. One ambiguity surfaced during analysis:

> ***WARNING:**** ****AC-8 wording vs. reviewed implementation.**** AC-8 says the workspace-bootstrap failure happens "When the callback finishes the code exchange." The Dev-confirmed callback implementation (comment, 2026-05-27) only performs a `workspace_members` existence check and redirects to `/onboarding` or `/projects` — it contains no workspace auto-creation call. The reachable failure point, per Design's Q5 spec, is the ****onboarding-form submission RPC****, not the OAuth callback itself. TC-22–TC-24 below target that reachable surface. ****NEEDS DEV CONFIRMATION***: if a callback-time auto-create call exists elsewhere in the codebase, retarget TC-22 before Stage 2 execution.

---

### Test Outlines

***Legend**** — Technique: `EP` equivalence partitioning · `BVA` boundary value · `ST` state-transition · `DT` decision table · `PW` pairwise · `EG` error guessing. ****PO-val****: PO ran a live E2E pass on 2026-06-24 and reports this AC as spot-checked (QA still independently re-confirms — PO-validated is not "skip"). ****Focus***: explicitly unverified by anyone — Stage 2 prioritizes these first.

#### AC-1 / AC-2 — First-time OAuth sign-up (GitHub / Google)

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-1 | Should complete first-time OAuth sign-up and land on `/onboarding` | Positive | High | EP | Yes — provider: GitHub / Google | Yes (AC-1, AC-2) |
| TC-2 | Should upsert exactly one `auth.users` row with `provider` metadata set on first-time OAuth signup | Integration | Medium | EP | Yes — provider | Yes |
| TC-3 | Should NOT show a pre-created workspace before the onboarding form is submitted (probes AC-1's "bootstrapped" wording vs. the manual-creation-via-onboarding-form implementation) | Boundary | Medium | EG | No | No — ambiguity probe |

***TC-1 precondition/expected***: Given a fresh never-used email verified with the provider · When visitor clicks Continue with {provider} and approves consent · Then user lands on `/onboarding`, no `workspace_members` row exists yet, session cookie present.

#### AC-3 — Returning OAuth user, no duplicate workspace

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-4 | Should sign in a returning OAuth user directly to `/projects` with the existing workspace, no duplicate created | Positive | High | EP + DT (rule: has\_workspace=Yes → `/projects`) | Yes — provider | Yes |
| TC-5 | Should not create a second `workspace_members` row when the same returning user signs in via OAuth twice in a row (double sign-in / re-entrancy) | Boundary | Medium | ST (re-entrancy) | No | No |
| TC-6 | Should route a user who originally signed up via GitHub to `/projects` (existing workspace) when they later sign in via linked Google | Integration | Medium | EP | No | No |

#### AC-4 — OAuth consent denied

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-7 | Should redirect to `/login` with `OAUTH_DENIED` and surface the magic-link fallback CTA when the user denies consent ***in-browser**** on the provider screen | Negative | High | EP | Yes — provider | ****Focus*** — PO only checked the server-side shortcut, not the real in-browser deny flow |
| TC-8 | Should create no session and no user row when OAuth consent is denied | Negative | Medium | EP | No | No |
| TC-9 | Should not leave a stale state-token cookie after back-button navigation following a consent denial | Boundary | Low | EG | No | No |

#### AC-5 — OAuth state CSRF token mismatch

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-10 | Should reject the callback with `OAUTH*STATE*MISMATCH` (403) and create no session when the state token doesn't match the issued one | Negative | Critical | EP | No | Yes |
| TC-11 | Should reject the callback with a distinct missing-state/missing-code error when the state param (or code) is absent entirely | Negative | High | EP | No | No |
| TC-12 | Should reject a replayed OAuth authorization code after it has already been exchanged once | Boundary | Critical | ST (consumed → replay) | No | No |
| TC-13 | Should reject an expired state-token/code when the callback is hit after the issuance TTL window | Boundary | High | ST + BVA (TTL window) | No | No |

#### AC-6 — Third-party-cookie restriction, 30s fallback

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-14 | Should surface the magic-link fallback with clear copy within 30s when the callback cookie fails to set in a third-party-cookie-blocked browser | Boundary | High | BVA (boundary) | No | ***Focus*** — not yet validated by anyone |
| TC-15 | Should NOT surface the fallback prematurely before the 30s mark elapses | Boundary | Medium | BVA (min-1 equivalent) | No | ***Focus*** |
| TC-16 | Should surface the fallback promptly just after the 30s mark, without excessive extra delay | Boundary | Medium | BVA (max+1 equivalent) | No | ***Focus*** |
| TC-17 | Should NOT surface the fallback when the cookie sets successfully before 30s | Positive | Medium | EP (valid partition) | No | ***Focus*** |

#### AC-7 — Cross-provider same verified email — automatic identity linking

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-18 | Should auto-link a new sign-in to an existing account sharing the same verified email, regardless of provider pairing, landing on `/projects` with the existing workspace | Positive | High | EP + PW (3 factors: new-method × existing-method, logged) | Yes — 3 rows: Google→existing-GitHub, GitHub→existing-Google, OAuth→existing-password | Partial — PO checked Google↔email only; GitHub↔Google and OAuth↔password rows are ***Focus*** |
| TC-19 | Should result in exactly ONE `auth.users`/identities row (not two) after cross-provider auto-linking | Integration | Critical | EG (Principle 5 — risk beyond the AC's silence on row count) | No | No |
| TC-20 | Should allow subsequent sign-ins via EITHER linked provider to reach the SAME account and workspace after linking has occurred | Positive | High | ST (linked state persists) | No | No |
| TC-21 | Should NOT auto-link when the matching email on the other provider is unverified | Negative | Critical | EP (distinct invalid partition) | No | No |

> Pairwise applied to TC-18: 3 combinable factors (GitHub, Google, password) reduced to 3 rows covering every pair at least once — full grid coincides with pairwise here since there are only 3 factors.

#### AC-8 — Workspace bootstrap failure

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-22 | Should keep the OAuth session persisted (no rollback) and show the inline error card with Retry when the workspace-creation RPC fails on onboarding-form submission | Negative | High | EP | No | ***Focus*** — AC-8 not in PO's validated list; ambiguity above also applies |
| TC-23 | Should allow the user to successfully retry workspace creation after an initial failure, without restarting the OAuth flow | Positive | Medium | ST (failed → retry → success) | No | No |
| TC-24 | Should log the failure server-side with user ID and error details | Integration | Low | EP | No | No — may be Manual/exploratory if no log-viewing tool is available in staging |

#### AC-9 — OAuth initiation failure

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-25 | Should surface a graceful error on `/login` with the magic-link fallback CTA and create no session when OAuth initiation fails before a session is established (provider 5xx) | Negative | High | EP | Yes — provider | Yes |
| TC-26 | Should distinguish initiation-failure messaging (pre-session) from mid-callback-failure messaging | Negative | Medium | EG | No | No |

#### AC-10 — OAuth UI buttons enabled + copy updated

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-27 | Should render the GitHub and Google OAuth buttons enabled with working onClick handlers (no disabled/"soon" state) | Positive | High | EP | Yes — provider | Yes |
| TC-28 | Should render updated login copy that no longer states OAuth ships next sprint (collapsed: trivially atomic, single string-presence check) | Positive | Low | EP | No | Yes |

#### Cross-cutting risk-beyond-AC (Principle 5 + explicit PO "Focus for QA")

| TC# | Title | Type | Priority | Technique | Param. | PO-val |
| --- | --- | --- | --- | --- | --- | --- |
| TC-29 | Should preserve BK-2 magic-link sign-in success alongside OAuth on the shared `app/auth/callback/route.ts` (no `state` param path) | Positive (regression) | Critical | EG | No | ***Focus*** — explicit PO ask |
| TC-30 | Should preserve password sign-in success alongside OAuth on the shared callback route | Positive (regression) | Critical | EG | No | ***Focus*** — explicit PO ask |
| TC-31 | Should reject a maliciously crafted `next` query param (e.g. `//evil.com`) on the OAuth callback path (open-redirect guard) | Boundary | High | EG (security) | No | No |
| TC-32 | Should apply a rate-limit / lockout to repeated rapid state-mismatch attempts against the callback (CSRF/credential-stuffing probing — G7 from shift-left, never resolved with an explicit AC) | Boundary | Medium | EG | No | No — ***NEEDS PO/DEV CONFIRMATION*** whether a rate-limit policy exists; may resolve to Manual/exploratory charter if unimplemented |

---

### Coverage estimate

| Type | Count |
| --- | --- |
| Positive | 10 |
| Negative | 8 |
| Boundary | 10 |
| Integration | 4 |
| ***Total**** | ****32*** |

Rationale: High business-logic + integration-complexity ratings (Test Analysis table) justify exceeding the AC-conformance floor with dedicated Decision-Table coverage on the redirect logic, Pairwise coverage on the 3-way identity-linking combinations, State-Transition coverage on the OAuth state-token lifecycle (issued → consumed → expired/replayed) and the linked-identity persistence, and BVA on the AC-6 30s window. No outline was added without a distinct partition/boundary/state/risk it explores that a sibling does not.

### Parametrization

| Group | Artifact | Rows | Benefit |
| --- | --- | --- | --- |
| Provider happy/negative paths | TC-1, TC-4, TC-7, TC-25, TC-27 | 2 rows each (GitHub / Google) | Same precondition/action/outcome-shape; only the provider varies — 5 artifacts instead of 10 |
| Identity-linking pairing | TC-18 | 3 rows (Google→GitHub, GitHub→Google, OAuth→password) | Pairwise-reduced; 1 artifact instead of 3 |

Total: 6 parametrized artifacts collapse 13 data-row executions that would otherwise be 13 separate outlines.

---

### Edge cases identified (risk-beyond-AC)

| Edge case | In original AC? | Outline | Priority |
| --- | --- | --- | --- |
| Replayed/reused authorization code | No | TC-12 | Critical |
| Expired state-token TTL window | No | TC-13 | High |
| Duplicate identity row after auto-link | No (AC-7 only states "no duplicate user") | TC-19 | Critical |
| Unverified email must not auto-link | No | TC-21 | Critical |
| Open-redirect via `next` param on OAuth path | No | TC-31 | High |
| Rate-limit on CSRF probing (shift-left G7, never resolved) | No | TC-32 | Medium — flagged gap |
| Callback-time bootstrap wording vs. manual onboarding-creation implementation | Partially (AC-8 wording ambiguity) | TC-3, TC-22 | Medium |

### Test data categories

| Data type | Purpose | Examples |
| --- | --- | --- |
| Fresh never-used email, verified GitHub | AC-1 happy path | `faker.internet.email()` seeded GitHub test account |
| Fresh never-used email, verified Google | AC-2 happy path | `faker.internet.email()` seeded Google test account |
| Shared-email account verified on GitHub AND Google | AC-7 TC-18 (Google↔GitHub row) | Pre-provisioned per shift-left's "Test Data Requirements" |
| Shared-email account: OAuth + password/magic-link | AC-7 TC-18 (OAuth↔password row), TC-30 | Pre-provisioned |
| Account with unverified secondary-provider email | AC-7 TC-21 | Pre-provisioned, email left unverified deliberately |
| Returning-user account with an existing active workspace | AC-3, AC-4, AC-9 negative paths | Existing staging fixture or `Generate` via onboarding once |
| Browser context simulating blocked third-party cookies | AC-6 | Playwright browser context with cookie policy override |
| Tampered / missing / expired state-token & code | AC-5 | Direct callback URL manipulation (query param injection) |

***Data generation strategy***: Dynamic (Faker) for disposable emails; static pre-provisioned OAuth test identities for GitHub/Google (cannot be Faker-generated — real provider consent flow); cleanup via staging DB deletion of test users post-run, tests kept order-independent.

---

### Traceability note (jira-native modality)

This is Modality jira-native — no separate `Test` work items are created at Stage 1 (regression-worthy scenarios are promoted to `Test` issues in Stage 4 `test-documentation`, ROI-gated). Traceability for this stage is the presence of this ATP body on the Story's `acceptance*test*plan` field, scoped to the current 10 ACs — there is no `[TMS_TOOL] trace` graph to verify yet.

---
_Synced from Jira by sync-jira-issues_
