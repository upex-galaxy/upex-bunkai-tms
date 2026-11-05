# ADR-0024 — Module restore: the archive records its own batch, and the live tree decides what may come back

- **Status:** Proposed
- **Date:** 2026-11-05
- **Deciders:** AI Tech Lead and AI Product Owner (Bunkai rule AI-LED-DECISIONS); rulings on BK-601 of 2026-08-24 and 2026-11-05
- **Tags:** soft-delete, cascade, cross-cutting-invariant, authorization
- **Supersedes:** —
- **Superseded by:** —

---

## Context

`bunkai_archive_module_subtree` takes a whole branch down across four tables and nothing could bring it back. A restore has to be the exact inverse of one archive, not of every archive that ever touched the subtree: a User Story archived on its own a month earlier must stay archived. ADR-0023 tells rows apart by timestamp, which only works while one transaction archives one subtree. `now()` is transaction time, and bulk archive is already named as planned work, so two subtrees archived together would share a stamp and restore each other.

## Decision

1. **Each Module archive stamps its own batch.** `archive_batch_id` on `modules`, `user_stories`, `acceptance_criteria` and `atcs`, one `gen_random_uuid()` per cascade call, cleared on restore. No backfill and no index: the restore reaches rows through their parent keys. `bunkai_archive_user_story`, `bunkai_archive_atc` and `bunkai_restore_atc` write none, because they are not Module archives. **Any future cascade writer must stamp its own batch**, or a restore cannot tell its rows apart.
2. **The target decides the rule, and the two rules never mix per row.** A target with a batch selects Modules, Stories and Criteria of exactly that batch. A target without one was archived before 0117: it selects rows with no batch and its exact timestamp, which is correct for them because no bulk archive has ever run.
3. **ATCs combine the batch with ADR-0023.** In a restored Module or Story, and either the target's batch or the "held by parent" signature `bunkai_restore_atc` leaves (no actor, no batch, the target's timestamp). An ATC comes back only if both its parents are live afterwards, because every ATC reader filters only `atcs.archived_at`. If the other parent is still archived, the ATC passes to it (ADR-0023 decision 2) and is not counted.
4. **The live tree's rules govern a restore.** Refused with a named code and no write: an archived ancestor (`45004`, naming the nearest), depth past 6 on the parent chain (`45002`), an active sibling with the same normalized name (`45005`), an active Story holding a restored Story's `external_id` (`45006`). The last is an AI Tech Lead addition to the Product Owner's list: `user_stories_project_external_id_uniq` ignores archived rows, so the key can be taken while the Story is archived, through the product, and the alternative was a raw `23505`. Never truncated, renamed or re-parented.
5. **No actor parameter.** `bunkai_restore_module_subtree(p_module_id)` is SECURITY DEFINER because the write spans four tables and `activity_log`, and its actor is `auth.uid()`, as in the rest of the Module family. A PAT runs through the impersonating client, so it has one too. This deletes the identity parameter rather than guarding it (ADR-0012).
6. **Locks serialize a restore with an archive.** A restore takes ancestors `FOR SHARE` root first, then the target `FOR UPDATE`; the cascade now locks its top Module before collecting the subtree. Otherwise a child restored while an ancestor is being archived could end up active under an archived Module.

## Consequences

- **Positive:** bulk archive can ship without touching restore. A restore is exact, atomic and refuses rather than repairs.
- **Negative / trade-offs:** one more column on four tables, and a rule every future cascade writer has to honour. `authenticated` holds table UPDATE on `modules`, `user_stories` and `acceptance_criteria`, so a member could write `archive_batch_id` or `archived_at` there through PostgREST; only `atcs` has a guard trigger, which now covers the new column. Existing ADR-0012 debt, not widened here.
- **Neutral / follow-ups:** `archived_by` stays ATC-only. Who archived a Module comes from its `module.archived` entry, and a Story or Criterion archived on its own shows a date only. Restoring a single Story or Criterion needs its own story. The depth and name-collision refusals cannot be reached through the product today: their tests build the state directly. `bunkai_move_module` measures depth on active rows only (flagged by the BK-601 shift-left); this story does not touch it.

## Alternatives considered

- **Timestamp equality only** — rejected: correct today, and silently wrong the day a bulk archive ships, with nothing erroring.
- **Restore the whole subtree** — rejected: reverses decisions nobody asked to reverse.
- **Restore archived ancestors too, or re-parent to the root** — rejected: edits structure the user never named. The refusal leaves them a next action.
- **An advisory lock per Project** — rejected: row locks follow the order the cascades already use, so `bunkai_restore_atc` keeps working unchanged.

## References

- BK-601, the AI Tech Lead and AI Product Owner rulings on the ticket
- `supabase/migrations/0117_module_restore.sql`, `lib/modules/restore-isolation.test.ts`
- ADR-0012 (RPC authorization), ADR-0022 (failpoints), ADR-0023 (own archive versus cascade)
