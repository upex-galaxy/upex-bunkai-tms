# ADR-0027 — ATC bulk edit: one batch RPC, per-ATC outcomes, partial success is normal

- **Status:** Proposed
- **Date:** 2026-11-11
- **Deciders:** AI Product Owner and AI Tech Lead (Bunkai rule AI-LED-DECISIONS), BK-507
- **Tags:** api, atc, bulk-edit, concurrency, authorization, data-model
- **Supersedes:** —
- **Superseded by:** —
- **Amends:** ADR-0009 decision 3 (anchors immutable on edit), for the bulk path only

---

## Context

BK-507 lets a writer select several ATCs in a Project's ATC list and change their tags, Module, layer or priority in one action. Three things in the repo shape the design:

- `bunkai_update_atc` is a full-replace single-ATC edit. It never writes `module_id`, and ADR-0009 decision 3 froze `module_id` and `slug` on edit. A bulk Module move is therefore a new capability, not a loop over the existing RPC. Looping the single-ATC RPC from the route would also lose the per-ATC outcome contract and spend one round trip per ATC.
- ATCs are chained into Tests by reference (`test_steps.atc_id`, ADR-0009 decision 1), so a bulk edit propagates the same way a single edit does: on the next read, with the distinct chaining Test ids on the emitted event.
- The database is shared with production (MVP-ONE-DATABASE, ADR-0009 decision 5), so no existing function may change its shape. `bunkai_update_atc` and `bunkai_list_activity` stay as they are.

## Decision

We will add ONE new SECURITY DEFINER function, `bunkai_bulk_edit_atcs`, behind `POST /api/v1/atcs/bulk-edit`, with these rules.

1. **One field per action, closed vocabulary.** `tags`, `module`, `layer`, `priority`. Never mixed. `status` is an Execution Status set by Runs and is not editable. `technique` is not in this story.
2. **Tags are add or remove, never replace.** Both are naturally idempotent and make the cap of 10 meaningful (an add that would exceed it refuses that ATC). A wholesale replace across many ATCs is destructive and has no sensible single value. Tags are normalised the way the editor does (trim, collapse inner whitespace, case-insensitive duplicate detection that keeps the spelling already stored).
3. **Per-ATC subtransaction.** Each ATC is processed in its own `BEGIN ... EXCEPTION` block. One ATC failing rolls back that ATC's write and its Activity row, never the others. Partial failure is the normal shape and is never presented as rolled back. The function returns one outcome per requested ATC: `changed`, `unchanged` or `refused`, with a reason from a fixed vocabulary.
4. **Fixed refusal vocabulary:** `not_found` (also covers an id outside the project, so the result discloses nothing), `archived`, `stale_version`, `tags_limit_exceeded`, `module_outside_story_subtree`, `slug_conflict`, `write_failed`. Raw database text never reaches the caller.
5. **A no-op is a success and is checked BEFORE the stale check.** An ATC already holding the target value is `unchanged`: no version bump, no Activity row. This makes a double confirm idempotent (the second request finds every ATC already changed, reports `unchanged`, writes nothing) without a server-side idempotency key.
6. **Stale ATCs are refused, never overwritten.** The client sends the version it saw for each ATC. A mismatch (and not a no-op) is refused `stale_version`.
7. **Module move validates per ATC** against that ATC's own User Story Module subtree, inclusive (the same rule `bunkai_create_atc` applies), and the destination must be live and in the same Project. The destination Module is locked `FOR SHARE` before any ATC is locked, and ATCs are locked in `id` order, the order the archive cascades use, so a concurrent Module archive cannot leave a live ATC under an archived Module.
8. **Slug on a Module move: the module segment is regenerated, the 8-hex suffix is kept.** Nothing addresses an ATC by slug (routes, Test chains and Activity all use the id) and the UI shows only the suffix (`shortSlug`), so the visible identifier does not change while the "slug embeds its module's slug" invariant keeps holding. `unique(project_id, slug)` is a per-ATC refusal (`slug_conflict`), never a 500. Consumers that match on the full slug string, such as an old CSV export, should match on the suffix.
9. **Preview then write.** `dry_run` runs the exact same per-ATC evaluation without locks, writes or events, so the confirmation can name the exact change, the exact number of ATCs, and how many will be refused and why, before anything is written. The write re-evaluates; a row can still be refused at write time.
10. **Ceiling: 200 ATCs per action.** Enforced by the client before the confirmation and by the function before any lock (E14).
11. **Activity: one `atc.updated` row per changed ATC**, same payload keys as the single edit (`title`, `version`, `affected_test_ids` computed with `array_agg(distinct ...)`) plus `changed_fields` and `bulk: true`. `bunkai_list_activity` already projects `atc.updated` from those keys and is not redefined.
12. **Authorization (ADR-0012).** Actor bind at step 0, one write-gate assert on `p_project_id`, every touched row constrained to that project. Execute is granted to `service_role` only (the route uses the admin client), revoked from `public`, `anon`, `authenticated` and `qa_inspector_ro`. A viewer is refused with the write gate (42501).
13. **The per-ATC outcome is returned, not persisted.** The response is the report; the changed ATCs are auditable through Activity. No bulk-job table.

## Consequences

- **Positive:** a refactor reorganisation is one action with an honest report. The existing edit path is untouched, so the shared database stays safe to migrate. The selection component and the batch semantics do not mention the Project list, so the workspace ATC Library can adopt them.
- **Negative / trade-offs:** a second function writes `atcs` rows, so a future change to ATC write rules touches two places. The confirmation's preview is advisory (a concurrent edit can still refuse a row at write time), and the UI says so. A network failure that loses the response leaves the outcome unknown; the UI says that instead of "nothing changed".
- **Neutral / follow-ups:** `technique` and a workspace-wide bulk edit are follow-up stories on the same function and component. The 22 unbound DEFINER functions of ADR-0012 stay out of scope.

## Alternatives considered

- **Loop the existing `bunkai_update_atc` per ATC from the route:** rejected. It cannot move a Module, it is full-replace (a tag-only change would have to resend steps, assertions and criteria), and one request per ATC makes the partial-failure report a client concern.
- **One all-or-nothing transaction:** rejected. One stale ATC in fifty would discard forty-nine valid changes.
- **Keep the slug unchanged on a Module move:** rejected. It breaks the slug-embeds-module invariant for every moved ATC with no consumer to protect; the visible suffix is kept either way.
- **Add a `replace` tags mode:** rejected, see decision 2.
- **A persisted bulk-job table with per-ATC rows:** rejected as speculative. Activity already audits every change.

## References

- ADR-0009 (ATC edit propagation contract), ADR-0012 (RPC authorization invariant), ADR-0023 (ATC archive), `0116_atc_archive_restore.sql` (writer shape, grants, locking order), `0087_atc_classification.sql` (`bunkai_create_atc` subtree rule and slug)
- `.context/design/master-design-plan.md` §5 D64
