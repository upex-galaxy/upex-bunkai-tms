# ADR-0012 — RPC authorization invariant: actor bind and result scoping on every DEFINER function

- **Status:** Proposed <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-08-01
- **Deciders:** Ely (PO/approver), avalanche-2026-07 orchestrator (proposer)
- **Tags:** authorization, database, security, cross-cutting-invariant
- **Supersedes:** — (extends the Path A / Path B split ratified in ADR-0001)
- **Superseded by:** —

---

## Context

The mechanism is deliberately **not** restated here. `.agents/skills/sprint-development/references/rpc-authorization.md` owns why `SECURITY DEFINER` bypasses RLS, the canonical guard shape, the six-question authoring checklist, and the test contract that proves both properties. This ADR records the decision to treat that reference as a binding project invariant, plus the two things that are specific to **this** codebase and belong nowhere else.

**RLS does not apply inside a DEFINER function here.** Verified 2026-08-01: `FORCE ROW LEVEL SECURITY` appears nowhere in `supabase/migrations/` — zero hits against both `origin/staging` and the working tree. Table owners therefore bypass their own policies, and a `WHERE` clause inside a DEFINER function selects rows without deciding whether the caller was allowed to ask.

**ADR-0001 made the DEFINER RPC the exception, and the exceptions were never audited.** Path B (impersonation) was chosen over Path A (per-route DEFINER RPCs) precisely so RLS stays the single source of authorization truth, with Path A kept valid "where transactional integrity already demands an RPC." Those Path A survivors accumulated, each one carrying an explicit actor parameter, without the guard that makes an explicit actor parameter safe.

### The audit (measured on `origin/staging`, 2026-08-01)

| Level | Count |
| ----- | ----- |
| Migration files declaring a function that takes `p_actor_user_id` | 18 |
| …carrying an actor bind (`auth.uid() <> p_actor_user_id` → raise) | 2 — `0039_run_history_actor_guard.sql`, `0041_run_project_report.sql` |
| …with no bind at all | 16, including `0042_run_step_mark.sql`, merged 2026-07-31 |

Resolving last-writer-wins to the **live** function set gives the number remediation actually has to scope: **24 live functions take `p_actor_user_id`; 2 carry the bind; 22 do not.** (The file count is lower because `0039` replaces `0038`'s `bunkai_list_test_runs`, and several files declare more than one such function.) All 22 are granted `execute` to `authenticated`, so each is directly callable via PostgREST by any signed-in user — the guard is not being supplied by an upstream caller that a client is forced to go through.

`0039` is the tell. It exists for no purpose other than retrofitting the bind onto `bunkai_list_test_runs` after this exact vulnerability was found in BK-37. The pattern was established, ratified, and then applied to nothing built afterwards except `0041`.

**Blast radius, stated without inflating it.** None of the 22 lets a caller cross a workspace boundary — each still asserts the *parameter's* membership, so an outsider reaches nothing. The exposure is a co-member with write access attributing a write to another co-member's identity. That is an identity-integrity defect, and it is not in the same severity class as the BK-49 disclosure below.

### Why this is a class, not three mistakes

Three independent occurrences on 2026-07-31, in three tickets, by three workers, each following the process correctly. Full traces in `.session/sprint-development-queue/avalanche-2026-07/escalation-log.md`:

| Ticket | Where | Caught |
| ------ | ----- | ------ |
| BK-49 | the RPC proposed in the Stage 1 plan — filtered on a caller-supplied `p_workspace_id`, no membership assert | pre-code, by an adversarial review of the proposal |
| BK-49 | `bunkai_resolve_activity_actors` (`0045`) — asserted the caller's membership, never scoped the returned `auth.users` rows to it | **live on the shared project**; any signed-in user could resolve any other user's email. Fixed in `0047` |
| BK-40 | `bunkai_create_bug` (`0046`) — no actor bind, while its sibling three lines below in the same file had one | in review, pre-merge |

The middle case is why this needs a checklist rather than care: the membership assert was present and correct, and the resource disclosed was a different one. ADR-0011 had already ratified the correct provenance guarantee for that function; the shipped SQL simply never enforced what the ADR claimed.

---

## Decision

We will treat actor bind and result scoping as a **cross-cutting invariant on every `SECURITY DEFINER` function that accepts a caller-supplied identity or scope parameter**, enforced at fixed points in the dev loop rather than by reviewer vigilance. The invariant:

> A DEFINER function taking a caller-supplied identity or scope parameter is not authorized until **(a)** the parameter is bound to `auth.uid()` at step 0, before any table read, and **(b)** every row that leaves the function is separately constrained to the boundary that was asserted. Satisfying (a) does not satisfy (b), and asserting the caller's own membership satisfies neither.

The guard shape, the six authoring questions, the failure-path error contract, and the DB-integration test requirement are **binding by reference** to `.agents/skills/sprint-development/references/rpc-authorization.md`. They live in exactly one place on purpose: duplicated doctrine that later diverges is worse than none.

The reference's first question stands as the preferred outcome — **prefer `SECURITY INVOKER`, or delete the identity parameter, over guarding it.** A function that cannot be told who the caller is cannot be lied to. `bunkai_list_activity` (`0045`) is the worked example: redesigned to INVOKER with no actor parameter at all, removing the class instead of defending against it.

Enforcement points: Stage 1 answers the six questions in Technical Decisions before any SQL is written; Stage 2 ships the DB-integration test in the same slice as the migration; Stage 3 checks the bind and the result scoping as two separate review items. The Stage 1 trigger is **mechanical** — any story forecast to add or modify anything under `supabase/migrations/` reads this ADR — so a story does not have to be recognized as security work to get the check. BK-40 was titled "file a defect from a failing run step" and nobody would have classified it as auth work.

---

## Consequences

- **Positive:** the recurring defect is closed at the planning layer rather than caught by an adversarial Stage 3 pass that has to fire perfectly every time (it did not — one instance shipped live). The mechanical trigger removes the judgment call that was failing, which was *deciding whether a story is security-relevant before reading anything*. New DEFINER functions arrive with a test that exercises the real database, so the `42804` class of failure — an RPC that raised on every real invocation while the suite mocked `db.rpc` green — cannot hide again.

- **Negative / trade-offs:** every migration-touching story now pays a fixed planning cost, including the many that turn out to need `SECURITY INVOKER` and no guard at all. Some of that cost is spent proving a negative. The DB-integration test requirement is heavier than a route test and needs live credentials, which makes the gate unavailable to any session that cannot reach the database.

- **Neutral / follow-ups:**
  - **The 22 unbound live functions are known debt: tracked, and deliberately NOT to be fixed inline.** A story that happens to touch one of them for unrelated reasons does not retrofit the guard — that is an untested security change smuggled into a diff that was never planned or reviewed for it. Remediation is its own audit covering all 22 under one test pass (the background task `task_f36dfa41` already scopes the same set).
  - **New functions must not add to the count.** The invariant is forward-binding from acceptance; the 22 are a closed set that only shrinks.
  - Open, and independent of the bind: whether the internal assert helpers (`bunkai_assert_actor_can_read_workspace`, `…can_write_workspace`, `…can_write_project`) should have their `authenticated` grant narrowed to `service_role`, which would shrink the directly-callable surface without touching a single function body.

---

## Alternatives considered

- **Retrofit the 22 as part of accepting this ADR** — rejected as a bundling error, not as unnecessary work. Twenty-two guards plus their tests is a dedicated remediation ticket with its own regression budget; folding it into an architectural decision means it lands unreviewed or the ADR stalls behind it. Recording the debt precisely and refusing to grow it is the part that has to happen now.
- **Enable `FORCE ROW LEVEL SECURITY` on the tables instead** — rejected. It would silently change the result set of ~24 functions at once with nothing proving equivalence, and it breaks the DEFINER functions that legitimately need to read across a boundary (`auth.users` is the real case). More fundamentally it does not address the actor bind at all: RLS keys on `auth.uid()`, and the defect is that a *parameter* claiming to be someone else is never compared to it.
- **Rely on the Stage 3 adversarial review that caught two of the three** — rejected. It also missed one, which reached the shared project and stayed there across a merge. A control that must fire perfectly on every ticket, in a codebase where the unguarded shape is the statistical default, is not a control.
- **Document it in `AGENTS.md` and the skill's Compact Rules only, with no ADR** — rejected on ADR-0001's own reasoning: a defense whose only enforcement is that the developer remembers has already failed. The Compact Rule stays as the always-loaded reminder; this ADR is what a planner is mechanically routed to read, and what records the debt a rule cannot carry.

---

## References

- `.agents/skills/sprint-development/references/rpc-authorization.md` — the mechanism, guard shape, authoring checklist, and test contract (binding by reference)
- ADR-0001 — Unified API Authentication (the Path A / Path B split this extends)
- ADR-0011 — Activity-feed actor resolution (the decision BK-49's shipped SQL failed to enforce)
- `.session/sprint-development-queue/avalanche-2026-07/escalation-log.md` — full traces of the three 2026-07-31 incidents
- `supabase/migrations/0039_run_history_actor_guard.sql` (BK-37 retrofit, canonical shape) · `0041_run_project_report.sql` · `0045_activity_stream.sql` · `0047_activity_actor_resolve_scope.sql`
- Reference isolation tests: `lib/runs/report-isolation.test.ts`, `lib/activity/list-activity-isolation.test.ts`
