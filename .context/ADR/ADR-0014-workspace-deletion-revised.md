# ADR-0014 — Workspace deletion, revised: soft-delete with grace, immediate access revocation, no member veto

- **Status:** Accepted — Not yet implemented <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-08-27
- **Deciders:** AI Product Owner + AI Tech Lead (joint, per `CLAUDE.md` Critical Rule #18 and `.agents/project.yaml` → `decision_authority.product: decide`). **No human reviewed this decision.** It was produced by a four-lens scored panel run by the unattended `story` delivery routine and must not be read as human product-owner or architect sign-off.
- **Tags:** tenancy, data-lifecycle, irreversible-action, gdpr, cross-cutting-invariant
- **Story:** BK-512 (Delete a workspace I own); pairs with BK-508 (workspace data export)
- **Supersedes:** ADR-0013
- **Superseded by:** —

---

## Context

ADR-0013 was Accepted on 2026-08-20 and has never been implemented. BK-512's own acceptance criteria, ratified by a scored ticket ruling on 2026-08-18 and reaffirmed 2026-08-23, specify the **opposite** policy on both of the questions ADR-0013 decides. That contradiction has blocked BK-512's mockup for four days across two delivery runs: the design plan's §8 row asks the mockup to draw a 30-day grace state with a restore affordance, while the ticket's AC-07 and AC-08 forbid any recoverable state from existing.

This ADR resolves it. **Two facts changed after both artifacts were written, and each one kills the load-bearing argument of one side.**

### Fact 1 — the scheduler now exists, which retires the hard-delete argument

The 2026-08-18 ticket ruling chose hard delete on the explicit ground that *"the purge cannot be built"* — that the product had no scheduled background-job mechanism. ADR-0013 made the mirror claim, calling the purge job *"new infrastructure. Nothing in this project currently deletes anything on a timer."*

Both statements are now false, as of BK-269 (merge `bd3922d`, PR #206, on `origin/staging` 2026-08-24):

| Fact | Evidence |
|---|---|
| `pg_cron` is installed | `supabase/migrations/0075_run_inactivity_sweep.sql:86` — `create extension if not exists pg_cron;` |
| A job is scheduled and running today | `supabase/migrations/0075_run_inactivity_sweep.sql:339` — `select cron.schedule('bunkai-sweep-abandoned-runs', '*/15 * * * *', …)` |

`0075` also settles the *shape* argument a purge job would otherwise re-litigate: it rejected Edge Function / service-role HTTP / `CRON_SECRET` designs because neither `pg_net` nor `http` is installed and a service-role HTTP sweep would be a third principal class amending ADR-0001. A purge job now has a shipped, reviewed, in-repo template. **This project's own framing rule applies: a binding ruling premised on a FACT stops binding when the fact changes.** The hard-delete ruling was premised on the absence of a scheduler.

### Fact 2 — ADR-0013's central gate is unsatisfiable, which retires ADR-0013 as written

ADR-0013 clause 4 refuses deletion while any other active member remains: *"The workspace must be emptied first, by those members leaving or being removed."* **The "or being removed" half does not exist in this product.**

| Fact | Evidence |
|---|---|
| Only self-removal is implemented | `app/api/v1/workspaces/[id]/membership/route.ts` — Leave only (BK-90) |
| No `remove_member` RPC exists | absent from `supabase/migrations/` |
| The CRUD matrix records the gap | `.context/business/business-feature-map.md:244` — `workspace_member` Delete ❌ |
| The story that would add it is unstarted | BK-572 "Remove a teammate" — `Backlog`, no estimate |

So ADR-0013 as written makes **any workspace with a second member permanently undeletable**: the owner's only path is to ask each member individually to leave, and one person who has left the company, ignores the request, or refuses out of spite blocks deletion forever. That defeats the GDPR erasure commitment in `.context/SRS/non-functional-specs.md:101` that ADR-0013 cites as its own motivation.

ADR-0013's other gate is a no-op: `v_other_active_owners` cannot fire, because a workspace can only ever have one Owner. The members-remain clause was carrying the entire ADR, and it is the clause that does not work.

### Fact 3 — one acceptance criterion is internally impossible, under either policy

BK-512's **AC-17** requires the deletion be recorded in that workspace's Activity Stream. `activity_log.workspace_id` is `references public.workspaces(id) on delete cascade` (`supabase/migrations/0009_cross_cutting.sql:81`), so under a hard delete the audit row is destroyed by the same statement that writes it. Shift-left scenario N4 flagged this and it was never answered. An event inside its own tombstone is not a record.

---

## Decision

**Soft-delete with a 30-day grace period, with access revoked immediately for everyone, no member veto, and an audit tombstone that survives the purge.**

Concretely:

1. `workspaces` gains `deleted_at timestamptz null` and `deletion_requested_by uuid null references auth.users(id) on delete restrict`. No row is physically removed at request time.
2. A `bunkai_request_workspace_deletion(p_workspace_id uuid)` DEFINER RPC, modelled on `bunkai_leave_workspace`, stamps `deleted_at`. It takes **no actor parameter** — `auth.uid()` is read inline. This is ADR-0012's *preferred* outcome ("prefer deleting the identity parameter over guarding it"), not a guarded exemption.
3. **The caller must be the workspace `owner`.** The `v_other_active_owners` assertion from `bunkai_leave_workspace` is retained as a cheap invariant check, while noting it is currently a no-op.
4. **Deletion is never blocked by the presence of other members.** ADR-0013 clause 4 is repealed. It is replaced by a **counted disclosure** in the confirmation — "this removes access for N other people" — which is exactly the message shape `bunkai_delete_environment` already uses for `environment_in_use` (`supabase/migrations/0032_project_environments_crud.sql:248`).
5. **Access ends at `deleted_at`, not at purge, for everyone including the owner.** PATs and pending invites for the workspace die at the same instant. This preserves the observable behavior of AC-08/AC-09/AC-10/AC-11 exactly as written, at zero extra cost, because the read filter does the eviction.
6. The read filter is applied **structurally, not per-query**: `deleted_at is null` is added to the `workspaces_select_active_member` RLS policy (`supabase/migrations/0001_tenancy.sql:68-76`) and to the four helpers in `supabase/migrations/0005_rls_helpers.sql`. That is 5 objects, and it covers all 43 `from('workspaces')` call sites because ADR-0001 Path B routes every cookie-session read through them.
7. **Physical purge after 30 days**, by a `bunkai_purge_deleted_workspaces()` DEFINER granted only to `service_role` and scheduled with `cron.schedule` on the `0075` template. The existing cascade edges do the physical delete.
8. **A `workspace_deletions` tombstone table, outside the cascade** — workspace id, name, actor, `requested_at`, `purged_at`, and a per-table row-count digest. This is the only structure that survives the purge, and it is what makes **AC-17 satisfiable**. AC-17 is amended from "recorded in that workspace's Activity Stream" to "recorded in the deletion audit record".
9. **At confirm time, email the owner and every active member** a receipt naming the workspace, the actor and the restore deadline. The email is what makes restore discoverable; a Settings tab that a panicking user has never visited is not a recovery path.
10. Restore during the grace period is `deleted_at = null` — no data movement.

**BK-512's acceptance criteria are amended by this ADR** on three points: AC-03's "immediately and cannot be undone" becomes "immediately, and is permanently erased after 30 days"; AC-07's confirm-time cascade moves to purge time; AC-17 records to the tombstone. AC-04 (typed-name gate), AC-06 (export first), AC-08 through AC-16 stand unchanged.

---

## Alternatives considered and scored

Four independent lenses scored three candidates out of 25 each. Lenses were run in parallel and forbidden from balancing each other; no lens saw another's reasoning.

| Candidate | Data-protection | Implementation cost | User harm | Codebase precedent | **Total /100** |
|---|---|---|---|---|---|
| **A** — immediate irreversible hard delete (BK-512 ACs as written) | 14 | 13 | 3 | **19** | **49** |
| **B** — ADR-0013 exactly as written | 19 | 16 | 17 | 14 | **66** |
| **C** — this decision | **24** | **21** | **23** | **23** | **91** |

**Why A loses.** Its cheapness is real and buys nothing that matters. The typed-name gate defends against a slipped mouse, not against the actual failure mode — a confident person acting on a wrong belief, who types the string correctly because they are not confused about the string. Behind it sit 46 cascade edges and 26 entity types, including `run_steps` (the grain at which evidence and timing live) and the traceability chain that the product's named persona explicitly buys it for. Its only recovery story is an operator extracting one tenant from a shared nightly snapshot, which contradicts BK-512's own premise of acting "without asking anyone at Bunkai to do it for me". It also cannot satisfy its own AC-17.

**Why B loses.** Not on its semantics, which are sound, but on clause 4 — see Fact 2. It converts a data-loss risk into a liveness trap: an owner holding a legal erasure deadline cannot delete their own workspace because a departed colleague's membership row still reads `active` and no button in the product can remove it. Secondarily, B leaves AC-08 unsatisfied by design and defers the notification surface that makes restore findable.

**Why the precedent lens dissented, and why it was overridden.** The codebase-precedent lens scored a *hard-delete* variant highest (23) on the ground that soft-delete introduces a **third** tombstone vocabulary — `deleted_at` alongside the established `archived_at` (4 tables, `0014_module_soft_delete.sql`) and `revoked_at` (2 tables) — and that this repo has **zero working restore paths**: every existing soft-deleted entity tombstones forever. That is a genuine cost and it is accepted below. It was overridden because the three other lenses each independently found the same asymmetry: A's failure mode is permanent and lands on people who did not make the decision, while C's failure mode is a read-path leak visible only to the sole owner who requested the deletion. That is a severity gap, not a preference. The same lens also supplied the decisive procedural finding this ADR obeys.

**Grace window.** The data-protection lens preferred **7 days**, aligning live erasure with the 7-day backup retention at `.context/SRS/non-functional-specs.md:76` so both converge on one date. **30 days** was kept, matching ADR-0013, because the dominant measured risk is unrecoverable loss rather than retention exposure — there is no published privacy policy, ToS or DPA anywhere in this repo, and the only commitment prescribes no window. Revisit if a retention window is ever published.

---

## Consequences

**Positive.** A misfired deletion costs one `update` and 30 days of attention instead of 26 entity types. Every mechanism this decision needs already exists and is reviewed: the soft-delete idiom, partial-index pattern and 404-on-archived read convention (`0014`), the DEFINER guard chain with custom errcodes (`0044_leave_workspace.sql`), the counted-refusal message shape (`0032:248`), and the cron job template (`0075`). The read-path fix is 5 structural edits, not 43 scattered predicates. Export (BK-508) and deletion compose correctly for the first time: BK-508's export is **asynchronous**, and under hard delete an owner could bounce to the export, return, confirm, and destroy the source rows while the archive was still `preparing` — making AC-06's "export first" a paper mitigation. Under soft-delete that round-trip is harmless.

**Negative, and accepted.**

1. **A third tombstone vocabulary.** `deleted_at` joins `archived_at` and `revoked_at`. Future contributors must know which column means "gone" for which entity. Mitigation: this is the only tenant-root lifecycle column and it is documented here.
2. **The 24-file DEFINER audit is the real hidden cost, and it must not be skipped.** `FORCE ROW LEVEL SECURITY` appears nowhere in `supabase/migrations/`, so DEFINER functions bypass RLS and the policy fix in decision point 6 does not reach them. Of 54 migration files declaring `SECURITY DEFINER`, 30 route their guard through the four `0005` helpers and are covered; **24 resolve tenancy from a `project_id` / `run_id` / `bug_id` and must each be read individually** to confirm a soft-deleted workspace does not leak through. This is an ADR-0012 review item, it is unglamorous, and it is exactly the class this codebase has already got wrong.
3. **Modifying four live helper functions is the riskiest edit in this plan.** The `0005` helpers gate 166 call sites and every RLS policy on workspace-owned data. A mistake there is an outage, not a leak.
4. **Member notification is pulled back into scope**, which ADR-0013 deliberately deferred. It is load-bearing here: without the receipt, decision point 5's immediate eviction is exactly the silent-vanish behavior the user-harm lens objected to in AC-08.

**Follow-ups that are NOT part of this ADR:**
- BK-572 "Remove a teammate" — no longer a blocker for deletion, but still the missing half of the membership lifecycle.
- Whether a soft-deleted workspace counts against a billing seat or workspace quota.
- Restore UI vocabulary shares a problem with BK-601 (restore an archived module) and BK-596 (archive/restore vocabulary for Tests); all three should settle on one treatment.

**Mockup gate.** BK-512's §8 row must be re-specified before its mockup is drawn. It currently asks for a **members-remain refusal state that this ADR repeals**. The correct states are: the confirmation with its typed-name gate and counted disclosure, the export-first affordance, the post-request grace state with its restore affordance, and the owner-only refusal. BK-508's gate is unaffected.

**ADR-0012 is `Proposed`, and this ADR depends on it.** Decision point 2 commits BK-512 to a DEFINER RPC governed by an invariant that has never been Accepted. That status should be resolved before BK-512 is implemented; it is flagged here rather than changed, because it is a separate decision.
