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


_Synced from Jira by sync-jira-issues_
