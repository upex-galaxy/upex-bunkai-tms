# ADR-0023 — ATC archive: own archive versus cascade, and restore under an archived parent

- **Status:** Proposed
- **Date:** 2026-11-04
- **Deciders:** AI Tech Lead (Bunkai rule AI-LED-DECISIONS); ruling on BK-571 of 2026-11-04
- **Tags:** soft-delete, read-paths, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

`atcs.archived_at` existed with no single-ATC writer: only the Module and User Story cascades set it. BK-571 adds that writer. Two things then have to be told apart, because BK-601 and BK-596 will restore parents on top of this: an ATC someone archived, and an ATC a parent archived.

The AI Product Owner ruled that an ATC can be restored while its parent is archived and that it "stays out of default lists in the way any ATC under an archived parent already is". Readers do not check the parent. `0111_user_story_archive_cascade.sql` records that every ATC reader filters only `atcs.archived_at` and relies on the invariant "archived parent means archived children" (BK-1555). Clearing the column under an archived parent would put the ATC back into search, the library, the Test chain picker, the export and `GET /api/v1/atcs/{id}`.

## Decision

1. **Own archive is read from the timestamps.** Cascades stamp one timestamp across the subtree. An ATC is archived on its own when its `archived_at` differs from both its User Story's and its Module's. `archived_by` is for display only and never decides this.
2. **Restore under an archived parent hands the ATC to the parent.** `archived_at` takes the parent's timestamp and `archived_by` clears: the state the cascade would have produced. It writes `atc.restored`. No reader changes and the invariant holds.
3. **The nearest parent decides.** Equal Module and User Story stamps mean the Module holds the ATC. Different stamps mean the User Story was archived on its own and holds it, because restoring the Module would not restore that Story.
4. **An ATC with no own archive has nothing to restore.** Restoring it is a success with `changed: false` and no event. The archived view lists own archives only.
5. **A parent's restore must honour this.** A Module restore brings back the children whose `archived_at` equals the Module's and whose User Story is live, selecting them the way the cascade does (`module_id` in the restored subtree or `user_story_id` in the restored stories). It leaves own archives alone.

## Consequences

- **Positive:** no reader had to change, and any future reader that filters `atcs.archived_at` is correct by default. An ATC archived on purpose before its Module stays archived when that Module returns.
- **Negative / trade-offs:** `archived_at` means "out of circulation", not "someone archived this", so a restored ATC under an archived parent still has it set. The rule depends on cascades stamping one timestamp, so a new cascade writer must keep doing that. An ATC archived with its parent does not appear in the archived view; the view says so.
- **Neutral / follow-ups:** one row archived before this rule, with both parents live and no actor, reads as an own archive with an unknown author. `authenticated` still holds table UPDATE on ATC content, and the legacy `bunkai_save_atc` has no archived check: existing ADR-0012 debt, not widened here. Only the two archive columns gained a guard.

## Alternatives considered

- **Clear the column and add a parent check to every reader** — rejected: about ten readers including two search functions, and any future reader that forgets leaks a retired ATC.
- **Refuse restore while a parent is archived** — rejected: contradicts the AI Product Owner ruling.
- **A separate "restored" flag** — rejected: a third state every reader and BK-601 would have to know.

## References

- BK-571, "AI Tech Lead — Decision: how restore behaves while a parent is archived"
- `supabase/migrations/0116_atc_archive_restore.sql`, `lib/atcs/archive-restore-isolation.test.ts`
- ADR-0012 (RPC authorization invariant), BK-1555 (`0111_user_story_archive_cascade.sql`), BK-595
