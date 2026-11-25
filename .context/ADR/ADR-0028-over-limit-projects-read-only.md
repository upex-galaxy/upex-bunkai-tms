# ADR-0028 — Over-limit projects are read-only through a derived database write lock

- **Status:** Proposed <!-- Implemented by BK-233 (migration 0140). Decided by the AI Tech Lead under Bunkai rule AI-LED-DECISIONS; no human has ratified it yet. -->
- **Date:** 2026-11-25
- **Deciders:** AI Tech Lead / AI Product Owner (BK-233 rulings of 2026-11-19 and 2026-11-25 on the ticket)
- **Tags:** billing, plans, limits, cross-cutting-invariant, database, authorization
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** ADR-0021 (closes its "over-limit resources become read-only" follow-up)

---

## Context

A workspace can end up with more projects than its effective plan allows: a Cloud owner downgrades to Community (BK-233), a cancelled subscription reaches the end of its paid period, or a failed renewal outlives its grace window (BK-231, ADR-0021). The ratified rule (PO, 2026-07-11) is that nothing is ever deleted: the oldest projects beyond the limit become read-only, stay fully viewable, and become editable again on a re-upgrade.

ADR-0021 left the write lock as a follow-up and named the cost: it needs a lock on every project-scoped table. The database is shared by every environment and by students, so the lock must be impossible to trigger for a workspace within its limits, and it must not depend on the UI.

## Decision

1. **Derived, never stored.** One ranking, `bunkai_project_ids_over_limit(workspace, limit)`, serves both the downgrade preview and the lock, so they cannot disagree. `bunkai_read_only_project_ids(workspace)` returns the projects over the EFFECTIVE plan's limit (`bunkai_effective_plan`), oldest first (`created_at`, then `id`): the first `count - limit`. A workspace at or under its limit, or on an unlimited or unknown plan, gets none. There is no flag to drift, no job to run, and a re-upgrade restores editing at the instant the plan changes.
2. **Enforced in the database.** A `SECURITY DEFINER` trigger, `bunkai_guard_project_writable`, refuses INSERT and UPDATE on the project-scoped content tables with SQLSTATE `45701` `project_read_only` when the target project (new or old row) is read-only. It never guards DELETE, so cleanup, project deletion and workspace deletion cannot be wedged by a plan change; writes from another trigger or a cascade (`pg_trigger_depth() > 1`) pass. Runs and import jobs are guarded on INSERT only, so work started before a downgrade can finish. The project row itself is guarded on UPDATE (creation stays the job of the project-limit trigger). A Test has no project of its own: it, its steps and its automation history resolve to every project its chained ATCs live in.
3. **Named at the API.** Every domain error mapper and the central handler translate `45701` into 422 `project_read_only`, the sibling of BK-230's `project_limit_reached`. Reads are never affected.

## Consequences

- **Positive:** one rule in one place covers every write path (API routes, RPCs, PostgREST, admin-client jobs); the state is reproducible from the plan and the project list alone; a workspace within its plan cannot be locked by construction.
- **Negative / trade-offs:** every guarded write pays a lookup of the project's workspace and its project count (the read-only ranking runs only when the count is above the limit). A Jira sync or an import into a now read-only project fails for that project, and so do the content writes of a run already in progress (its own status can still close). A Test that chains ATCs from an editable and a read-only project is locked as a whole. The derived ranking means deleting an editable project can thaw the newest read-only one; that is the rule working, not a bug.
- **Neutral / follow-ups:** a route whose domain mapper does not run for a given write still refuses it (the database decides) but may answer a generic error instead of the named one. Seats are never made read-only: the downgrade is refused while active members exceed the target cap (PO ruling 2 of 2026-11-19).

## Alternatives considered

- **A stored `is_read_only` flag written on downgrade** — rejected (AI Tech Lead, 2026-11-19): duplicated state that drifts, and it needs an undo path on every upgrade, grace recovery and project deletion.
- **API-only enforcement** — rejected: PostgREST and admin-client jobs would bypass it, and the database is shared by every environment.
- **Guarding DELETE too** — rejected: a cascade or a cleanup job blocked by a billing state is a worse failure than a member deleting content of a read-only project they could already see.

## References

- BK-233 (Jira rulings 2026-11-19 and 2026-11-25), migration `supabase/migrations/0140_billing_downgrade_cancel.sql`
- ADR-0021 (effective plan), ADR-0014 (Stripe Checkout and the webhook), ADR-0012 (RPC authorization invariant)
- `lib/api/project-read-only.ts`, `lib/billing/subscription.ts`
