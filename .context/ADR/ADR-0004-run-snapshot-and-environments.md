# ADR-0004 — Run Snapshot Model & Project Environments Entity

- **Status:** Accepted <!-- Proposed | Accepted | Superseded by ADR-MMMM | Deprecated -->
- **Date:** 2026-06-20 <!-- date the decision was made / last status change -->
- **Deciders:** Dev (drafted), Architect + PO (accept), QA-Lead (test gate)
- **Tags:** data-model, execution, runs, cross-cutting-invariant, tenancy
- **Supersedes:** —
- **Superseded by:** —

---

## Context

BK-34 opens the **Manual Execution & Runs** epic (BK-30). A QA engineer must be able to start a manual Run of a Test in a chosen environment, and the Run renders as a checklist they execute step by step (mark pass/fail/block, abort, review history — BK-35→39). This is the first Runs story, so it must lay the data-model foundation the entire tail extends, while building only the start-a-run behavior.

Two structural questions force a decision now, each architectural **and** hard to reverse once Runs exist in production:

1. **Execution content provenance — snapshot vs. live reference.** A Run executes the steps of a Test's ATC chain. But a Test (BK-24/28) and its ATCs (BK-13) are editable *after* a Run starts: steps get reworded, reordered, added, or deleted; ATCs get archived. If a Run referenced the live chain, editing a Test mid-execution (or months later) would silently rewrite the historical record of what was actually executed — corrupting evidence and breaking the verdict's meaning. The domain glossary already mandates the resolution: *"A Run snapshots step content so editing an ATC later never corrupts history."* The schema must encode that mandate, not leave it to convention.

2. **What a Run targets — there is no environments concept anywhere.** A Run must select a configured Project environment ("run this against Staging"). Confirmed by audit: **zero** environments schema exists — no table, no enum, no column on `projects`. A choice is forced: hardcode an enum (`'staging' | 'production'`) on `runs`, or introduce a real first-class entity. An enum cannot model per-project environment sets, custom environments, or future env management; widening it later means a data migration of every historical Run. This is the kind of decision that is cheap now and expensive after Runs accumulate.

Constraints in play: mirror the established SECURITY DEFINER + `workspace_members` RLS + optimistic-lock conventions (precedent `bunkai_create_test` 0024, `bunkai_get_test_expanded` 0025, BK-33 tags 0030); additive migration only; the live route-driven workbench-tab shell (ADR-0003 / BK-147) is the surface the runner mounts into.

## Decision

**We will model Run execution as an immutable snapshot taken at start, and introduce `project_environments` as a first-class entity that a Run targets by foreign key.**

Concretely:

1. **Snapshot-at-start.** `bunkai_create_run` walks the Test's live chain (`test_steps → atcs → atc_steps`) **once**, at the start instant, copying step content (`content`, `input_data`, `expected`) and the chain/ATC titles + positions into two new owned tables — `run_atcs` (one row per chain position) and `run_steps` (one row per executable step). After insert, the Run's content is **frozen**: it is read only from `run_atcs`/`run_steps`, never re-resolved from the source. The links back to source rows (`run_atcs.atc_id`, `run_steps.atc_step_id`) are `ON DELETE SET NULL` provenance pointers only — never read for content. **Invariant: once a Run is created, no edit, reorder, or deletion of the source Test/ATC/step ever alters that Run's `run_steps`.**

2. **`project_environments` as a real entity.** A Run targets exactly one environment via `runs.environment_id → project_environments.id` (NOT a `text`/enum column). Each row is `(project_id, name)`, unique per project case-insensitively. RLS: SELECT for the project's workspace members; **no client write policy** for MVP (default-deny until an environment-management story ships). The BK-34 migration **seeds `Staging` + `Production` for every existing project** so the start-run flow has real data to pick (PO-pending: default seed names — see implementation-plan §4 Q-env).

3. **The header is the row the tail extends.** `runs` carries `status` (CHECK includes `running/passed/failed/aborted` — the tail's targets), `executor_mode` (`human/agent/ci`), `executor_user_id`, a `version int` optimistic lock, `start_token` (domain idempotency), snapshot `test_title`, and `started_at/finished_at`. `bunkai_create_run` is one SECURITY DEFINER transaction gated by `bunkai_assert_actor_can_write_project`, emits a `run.started` `activity_log` row, and enforces domain idempotency by a **transaction-backed 24h lookup** on `(test_id, start_token)` under the project write-lock — NOT a partial unique index, because a `now()`-relative predicate is not constraint-able (story-local; see implementation-plan §4 Q5 / TD-3).

## Consequences

- **Positive:**
  - Run history is tamper-proof: a Test edited or deleted after a Run never rewrites that Run's executed steps — the historical-evidence guarantee QA depends on.
  - The schema is forward-built for the whole epic: BK-35 (mark pass/fail/block) writes `run_steps.status/note/evidence_url/executed_at`; BK-36 (abort) flips `runs.status='aborted'`; BK-37 (history) reads the snapshot `test_title`/`atc_title` that survive source edits; BK-38 (project filter) reads `runs.project_id/executor_mode/status`; BK-39 (verdict) sets `runs.status` + `finished_at` under `runs.version`. No re-migration to add Runs behavior.
  - Environments are extensible: custom environments, per-project sets, and a future env-management UI are additive — no enum migration of historical Runs.
- **Negative / trade-offs:**
  - Storage cost: every Run duplicates its chain's step content. Acceptable — execution records are append-mostly and the duplication *is* the historical record.
  - The snapshot semantics will look like a "stale checklist" bug to anyone unaware of the mandate: editing a Test does **not** update an in-flight Run. This must be called out to QA (it is correct behavior, not a defect) — flagged in implementation-plan §5.
  - Domain idempotency lives in plpgsql (transaction lookup), not a DB constraint, so it cannot be enforced outside `bunkai_create_run`. Mitigated by routing all creation through that single RPC.
- **Neutral / follow-ups:**
  - Environment **write/management** (create, rename, deactivate, reorder) is deliberately out of scope — a future story owns it. Until then environments come only from the seed.
  - The expired-token branch (after 24h, same token → new Run vs. explicit reject) is PO-pending (implementation-plan §4 Q1); the chosen working answer (new Run) is the simplest and adds no expired-token error path now.

## Alternatives considered

- **Live-reference execution (Run reads the current Test chain at render time)** — rejected: editing or deleting a Test after a Run starts would silently rewrite or break the historical execution record, violating the glossary's snapshot mandate and destroying evidence integrity. The whole point of a Run is *what was executed then*, not *what the Test says now*.
- **Hardcoded environment enum on `runs` (`status_env text check (... in ('staging','production'))`)** — rejected: cannot model per-project environment sets, custom environments, or future env management; any later flexibility means a data migration of every historical Run. A `project_environments` FK is cheap now and open-ended.
- **Partial unique index for domain idempotency (`unique (test_id, start_token) where started_at > now() - interval '24h'`)** — rejected: a `now()`-relative predicate is not immutable, so Postgres cannot build it as an index/constraint. The transaction-backed lookup under the project write-lock is the documented fallback.
- **Snapshot only step *references*, resolve content lazily** — rejected: a reference is exactly the live-reference model with extra indirection; it does not freeze content.

## References

- Story plan: `.context/PBI/epics/EPIC-BK-30-manual-execution-runs/stories/STORY-BK-34-as-a-qa-engineer-i-want-to-start-a-manual-run-of-a/implementation-plan.md` (§2 data model, §4 open questions, TD-1..TD-4).
- Domain glossary: `.context/business/domain-glossary.md` — Run / snapshot mandate.
- Precedent migrations: `supabase/migrations/0024_tests.sql` (`bunkai_create_test`, DEFINER + audit + RLS), `0025_test_read.sql` (`bunkai_get_test_expanded`, nested jsonb read), `0030_test_tags.sql` (optimistic-lock pattern), `0021_atc_create_update.sql` (`bunkai_assert_actor_can_write_project`).
- ADR-0001 (API auth), ADR-0002 (Idempotency-Key scoping — the *request-level* replay guard, distinct from this story's *domain* `start_token`), ADR-0003 (route-driven workbench tabs — the shell the runner mounts into).
