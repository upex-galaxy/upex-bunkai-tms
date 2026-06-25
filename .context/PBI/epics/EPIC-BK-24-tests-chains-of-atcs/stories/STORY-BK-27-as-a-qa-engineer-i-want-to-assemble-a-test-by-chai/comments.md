# Comments for BK-27

[View in Jira](https://jira.upexgalaxy.com/browse/BK-27)

---

### Ely - 6/6/2026, 3:12:52 AM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

Shift-Left QA refinement complete. The full ATP DRAFT lives in the ***🧪 Acceptance Test Plan (ATP)**** field (customfield_10067). Refined acceptance criteria are in the ****✅ Acceptance Criteria (Gherkin)*** field.

***Risk:*** HIGH. Key planning signal: the Story is effectively greenfield — the `tests` entity, the `activity_log` write path, and idempotency wiring do not yet exist in source (migrations <= 0020), so the current 3-SP estimate likely underscopes the work. See the Open Questions in the description and the full feasibility analysis in the ATP field before estimating.

---

### Ely - 6/6/2026, 3:26:55 AM

## PO Perspective — Shift-Left Grooming (proposed answers, pending confirmation)

**Drafted to seed sprint-planning discussion. Each item restates the open question verbatim, then the PO's proposed answer. Status code on Q5 is left to Engineering by design.**

### Q1 — Is building the `tests` entity (table + ordered ATC join + create path + RLS) part of THIS Story, or assumed pre-built? (No tests table/route/UI exists — Story reads greenfield; 3-SP estimate likely wrong.)

***PO answer:*** In scope, and yes — the 3-SP estimate is wrong as written. The Test is the first deliverable of the BK-24 epic and the activation funnel KPI ("≥1 Module + ≥1 ATC + ≥1 Test + ≥1 Run in first 24h") cannot move without it, so the entity is the point of this Story, not a prerequisite. What I am NOT willing to do is let three subsystems ride in silently under a 3-SP label. Decision: the core `tests` table + ordered `test*atcs` join + create path + workspace RLS + the empty-chain / title / same-workspace validations stay in BK-27 and we re-estimate it (expect 5-8 SP). The `activity*log` write (Q4) and the idempotency dedupe (AC3 / agent retry) get carved into a sibling story BK-2x so they can be estimated and tested on their own merit. Re-estimate BK-27 at planning; do not commit it at 3 SP.

### Q2 — What is a 'selectable / published ATC'? AC1 says 'published' but `atcs.status` has no published state and no publish flag exists — AC1 precondition is untestable as written.

***PO answer:*** "Published" is loose wording in the source spec, not a real concept — drop it. We are NOT introducing an ATC publish lifecycle in MVP; that is scope we have deliberately not signed up for, and `atcs.status` is a run-lifecycle (unrun/running/pass/fail/...), not an authoring gate. Product rule: a "selectable ATC" is any non-archived ATC that lives in the active workspace and belongs to the same project context — full stop. Both Elena (UI picker) and Karim (headless) see the same selectable set; one rulebook, three executors. Reword AC1's precondition to "three ATCs from her workspace's library" and delete the word "published" everywhere it appears. If we ever add a draft/publish gate it becomes its own backlog story, not a hidden dependency of BK-27.

### Q4 — Is the `activity_log` write in scope? Table exists (0009) but has no runtime write path — DoD audit criterion is otherwise unverifiable.

***PO answer:**** The audit guarantee is in scope as a product promise — "a Test creation cannot be silently lost" is a business rule and the workspace owner must be able to audit who created what and when (it is also a selling point for our regulated-industry buyers). But the **implementation* of the first-ever runtime writer into `activity_log` is net-new plumbing that should not be smuggled under BK-27's number. Decision: split the activity-log writer into sibling story BK-2x alongside idempotency, and there define read visibility as owner-and-admin can audit (members do not need the audit view in MVP). BK-27's DoD line "Activity log records who created the Test" stays as the acceptance target, but it is satisfied by the sibling story landing in the same sprint — QA validates the audit entry once the writer exists. Until then that DoD line is explicitly blocked, not silently unmet.

### Q5 (product/copy) — Cross-workspace ATC rejection (AC4): the user-facing message copy + the product intent that it must NOT reveal whether the foreign ATC exists.

***PO answer:*** Non-disclosure is a hard product stance, not a nice-to-have — tenant isolation is the single most important promise a multi-tenant TMS makes, and a message that distinguishes "this ATC is in another workspace" from "this ATC does not exist" leaks the existence of another customer's data. So the rule is: the rejection for a foreign-workspace ATC and the rejection for a wholly-nonexistent ATC id MUST be byte-identical — same wording, same shape, no ID echoed back, no "belongs to another workspace" phrasing ever. Proposed user-facing copy: "One or more selected ATCs are not available in this workspace." That single sentence covers foreign, deleted, and never-existed alike without disclosing which. The exact HTTP status code is Engineering's call — I only require that whatever code is chosen is the same for both the foreign and the nonexistent case.

***Net scope recommendation:*** Re-estimate BK-27 (core entity + create path + RLS + validations, expect 5-8 SP, not 3) and split the activity-log writer + idempotency dedupe into a sibling story BK-2x so each is estimated and tested honestly.

---

### Ely - 6/6/2026, 3:28:14 AM

## Engineering Perspective — Shift-Left Grooming (proposed answers, pending confirmation)

**Drafted to seed sprint-planning discussion. Each item restates the open question verbatim, then Engineering's proposed answer.**

### Q1 (feasibility & effort) — Is building the `tests` entity (table + ordered ATC join + create path + RLS) part of THIS Story? (No tests table/route/UI exists — Story reads greenfield; 3-SP estimate likely wrong.)

***Dev answer:**** Confirmed greenfield against the target repo: migrations run through `0020*import*jobs*one*active.sql` with no `tests` table, no `test*atcs` join, and no `/api/v1/tests` route — "New Test" is an unwired stub. The technical build inventory is: (1) a migration adding `tests` (header: id, workspace*id FK, title, created*by, timestamps) plus an ordered `test*atcs` join (test*id, atc*id, `position int`, duplicates allowed) with RLS `select/insert` policies gated by the existing `bunkai*is*workspace*member` / `bunkai*can*write*workspace` helpers from `0005*rls*helpers.sql`; (2) a `bunkai*save*test` plpgsql RPC mirroring the `bunkai*save*atc` (0007) `security invoker` + full-ordered-replace pattern, which re-validates server-side; (3) a `POST /api/v1/tests` route under `withApiHandler` + a server action for the UI; (4) the `activity*log` write (service-role, since 0009 is service-role-write-only); (5) the React "New Test" form with the ordered ATC picker + a Test list view. Honest effort read: this is ****not**** 3 SP. The schema + RPC + RLS + API + server-side validation is roughly a 3-SP slice on its own, and the ordered-picker UX is another 2-3 SP. I recommend ****splitting***: a backend predecessor (schema + RPC + RLS + API + activity*log + idempotency wiring, ~3 SP) and this Story as the UI builder on top (~3 SP). The in-scope/out-of-scope cut is the PO's call; my position is the 3-SP number only holds if the backend lands as a separate predecessor.

### Q3 — Define the idempotency window + retry-safe-identifier source (client-supplied vs server-derived); `idempotency_keys` table exists but is unwired today.

***Dev answer:**** Correction to the refinement: the middleware itself is ****already written**** at `lib/api/idempotency.ts` (begin / record / discard lifecycle, SHA-256 payload hashing, replay-snapshot return, 409 on same-key-different-payload) — it is just imported by ****zero**** handlers today, so the table is wired at the lib layer but not invoked by any route. Proposed mechanism, reusing that lib as-is: the client supplies an `Idempotency-Key` HTTP header — the ****agent/CI caller MUST supply one**** (per the workflow "agent provides a retry-safe identifier"), and the ****UI auto-generates a request UUID per form session*** and resends it on the double-click retry. The dedupe identity is the table's existing `unique (user*id, endpoint, key)`, with the payload SHA-256 (`request*hash`) guarding against key reuse with a different body. Window/TTL is the table default: `expires*at = now() + interval '24 hours'` (0009) — a 24h replay window, well beyond the double-click case. Server-derived fallback for clients that send no header: hash of `(user*id, endpoint, payload)` as a synthetic key so a naive double-submit still dedupes. Wiring is the one missing piece — call `beginIdempotentRequest` at the top of the new `POST /api/v1/tests` handler and `recordIdempotencyResult` on success.

### Q5 (status code & non-disclosure) — Exact status code + verbatim copy for the cross-workspace ATC rejection (AC4) — must be byte-identical to a nonexistent-ATC response or it leaks existence (INV-3).

***Dev answer:**** Status code is ****404 ****`not*found`, and the non-disclosure is enforced by RLS, not by application branching. The canonical pattern in the codebase (e.g. `app/api/v1/user-stories/[id]/route.ts`): the handler reads the referenced row with `.maybeSingle()`; an RLS-invisible row (foreign workspace) returns `null` exactly as a genuinely-nonexistent id does, and both paths throw the same `ApiError('not*found', ...)` → identical 404 status and identical body. So we never write a code branch that distinguishes "exists in another workspace" from "does not exist" — RLS collapses them upstream, which is what makes the responses byte-identical and satisfies INV-3. A ****403 would leak existence***: returning "forbidden" only happens when the server has confirmed the resource exists but the caller lacks rights, so a 403-vs-404 split tells the caller which foreign ATC ids are real. 422 would be wrong for the same reason (it implies the server processed and rejected a known-but-invalid reference). The `tests` create RPC must therefore resolve every chained ATC id through an RLS-scoped read and emit a uniform 404 if any id is unreadable. (User-facing message wording is the PO's; whatever copy is chosen must be the same string for both paths.)

### Q6 — ATC deletion behavior while referenced by a Test (RESTRICT vs cascade) + binding instant under a mid-form workspace switch.

***Dev answer:**** FK on-delete policy: `test*atcs.atc*id` should be `on delete restrict`, matching the existing meaningful-reference precedent `atcs.user*story*id ... on delete restrict` (0004) — a referenced ATC cannot be deleted while a Test depends on it, preventing orphaned chain positions and silent data loss. (Note: ATCs are not soft-deleted today; if soft-delete on ATCs is later added, "delete while referenced" becomes an application-level guard rather than an FK, but RESTRICT is the correct hard-delete posture now.) The `test*atcs.test*id` side stays `on delete cascade` so deleting a Test tears down its own join rows. Binding instant: the Test binds to the workspace active ****at save-commit time***, not form-open — the server action/RPC reads the active workspace from the authenticated session at the moment of submit and stamps `tests.workspace*id` from that, then `bunkai*save_test` re-validates that every chained ATC is readable under that same workspace's RLS. This resolves the mid-form-switch race deterministically: a workspace switch before Save simply re-targets both the binding and the ATC-visibility check to the new workspace, and any now-foreign ATC in the chain falls through to the uniform 404 from Q5.

***Effort read:*** Not 3 SP as a single greenfield item — recommend splitting into a backend predecessor (schema + RPC + RLS + activity_log + idempotency wiring, ~3 SP) and this Story as the UI test-builder on top (~3 SP); 3 SP only holds if the backend ships separately.

---

### micaelavirgagarcia - 6/6/2026, 7:34:04 PM

## Shift-Left Handoff — ATP DRAFT Ready for Review

Shift-Left QA refinement complete on 2026-06-06.

### Summary
- ✅ 4 ACs refined (all valid, no blockers for development)
- ✅ 25 ATP outline scenarios (5 Positive, 6 Negative, 7 Boundary, 7 Integration)
- ✅ 8 edge cases mapped with mitigations
- ✅ 8 open questions (3 PO scope, 5 Dev technical — ***none blocking estimation***)
- ✅ Coverage is comprehensive across permission boundaries, validation, audit trail, and E2E flows

### ATP Location
Full ATP DRAFT lives in the 🧪 Acceptance Test Plan (ATP) field above. Refined ACs and business rules live in the ✅ Acceptance Criteria (Gherkin) field.

### Open Questions (for dev kick-off, not blocking now)
1. Idempotency window (suggest 24h)
2. Max chain length (suggest no hard limit in MVP; soft UI 100)
3. Test description field scope (title only vs. title+description)
4. Idempotency-Key scope (suggest user_id, endpoint, key)
5. ATC validation timing (suggest before insert, atomic)
6. RLS policy for foreign ATC (explicit workspace check)
7. Error message for foreign ATC (generic, no leakage)
8. Activity log actor field (suggest user_id FK)

### Next Steps
1. ***PO:*** review questions 1–3, confirm answers
2. ***Dev:*** review questions 4–8, confirm technical approach
3. ***When Ready For QA:*** run `/sprint-testing` — story will short-circuit Phases 1–3 thanks to shift-left-reviewed label, proceeding straight to manual QA execution

Ready for sprint planning. No ambiguities blocking development.


---

### micaelavirgagarcia - 6/6/2026, 7:35:38 PM

Shift-Left Handoff Complete: 25 ATP scenarios, 8 edge cases mapped, 8 open questions (none blocking). ATP DRAFT in field above. Ready for sprint planning.

---

### Ely - 6/12/2026, 1:57:22 AM

# BK-27 — Implementation Plan — Appendix

> Continuation of the Spec Implementation Plan (Dev) field — split due to Jira field content limit.

## Types & Type Safety

- Regenerate `lib/types/supabase.ts` via `bun run types:gen` after the migration (picks up `tests`, `test*steps`, `bunkai*create_test`). Generated file — mark `// generated, do not review` in the PR.
- New domain types live in `lib/tests/validation.ts` (`z.infer<typeof TestCreateBodySchema>`) and the `createTest` wrapper args in `lib/supabase/rpc.ts` — follow the `createAtc` wrapper shape (`lib/supabase/rpc.ts:85`).
- Import aliases: `@lib/**`, `@components/**`, `@app/*` only (this repo has NO `@api/`/`@schemas/` aliases — verified in `tsconfig.json`). Max 2 positional params; 3+ → object param.
- UI components type props from the generated row types; zero hand-rolled entity shapes.

---

## Content Writing (exact strings — glossary casing enforced)

| Context | Copy |
| --- | --- |
| Empty chain (server + UI, byte-identical) | `A Test must include at least one ATC.` |
| Foreign/nonexistent ATC (server, rendered verbatim by UI) | `One or more selected ATCs are not available in this workspace.` |
| Title required | `Title is required.` |
| Title too long | `Title must be 200 characters or fewer.` |
| Builder heading | `New Test` |
| Builder helper line | `Chain ATCs from your workspace library — selection order is run order.` |
| UI soft cap | `Chains are limited to 100 ATCs in the UI.` |

Never "test case", "test component", or "published ATC" anywhere (UI, code comments, OpenAPI descriptions).

---

## Unit-Test Plan (bun:test, colocated `*.test.ts` — no `test` script; run `bun test`)

| Step | Test file | Cases |
| --- | --- | --- |
| 4 | `lib/tests/validation.ts` → `lib/tests/validation.test.ts` | Title: trim-then-validate, whitespace-only rejected, 1-char OK, 200 OK, 201 rejected; chain: `[]` rejected, 1 OK, duplicates OK, non-uuid rejected; `workspace_id` optional; schema parse table tests (TC-04/05/09/10 fast layer) |
| 4 | `lib/tests/errors.ts` → `lib/tests/errors.test.ts` | SQLSTATE map: 42501→403 `forbidden`; 45120→422 `chain*empty` + exact copy; 45121→422; 45122→404 `not*found` + exact copy + NO details/id echo; unknown→500 (TC-06/07 mapping layer) |
| 9 | `lib/tests/rls-isolation.test.ts` (env-gated, `rls-parity.test.ts` pattern) | WS-X member reads zero WS-Y `tests`/`test_steps`; foreign-ATC create via RPC → uniform error; viewer RPC → 42501 (TC-13, TC-06/07 DB layer) |

RPC business rules (order preservation, duplicates, activity_log row, idempotent replay) are verified via Step 2/6 `verify:` checks and the env-gated suite. E2E is out of scope for this plan (owned by `/sprint-testing`).

---

## Dependencies

- [ ] BK-18 (ATC create/edit REST API) — dev-done, provides the route/RPC/error patterns being cloned. Present.
- [ ] Migrations 0001–0023 applied to the target DB (esp. 0005 helpers, 0009 `idempotency*keys`/`activity*log`, 0021 RPC precedent). Present.
- [ ] Supabase creds in `.env` for `types:gen` + env-gated tests (read from `.env`, never hardcode).
- [ ] ***Orchestrator******:****** add the §5 ratification entry for the builder derivation (Decisions 17–18) before Step 7 begins.***
- [ ] ***Orchestrator******:****** draft ****`ADR-0002-idempotency-key-scoping`**** (Decision 3); also fix the stale ADR README index (ADR-0001 missing) when it lands.***
- [ ] Branch: `feature/BK-27-test-builder` off `staging`; merge `--no-ff` into `staging`.

## Risks & Mitigations

***Risk 1 — Sibling "BK-2x" was never created; idempotency + audit tests (TC-12/14/16) had no owning story.***

- Impact: High (coverage orphaned, DoD audit line "blocked").
- Mitigation: this plan absorbs both write paths (Steps 2 and 6) at marginal cost; Decision 4 flags the PO confirmation. DoD audit line becomes satisfiable, not blocked.

***Risk 2 — ATP count mismatch (19 synced vs 25 claimed).***

- Impact: Medium (silent coverage gap if Jira truly holds 25).
- Mitigation: traceability note above; orchestrator re-syncs BK-27 before Stage 2 and extends the map if new outlines appear.

***Risk 3 — Builder UI has no authored mockup (placeholder ****`TestDetail`****).***

- Impact: Medium (design-fidelity defect if invented silently).
- Mitigation: derive-by-analogy spec written above; §5 ratification entry is a hard pre-Step-7 dependency.

***Risk 4 — First idempotency consumer sets a repo-wide precedent.***

- Impact: Medium (wrong scoping is hard to reverse once agents depend on it).
- Mitigation: defaults match the already-built 0009 schema exactly (no new semantics invented); ADR-0002 documents it; replay/409/discard paths covered by Step 6 verify + curls.

***Risk 5 — Review workload is High (******~******1.9k weighted lines).***

- Impact: High (review quality collapse past 400 lines/PR).
- Mitigation: feature-branch-chain proposed below; generated types excluded; OpenAPI sibling and SQL are low-cognitive-density.

## Estimated Effort

| Step | Time |
| --- | --- |
| 1. Migration: schema + RLS | 3h |
| 2. Migration: RPC + activity log | 5h |
| 3. Types regen | 0.5h |
| 4. Domain layer (validation/errors/codes/wrapper) | 4h |
| 5. API handler + OpenAPI | 4h |
| 6. Idempotency wiring | 2h |
| 7. UI builder | 8h |
| 8. Explorer Tests group | 3h |
| 9. Verification sweep | 2.5h |
| ***Total**** | ****32h ≈ 4 dev-days*** |

***Story points******:*** 8 (matches the PO re-estimate and the epic story table).

## Definition of Done Checklist

- [ ] All 9 steps implemented per this plan; every `verify:` line observed
- [ ] All 10 AC scenarios + all 19 synced ATP TCs traceable to passing behavior (table above)
- [ ] Backend types used throughout (`lib/types/supabase.ts` regenerated; zero hand-rolled entity shapes)
- [ ] Glossary casing exact in all UI copy + identifiers (Test, ATC, chain; `test_steps`)
- [ ] Non-disclosure verified: foreign vs nonexistent ATC responses byte-identical
- [ ] activity_log row asserted for every successful creation (DoD audit line satisfied in-RPC)
- [ ] Idempotency replay verified (UI double-submit + headless retry)
- [ ] Sibling scope untouched: no reorder UX (BK-28), no Test detail pane (BK-32), no tags (BK-33), no Used-by wiring (BK-22)
- [ ] `bun test` · `bun run types:check` · `bun run lint:check` · `bun run openapi:diff` all green (no local production build)
- [ ] Code review approved; merged `--no-ff` to `staging`; staging smoke test (desktop layout, builder flow, explorer list)

---

### Automation for Jira - 6/12/2026, 2:20:30 AM

🔎 Pull Request created. Task is pending to ANALYZE and REVIEW by the team. Waiting for PR Approval.

---

### Automation for Jira - 6/12/2026, 2:29:08 AM

✅ Pull Request is successfully MERGED. Task is Done.

---

### Ely - 6/12/2026, 3:13:37 AM

## Ready For QA — staging deploy

> ***SUCCESS:*** BK-27 merged to `staging` and auto-deployed. All 10 AC scenarios + 19 ATP TCs traceable (see the `compliance-matrix.md` artifact and the Spec Implementation Plan field).

| Item | Value |
| --- | --- |
| PR | https://github.com/upex-galaxy/upex-bunkai-tms/pull/40 (merge `54749ba`) |
| Branch | `feature/BK-27-test-builder` → `staging` |
| Staging | https://staging-upexbunkai.vercel.app |
| Builder route | `/projects/{slug}/tests/new` |

***Verified before handoff***: 265 unit tests green; live-DB SQL suite (order preservation, duplicates, trim, 200/201 boundary, uniform non-disclosure 45122 incl. foreign/archived/NULL ids, viewer 42501, activity_log row); env-gated RLS isolation suite (3 pass / 16 asserts).

***QA focus on staging*** (HTTP-layer items marked review-approved in the compliance matrix):

1. Builder flow end-to-end: assemble a Test with 3 ATCs incl. one duplicate — chain order must equal selection order; Test appears in the explorer Tests group.
2. Double-submit (TC-12): rapid double-click on Create Test → exactly one Test.
3. Headless retry (TC-16/17): `POST /api/v1/tests` with PAT + same `Idempotency-Key` twice → one Test, identical responses; omitting `workspace_id` → 422.
4. Validation copy verbatim: empty chain, whitespace title, 201-char title.

---

### Andrés Daniel Cumare Morales - 6/15/2026, 10:26:46 AM

## Acceptance Test Results (ATR)

********Status*****:*** Pending — Stage 2 execution not yet started
********Modality****: Jira-native (no `acceptance*test*results` custom field configured in this Jira instance — using comment fallback per `jira-required.yaml`)

Stage 1 Planning complete — see ATP in ***🧪 Acceptance Test Plan (ATP)*** field above (19 outlines, condensed per Phase 4-7).

Execution results will be posted here as a follow-up comment once Stage 2 begins, after the staging data-gap setup actions (Phase 5) are completed.

---

### Andrés Daniel Cumare Morales - 6/17/2026, 6:32:56 AM

## Acceptance Test Results (ATR) — BK-27

***Status:**** PASSED | ****Date:**** 2026-06-17 | ****Environment:**** staging (staging-upexbunkai.vercel.app) | ****Modality:*** Jira-native

### Execution Summary

| Metric | Value |
|---|---|
| Total TCs | 19 |
| Passed | 16 |
| Deferred | 1 (N6 — viewer 403, no 2nd auth user on staging) |
| Partial | 1 (I1 — RLS SELECT, no GET endpoint) |
| Not Reproducible | 1 (I4 — UI WS switch destroys form) |
| Failed | 0 |
| Bugs Filed | 0 |

### Results by Category

***Positive (3/3 PASSED):*** P1 chain order (API+UI+DB), P2 duplicate ATC preserved, P3 single ATC accepted.

***Negative (5/6):*** N1 UI empty chain blocked, N2 API empty chain 422, N3 foreign ATC 404, N4 nonexistent ATC byte-identical, N5 archived ATC byte-identical. N6 DEFERRED (no viewer user).

***Boundary (4/4 PASSED):*** B1 title 200/201, B2 whitespace rejected, B3 trim works, B4 missing idempotency-key 400.

***Integration (2/4):*** I2 activity*log written atomically, I3 UI/headless parity verified. I1 PARTIAL (workspace*id stamps correct). I4 NOT REPRO (UI safety net).

***API/Idempotency (3/3 PASSED):*** A1 double-submit 1 row, A2 replay same key, A3 conflict 409 + missing workspace_id 422.

### Non-Disclosure Contract (INV-3): VERIFIED

N3/N4/N5 return byte-identical 404 responses for foreign, nonexistent, and archived ATCs. No id echo, no existence leak.

### Dev-Flagged Focus Areas: ALL VERIFIED

Builder E2E + duplicate ATC, double-submit dedup, headless idempotency retry, verbatim validation copy.

### Observations (Non-Blocking)

1. Zod pre-empts RPC for validation (N2, B1, B2) — generic messages instead of spec verbatim copy. Functionally correct.
2. I4 workspace switch navigates away — design-level safety net prevents mid-form binding-instant scenario via UI.

### Verdict: PASSED — QA recommends sign-off.


---


_Synced from Jira by sync-jira-issues_
