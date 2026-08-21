# BK-497 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-497)

## ATP: BK-497: PAT | Require every API route to declare its capability posture

> ***Shift-Left short-circuit applied.**** This Story inherits shift-left refinement from parent BK-262 (label `shift-left-reviewed`, 2026-08-14, < 30 days old). Phases 1-3 (Critical Analysis, Story Quality, Refined ACs from scratch) are ****not re-derived**** — reused per BK-262's "Shift-Left QA — Decisions from PO review" comment. This ATP continues from ****Phase 4*** with executable detail, plus three explicit QA-owner decisions applied on top (see below).

### Triage

***Type****: Story. ****Veto***: `auth / authorization` → REQUIRE TESTING (Full ATP), consistent with the inherited shift-left decision — no re-triage needed.

***Risk score*** (§0.2, restated for BK-497's actual delivery — not BK-262's full scope):

| Factor | Score | Why |
| --- | --- | --- |
| Dynamic data (API) | +3 | PAT scopes, workspace binding, 87 live route handlers |
| Explicit ACs present | +2 | AC-04/05/06 |
| High priority (Critical risk-tier) | +1 | Sits in master-test-plan.md's CRITICAL Auth/PAT tier |
| Multi-component | +1 | 68 route files, gateway, PAT module, Settings UI |
| User-facing | 0 | Story is behaviour-neutral for 86/87 handlers; only the token-route lift + Settings smoke are user-facing |
| New feature | 0 | Type-level hardening + one behavioural lift, not new functionality |

***Total******:****** 7 → MEDIUM-HIGH, Full ATP.**** Weighted down from a naive auth-surface HIGH score because the DoD's "no behaviour change" claim on 86/87 handlers converts most of the surface into ****regression risk**** (verify nothing broke) rather than ****new-behaviour risk*** (verify a new rule works) — the ATP below reflects that split explicitly.

### Decisions applied (QA owner, final — not open questions)

1. ***Added**** Scenarios D1-D5 (below) for the headline property **"a route handler with no declared posture fails to compile"* — no AC exists for it in Jira (confirmed gap, see AC Gaps). Scoped strictly to "does the type system enforce this" — no capability-assignment testing (that's BK-498/BK-499).
2. ***Added*** Scenario F (manual smoke: issue + revoke a PAT from Settings) — the only user-facing surface touching the one real behavioural change.
3. ***Excluded***: `app/auth/callback` / `app/auth/oauth/[provider]` bare handlers, and `POST /invites/accept` deferred-debt posture — both BK-499's shift-left scope.

---

## Phase 3 — Refined Scenarios (reused from BK-262 + Decisions #1/#2)

| # | Scenario | Type | Priority |
| --- | --- | --- | --- |
| A | AC-04 — read-only PAT rejected creating an invite | Negative | Critical |
| B | AC-05 — write+execute PAT (no admin) rejected revoking a pending invite | Negative | Critical |
| C | AC-06 — admin-scoped PAT with no resolvable workspace rejected on workspace-admin action | Negative | Critical |
| D | ***NEW*** — a route handler with no declared posture fails to compile (headline property, Decision #1) | Positive/Structural | Critical |
| E | Scope §4 — `cookie-only` lift on the two token routes (PAT rejected verbatim, session unaffected) | Negative + Positive | Critical |
| F | ***NEW*** — manual smoke: issue + revoke a PAT from Settings (Decision #2) | Positive | Critical |
| G | Regression spot-check across the 4 posture types on the 85 migrated call sites | Positive | Medium |

***Collapsed******:****** none.*** Every scenario above is non-trivial (interacting conditions, ranges, or a structural property) — none qualifies for the single-outline `trivially atomic` exemption.

---

## Phase 4 — Test Design (Test Outlines)

### Technique-driven derivation

| Trigger in the AC | Technique applied | Result |
| --- | --- | --- |
| Token scope × required capability × workspace binding interact (A/B/C) | ***Decision Table*** | 3 negative rules (AC-04/05/06) + 1 positive control row |
| `NonEmpty<Capability>` / `Capability` literal type boundaries (D) | ***Boundary Value Analysis*** | empty-array boundary, invalid-literal boundary, 0-vs-1-vs-2-handlers-per-file boundary |
| Cookie-only lift = 2 conditions (auth channel × route) interact | ***Decision Table*** | PAT×POST, PAT×DELETE, PAT×GET(control), Session×all-three |
| Auth-channel input domain (Bearer valid / invalid / expired / cookie) | ***Equivalence Partitioning*** | adds the invalid/expired-Bearer edge case (auth-order charter) |
| Entity state / lifecycle field | ***State-Transition**** | ****N/A*** — no state machine is introduced or modified by this Story (token `revoked_at` lifecycle is pre-existing, unchanged code path; exercised functionally by Scenario F, not as a transition matrix) |
| 3+ combinable factors | ***Pairwise**** | ****N/A*** — the interacting factors here (≤3, hand-picked business-critical combos) are fully enumerated by the Decision Tables above; a combinatorial sweep would not surface a distinct risk |
| Experience-based risk (regression surface of an 85-call-site migration; auth-resolution-vs-posture-check ordering) | ***Error Guessing charter*** | 2 charters: auth-order edge case, posture-type spot-check |

### Coverage estimate

| Type | Count | Notes |
| --- | --- | --- |
| Positive | 5 | Positive control (decision table), GET /tokens control, session-unaffected control, both Settings smoke steps |
| Negative | 5 | AC-04/05/06, POST/DELETE token-route rejections |
| Boundary | 3 | empty `requires: []`, invalid capability literal, coverage-check per-handler granularity |
| Structural (compile-time) | 2 | missing-posture-fails-to-compile, bypasser-postures-stay-green |
| Integration | 1 | Settings UI → API round-trip (issue/revoke) |
| Edge (Error Guessing) | 2 | auth-order edge case, posture-type regression spot-check |

***17 outlines total.**** Rationale: AC-04/05/06 are non-regression guards on the only Story that touches all 87 call sites — they get a decision table, not a single spot-check, because three genuinely different rule combinations are asserted. The headline compile-time property (Decision #1) gets 5 outlines because it is a ****type-level contract with its own boundaries*** (empty array, invalid literal, per-file granularity, bypasser carve-out) that a single "doesn't compile" outline would under-specify. The cookie-only lift is the one real behavioural change, so it is exploded 1:N per the standard technique (Positive/Negative × PAT/Session × route) rather than collapsed. Two Error Guessing charters cover what the ACs are silent on: check-ordering (auth resolution vs. posture rejection) and a bounded regression sample of the 85 mechanically-migrated call sites — NOT a re-verification of all 87 by hand, since the dev's automated coverage-check + full suite (1555/1556 pass) already owns that.

### Parametrization

| Group | Param 1 (auth channel) | Param 2 (route) | Expected |
| --- | --- | --- | --- |
| Cookie-only lift | Bearer PAT | `POST /api/v1/tokens` | 403, pre-lift message verbatim |
| Cookie-only lift | Bearer PAT | `DELETE /api/v1/tokens/{id}` | 403, pre-lift message verbatim |
| Cookie-only lift | Bearer PAT | `GET /api/v1/tokens` | 200 (positive control — not lifted) |
| Cookie-only lift | Session cookie | all three routes | unaffected, pre-Story behaviour (200/201/204 as applicable) |

One parameterized outline group (TC-10/11/12/13 below) rather than four unrelated artifacts — same precondition shape (a minted PAT / an active session), only the auth channel + target route vary, and the outcome-shape differs by row (this is the ***split*** case per test-design-doctrine Part 2.5: different status code per row = separate rows in one table, not silently collapsed).

---

## Test Outlines

### Decision Table — AC-04/05/06 (Scenario A/B/C) + positive control

| Row | Token scopes | Action | Requires | Workspace bound? | Expected |
| --- | --- | --- | --- | --- | --- |
| TC-01 | `atc:read` only | `POST /invites` (create invite) | not `atc:read` alone | n/a | ***403***, no invite created (AC-04) |
| TC-02 | `atc:write`, `run:execute` (no `workspace:admin`) | `DELETE /invites/{id}` (revoke pending invite) | `workspace:admin` | n/a | ***403***, invite unchanged (AC-05) |
| TC-03 | `workspace:admin` | `PATCH /workspaces/{id}/settings` | `workspace:admin` | ***No*** (unresolvable) | workspace-resolution error, no action taken (AC-06) |
| TC-04 | correctly-scoped PAT, bound to the target workspace | same admin action as TC-03 | `workspace:admin` | ***Yes*** | 200, action succeeds (positive control — proves the 87-call-site migration didn't also break the allow path) |

- ***Titles***: TC-01 `Should reject invite creation with a PAT scoped only atc:read`; TC-02 `Should reject pending-invite revocation with a PAT missing workspace:admin`; TC-03 `Should reject a workspace-admin action when the PAT's workspace binding cannot be resolved`; TC-04 `Should allow a workspace-admin action with a correctly scoped and bound PAT`.
- ***Level****: API. ****Priority***: TC-01/02/03 = P0 (Critical — non-regression guard on all 87 call sites), TC-04 = P1 (High — positive control, not itself an AC).
- ***Test data****: Generate — mint each PAT via `POST /api/v1/tokens` (session-authenticated) with the exact scope set per row. TC-03's "unbound" precondition: ****Discover**** first against the GAP-14 residual — `.context/business/business-api-map.md` documents ~136 pre-fix admin-scoped PATs on staging never confirmed revoked, which are plausibly already workspace-unresolvable; if none are usable, ****Generate*** by minting a workspace-bound admin PAT then removing the caller's membership from that workspace (Modify) to force an unresolvable context.
- ***Note***: this AC-coverage question already passes on today's code per dev evidence (17 tests, 0 skips) — this ATP's job is the independent QA confirmation, not first discovery.

### Structural / compile-time — Scenario D (headline property, Decision #1)

| # | Title | Type | Priority |
| --- | --- | --- | --- |
| TC-05 | Should fail to compile a route handler that omits its `auth` posture entirely | Positive/Structural | P0 |
| TC-06 | Should fail to compile a `required` posture with an empty `requires: []` array | Boundary | P1 |
| TC-07 | Should fail to compile a `required` posture carrying an invalid capability literal (not in `Capability`) | Boundary | P2 |
| TC-08 | Should fail the coverage check only for the specific handler missing a posture, when a route file exports two handlers and just one omits it | Boundary | P1 |
| TC-09 | Should keep the coverage check green for the two explicitly enumerated `bypass`-posture handlers (`app/api/openapi/route.ts`, `app/api/v1/route.ts`) | Positive | P2 |

- ***Level***: Type-check / static verification, not runtime API calls.
- ***Preconditions***: a scratch fixture file (NOT committed to `app/api`) exercising `WithApiHandlerOptions` directly, or `// @ts-expect-error` assertions compiled via `bunx tsc --noEmit` against the fixture; TC-08/TC-09 additionally run `lib/api/route-capability-coverage.test.ts` against a temporary route file / the existing committed snapshot.
- ***Test steps**** (TC-05): 1) Write a fixture calling `withApiHandler(handler)` / `withApiHandler(handler, {})` with no `auth` key. 2) Run `bunx tsc --noEmit` against the fixture. ****Verify***: compilation fails with a type error naming the missing `auth` discriminant; no code path exists where this compiles.
- ***NEEDS DEV CONFIRMATION***: whether the team wants this formalized as a committed type-only test (e.g. a `tsd`/`expectTypeOf` assertion file) during this QA pass, or kept as an ad-hoc scratch verification — the AC-coverage gap note in `context.md` says this property "is tested but never stated as a criterion," implying no committed test currently proves it in CI. Flagging for the Stage 1 report, not blocking ATP authorship.
- ***Test data***: none (compile-time only, no runtime data).

### Cookie-only lift — Scenario E (parametrized group)

| # | Title | Auth channel | Route | Expected | Priority |
| --- | --- | --- | --- | --- | --- |
| TC-10 | Should reject a PAT-authenticated POST /api/v1/tokens with the pre-lift 403 message verbatim | Bearer PAT | `POST /api/v1/tokens` | 403, message = pre-lift "cannot issue tokens" string, no token minted (DB-confirmed) | P0 |
| TC-11 | Should reject a PAT-authenticated DELETE /api/v1/tokens/{id} with the pre-lift 403 message verbatim | Bearer PAT | `DELETE /api/v1/tokens/{id}` | 403, message = pre-lift "cannot revoke tokens" string, target token still unrevoked (DB-confirmed) | P0 |
| TC-12 | Should allow a PAT-authenticated GET /api/v1/tokens (positive control, not lifted) | Bearer PAT | `GET /api/v1/tokens` | 200, RLS-scoped list of the caller's own tokens | P1 |
| TC-13 | Should allow session/cookie-authenticated calls to all three token routes, unaffected by the lift | Session cookie | all three | pre-Story behaviour preserved (issue succeeds, revoke succeeds, list succeeds) | P0 |

- ***Level****: API. ****Test data***: Generate — a minted, valid PAT (any scope; the rejection is channel-based, not scope-based) for TC-10/11/12; an authenticated staging session for TC-13.
- ***DB cross-validation***: TC-10/11 require a `[DB*TOOL]` check post-call — `access*tokens` row count unchanged (TC-10) / target row's `revoked_at` still null (TC-11).

### Manual smoke — Scenario F (Decision #2)

| # | Title | Type | Level | Priority |
| --- | --- | --- | --- | --- |
| TC-14 | Should issue a new PAT from Settings and see it listed | Positive | UI | P1 |
| TC-15 | Should revoke an issued PAT from Settings and confirm it is rejected on subsequent use | Positive/Integration | UI + API | P0 |

- ***Preconditions***: staging session logged in, Settings page reachable, `IssueTokenModal.tsx` accessible.
- ***Steps (TC-14)****: 1) Navigate to Settings → Tokens. 2) Issue a token with a representative scope (e.g. `atc:read`). ****Verify***: UI shows the new token (masked) in the list; DB shows a new `access_tokens` row.
- ***Steps (TC-15)****: 1) From TC-14's token, click Revoke. ****Verify****: UI reflects revoked state. 2) Attempt a Bearer call using the now-revoked token against any `required`/`authenticated` route. ****Verify***: 401/403 rejection, not treated as valid.
- ***Rationale***: the only user-facing surface touching the one real behavioural change; not itself an AC, included per QA-owner Decision #2.

### Error Guessing charters — Scenario G

| # | Title | Charter | Priority |
| --- | --- | --- | --- |
| TC-16 | Should reject an invalid/expired Bearer token against the two lifted routes with an identity-resolution 401, not the 403 posture rejection | 15-min charter: confirm `cookie-only`'s runtime order is "resolve identity, THEN reject `via==='bearer'`" — an invalid token must fail at identity resolution, never reach the posture check | P2 |
| TC-17 | Should return unaffected (pre-Story) responses for a representative sample of migrated routes across each of the 4 posture types (public / cookie-only / authenticated / required), called via session | 20-min charter: pick 1 route per posture type not otherwise covered above (e.g. one `BK-498 pending`-placeholder route), confirm behaviour matches pre-migration baseline | P2 |

- ***Rationale***: TC-16 probes a risk the ACs are silent on (check ordering). TC-17 is a bounded, risk-based spot-check of the 85-call-site mechanical migration — NOT a re-verification of all 87 handlers by hand; the dev's automated coverage-check + full suite (1555 pass / 1 pre-existing unrelated fail) already owns exhaustive regression coverage. This charter exists to give QA independent eyes on a small sample, per the Story's own framing ("is everything still exactly as it was").

---

## Phase 5 — Edge Case + Test-Data Summary

### Edge case table

| Edge case | In original story? | Added to refined AC? | Outline | Priority |
| --- | --- | --- | --- | --- |
| Route handler with no posture | No (headline property, no AC) | Yes — Decision #1 | TC-05 | P0 |
| Empty `requires: []` | No | Yes | TC-06 | P1 |
| Invalid capability literal | No | Yes | TC-07 | P2 |
| Partial-file coverage-check granularity | No | Yes | TC-08 | P1 |
| Gateway bypassers stay green | Implicit in Scope | Yes | TC-09 | P2 |
| Invalid/expired Bearer vs. cookie-only order | No | Yes | TC-16 | P2 |
| Broad regression sample beyond the 3 explicit ACs | Implicit in Ely's framing | Yes | TC-17 | P2 |

### Test-data categories

| Data type | Count | Purpose | Examples |
| --- | --- | --- | --- |
| Valid (PAT, correctly scoped+bound) | 1 | TC-04 positive control | `atc:write`+`workspace:admin`, bound |
| Invalid (PAT, wrong/missing scope) | 2 | TC-01/02 | `atc:read` only; `atc:write`+`run:execute` |
| Boundary (PAT, unresolvable workspace) | 1 | TC-03 | `workspace:admin`, unbound / orphaned |
| Valid (PAT, any scope) | 1 | TC-10/11/12 (cookie-only lift; channel-based, scope-irrelevant) | any minted PAT |
| Session | 1 | TC-13, TC-14, TC-15, TC-17 | staging login |
| Compile-time fixtures | none (no runtime data) | TC-05-09 | N/A |

### Data generation strategy

- ***Static***: none required — no hardcoded business-critical values beyond the exact scope strings named in the ACs.
- ***Dynamic****: PATs minted live via `POST /api/v1/tokens` per row; TC-03's unbound precondition sourced by ****Discover**** (GAP-14 residual orphaned admin PATs) with ****Generate****/****Modify*** fallback (mint + remove membership).
- ***Cleanup***: revoke every PAT minted for this ATP's execution at the end of Stage 2 (idempotent, order-independent); TC-15's token is self-cleaning (revoked as part of the test).

---

## Phase 0.3 — Data feasibility check

| AC / Scenario | Precondition | Data found? | Pattern | Notes |
| --- | --- | --- | --- | --- |
| AC-04 (TC-01) | PAT scoped exactly `atc:read` | Yes (mintable) | Generate | Standard `POST /api/v1/tokens` mint |
| AC-05 (TC-02) | PAT scoped `atc:write`+`run:execute`, no admin | Yes (mintable) | Generate | Standard mint |
| AC-06 (TC-03) | PAT scoped `workspace:admin`, unresolvable workspace | Partial | Discover → Generate/Modify fallback | GAP-14 residual candidates unconfirmed; fallback path always available |
| Cookie-only lift (TC-10-13) | any valid PAT + active session | Yes | Discover/Generate | trivially available |
| Manual smoke (TC-14/15) | active staging session, Settings reachable | Yes | Discover | already have staging QA session |
| Compile-time (TC-05-09) | none (static analysis) | N/A | N/A | no runtime data needed |

No critical precondition is blocked — AC-06's data path has a confirmed fallback even if the GAP-14 Discover attempt comes up empty.

---

## AC Gaps

1. ***Headline property has no formal AC**** — **"a route handler with no declared posture fails to compile"* is the Story's central delivery but was never written as an acceptance criterion in Jira (confirmed via BK-262's split ruling and Ely's BK-497 comment). This ATP adds Scenarios D (TC-05–TC-09) to cover it as risk-beyond-AC per test-design-doctrine Principle 2, per QA-owner Decision #1. Not a blocker — flagged for visibility only.
2. No other AC gaps identified. AC-04/05/06 are precisely and testably stated with concrete data (Karim, exact scopes, exact endpoints).

## Open Questions

- TC-05-09's exact execution mechanism (scratch `tsc --noEmit` fixture vs. a to-be-written committed type-only test) is a Stage 2 execution detail, not a Stage 1 blocker — see "NEEDS DEV CONFIRMATION" note under Scenario D above.

---

## Traceability

- ATP field: Story `🧪 Acceptance Test Plan (ATP)` (`customfield_10067`), Modality jira-native.
- ATR container: to be initialized empty this Stage, filled at Stage 3.
- No `Test` work items created at this Stage (jira-native TC creation timing — deferred to Stage 4 `test-documentation`, regression-worthy outlines only).
- Source Story: BK-497. Parent Epic: BK-1 (Tenancy & Identity). Sibling Stories (not covered here): BK-498, BK-499.

---
_Synced from Jira by sync-jira-issues_
