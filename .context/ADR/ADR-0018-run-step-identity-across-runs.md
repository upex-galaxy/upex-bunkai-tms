# ADR-0018 — Run step identity across Runs: occurrence key plus exact wording, computed in one read-only function

- **Status:** Proposed <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-10-15
- **Deciders:** AI Tech Lead (proposer, BK-442 Stage 1/2); Ely (PO/approver) to accept
- **Tags:** data-model, runs, comparison, cross-cutting-invariant
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-442 compares a Run with the previous Run of the same Test and must say, step by step, which failures are new, which were already failing and which are now fixed. That needs a rule for "the same step in two Runs". A wrong rule is worse than none: pairing a step with a different step fabricates a "new failure", which is a false regression alarm.

What is true now (verified on `origin/staging`, 2026-10-15):

- A Run is an immutable snapshot of its Test's chain (ADR-0004): `run_atcs` and `run_steps` copy titles, positions and step text at start. `run_steps.atc_step_id` is provenance only and `on delete set null`.
- `bunkai_update_atc` deletes and recreates every `atc_steps` row on every save (0087, and the same in 0007, 0021, 0035, 0065). A step id therefore changes at every ATC edit and cannot pair steps across an edit.
- The PATCH body has no step id, the save is a full replace and the editor is one Markdown block, so the server cannot know which new step is "the same" as an old one.
- A Test's chain cannot change after creation today (create, reorder and tags only), but `test_steps` has no `unique(test_id, atc_id)`, so the same ATC can appear twice.
- BK-513 and BK-554 reuse the same pairing rule.

## Decision

We will identify a step across two Runs by **(ATC occurrence key, exact step text)**, and compute the whole comparison in **one read-only database function**, `bunkai_compare_run`.

1. **Occurrence key.** `run_atcs.source_atc_id` (uuid, no foreign key, snapshotted at insert from `atc_id` by a `BEFORE INSERT` trigger, backfilled once) names the ATC a chain position came from. An occurrence is `(source_atc_id, n)` where n is the rank among the Run's `run_atcs` sharing that key, ordered by chain position. A repeated ATC pairs 1st-1st and 2nd-2nd; an occurrence present in one Run only is Added or Removed whole.
2. **Exact text.** Inside a paired occurrence a step is `(content, input_data, expected)` compared exactly, null equal to empty. A wording repeated inside one occurrence pairs k-th with k-th only when both Runs hold the same number of copies; otherwise every copy is Removed and Added.
3. **Never guess.** A step that cannot be paired is reported as Removed (only in the Previous run) and Added (only in This run). A reworded step is therefore Removed plus Added in release 1. If any `run_atcs` of either Run has no key, the function answers the `unreliable` state and returns no counts.
4. **One rulebook.** The status matrix (4 comparable pairs, 12 not comparable), the Previous-run rule and the pairing live only in the function. The page and the API read it and add only words. The function is `SECURITY INVOKER` with no identity parameter (RLS on the caller's own client is the only authorization) and refuses a caller without `auth.uid()`.

The invariant for future work: **any feature that relates a step in one Run to a step in another Run (BK-513, BK-554, a later flakiness score) must go through this identity rule and this function, never a second pairing.**

## Consequences

- **Positive:** no wrong "new failure" from a mis-pairing; an ATC re-save or rename, a move, a reordered chain and an inserted or deleted step all behave correctly; one rulebook for page and API; no shipped function is edited (the key is filled by a trigger, not by re-creating `bunkai_create_run`); old Runs compare like new ones after the backfill.
- **Negative / trade-offs:** a reworded step shows as Removed plus Added, which is the edit QA makes most; a Run whose `atc_id` was already null before the backfill answers `unreliable`; pairing is only as good as exact text (a trailing space is a different step).
- **Neutral / follow-ups:** the follow-up Story "TMS-ATC | Keep a step's identity across ATC edits so run comparison pairs reworded steps" (author-supplied step ids: an optional id in the ATC PATCH, an id-preserving `bunkai_update_atc`, a row-based editor) lifts the reworded-step limit; when it ships this ADR is superseded, not edited. A future chain-edit Story reuses the occurrence rules already in the function.

## Alternatives considered

- **Pair by position** — rejected: one inserted step shifts every later pair and fabricates new failures (positions also have gaps).
- **Snapshot `atc_steps.id` and pair on it** — rejected: the id changes at every save, so a Run started after an edit holds other ids.
- **Make ATC update keep step ids** — rejected for release 1: the PATCH step carries no id and the editor is one Markdown block, so the server would have to guess.
- **Compute the diff in TypeScript** — rejected: the rules would live twice (page and API), against R-003.
- **Fill `source_atc_id` by re-creating `bunkai_create_run`** — rejected: it copies a shipped DEFINER function that ADR-0012 lists as unguarded and not to be retrofitted inline; a trigger covers every insert path including seeded fixtures.
- **Compare on `run_atcs.atc_id` with no new column** — rejected: `atc_id` is `on delete set null`, so a hard delete of an ATC would silently turn old comparisons unreliable.

## References

- Jira BK-442: Developer comment T1/T2/T3, Product Owner follow-up of 2026-10-12, AI Tech Lead decisions and the correction on the service role.
- `supabase/migrations/0092_run_compare.sql`; `lib/runs/compare-view.ts`; `lib/runs/compare-isolation.test.ts`.
- ADR-0004 (Run snapshot model), ADR-0009 (ATC edit propagation), ADR-0012 (RPC authorization invariant: prefer INVOKER, no inline retrofit of the unguarded set).
