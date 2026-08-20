# ADR-0013 — Workspace deletion: soft-delete with a grace period, sole-owner gate, and no member eviction

- **Status:** Accepted — Not yet implemented <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-08-20
- **Deciders:** AI Product Owner + AI Tech Lead (joint, per `CLAUDE.md` Critical Rule #18 — this project is AI-led and has no human PO; the operator directed that the decision be recorded before the mockup, not after)
- **Tags:** tenancy, data-lifecycle, irreversible-action, gdpr, cross-cutting-invariant
- **Story:** BK-512 (Delete a workspace I own)
- **Supersedes:** — (extends the tenancy model established in ADR-0001; pairs with BK-508, workspace data export)
- **Superseded by:** —

---

## Context

BK-512 was created 2026-08-18 by the `discovery` routine. It is the second half of the requirement in `.context/SRS/non-functional-specs.md`: *"GDPR: Workspace owners can request data export + deletion via Settings."* The export half is BK-508. Neither has a mockup, and this ADR exists because **deletion must not be drawn before its semantics are decided** — a confirmation dialog is a picture of a policy, and drawing it first silently picks the policy.

### What the schema actually does today (measured on `origin/staging`, 2026-08-20)

| Fact | Evidence |
|---|---|
| **14 tables cascade directly off `workspaces`** | `references public.workspaces(id) on delete cascade` × 14 across `supabase/migrations/` |
| **46 `on delete cascade` clauses total** | the 14 direct ones plus transitive chains through `projects`, `user_stories`, `atcs`, `runs`, `bugs` |
| **11 `on delete restrict` clauses guard the chain** | including `atc_id`, `user_story_id`, `created_by` and, critically, `workspaces.owner_user_id → auth.users(id) on delete restrict` |
| **No soft-delete exists anywhere** | zero `deleted_at` columns; zero archive/tombstone tables |
| **The sole-owner guard is already written** | `bunkai_leave_workspace` (BK-90) declares `v_other_active_owners`, counts active owners, and raises `last_membership` with errcode `45212` |
| **Membership model** | `workspace_members(workspace_id, user_id)`, `role in ('viewer','member','admin','owner')`, `status in ('active','invited','suspended')` |

So a naive `delete from workspaces where id = $1` **would succeed** and would take 46 cascade edges of data with it, irreversibly, with no tombstone and no recovery path. That is the decision this ADR exists to prevent from being made by default.

---

## Decision

**Soft-delete with a 30-day grace period, gated on sole-ownership, refusing outright while other active members remain.**

Concretely:

1. `workspaces` gains `deleted_at timestamptz null` and `deletion_requested_by uuid null references auth.users(id) on delete restrict`. Every read path filters `deleted_at is null`. No row is physically removed at request time.
2. A `bunkai_request_workspace_deletion(p_workspace_id uuid)` DEFINER RPC, modelled on `bunkai_leave_workspace` and bound by ADR-0012's actor-bind invariant, performs the guards and stamps `deleted_at`.
3. **The caller must be the sole active `owner`.** Reuse the exact `v_other_active_owners` count already in `bunkai_leave_workspace`; a second owner means refuse.
4. **Any other active member — of any role — refuses the deletion.** The workspace must be emptied first, by those members leaving or being removed. Deletion never evicts a third party.
5. Physical purge happens after 30 days, by a scheduled job, and only then does the cascade run.
6. Restore during the grace period is `deleted_at = null` — no data movement, which is the whole point of choosing soft-delete.

---

## Alternatives considered and scored

Criteria: **reversibility** (can a mistake be undone), **implementation cost**, **consistency with existing precedent**, **GDPR fit**, **blast radius if wrong**.

| # | Option | Reversibility | Cost | Precedent | GDPR fit | Verdict |
|---|---|---|---|---|---|---|
| A | **Hard delete behind a type-the-name confirmation** | none — 46 cascade edges, unrecoverable | lowest | none in this codebase | satisfies erasure literally | **rejected** |
| B | **Soft-delete, 30-day grace, sole-owner gate** (chosen) | full, for 30 days, at zero data-movement cost | medium — one column pair, one RPC, read-path filter, one scheduled purge | reuses `bunkai_leave_workspace`'s guard shape and ADR-0012's DEFINER contract | erasure completes at purge; 30 days is well inside any reasonable SLA | **chosen** |
| C | **Soft-delete with automatic eviction of remaining members** | full | high — eviction is its own notification, permission and audit surface | none | same as B | **rejected** |
| D | **Deletion by support request only (no self-serve)** | full | lowest | none | fails the SRS, which says *via Settings* | **rejected** |

**Why A loses despite being cheapest.** The action is irreversible over 46 cascade edges and a confirmation dialog is not a recovery mechanism — it is a speed bump measured in seconds against a loss measured in a workspace. The cost gap to B is one nullable column pair and a read-path filter, which is not a real defence of A.

**Why C loses.** Deleting a workspace and evicting its members are two different product actions with two different blast radii, and bundling them means one confirmation click removes other people's access to their own work. It also drags in notification and audit surfaces this story does not own. Refusing while members remain (option B) is more conservative, cheaper, and leaves the operator a legible next step.

**Why D loses.** The SRS names Settings as the location. Routing it to support is not an implementation of the requirement, it is a deferral of it.

---

## Consequences

**Positive.** A misfired deletion is recoverable for 30 days at the cost of a single `update`. The guard logic is not invented — it is the shape already proven by BK-90's `bunkai_leave_workspace`, which lowers both implementation and review cost. Export (BK-508) and deletion (BK-512) compose in the correct order: export while the workspace is soft-deleted still works, because the rows are all still there.

**Negative, and accepted.** Every workspace read path now carries a `deleted_at is null` predicate, and a path that forgets it leaks a deleted workspace. This is a real, recurring footgun and it is the price of reversibility. Mitigate at the RLS/view layer rather than per-query, so the filter is structural rather than remembered.

**A scheduled purge job is new infrastructure.** Nothing in this project currently deletes anything on a timer. That job is in scope for BK-512 and must not be silently deferred, or the "grace period" becomes "never actually erased" — which is a GDPR failure wearing the costume of a feature.

**Follow-ups that are NOT part of this ADR**, to be filed as their own tickets:
- Notifying remaining members that a workspace they belong to was scheduled for deletion (does not arise under option B, since deletion refuses while they remain — but does arise if C is ever revisited).
- Whether a soft-deleted workspace still counts against any future billing seat or workspace quota.

**Mockup gate.** With these semantics ratified, BK-512's mockup can now be authored: it needs the sole-owner refusal state, the members-remain refusal state, the confirmation treatment, and the post-request grace-period state with its restore affordance. Its §8 row records the gate as unratified until this ADR merges.
