# BK-45 — Acceptance Test Plan (QA)

> Jira field: `customfield_10067` · [View in Jira](https://jira.upexgalaxy.com/browse/BK-45)

## Acceptance Test Plan (ATP) — BK-45

***ATP******:****** BK-45******:****** TMS-Traceability | Render full US to bug evidence chain in one read***

Formal Stage 1 ATP (full pass — the `shift-left-2026-06-11` label is 57 days old, past the 30-day short-circuit threshold, so Phases 1-3 were re-run in full rather than short-circuited). Supersedes the DRAFT outline block ("23 test outlines") previously logged in this field; the 10 literal `NEEDS PO/DEV CONFIRMATION` markers across AC (4) and this ATP (6) are ***stale, not open**** — resolved by PO ratification (comment 12171, 2026-08-05) and Tech Lead ratification (comment 12176, 2026-08-05), reconfirmed by QA note (comment 12221, 2026-08-07). See `test-session-memory.md` in the PBI folder for the full resolution table; key rulings this ATP builds on: latest-run = most recently **started* run with `id DESC` tiebreaker; defect scoping via `bugs.atc*id` (not `run*id`); no ATC dedup across ACs; 3-predicate archived-ATC filter; role gate = viewer and above, no extra gate; archived Story renders read-only with a banner, not a 404; filtering (BK-48) and export (BK-50) are out of scope by design.

### Risk Level: HIGH

Triage forces a Full ATP on two independent grounds:

1. ***Veto**** (Phase 0.1) — this story hits the `REQUIRE TESTING` veto category on ****auth/authorization**** (cross-workspace tenant isolation) and ****data integrity on core entities*** (defect scoping must not leak across stories), which forces Full regardless of the numeric score.
2. ***Risk score**** (Phase 0.2) — New feature (+3), dynamic API/DB data (+3), explicit ACs present (+2), user-facing (+2), high effort/8 SP (+2), multi-component FE+API+DB+RPC (+1) = ****13, comfortably inside the 8+ HIGH band*** even before any priority-field bonus.

The security/tenant-isolation surface (cross-workspace non-disclosure, defect-leak prevention across stories sharing a Test) is the dominant driver — this is a read path over sensitive coverage/defect data spanning workspaces, and the one negative finding here (a data leak) would be a CRITICAL-severity defect. Stage 2 should go deep on the non-disclosure and defect-scoping cases before anything else.

### Flagged discrepancy — AC-05 "403 Forbidden" vs shipped 404 (triage conclusion)

AC-05's second scenario reads: **"the application returns a 403 Forbidden response ******or equivalent access-denied UI****"***********. The shipped implementation (****`lib/traceability/errors.ts`****, ****`mapTraceabilityRpcError`****) maps the RPC's ****`P0002`**** (covers missing story, foreign-workspace story, and non-member alike — all indistinguishable at the RPC boundary) to a uniform ****HTTP 404*** `not_found`, "User story not found." — identical wording whether the story doesn't exist or belongs to a workspace the caller can't see. Neither ratification comment (12171, 12176) rules on the literal status code; the dev's own code comment names this as an unratified, autonomous UI-shape call.

***Conclusion******:****** this is a spec-wording clarity gap, not a code defect.*** Reasoning:

- AC-05 already permits an "equivalent access-denied UI" alongside 403 — it does not mandate the literal status code. A uniform 404 satisfies that alternative clause as written.
- A ***split*** 403-vs-404 response would itself be the actual security defect: it lets a caller distinguish "story exists but you can't see it" (403) from "story doesn't exist" (404), which is a resource-existence enumeration side-channel across workspace boundaries — exactly the risk this feature's own edge-case list (EC1/EC2) flags as CRITICAL.
- This matches the identical non-disclosure pattern already verified today on BK-175 (anti-enumeration) and BK-23 (cross-workspace non-disclosure) — this codebase has a consistent, deliberate convention here, not a one-off.
- ***Test design decision****: TC-BK45-16 (below) tests the non-disclosure **behavior** — foreign-workspace access and a nonexistent story ID must return the ****same*** response (status + message), and neither must leak any chain data — rather than asserting the literal string "403". A uniform 404 is the PASS condition.
- ***Recommendation for PO***: reword AC-05's second scenario to read "...returns a uniform 404 Not Found (non-disclosure — indistinguishable from a nonexistent story)..." so future readers don't have to re-derive this reasoning.

### Untested residual — partial/mixed coverage render (new TC this ATP adds)

`resolveStoryChainViewState` has no dedicated "partial/mixed" state — a story with some covered / some uncovered ACs resolves to `has-chain`, and each `AcCard` independently renders either its chain or the uncovered strip. This branch is unit-tested and DB-integration-tested (`story-traceability-isolation.test.ts`, 11/11 passing) but has never been exercised live against a seeded example. ***TC-BK45-11*** below is the dedicated live-UI case for Stage 2.

---

### Coverage Estimate

| Type | Count |
| --- | --- |
| Positive | 7 |
| Negative | 12 |
| Boundary | 3 |
| Integration | 4 |
| ***Total**** | ****26*** |

***Rationale***: up from the 23 draft outlines. The increase is not padding — every added outline explores a partition, boundary, state, or named risk the draft did not isolate: the partial/mixed live case (the flagged residual), the explicit non-disclosure parity check (folds the 403/404 discrepancy into one testable behavior), the run-status State-Transition set (pass/fail/blocked/skipped/running as 5 distinct states, not 1), the archived-STORY-vs-archived-AC split (2 different mechanisms, previously conflated), the ghost-ATC/EC7 regression check, the ATC-no-dedup rule (A5/EC3), and the scope-boundary guard (filter/export must NOT appear). Negative is the largest bucket (12) because this is a read-only view — every write-path category the doctrine would normally probe (double-submit, malformed payload) doesn't apply, so risk concentrates entirely in access-control, state-fidelity, and leak-prevention instead, which is exactly what a HIGH-risk read surface should look like.

***Techniques applied*** (full doctrine: `agentic-qa-core/references/test-design-doctrine.md`):

- ***EP*** — always, every AC (valid/invalid partitions per state below).
- ***BVA*** — chain depth (EC6): TC-02 (1 AC/1 ATC minimum) and TC-03 (50+ ATC maximum), plus the run-timestamp tie (TC-06).
- ***State-Transition*** — run status (pass/fail/blocked/skipped/running, TC-04/TC-05) and Story lifecycle (draft accessible TC-20, archived read-only-with-banner TC-19).
- ***Decision Table*** — AC-05 access control: 3 interacting conditions (authenticated? × workspace member? × story exists?) — TC-14/TC-15/TC-16 are the surviving rules after collapsing equivalent columns (both "story doesn't exist" and "foreign workspace" columns collapse to the same uniform-404 rule, hence TC-16 is one parametrized artifact with 2 data rows, not 2 separate outlines).
- ***Pairwise***: N/A — no 3+ independent orthogonal factors with a combinable grid large enough to need reduction; the one 3-factor interaction (access control) is small enough for a full decision table.
- ***Error-Guessing charter*** — TC-26, concurrent Jira import mid-load (EC12), time-boxed exploratory.
- ***Parametrization*** — 3 groups collapsed into single artifacts per Part 2.5: run-status pill copy (TC-04, 4 rows), layer-specific "no data yet" copy (TC-09, 5 rows), non-disclosure parity (TC-16, 2 rows). Net: 11 data points folded into 3 artifacts instead of 11 separate outlines.

---

### Test Case Outlines

> jira-native modality — ***outlines only*** (name + precondition → expected). No `Test` work items are created in this stage; Stage 4 (`test-documentation`) promotes regression-worthy outlines into formal Xray/Jira `Test` issues later.

| # | Title | Type | Technique | Precondition → Expected |
| --- | --- | --- | --- | --- |
| TC-BK45-01 | Should render the full 5-layer chain for a fully covered story | Positive | EP | Story with 1+ AC, each with ATC→Test→Run→Defect → single-page chain renders, no extra navigation |
| TC-BK45-02 | Should render the minimum populated chain (1 AC, 1 ATC, 1 Test, 1 Run) | Boundary | BVA (lower) | Smallest non-empty chain seeded → renders correctly, no broken/null cells |
| TC-BK45-03 | Should render a large chain (50+ ATC rows) without N+1 latency | Boundary | BVA (upper) / EC6 | Story with 50+ ATC rows → single RPC round trip, acceptable latency, no per-ATC fan-out calls in network log |
| TC-BK45-04 | Should render the correct latest-run status pill **(parametrized****:**** pass / fail / blocked / skipped)** | Positive | EP + State-Transition | Latest run in each of the 4 terminal statuses → matching status pill/copy renders |
| TC-BK45-05 | Should not show a misleading verdict when the latest run is in-flight ("running") | Negative | State-Transition | Latest run status = running → run-level `running` discriminator outranks any position-level pass/fail, UI shows in-progress state, not a false pass/fail |
| TC-BK45-06 | Should break a same-`started*at` tie on the latest run using `id DESC` | Boundary | BVA / EC8 | Two runs seeded with identical `started*at` → the higher-`id` run renders as "latest" |
| TC-BK45-07 | Should list and order multiple defects linked to one run by `created_at DESC` | Integration | EP | Run with 2+ linked defects → all render, most recent first, with ID/title/status |
| TC-BK45-08 | Should not show a defect belonging to a different story's ATC, even when sharing a Test/Run | Negative | EP / EC9 | Defect scoped via `bugs.atc_id` to a foreign story's ATC on a shared Test → defect does NOT appear in this story's chain |
| TC-BK45-09 | Should show the correct layer-specific "awaiting data" copy **(parametrized****:**** No test written yet / Awaiting test / No run recorded yet / Awaiting first run / None linked)** | Positive | EP | AC with ATCs bound but missing the next layer (Test/Run/Defect, per layer) → exact copy per layer, no null cells |
| TC-BK45-10 | Should show the "Uncovered · 0 ATCs bound" strip for an AC with no ATCs, in a story with 2+ ACs | Positive | EP / AC-04 | Story has 1+ covered AC and 1+ AC with zero ATCs → uncovered AC shows the strip, no broken row |
| TC-BK45-11 | ***[******residual]*** Should render a mixed story correctly — some ACs with full chains, some with the uncovered strip, in the same page load | Integration | EP (live exercise of untested branch) | Story with 2+ ACs, mixed coverage, seeded live (not unit/DB-only) → both states render side by side, no state bleeds into the other |
| TC-BK45-12 | Should show "No coverage anywhere on this story" when a story has ACs but zero ATCs bound to any of them | Negative | EP / AC-03 | Story's ACs all individually rendered, each showing the uncovered strip → distinct banner, NOT a blank screen, no spinners/placeholders |
| TC-BK45-13 | Should show "No acceptance criteria yet" for a story with zero ACs, distinct from the AC-03 copy | Negative | EP / AC-07 | Story (any lifecycle status, incl. draft) with 0 ACs → authoring-gap copy renders, zero chain rows for any layer |
| TC-BK45-14 | Should redirect an unauthenticated user to login with no chain data rendered first | Negative | Decision Table rule 1 | No session → redirect fires before any chain data paints |
| TC-BK45-15 | Should allow a viewer-role workspace member full access with no additional role gate | Positive | Decision Table rule 2 / AC-05 role gate | Authenticated viewer-role member of the story's workspace → full chain accessible, same as member/admin/owner |
| TC-BK45-16 | ***[******discrepancy]**** Should return an identical non-disclosure response **(parametrized***:**** foreign-workspace story / nonexistent story ID)** | Negative | Decision Table rules 3+4 (collapsed — same outcome) | Authenticated member of a different workspace hitting a real foreign story, AND hitting a random nonexistent story ID → both cases return the SAME status + message ("User story not found"), zero chain data leaked either way. Uniform 404 is the PASS condition — see discrepancy triage above |
| TC-BK45-17 | Should exclude an archived AC and its archived ATC from the chain | Negative | EP / AC-06 | Story has 1 active + 1 archived AC (each with 1 ATC) → only the active AC/ATC render |
| TC-BK45-18 | Should exclude a "ghost" ATC whose ancestor module was archived, even though the ATC's own `archived*at` is null | Negative | Error-Guessing / EC7 regression | ATC under a module whose ancestor was archived via `bunkai*archive*module*subtree` → 3-predicate filter excludes it |
| TC-BK45-19 | Should render an archived Story's chain read-only with an "archived" banner — not a 404 | Negative | State-Transition (Story lifecycle) | Story `archived_at` set → chain still renders (read-only) + banner; distinct from TC-16's uniform-404 case |
| TC-BK45-20 | Should render the chain for a draft-status Story with no additional lifecycle gate | Positive | State-Transition / EC11 | Story lifecycle status = draft → view fully accessible, same as any other status |
| TC-BK45-21 | Should show the error+retry state and recover when the initial server-side fetch fails then succeeds on retry | Negative | State-Transition (error→retry→success) | SSR fetch fails on first load → error+retry UI shown; retry succeeds → chain renders |
| TC-BK45-22 | Should show the error+retry state and recover when the client-side retry fetch fails then succeeds, without a full page reload | Negative | State-Transition (error→retry→success) | Client-side Retry button re-fetch fails once → error persists; next retry succeeds → chain renders via client fetch only (no navigation/reload) |
| TC-BK45-23 | Should render the "select a user story" prompt when no `?story=` param is present **(collapsed****:**** trivially atomic — single boolean presence/absence)** | Positive | EP | Route hit with no `story` query param → prompt state renders, no chain fetch attempted |
| TC-BK45-24 | Should render no filter or export control anywhere on the view | Negative | Error-Guessing / scope guard | Any chain state (happy/zero/error) → no filter or export UI present (BK-48/BK-50 out-of-scope-by-design regression guard) |
| TC-BK45-25 | Should repeat an ATC's chain segment under EACH bound AC when the ATC is bound to 2+ ACs on the same story | Integration | EP / A5+EC3 | ATC bound to 2 ACs on the same story → segment appears once under each AC (no cross-AC dedup) |
| TC-BK45-26 | ***[******charter]*** Time-boxed exploration: load the traceability view while a Jira import job is mid-flight against the same story | Integration | Error-Guessing charter / EC12 | Import job actively upserting ACs during page load → single-statement snapshot renders a consistent AC count, no torn/partial read |

---

### Data feasibility note

`testing.automation*identity` (per `test-session-memory.md`) already covers: full chain (real in-flight run + real defect), no-story-selected, zero-coverage banner, zero-AC empty state, both error+retry paths, and the cross-workspace/nonexistent-story non-disclosure pair. Stage 2 needs to additionally seed/confirm: a minimum chain (TC-02), a 50+ ATC chain (TC-03), same-timestamp run pair (TC-06), multi-defect run (TC-07), a ***live mixed-coverage story**** (TC-11 — the residual), an archived-ancestor-module ATC (TC-18), an archived Story (TC-19), a draft-status Story (TC-20), and an ATC bound to 2+ ACs (TC-25). `DBHUB***` is unset — DB-layer evidence for these leans on the existing 11/11 `story-traceability-isolation.test.ts` suite rather than live DB queries (known gap, not a blocker).

---

**Formalized by QA — Stage 1 Planning, sprint-testing. Traceability****:**** BK-45 ← BK-44 (epic).**

---
_Synced from Jira by sync-jira-issues_
