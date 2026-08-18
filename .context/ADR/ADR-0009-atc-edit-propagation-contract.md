# ADR-0009 — ATC edit propagation contract: no layer-policy gate, immutable anchors, reference-based cascade

- **Status:** Accepted — Implemented
- **Date:** 2026-06-25 (proposed) · 2026-08-13 (status synced — BK-21 shipped: migration `0035_atc_update_propagation.sql`)
- **Deciders:** Ely (PO/tech-lead, acting), BK-21 shift-left by Ramiro Majdalani (QA)
- **Tags:** api, atc, propagation, data-model, contract
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-21 ("Cascade ATC edits to all tests") shipped to dev with an **unratified contract**. The architect annotation (BK-21 comments) and the story `scope.md` made assumptions that the as-built schema does not support, and the shift-left QA review (Ramiro, 2026-06-02) raised 10 contract questions that block reliable API/automation coverage. The hard constraints discovered while mapping the code:

- Tests reference ATCs through `test_steps.atc_id` and **never copy** ATC step/assertion content; execution snapshots live in `run_atcs` / `run_steps` (migration `0031`, ADR-0004). So propagation is already automatic and historical Runs are already immutable.
- The architect annotation specified a **422 layer-policy check** ("query `tests.layer_policy` … abort with 422 if an ATC layer change breaks a referencing Test"). **The `tests` table has no `layer_policy` column** (migration `0024_tests.sql:40-49` — only `id, workspace_id, title, created_by, timestamps`). EPIC-BK-5 never delivered it. There is nothing to enforce.
- `scope.md` lists Module / Story / Acceptance-Criteria anchors as editable, but BK-18 (`0021`) already froze `user_story_id`, `module_id`, and `slug` as immutable (the slug derives from the module; the US defines AC provenance).
- The remote Supabase project is **shared across local/staging/production** (single project ref `fmbpikzpkafptqximhxn`), so any `create or replace` is live for all environments — including the production route still running old code — the instant it is applied.

These are architectural, cross-cutting, and hard to reverse (they shape the public PATCH contract and the event schema), so they are recorded here rather than buried in the story plan.

## Decision

For the ATC edit endpoint (`PATCH /api/v1/atcs/{id}`) and its RPC (`bunkai_update_atc`):

1. **Propagation is reference-based and read-time.** An ATC edit is visible to every chaining Test on that Test's next read. No realtime push, no latency target, no cache invalidation — the reference architecture (`test_steps.atc_id`) already guarantees it.
2. **No layer-policy gate.** ATC `layer` (`UI | API | Unit`) is a free attribute; changing it never returns 422 against referencing Tests, because no Test-level layer policy exists in the schema. A layer-compatibility feature is **deferred** to a future story that first adds the policy column to `tests`.
3. **Anchors are immutable on edit.** `user_story_id`, `module_id`, and `slug` cannot change; only `acceptance_criterion_ids` are re-bindable within the fixed user story. `scope.md`'s "anchors editable" wording is corrected to this.
4. **Edit-result contract.** The endpoint returns `{ atc, version, affected_test_count }`, where `affected_test_count` is the count of **DISTINCT** Tests chaining the ATC (a Test chaining it at multiple positions counts once). The authoritative `affected_test_ids` ride the emitted `atc.updated` event, computed **in the same transaction** as the edit. `If-Match` (carried as `X-If-Match`, BK-96) is **optional but honored**: present → 409 on version mismatch; absent → last-write-wins.
5. **Backward-compatible RPC change on the shared DB.** `bunkai_update_atc` keeps its bare-ATC return shape; the migration only fills the event's real `affected_test_ids`. The HTTP `affected_test_count` is derived by the route via the existing `bunkai_atc_usage` RPC (`0029`). This invariant holds: **no migration to the shared project may change an RPC's return shape while a deployed route still depends on the old shape** — additive or out-of-band-coordinated changes only.

## Consequences

- **Positive:** propagation needs zero new write machinery; historical Runs stay correct for free; the contract is now testable (QA's 10 questions resolved); the shared-DB deploy is safe (no prod breakage on apply); affected-Test counting reuses one battle-tested query (`bunkai_atc_usage`).
- **Negative / trade-offs:** no guardrail against an ATC layer change that is semantically wrong for a referencing Test (accepted: no policy model exists to define "wrong"); `affected_test_count` in the HTTP body is read just after commit (not strictly in-tx), so a Test created/deleted in the ~ms window could shift it by one — acceptable for an informational confirmation, and the event ids remain authoritative; the UI editor (`bunkai_save_atc`, `0007`) still does not emit `atc.updated` — see follow-up.
- **Neutral / follow-ups:**
  - **Tech-debt:** unify the UI editor edit path onto `bunkai_update_atc` so UI-originated edits also emit `atc.updated` (today they do not — search reindex / future notifications miss them). Out of scope for BK-21 (Option A); file as a tech-story.
  - A future "layer compatibility" story must add `tests.layer_policy` (or equivalent) before the deferred 422 gate can exist.

## Alternatives considered

- **Implement the architect's 422 layer-policy check now** — rejected: there is no `tests.layer_policy` column to check against; building one is a separate schema story, out of BK-21 scope.
- **Change `bunkai_update_atc` to return `{ atc, version, affected_test_count }` directly** — rejected: the shared remote project means the new return shape would break the production route (still doing `{ atc: data }`) the moment the migration applied. Kept the return shape; derived the count via `bunkai_atc_usage`.
- **Make anchors (incl. `user_story_id`) mutable per `scope.md`** — rejected: changing the US orphans AC bindings and changes the derived slug; BK-18 already froze them. Corrected the scope wording instead.
- **Compute `affected_test_count` in the same transaction and return it** — partially rejected for the HTTP body (would require the breaking return-shape change); the in-tx value is still emitted on the event for any consumer needing exactness.

## References

- BK-21 story + shift-left QA review (`.context/PBI/epics/EPIC-BK-13-.../stories/STORY-BK-21-.../comments.md`)
- Migrations: `0021_atc_create_update.sql` (base RPC), `0024_tests.sql` (test_steps, no layer_policy), `0029_atc_usage.sql` (distinct-Test count), `0031_runs.sql` (snapshots), `0035_atc_update_propagation.sql` (this change)
- ADR-0004 (run snapshot model — historical Run immutability), BK-96 (Vercel `If-Match` → `X-If-Match`)
- `.context/business/events.md` § `atc.updated`
