# Comments for BK-202

[View in Jira](https://jira.upexgalaxy.com/browse/BK-202)

---

### Ely - 7/11/2026, 12:52:47 PM

## PO Ratification — 2026-07-11

- T1 ratified: plan name 1–100 chars, unique per project (case-insensitive) — now a PO-final rule, no longer convention-derived from environment names. Business Rules field updated accordingly.
- T2 confirmed: creating and editing plans stays member role and above.

---

### Ely - 7/30/2026, 1:29:02 PM

Mockup — Test Plans index. Source: .context/designs/bunkai-test-management-tool/bk-201-test-plans-milestones/test-plans-index.html · spec: master-design-plan §4.11



---

### Ely - 7/30/2026, 1:29:06 PM

Mockup — Plan detail. Source: .context/designs/bunkai-test-management-tool/bk-201-test-plans-milestones/plan-detail.html · spec: master-design-plan §4.11



---

### Alfonso Hernandez - 8/15/2026, 1:53:14 AM

## Acceptance Test Plan (ATP) — Shift-Left DRAFT ready for review

ATP DRAFT (condensed) lives in the Acceptance Test Plan (ATP) field. Full analysis in the repo: `.context/PBI/epics/EPIC-BK-201-test-plans-milestones/stories/STORY-BK-202-tms-test-plan-create-a-test-plan-grouping-tests-fo/shift-left-refinement.md`.

---

### Alfonso Hernandez - 8/15/2026, 2:17:45 AM

# BK-202 — Open Questions Resolution — 2026-08-14

> Resolves the 10 open questions surfaced by the Shift-Left refinement (`shift-left-refinement.md`), each answered from two grounded perspectives: ***PO**** (business/product ruling, in the same voice as the existing 2026-07-11 PO Ratification comment on this ticket) and ****Dev*** (technical/implementation ruling). Both were grounded against the real product codebase — sibling repo `upex-bunkai-tms` — not assumption. This is a NON-Jira working file (not synced from Jira); ratified content should be folded into `business-rules.md` / `scope.md` on the next Jira sync and copied forward as precedent onto sibling stories BK-203/BK-204/BK-207.

---

## ⚠️ Major correction surfacing from this pass

Both the PO and Dev rulings independently found the same thing, from separate codebase reads: ***Epic BK-24 ("Tests") and Epic BK-30 ("Runs") — the two dependencies BK-202's own description names as blockers — are already shipped in the product***, not "still in Planning" as Jira's Epic BK-24 status ("Planificación") showed during Phase 1 triage.

- `supabase/migrations/0024*tests.sql` (BK-27) — `tests` + `test*steps` tables, RPC `bunkai*create*test`, already live.
- `supabase/migrations/0031_runs.sql` (BK-34) — Manual Execution & Runs data-model foundation, already live.
- Both shipped roughly 2 months before Milestones (`0064_milestones.sql`), the sibling half of BK-202's own epic.

***Action******:*** re-verify Epic BK-24's live Jira status with PO — it appears stale relative to the codebase. This directly resolves Critical Question 1 below (decouple, do not wait).

---

## Critical Questions

### 1. Should BK-202 stay in Estimation until epic BK-24 (Tests) ships, or is the plan container decoupled enough to build and estimate now against a stub?

***PO Ruling******:****** DECOUPLE. Move to estimate now — do not gate on BK-24.***
The "activates once its dependency epics are live" line was written when BK-24 was a roadmap entry; it no longer describes reality (see correction above). Separately, and more importantly: BK-202's own AC set never reads or writes a Test/ATC row — Test **membership** is BK-203's job, explicitly out of scope here. A pure name/description/goal container has zero technical coupling to whether Tests exist. ***T3 ratified******:****** BK-202 estimates and builds now, independent of BK-24's Jira status.***

***Dev technical assessment******:*** No stub needed — BK-202 can be built now with a REAL foreign key to `tests.id` via a junction table (e.g. `test*plan*tests(test*plan*id, test_id, position?)`) once BK-203 (add/remove tests) lands. The premise needing a stub was itself the stale assumption.

---

### 2. Is Delete ever planned for a Test Plan, or is Close (BK-207) the only way a plan leaves "Open," making Delete permanently out of scope for the whole epic?

***PO Ruling******:****** No Delete, ever. Close (BK-207) is the sole exit from "Open." Ratify this now for the whole Test Plan sub-epic, not just BK-202.***
This is the exact pattern already shipped for Milestones (sibling half of the same epic): `0064*milestones.sql`'s header states "No DELETE policy and no delete RPC — deletion is out of scope," matching the same default-deny-on-writes precedent `0031*runs.sql` set for `project_environments`. ***T4 ratified******:****** add "No Delete — Close is the only exit from Open" explicitly to BK-202's (and the whole epic's) Out of Scope***, so it stops surfacing as a question on every sibling story.

***Dev technical assessment******:*** Follow the Milestone precedent exactly — no DELETE policy, no delete RPC, ship nothing. Adding an unused delete path now is unrequested surface area with its own audit/cascade design questions answered for nothing. BK-202's own `out-of-scope.md` doesn't mention Delete at all, which under house convention means it isn't in scope unless a future story explicitly asks.

---

### 3. Is the "member role or higher" gate on create/edit enforced server-side, independent of the UI hiding the affordance, and does it re-check the live role at submit time?

***PO Ruling******:****** Yes — non-negotiable. Server-side role gate, re-checked live on every write, is a hard NFR for this Story, not optional hardening.***
Already load-bearing house convention, not a new ask — every write RPC in this codebase gates on role first, inside the `SECURITY DEFINER` function itself. There is no code path where a write RPC trusts client-supplied identity or a cached client role.

***Dev Decision******:****** Yes on both counts, by construction — reuse ****`bunkai*can*write_workspace`**** verbatim, don't invent a parallel check.***
`public.bunkai*can*write*workspace(ws*id)` (`0005*rls*helpers.sql`) is `security definer stable`, checks `workspace*members` for `role in ('member','admin','owner')` live against `auth.uid()` (resolved server-side — no actor parameter a caller could spoof). `bunkai*create*milestone`/`bunkai*update_milestone` both call it as their first authorization step. Per the documented architecture layering (Edge → Route Handlers → domain services → ***Postgres RLS+RPCs***), the RPC/RLS layer is the actual enforcement boundary — Route Handlers are a thin pass-through, not a second independent gate. Hiding the "New plan" button in the UI is cosmetic only; a demoted user's stale UI still hits the live-checked RPC and gets `42501`.

---

### 4. Does renaming an existing plan re-trigger the same case-insensitive, trimmed uniqueness check as creation?

***PO Ruling******:****** Yes. Uniqueness applies identically on create and rename — no carve-out. T5 ratified.***
`milestones*project*name*idx` is a DB-level `unique (project*id, lower(name))` index, which by construction fires on every INSERT and every UPDATE that touches `name` — there is no code-level "only check on create" path in the milestone precedent, and there must not be one for Test Plans either.

***Dev Decision******:****** Yes, mechanically identical, and self-exclusion is automatic — no special-case code needed.***
`bunkai*update*milestone`'s own comment: "Self-exclusion is automatic: updating a row to a value it already holds does not violate the unique index, because it is the same row." Same `(project_id, lower(name))` unique index backs both INSERT and UPDATE paths for milestones; Test Plan should reuse the identical index shape so the same guarantee holds for free.

---

## Technical Questions

### 1. Exact verbatim error-message copy for the duplicate-name rejection (AC3) and the blank-name rejection (AC4)

***Dev Decision (PO-concurred on tone/pattern)******:***

- Duplicate name (409, `conflict`, `reason: test*plan*name_taken`): ***"A test plan with this name already exists."***
- Blank/invalid name (422, `validation*failed`, `reason: test*plan*name*length`): ***"Name must be between 1 and 100 characters."***

Exact live copy for the sibling entity, `lib/milestones/errors.ts` `mapMilestoneRpcError()`: `'A milestone with this name already exists.'` (23505 → conflict) and `'Name must be between 1 and 100 characters.'` (45500 → validation_failed). Swap "milestone" → "test plan"; envelope shape (`ApiError(kind, message, { details: { reason } })`) stays identical. PO note: AC3's project-scoping detail ("...in this project") is a real user-facing fact per the AC as written but Milestones' shorter copy omits it — ship the shorter house-convention copy for consistency across the app's error surface; AC3/AC4 wording was behavior description, not literal required copy.

---

### 2. Does "compared after trimming spaces" mean ASCII space only, or all whitespace (tabs, non-breaking space)?

***Dev Decision******:****** All whitespace, not just ASCII space — collapse runs of whitespace to a single space, THEN trim, enforced as a table-level CHECK (not just an RPC-time transform).***
`0064*milestones.sql`: `name text not null check (name = btrim(regexp*replace(name, '\s+', ' ', 'g')) and char_length(name) between 1 and 100)`. Postgres `\s` covers tab/newline/etc., not just literal space. Note: U+00A0 (non-breaking space) is NOT matched by POSIX `\s` and would need an explicit character class if the team wants that edge covered — the milestones precedent doesn't bother, so match that scope unless PO says otherwise.

***PO note******:*** Read Business Rules T1 ("compared after trimming spaces") as shorthand for this same normalize-then-compare rule, not literally ASCII-space-only. Reuse the same regex, don't reinvent it.

---

### 3. Is plan edit restricted to the plan's original creator, or can any project member with role ≥ member edit any plan?

***PO Ruling******:****** Any project member with role ≥ member may edit any plan, not creator-restricted.***
This is a team-shared planning artifact (Elena curates a plan Mateo created, per epic.md's own persona table), not personal content — creator-locking it would contradict the epic's own "the whole team collaborates on this container" framing.

***Dev Decision (confirms mechanically)******:****** same — ****`bunkai*update*milestone`**** gates purely on ****`bunkai*can*write*workspace`****, zero comparison against ****`created*by`**** anywhere in the update path.*** `created_by` is stored only for audit/display, never as an authorization input. Nothing in BK-202's `business-rules.md` asks for creator-restriction — it would be a deliberate deviation from house convention, not the default.

---

### 4. What is the intended max length for description and goal?

***Ruling (PO + Dev converge)******:****** Description 500 chars, Goal 100 chars.***
Description reuses Milestones' exact cap (`0064*milestones.sql`, `check (char*length(description) <= 500)`, matched by validation-failed copy `'Description must be 500 characters or fewer.'`) — no reason to pick a different number for a sibling entity in the same epic. Goal gets name's shorter bound (100) since it renders as a short label/chip ("Release 2.4") in the mockup's compact list-column, not free-form prose — a paragraph-length goal would break that layout.

***No-precedent flag******:*** `goal` is genuinely greenfield (no existing field like it in the codebase) — treat 100 as a PO-confirmable default, not load-bearing precedent, unlike the reused `description` cap.

---

### 5. Is per-project name uniqueness backed by a DB-level unique constraint, or an app-level check only?

***Ruling (PO + Dev converge)******:****** DB-level unique index. Non-negotiable — app-level-only is not acceptable.***
`unique index on (project*id, lower(name))`, relying on the table CHECK to guarantee `name` is already whitespace-normalized before the index sees it — "correct by construction," per the migration's own comment. This closes the concurrent-duplicate-creation race the refinement flagged (Edge Case #1 / the Integration outline for it) for free: the second concurrent INSERT gets `23505 unique*violation` from Postgres itself, no app-level TOCTOU window. Same shape reused from `project*environments*project*name*idx` (`0031*runs.sql`) — a 3rd-generation house pattern, not a one-off. This is a copy-paste of the Milestones index shape onto the new `test*plans` table, not new design work.

---

### 6. Is there an intended maximum number of Test Plans per project, or is the list unbounded by design?

***Ruling (PO + Dev converge)******:****** Unbounded by design — no cap.***
Neither `tests` nor `milestones` — the two closest precedent entities — impose a per-project row cap anywhere in schema or RPCs (grepped `supabase/migrations/*.sql` for any count-limit pattern — zero hits). Every project-scoped list in this codebase is unbounded and relies on a plain composite index for list performance. Recommend `(project*id, created*at, id)` or `(project*id, name)` for Test Plans depending on the list's default sort, with `id` as the stable tie-break/future keyset-pagination seek column — same reasoning `milestones*project*target*date*id*idx` documents. If plan volume ever becomes a real UX problem, it's a pagination/sort concern for the list view, not a hard cap on creation.

---

## Summary of ratified additions to BK-202's record

- ***T3***: BK-202 does not wait on BK-24 — build/estimate now (Jira Epic BK-24 status needs PO re-verification, appears stale vs. shipped code).
- ***T4***: No Delete for Test Plans, ever — Close is the sole exit from Open. Add to Out of Scope, epic-wide.
- ***T5***: Rename re-validates uniqueness, identical rule to create.
- Confirmed as non-negotiable NFR (not new): server-side role gate on every write, re-checked live, no client-role trust — reuse `bunkai*can*write_workspace` verbatim.
- Reused precedent (not new design): whitespace collapse-then-trim (table CHECK), DB-level unique index `(project_id, lower(name))`, error-copy pattern (`lib/.../errors.ts` shape), no-owner-restriction on edit, no-Delete-ever.
- New numeric decisions: description max 500 chars (reused), goal max 100 chars (new, PO-confirmable default).
- No per-project Test Plan count cap.
- ***No-precedent flags*** (genuinely greenfield, no existing code to reuse): `goal` field's max length; the new SQLSTATE error-code block to allocate for Test Plans (Milestones claimed the 455xx block; Test Plan needs its own, e.g. 456xx, per the file's own allocation-comment convention).

**Sources****:**** PO ruling and Dev ruling were each produced independently (parallel analysis, no cross-contamination) against the real **`upex-bunkai-tms`** codebase and this repo's **`.context/`** — both converged on the same evidence for every shared question, which is itself a signal these rulings are well-grounded rather than guessed.**

---

### Alfonso Hernandez - 8/19/2026, 1:08:40 AM

## Dependency check — Epic BK-24 (Tests)

Shift-left refinement flagged an open PO question: **"Should BK-202 stay in Estimation until epic BK-24 (Tests) ships, or is the plan container decoupled enough to build now against a stub?"**

***Resolved — BK-24 is already shipped, not pending.***

- Product code (`upex-bunkai-tms`, sibling repo): Tests entity has been live since `supabase/migrations/0024*tests.sql`, months before Milestones (`0064*milestones.sql`).
- All 4 BK-24 sub-items (BK-27, BK-28, BK-32, BK-33) show ***Ready For Release***, 100% completado.
- The epic's own Jira status ("Planificación") is stale relative to the real implementation — an administrative gap, not outstanding work. No code dependency blocks BK-202.

No change needed to scope or sequencing. BK-202 can be built against the real Tests entity, not a stub. Leaving this here so the open question doesn't get re-raised without context.

---


_Synced from Jira by sync-jira-issues_
