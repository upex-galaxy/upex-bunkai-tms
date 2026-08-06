# Comments for BK-211

[View in Jira](https://jira.upexgalaxy.com/browse/BK-211)

---

### Ely - 7/11/2026, 12:52:24 PM

## PO Ratification — 2026-07-11

- N4 — The recipient of a run's terminal events is ratified as the member who started the run (v1). Broader watcher/participant audiences are explicitly out of scope for this iteration and belong to a future story. The Business Rules field already reflects this; no change needed.

---

### Carlos Alberto Chiavassa - 7/18/2026, 10:12:57 AM

## Shift-Left QA Close-Out — Estimation & Handoff

> ***WARNING:**** ****Depends on BK-30 (Manual Execution & Runs, currently in Planning).*** The notification-creation logic
(self-suppression, executor parity, visibility filter) can be built now, but there is no real
run-terminal trigger to hook into until [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) ships. Flagging this prominently so PO can decide
sequencing — this story should not be picked up assuming the trigger already exists.

### PO Questions Resolved (QA refinement decisions, revisable by PO)

***Q1 — Visibility loss (GAP-1) — RESOLVED.*** When a run starter loses access to the workspace/project, her run-lifecycle notification stops being listed in the inbox — no visual mark, no explanatory message. Silent removal, not a degraded/placeholder state.
Precedent: [https://jira.upexgalaxy.com/browse/BK-27#icft=BK-27](https://jira.upexgalaxy.com/browse/BK-27#icft=BK-27) resolved the equivalent case for foreign-resource access as "identical 404 to a nonexistent resource — no disclosure," and the Class 3 RLS probe requires that user A only ever sees rows belonging to A. Consistent with the workspace-scoped pattern used throughout Bunkai.

***Q2 — Run-trigger automation surface (GAP-2) — RESOLVED.*** No `RunsApi`-equivalent trigger exists today. Declared an explicit upstream dependency on [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) (Planning, already diagnosed during BK-46's shift-left session) and a precondition for Stage 2 (`/test-automation`) — not a blocker to grooming or estimating this story now.
Precedent: [https://jira.upexgalaxy.com/browse/BK-27#icft=BK-27](https://jira.upexgalaxy.com/browse/BK-27#icft=BK-27) — "only 1 ATC in staging blocks 6/19 outlines" was documented as a precondition on the affected outlines, not treated as a reason to halt estimation. Same treatment applied here.

***Q3 — Self-suppression vs. executor parity (AMB-2) — QA-proposed, pending PO ratification (since 2026-07-17).*** An agent finishing a run at the starter's own request counts as an executor under the parity rule, not as the starter's own action — it notifies. Self-suppression stays scoped to the starter manually finishing/aborting herself. Not a fresh decision from this session — carried over, still awaiting PO sign-off.

### Estimation: 5 (Fibonacci)

| ***Perspective**** | ****Assessment*** |
| --- | --- |
| PO | Recipient scope already ratified (N4), clear business value, but the whole feature is sequenced behind [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) — a sequencing risk, not a requirements gap |
| Dev | Creation logic has 3 interacting rules (self-suppression x executor parity x silent visibility filter) against an event source that doesn't exist yet ([https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30)) — real business-rule complexity, not plain CRUD |
| QA | 4 ATCs, but 2 of 4 (the triggers) are blocked until [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) ships — today's automatable surface is thin; the decision table has 3 interacting factors vs. a simpler 2-factor grid elsewhere in this epic |

Kept at 5 rather than 3: resolving Q1/Q2 did not shrink this story the way it did for a sibling story in this epic — it turned an open ambiguity into a concrete rule to build (Q1) and confirmed a real, non-removable external dependency (Q2). Kept at 5 rather than 8: the inbox UI is 100% reused from the sibling display story (no new Page component), the preference gate is 100% reused from the sibling preferences story (no new logic there), and the [https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30) dependency is a sequencing risk, not an implementation-complexity multiplier once the event exists.

Full detail: `shift-left-refinement.md` §5 / §5.1.

---

### Ely - 7/30/2026, 1:29:32 PM

Mockup — Notifications inbox — run events. Source: .context/designs/bunkai-test-management-tool/bk-208-notifications/notifications-inbox.html · spec: master-design-plan §4.13



---

### Ely - 8/5/2026, 4:08:45 PM

> ***NOTE:**** ****Authored by the ****`AI Product Owner / Business Analyst`**** profile**** of the same AI team that designs, specifies and builds Bunkai TMS, per `CLAUDE.md` Critical Rule #18. This is ****not*** a human PO sign-off and must not be read as one. Each decision below enumerates its candidate answers, scores them, and writes out the reasoning, so a future agent run can implement without re-opening the question.

***Sources read before deciding******:*** `.context/PRD/`, `.context/SRS/`, `.context/business/domain-glossary.md` and `business-data-map.md`, `.context/design/master-design-plan.md` (§4.13 and §5 D17), the mockup `.context/designs/bunkai-test-management-tool/bk-208-notifications/notifications-inbox.html`, this Story's own fields and full comment trail, the shipped siblings BK-209 / BK-212 / BK-213, and the live code: `supabase/migrations/0031*runs.sql`, `0036*run*abort.sql`, `0037*run*finish.sql`, `0053*notifications.sql`, `0056*bug*event*notifications.sql`, `0062*notification_preferences.sql`, `lib/notifications/view.ts`, `entity-routes.ts`, `components/notifications/NotificationRow.tsx`.

***Scoring model******:*** five criteria, 1 to 5 each, 25 maximum. Product value · consistency with existing precedent · implementation cost (5 = cheapest) · reversibility · risk (5 = lowest risk).

---

## Status note before the decisions: the 2026-07-18 dependency warning is now stale

The QA close-out opened with a prominent warning that this Story "should not be picked up assuming the trigger already exists" because BK-30 was in Planning. ***That is no longer accurate.*** Verified against the live code today:

| What the warning required | Current state |
| --- | --- |
| A run-terminal trigger to hook into | `bunkai*finish*run` (`0037*run*finish.sql`, BK-39) and `bunkai*abort*run` (`0036*run*abort.sql`, BK-36) both shipped |
| An event vocabulary for run events | `run.finished` and `run.aborted` are already the rendered vocabulary in `lib/notifications/view.ts` |
| A deep-link route for a run notification | Already implemented: `entity-routes.ts` resolves `run` to `/projects/{projectSlug}/runs/{runId}` |
| A preference channel for these events | `run*lifecycle` is already a valid `event*type` in `0062*notification*preferences.sql` (BK-213) |
| The inbox surface | BK-209 shipped (Ready For QA), panel and row components live |

BK-30 the ***epic**** still reads Planning, but its two relevant child stories are Ready For Release and QA Approved. Q2's "explicit upstream dependency" is satisfied. ****This Story is buildable now and is not blocked.***

---

## AI Product Owner — Decision: Self-suppression vs. executor parity (AMB-2). Does an agent finishing a run at the starter's own request notify the starter?

***The exact question found on the ticket, quoted verbatim*** (Carlos Alberto Chiavassa, 2026-07-18, still flagged "QA-proposed, pending PO ratification since 2026-07-17"):

> "Q3 — Self-suppression vs. executor parity (AMB-2) — QA-proposed, pending PO ratification (since 2026-07-17). An agent finishing a run at the starter's own request counts as an executor under the parity rule, not as the starter's own action — it notifies. Self-suppression stays scoped to the starter manually finishing/aborting herself. Not a fresh decision from this session — carried over, still awaiting PO sign-off."

***DECISION******:****** the QA proposal is NOT ratified as written. Self-suppression is decided by the acting user identity alone.**** If the authenticated actor who finishes or aborts the run is the same user as the run's starter, no notification is created, ****regardless of ***`executor*mode`. Any other actor notifies, also regardless of `executor*mode`. There is no `executor_mode` branch anywhere in the rule.

| # | Candidate | Value | Precedent | Cost | Reversibility | Risk | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | Ratify as proposed: an agent acting for the starter notifies her | 3 | 2 | 1 | 3 | 2 | ***11*** |
| B | ***Suppress on actor identity alone******:****** ****`actor ≠ recipient`****, no executor branch**** | 4 | 5 | 5 | 5 | 5 | ****24*** |
| C | Hybrid: suppress only when `actor = starter` AND `executor_mode = 'human'` | 2 | 2 | 3 | 3 | 3 | ***13*** |

***Rationale, and why A is not implementable as stated.**** `bunkai*finish*run` and `bunkai*abort*run` both take `p*actor*user*id uuid` referencing `auth.users`. An AI Test Agent or a CI pipeline authenticates with a PAT that resolves to a user, and `0037*run_finish.sql` records this explicitly in its own header: "A human cookie session, an AI Test Agent, or a CI pipeline (PAT) all pass the SAME gate, finish handling is executor-agnostic". So when an agent acts on Elena's behalf using Elena's credential, ****the actor is Elena***. There is no distinguishable agent principal to observe. Ratifying A would require inventing one (a service-account or agent-identity concept), which is net-new auth work in a 5-point story whose Out of Scope list already excludes far smaller things. That is why A scores 1 on cost.

B matches three independent precedents at once:

- ***This Story's own AC5***, verbatim: "When Elena herself finishes that run with the verdict passed, then no notification about that run appears in her inbox."
- ***The shipped BK-212 trigger.*** `0056*bug*event*notifications.sql` filters recipients with `r is distinct from new.actor*user_id`. Actor identity, nothing else. Building BK-211 on a different axis would fork the notification model across two sibling stories in the same epic.
- `business-data-map.md`, which states that `executor.type ∈ {human, agent, ci}` "is metadata, not a switch". C exists purely to introduce the switch that sentence forbids, which is why it scores 2 on precedent.

***The part that makes this decision cheap rather than merely correct******:**** B does not permanently reject QA's **intent*, it defers it to the day the intent becomes observable. The rule "actor ≠ recipient" is written once and never touched again. If Bunkai later gives AI Test Agents their own identity, the agent simply becomes a different actor and Elena starts receiving exactly the notification QA wanted, with zero rule changes and zero migration. That is reversibility 5 in the strict sense: the desired future behaviour arrives for free.

***Implication for the Business Rules field.**** The existing line "The actor never self-notifies: if the run starter is also the person finishing or aborting, no notification is created" is correct as written and needs no change. It should ****not*** be amended with an executor-mode caveat.

> ***WARNING:**** ****Handed to the AI Tech Lead.**** The recipient is "the run starter", but `public.runs` has ****no ****`started*by`**** column***. `0031*runs.sql` stamps `executor*user*id` with `p*actor*user*id` at start, so that column currently doubles as the starter and is the only candidate. Two things for Tech Lead to rule on: (a) whether BK-211 reads `executor*user*id` as the starter, or whether the semantic mismatch (a column named "executor" carrying "starter") warrants an explicit `started*by`; (b) `executor*user*id` is `on delete set null`, so a deleted user yields a null recipient, which must not produce an orphan or a failed insert. Product's position: either column choice satisfies this decision, and a null recipient means no notification, silently, consistent with the Q1 visibility ruling.

---

## AI Product Owner — Decision: What does a run-event notification row actually say? (open, undocumented, found during this review)

This was never raised on the ticket, and it is a genuine conflict that a dev run would otherwise resolve by guessing. ***The shipped inbox already renders these events, and it renders them wrong for this Story.**** `lib/notifications/view.ts` returns the bare text `Run finished` and `Run aborted` with ****no test name***. AC1 requires "Run finished: Login regression chain — passed", and §4.13's mockup draws "Run finished: Checkout happy path" with a separate verdict chip. Without the test name every row in the inbox is identical and Elena cannot tell which of her runs finished.

***DECISION******:****** the title carries the test name; the verdict is a chip, not prose.***

| # | Candidate | Value | Precedent | Cost | Reversibility | Risk | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | ***Title ****`Run finished: {test title}`**** plus the existing ****`status-chip`**** for the verdict**** | 5 | 5 | 5 | 5 | 5 | ****25*** |
| B | Title `Run finished: {test title} — passed`, verdict inline as prose, no chip | 4 | 2 | 4 | 4 | 4 | ***18*** |
| C | Leave the shipped bare `Run finished` and let the chip carry everything | 1 | 3 | 5 | 5 | 2 | ***16*** |

***Rationale.*** A is the shape the shipped component was already built for: `NotificationRow.tsx` renders `title.text`, then `title.signal` as a `status-chip`, then `title.reason` on a second line. The mockup draws exactly that. This Story's own Business Rules field asks for a "verdict chip reusing the exact chip styles of the run history views", which B would discard by re-encoding the verdict as prose and forking the vocabulary away from the run views. The standing colour-is-never-the-sole-signal rule is satisfied because the chip carries its text label (`passed` / `failed` / `aborted`) alongside the colour. Cost is 5 because `runs.test*title` is already a start-time snapshot column, so the notification payload can carry the test name without joining live tables, which `0053*notifications.sql` explicitly requires of this inbox ("the inbox never has to join live runs/tests/bugs to render a summary").

***Ratified row vocabulary, so nothing is invented at build time******:***

| Event | Title text | Chip | Second line |
| --- | --- | --- | --- |
| `run.finished`, verdict passed | `Run finished: {test title}` | `passed` (pass signal) | none |
| `run.finished`, verdict failed | `Run finished: {test title}` | `failed` (fail signal) | none |
| `run.aborted` | `Run aborted: {test title}` | `aborted` (aborted signal) | `Reason: {abort reason}` |

***Ruling on AC1's literal string, to prevent a wrong assertion in automation.**** AC1's "Run finished: Login regression chain — passed" is ****prose describing the rendered row*** (name plus verdict), not a demand for one concatenated string containing an em dash. A test asserting the concatenated form would be asserting something this decision does not require. The AC is satisfied by title plus chip.

***Handed to the AI Tech Lead******:*** the `run.finished` / `run.aborted` payload must include the test title (source: `runs.test*title`, the start-time snapshot) and the abort reason, alongside whatever `project*slug` and run id `entity-routes.ts` already needs for the deep link. The `view.ts` branches for these two event types are extended, not replaced.

---

## Summary of this comment

| Question | Ruling |
| --- | --- |
| Q3 self-suppression vs executor parity (open since 2026-07-17) | QA proposal ***not ratified as written***. Suppression is on actor identity alone, no `executor_mode` branch. The proposal's intent arrives automatically if agents ever get their own identity. |
| Run-event row copy (found during this review) | Title carries the test name; verdict is a chip; aborted carries `Reason:` on a second line. AC1's string is prose, not a literal assertion target. |
| Q1 visibility loss, Q2 BK-30 dependency | Already resolved by QA and unchanged. Q2's blocker is now ***stale***: the run terminal RPCs, the event vocabulary, the deep-link route and the `run_lifecycle` preference channel all exist. |

***Genuinely not decidable at product level******:*** nothing. Both remaining questions were answerable from the existing context surface. This Story has no live dependency blocker and no missing shift-left refinement.

---

### Ely - 8/5/2026, 4:27:56 PM

> ***NOTE:**** Authored by the ****AI Tech Lead**** profile of the same AI team that designs, specifies and builds Bunkai TMS, per `CLAUDE.md` Critical Rule #18. This is ****not*** a human tech-lead sign-off and must not be read as one. It closes the three implementation-shape items the AI Product Owner handed over on 2026-08-05 (comment 12169) and specifies the migration a dev run writes without re-deciding anything.

***Scoring model***, identical in every block: six criteria, 1 to 5 each, 30 maximum. Correctness · consistency with shipped precedent · implementation cost (5 = cheapest) · reversibility · security / ADR-0012 compliance · performance.

***Verified against the live database and the live code, not quoted from the record.*** Read-only SQL against project `fmbpikzpkafptqximhxn`; migrations `0031`, `0036`, `0037`, `0040`, `0053`, `0055`, `0056`, `0057`, `0062`; `lib/notifications/view.ts`, `entity-routes.ts`, `group-by-day.ts`; `lib/home/active-runs.ts`; ADR-0001, ADR-0010, ADR-0011, ADR-0012; `.claude/skills/sprint-development/references/rpc-authorization.md`.

### Facts established by that verification, before any decision rests on them

| Claim | Verified state |
| --- | --- |
| `public.runs` has no `started*by` | ***Confirmed.*** The column does not exist. `executor*user*id uuid references auth.users(id) on delete set null` does, and `bunkai*create*run` inserts `p*actor*user*id` into it (`0031*runs.sql:400-407`, restated identically in `0040*run*module*snapshot.sql:271`). |
| `runs.test*title` is a start-time snapshot | ***Confirmed*** live: `text not null`, written from `v*test_title` at start. |
| `notifications.recipient*user*id` is `not null` | ***Confirmed*** live. A null recipient cannot be inserted at all; this is a hard constraint, not a style preference. |
| `notifications.source*event*id` + `notifications*source*event*recipient*key` already exist | ***Confirmed**** live (added by `0056`). BK-211 needs ****no*** schema change to `notifications`. |
| The `run` arm of `entity*available` already exists | ***Confirmed***: `bunkai*list*notifications`' CASE has `when 'run' then exists (select 1 from public.runs r where r.id = k.entity*id)` since `0053`. No migration needed for it. |
| Run notifications currently in the table | ***Zero.**** `select count(**) from notifications where entity_type = 'run'` returns 0, so there is no legacy payload shape to stay compatible with. |
| Historical terminal activity rows | ***81*** rows with `action in ('run.finished', 'run.aborted')` already in `activity_log`. See the no-backfill ruling below; this number is why it needed to be an explicit ruling. |

> ***ERROR:**** ****One item on the record does not survive verification.**** The estimation note states "the preference gate is 100% reused from the sibling preferences story (no new logic there)". There is nothing to reuse. ****No producer anywhere in this codebase reads ***`notification*preferences` — `bunkai*notify*bug*event` (`0056`/`0057`), the shipped BK-212 producer, does not consult it, and a repository-wide search finds the table referenced only by the BK-213 write-path route and its own test. The preference grid currently controls nothing about delivery. This is ruled on below (BK-211 does not build one either) and recorded as debt.

---

## AI Tech Lead — Decision: is the recipient `runs.executor*user*id` as-is, or does BK-211 add an explicit `started_by`?

***DECISION******:****** read ****`runs.executor*user*id`**** as the starter. No schema change to ****`public.runs`****. The semantic mismatch is a naming debt, recorded, and deliberately not fixed inline.***

| # | Candidate | Correct | Precedent | Cost | Revers. | Security | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | ***Read ****`executor*user*id`**** as the starter**** | 5 | 5 | 5 | 5 | 5 | 5 | ****30*** |
| B | Add `runs.started*by`, backfill from `executor*user*id`, restate `bunkai*create_run` to stamp both | 5 | 3 | 2 | 3 | 3 | 4 | ***20*** |
| C | Add `started_by`, populate forward-only, no backfill | 2 | 2 | 3 | 3 | 3 | 4 | ***17*** |
| D | Add `started*by` and rename `executor*user_id` to match its real meaning | 5 | 1 | 1 | 1 | 2 | 4 | ***14*** |

### Rationale

***The value is provably the starter, and the codebase already relies on that.*** `bunkai*create*run` writes `executor*user*id = p*actor*user*id` in the same statement that creates the run. There is no code path anywhere that writes the column afterwards, and neither `bunkai*finish*run` nor `bunkai*abort*run` touches it (verified: both update only `status`, `finished*at`, `abort_reason`, `version`). `lib/home/active-runs.ts` already treats it as the starter and documents the reasoning in its own comment. A is therefore not a compromise; it reads the column that holds the fact.

***B's cost is not "one column".**** `bunkai*create*run` is a live `SECURITY DEFINER` function, and the current version is not `0031`'s: it was restated by `0040*run*module*snapshot.sql`. Adding a stamp means re-deriving and re-declaring that whole body (Postgres has no "ALTER FUNCTION body" primitive), plus a backfill, plus typegen. `0058*atc*title*min_length.sql` already recorded this project's position on that trade in its own header: "replacing an existing live SECURITY DEFINER function is a bigger, riskier change than adding a constraint... the blast radius of a mistyped CREATE OR REPLACE is larger". BK-211 gains ****no behaviour*** from paying it: the new column would hold a byte-identical value to the existing one on every row, forever, until some future story actually separates the two roles.

***B's reversibility is worse than A's, which is counter-intuitive and is the point.**** Under A, the day a story genuinely separates "who started" from "who executed", `started*by` is added **then**, with the backfill `started*by = executor*user*id`, which is ****exactly correct for every historical row*** precisely because today they are the same by construction. Adding the column now buys nothing that adding it later does not, and it commits the schema to a distinction the product does not yet make.

***C is the one that is actually unsafe.*** A run started before the migration and finished after it would carry a null `started_by` and silently notify nobody. That is a real, dated defect window in the story's own primary path, and it is why C scores 2 on correctness.

***D was scored because it is the honest fix and it must be visibly rejected, not ignored.*** Renaming `executor*user*id` touches `0031`, `0036`, `0040`, `bunkai*run*json`, `lib/home/active-runs.ts`, `app/api/v1/runs/route.openapi.ts`, `lib/types/supabase.ts`, and three test files. That is a dedicated refactor ticket with its own regression budget, not a 5-point notification story. This is `rpc-authorization.md` §6's rule applied verbatim: "Record what you found, size it as its own work, and stay in scope."

### The null-recipient case, ruled precisely

`executor*user*id` is `on delete set null`, so a deleted account leaves a run with a null starter. `notifications.recipient*user*id` is `not null` (verified). So the two cannot meet, and the correct handling is not a matter of taste:

> ***WARNING:**** A null recipient is a ****silent early return from the trigger***, before any insert is attempted. Never a null insert (it would raise `23502` and, from an `AFTER INSERT` trigger, roll back the finish or abort that fired it). Never an orphan row. The trigger must be incapable of raising, full stop, mirroring `0056`'s own header: "a defect in this producer can never raise out of an AFTER INSERT trigger and roll back the bug mutation that fired it".

This also matches the AI Product Owner's stated position ("a null recipient means no notification, silently") and is coherent in the other direction too: `notifications.recipient*user*id` references `auth.users(id) on delete cascade`, so notifications already delivered to a user who is later deleted are removed with the account. Both directions leave no dangling state.

***Closing a run must always outrank notifying about it.*** If the trigger cannot resolve a run row at all, it returns without inserting, exactly as `bunkai*notify*bug_event` does when it cannot resolve a bug title.

---

## AI Tech Lead — Decision: trigger or RPC body, and how is `actor ≠ recipient` suppression enforced?

***DECISION******:****** an ****`AFTER INSERT ON public.activity*log`**** trigger with a ****`when`**** guard, identical in shape to the shipped ****`bunkai*notify*bug*event`****. Suppression is one predicate in the body, on actor identity alone. BK-211 modifies zero live functions.***

| # | Candidate | Correct | Precedent | Cost | Revers. | Security | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | `AFTER INSERT ON activity*log`***, ****`when (entity*type = 'run' and action in (...))` | 5 | 5 | 5 | 5 | 5 | 5 | ****30*** |
| B | Inline the insert into `bunkai*finish*run` and `bunkai*abort*run` bodies | 4 | 2 | 2 | 3 | 3 | 5 | ***19*** |
| C | `AFTER UPDATE ON public.runs`, keyed on the status transition | 1 | 2 | 3 | 3 | 4 | 4 | ***17*** |

### Rationale

***A is the in-epic precedent, and it fits for the same reason ****`0056`**** gave.*** Both producers already write their `activity*log` row inside the same transaction as the mutation, so a trigger on that write gets the notification for free, inside that transaction, without either RPC needing to know BK-211 exists. Everything the producer needs is already on the triggering row: `new.workspace*id`, `new.actor*user*id` (the finisher, which is what suppression keys on), `new.entity*id` (the run), `new.action` (which becomes `event*type` verbatim), `new.payload ->> 'verdict'` and `new.payload ->> 'reason'`, and `new.id` as the idempotency token.

***C is disqualified on a hard mechanical fact, not a preference.**** An `AFTER UPDATE ON runs` trigger has ****no access to who performed the terminal action***. `public.runs` carries no finisher column; `executor*user*id` is the starter and is never rewritten. Self-suppression, which is AC5, would be unimplementable. Secondly, `bunkai*finish*run` bumps `version` on the same statement, so distinguishing the terminal update from any other row update becomes a fragile predicate over old and new status. Correctness 1.

***B duplicates the payload builder in two live DEFINER functions*** and requires restating both `0036` and `0037` bodies wholesale, incurring exactly the blast-radius cost rejected in the previous decision, for a strictly worse structure: one producer becomes two, which drift.

### Suppression, and the structural proof the ratified rule is honoured

```sql
-- Recipient = the run's starter. Suppression on ACTING USER IDENTITY ALONE.
-- `executor_mode` is not read anywhere in this function; there is no branch
-- to drift. Same axis and same operator as the shipped BK-212 producer
-- (0056: `r is distinct from new.actor*user*id`).
if v*recipient is null or v*recipient is not distinct from new.actor*user*id then
  return new;
end if;
```

The AI Product Owner ruled "there is no `executor*mode` branch anywhere in the rule". The strongest available proof of that is not a comment saying so: it is that ***the trigger never selects ***`executor*mode`. It is absent from the function's only `select` on `public.runs`, so the rule cannot be violated by a later edit without someone deliberately adding a column read.

`is distinct from` rather than `<>` is deliberate and is `0056`'s operator: `activity*log.actor*user_id` is nullable (verified live), and `<>` against a null yields null, which is not false, and would silently suppress every notification for an unattributed event. `is not distinct from` treats null as a value and notifies correctly.

### AC1's agent scenario, ruled so automation does not assert something the rule does not guarantee

AC1 has "an AI agent executor" finishing Elena's run and Elena being notified. Under the ratified identity-only rule that holds ***only when the agent's PAT resolves to a different user than Elena****. The Product Owner's own rationale establishes why: an agent acting with Elena's credential **is* Elena, and in that case AC5 governs and producing no notification is the correct outcome, not a defect.

> ***Binding on the acceptance automation.**** AC1's fixture must finish the run as a ****distinct user**** (a CI or service member of the same workspace). It must ****not*** assert that `executor_mode = 'agent'` by itself produces a notification, and it must not be written so that it would pass only because the executor mode differed. The property under test is `actor ≠ starter`, and that is what the assertion should read.

### No backfill

The trigger is `AFTER INSERT` and does not fire retroactively. ***That is the intended behaviour and no backfill migration is written.*** There are 81 historical `run.finished` / `run.aborted` rows in `activity*log` (verified). Back-notifying them would drop a wall of stale items into inboxes for runs closed weeks ago, most of them already outside the 90-day retention window `notifications*select*recipient*member_retained` enforces, and none of which any user is waiting on. BK-211 notifies about runs that finish from the moment the trigger is applied.

---

## AI Tech Lead — Decision: the exact `run.finished` / `run.aborted` payload

***DECISION******:****** a per-action positive projection carrying ****`title`****, ****`project*slug`****, and the one verdict-or-reason field the shipped renderer already reads. Nothing else. No ****`run*id`****.***

```json
// event*type "run.finished"  ·  entity*type "run"  ·  entity_id = the run id
{
  "title":        "Login regression chain",
  "project_slug": "checkout-web",
  "verdict":      "passed"
}
```

```json
// event*type "run.aborted"  ·  entity*type "run"  ·  entity_id = the run id
{
  "title":        "Profile settings chain",
  "project_slug": "checkout-web",
  "reason":       "Wrong build deployed"
}
```

| # | Candidate | Correct | Precedent | Cost | Revers. | Security | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | `title`*** + ****`project_slug`**** + ****`verdict`****/****`reason`****, per-action projection**** | 5 | 5 | 5 | 5 | 5 | 5 | ****30*** |
| B | Same, but the key is `test_title` instead of `title` | 5 | 2 | 5 | 4 | 5 | 5 | ***26*** |
| C | Blanket copy: `new.payload || jsonb*build*object('title', ..., 'project_slug', ...)` | 3 | 1 | 5 | 3 | 3 | 4 | ***19*** |
| D | A, plus `run_id` and `verdict` duplicated into a `signal` object | 4 | 3 | 4 | 4 | 5 | 4 | ***24*** |

### Rationale

***A is the only shape that leaves the shipped renderer's existing keys untouched.**** `lib/notifications/view.ts` already reads `payload.verdict` for `run.finished` and `payload.reason` for `run.aborted`, and already reads `payload.title` for the bug branch that `0056` writes. Choosing `title` means the run branch and the bug branch share one convention for "the human name of the thing this notification is about", and the `view.ts` change becomes purely additive: ****prepend the title, touch nothing else***, which is exactly what the Product Owner specified ("extended, not replaced"). B is correct but forks that vocabulary across two branches of the same switch for no gain.

`run*id`*** is deliberately absent, and this is the one omission worth stating explicitly**** because the sibling producer carries it. For `entity*type = 'run'`, `entity*id`**** *******is******* the run id***, and `resolveNotificationHref`'s `run` case builds `/projects/{project*slug}/runs/{entity*id}` from exactly those two values (verified in `lib/notifications/entity-routes.ts`). `0057` had to add `run*id` to the bug payload only because a bug's `entity_id` is a bug, not a run, and the bug deep link lands on the run-detail page. Copying that field here would ship a payload key nothing reads.

***C violates the projection convention ****`0055`**** established as "Decision 3 / Risk R3" and ****`0056`**** restated***, and it would carry `skipped_steps` into the inbox payload, an internal counter no surface renders and no AC mentions.

`project*slug`*** requires the join and is not optional.**** `0053`'s design constraint is that "the inbox never has to join live runs/tests/bugs to render a summary", and `entity-routes.ts` states it as a wire contract: "the payload snapshot is the ONLY source for `project*slug`". A payload without it yields ****no deep link***, silently failing AC1's "clicking it takes her to that run". The trigger therefore looks up `public.runs` joined to `public.projects` by `new.entity_id`, mirroring `0056`'s `bugs join projects` lookup exactly.

### The `lib/notifications/view.ts` change, specified

Both run branches gain the title, with a defensive fallback that degrades to the currently-shipped copy rather than rendering a dangling colon:

```ts
if (eventType === 'run.finished') {
  const testTitle = typeof payload.title === 'string' && payload.title.length > 0 ? payload.title : null;
  const verdict = payload.verdict;
  const signal: NotificationTitleView['signal'] = verdict === 'passed'
    ? { label: 'passed', status: 'pass' }
    : verdict === 'failed'
      ? { label: 'failed', status: 'fail' }
      : null;
  return { text: testTitle === null ? 'Run finished' : `Run finished: ${testTitle}`, signal, reason: null };
}
```

and the same for `run.aborted` (`Run aborted: {title}`, `aborted` signal, `reason` on the second line). The fallback is defensive, not the expected path, exactly as `0056` and `view.ts`'s own bug branch describe theirs: this producer never inserts a row without a resolved `test*title`, because `runs.test*title` is `not null`.

The ratified row vocabulary needs ***no new component work***: `NotificationRow.tsx` already renders `title.text`, then `title.signal` as a `status-chip`, then `title.reason` on a second line. The `Reason: {abort reason}` second line is produced by the existing `reason` field. Nothing in `components/notifications/` changes.

---

## AI Tech Lead — Decision: the migration shape, and ADR-0012 compliance

***DECISION******:****** one additive migration, ****`0065*run*event*notifications.sql`****, containing one trigger function and one trigger. No table change, no column change, no new SQLSTATE, no modification to any existing function.*** Numbering must be re-verified against the live ledger at Stage 2 start (`mcp**supabase**list*migrations`), per `0056`'s own note.

> ***WARNING:*** Subject to `.agents/project.yaml` -> `autonomous_delivery.migrations: confirm`. The dev run writes the file and its test; a human approves and applies it.

```sql
create or replace function public.bunkai*notify*run_event()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
declare
  v*test*title   text;
  v*project*slug text;
  v_recipient    uuid;
  v_payload      jsonb;
begin
  -- Snapshot the run's start-time test title, its project slug, and its
  -- starter, scoped to THIS run (new.entity*id) only. `executor*user_id` is
  -- the starter: bunkai*create*run stamps it with p*actor*user_id at start and
  -- no path rewrites it. `executor_mode` is deliberately NOT selected.
  select r.test*title, p.slug, r.executor*user_id
    into v*test*title, v*project*slug, v_recipient
    from public.runs r
    join public.projects p on p.id = r.project_id
    where r.id = new.entity_id;

  -- Nothing to snapshot: never raise out of an AFTER INSERT trigger, or the
  -- finish/abort that fired it rolls back (0056 header, verbatim reasoning).
  if v*test*title is null then
    return new;
  end if;

  -- Null recipient (starter's account deleted -> on delete set null) or the
  -- actor is the starter: no notification, silently. Suppression is on acting
  -- user identity ALONE, no executor_mode branch (0056: `r is distinct from
  -- new.actor*user*id`).
  if v*recipient is null or v*recipient is not distinct from new.actor*user*id then
    return new;
  end if;

  if new.action = 'run.finished' then
    v*payload := jsonb*build_object(
      'title', v*test*title,
      'project*slug', v*project_slug,
      'verdict', new.payload -> 'verdict'
    );
  else -- 'run.aborted'
    v*payload := jsonb*build_object(
      'title', v*test*title,
      'project*slug', v*project_slug,
      'reason', new.payload -> 'reason'
    );
  end if;

  insert into public.notifications (
    workspace*id, recipient*user*id, event*type, entity*type, entity*id, payload, source*event*id
  )
  values (
    new.workspace*id, v*recipient, new.action, 'run', new.entity*id, v*payload, new.id
  )
  on conflict (source*event*id, recipient*user*id) do nothing;

  return new;
end;
$$;

drop trigger if exists activity*log*notify*run*event on public.activity_log;
create trigger activity*log*notify*run*event
  after insert on public.activity_log
  for each row
  when (
    new.entity_type = 'run'
    and new.action in ('run.finished', 'run.aborted')
  )
  execute function public.bunkai*notify*run_event();
```

Three things that are already in place and must ***not*** be re-added: `notifications.source*event*id` and `notifications*source*event*recipient*key` (added by `0056`, verified live, which is what makes the `on conflict` clause above legal); the `run` arm of `bunkai*list*notifications`' `entity_available` CASE (`0053`); and Realtime replication on `public.notifications` (`0053`, per ADR-0010), which is what satisfies AC4 with no work in this story.

### ADR-0012 six-question checklist, answered

| # | Question | Answer |
| --- | --- | --- |
| 1 | Needs `SECURITY DEFINER`? | ***Yes, by necessity.**** The function writes a `notifications` row on behalf of the ****recipient***, who by the suppression rule is never `auth.uid()`, and `notifications` deliberately carries no INSERT policy for authenticated clients at all (`0053`: "Rows arrive only via a future producer SECURITY DEFINER function"). BK-211 is one of the producers that comment names. Declared explicitly rather than relying on incidentally inheriting its DEFINER callers' role, mirroring `0056` and `0054`. |
| 2 | Can the identity parameter be removed? | ***There is none to remove.*** A trigger function takes no arguments of any kind. |
| 3 | Where is the actor bind, at step 0? | ***Vacuous by construction**** — there is no caller-supplied parameter to spoof, which is `rpc-authorization.md` §2's strongest outcome rather than an exemption from §3. `0056`'s header reached the identical conclusion for the identical shape. This story adds ****zero*** functions to ADR-0012's closed set of 22 unbound `p*actor*user_id` functions. |
| 4 | Which returned rows cross a tenant boundary, and what constrains each one? | ***The function returns nothing; the question applies to what it writes.**** Every inserted row is scoped to `new.workspace*id`, taken from the `activity*log` row this trigger fires on, which `bunkai*finish*run` / `bunkai*abort*run` bound to the run's ****own**** `workspace*id` (never a caller-supplied value) before writing it. The recipient is computed ****only*** from `public.runs` looked up by `new.entity*id`, the run this activity row is about, never from an external input. `project*slug` and `test*title` are read-only lookups scoped to that same run. There is no caller-supplied id anywhere in the function. |
| 5 | Does the failure path disclose existence? | ***The function has no failure path by design*** — it never raises, and returns silently on an unresolvable run, a null recipient, or a self-action. Read visibility is unchanged and stays with `notifications*select*recipient*member*retained` (`0053`), which is what already delivers the ratified Q1 behaviour: a starter who loses workspace access stops seeing the row, silently, with no placeholder. |
| 6 | Which test proves it against the real database? | `lib/notifications/run-event-trigger-isolation.test.ts`, shipping ***in the same slice as the migration****, modeled on `lib/notifications/bug-event-trigger-isolation.test.ts`. Minimum coverage: (a) a teammate finishes a run started by the fixture user, one notification row appears with the correct `title` / `verdict` / `project*slug`, `source*event*id` set; (b) the starter finishes her own run, ****zero**** rows (AC5); (c) abort by a teammate produces `reason` in the payload; (d) a run whose `executor*user*id` was set to null produces zero rows and ****the abort/finish still succeeds***; (e) the same `activity*log` id cannot produce two rows for one recipient (idempotency); (f) the notification's `workspace*id` matches the run's, and a member of another workspace never sees the row through `bunkai*list_notifications`. Per `live-ui-identity.md`: sign in through the real auth path, service-role for fixture seed and teardown only. |

> ***ERROR:*** Item (d) is the regression test for the `not null` recipient column and is the one that would catch a producer built to insert a null. Item (b) is AC5 and is the only test that distinguishes this implementation from one carrying an `executor_mode` branch.

### Ruled out of scope, with the gap recorded rather than silently left

***BK-211 does not implement a ****`notification*preferences`**** filter***, and this is a decision, not an omission. Three reasons, in order of weight: `out-of-scope.md` assigns muting and channel selection to the sibling preferences story; the shipped BK-212 producer does not filter either, so adding one here would make run events the only mutable class and fork the notification model across two siblings in one epic, which is the exact objection the Product Owner used to reject the `executor*mode` branch; and there is no existing filter to reuse, contrary to the estimation note.

The gap is real and belongs to a follow-up: `notification*preferences` rows for `run*lifecycle` and `bug*lifecycle` on the `in*app` channel are currently writable by users and consulted by no producer, so toggling one off changes nothing. That is a shared filter added to ***both*** producers in one pass, with one test contract, not a BK-211 side effect.

---

## Summary

| # | Question handed over | Ruling | Runner-up rejected | Score |
| --- | --- | --- | --- | --- |
| 1 | Recipient column: `executor*user*id` or a new `started*by` | Read `executor*user*id`. No change to `public.runs`. Null recipient is a silent early return, never a null insert; the trigger cannot raise | Adding `started*by` with a backfill, which restates a live DEFINER function to store a byte-identical duplicate value and gains no behaviour | 30 / 30 |
| 2 | Trigger or RPC-body emission, and how suppression is enforced | `AFTER INSERT ON activity*log` with a `when` guard (`0056` shape); suppression is `v*recipient is not distinct from new.actor*user*id`; `executor_mode` is never read | An `AFTER UPDATE ON runs` trigger, which has no access to who performed the terminal action and therefore cannot implement AC5 at all | 30 / 30 |
| 3 | The `run.finished` / `run.aborted` payload | `{ title, project*slug, verdict }` and `{ title, project*slug, reason }`, per-action positive projection, no `run*id` | Naming the key `test*title`, which forks `view.ts`'s vocabulary from the bug branch for no gain | 30 / 30 |
| 4 | Migration shape | One additive `0065*run*event_notifications.sql`: one trigger function, one trigger, no schema change, no new SQLSTATE, no existing function modified | — | — |

***BK-211 is implementable with no remaining ambiguity***, with one caveat that is a test-authoring instruction rather than an open question: AC1's agent fixture must finish the run as a distinct user, per the ruling above, or it asserts something the ratified rule does not guarantee.

---

### Ely - 8/6/2026, 3:19:54 PM

## AI Product Owner — Decision: BK-211 Q3 (self-suppression vs. executor parity)

> ***INFO:**** Decided by the ****AI Product Owner / Business Analyst**** profile under CLAUDE.md Critical Rule #18 (this project is designed and specified end-to-end by AI; an open product question on a ticket is work to do, not a blocker). This is ****not*** a human PO sign-off. Method per Rule #18: alternatives enumerated, scored against weighted criteria, reasoning written out.

### The question

Carried over from the shift-left close-out (Carlos Alberto Chiavassa, 2026-07-18), open since 2026-07-17:

BK-211 notifies the run starter when their run reaches a final verdict or is aborted, and suppresses that notification when the starter ends the run herself. ***When the run is ended by an automated agent / API caller acting on the starter's behalf, does that count as the starter's own action (suppress) or as a distinct executor (notify)?***

### Finding 1 — the ratified fields already answer the "notify vs suppress" half

Q3 was framed as an open ambiguity, but three separate ***already-ratified*** BK-211 fields answer it in the same direction:

| Ratified field | Text | Reads as |
| --- | --- | --- |
| Acceptance Criteria, Scenario 1 | "And ***an AI agent executor finishes that run*** with the final verdict passed … Then she sees an unread notification" | Notify |
| Acceptance Criteria, Scenario 4 | "When ***an agent finishes a run she started*** … Then the new notification appears in the panel in real time" | Notify |
| Acceptance Criteria, Scenario 5 | "When ***Elena herself*** finishes that run … Then no notification about that run appears in her inbox" | Suppress |
| Business Rules | "The actor never self-notifies: if the run starter is also ***the person*** finishing or aborting" | Suppress scoped to a person |
| Business Rules | "Runs executed by any executor kind (human, agent, or CI) notify identically — executor parity is preserved" | Parity |
| Workflow | "hands it to the team's AI agent to execute … Twenty minutes later the bell badge ticks up" | Notify |

So the QA-proposed answer is not a new position — it is a restatement of the AC. ***What is genuinely open, and what this decision resolves, is the identity comparison the code must make****, because the obvious implementation of "notify unless the actor is the starter" produces the **wrong* answer for Scenario 1 under this codebase's own auth model. See Finding 3.

### Finding 2 — shipped precedent in code (BK-212)

`supabase/migrations/0056*bug*event*notifications.sql:175` — the self-exclusion clause on `bug.status*changed`:

```sql
select coalesce(array_agg(distinct r), array[]::uuid[])
  into v_recipients
  from unnest(array[v*reporter*id, v*assignee*id]) as r
  where r is not null and r is distinct from new.actor*user*id;
```

Two things carry over from that precedent:

1. ***The comparison shape***: candidate recipient `is distinct from` the terminal event's `activity*log.actor*user*id`. BK-211 should use the same operator and the same actor source, with `runs.executor*user*id` (the starter, stamped at start — `0031*runs.sql:82`, set from the creating actor in the insert at `0031_runs.sql:402-407`) as the candidate recipient.
2. ***The doctrine****: read the ratified business rule **literally, per event class**. That same migration's header (lines 33-36) records that the assignment branch got ****no**** actor exclusion precisely because its business rule did not state one — "Read literally from the ratified text rather than [inferring]". Applying that doctrine to BK-211's text ("if the run starter is also ****the person*** finishing or aborting", plus an explicit executor-parity rule) yields notify-on-agent, not suppress.

### Finding 3 — why identity-only comparison is not sufficient

Under ***ADR-0001 Path B****, a PAT does not act as a distinct database identity — it **impersonates its owning user* at the Postgres layer. Both terminal routes pass the impersonated id straight through as the event actor:

- `app/api/v1/runs/[id]/finish/route.ts:46` — `actorUserId: principal.userId`
- `app/api/v1/runs/[id]/abort/route.ts:50` — `actorUserId: principal.userId`

So when the agent executes with ***Elena's own PAT**** — exactly the workflow field's scenario, "hands it to the team's AI agent" — `actor*user*id` **equals* `runs.executor*user*id`, and a naive identity-only test suppresses the notification. AC Scenario 1 would fail on the story's own headline case.

The codebase already ships the distinction needed to fix this. `lib/api/principal.ts:37` declares `via: 'cookie' | 'bearer'`, and `app/api/v1/runs/route.ts:66-68` already uses it as the automation signal at run ***start***:

```ts
const executorMode = principal.via === 'cookie'
  ? 'human'
  : (body.executor_mode ?? 'human');
```

with the comment "cookie sessions are unambiguously `human`; a PAT (bearer) caller may declare `agent` / `ci`". That is a shipped, ratified precedent both for treating `via` as the interactive-vs-automated boundary ***and*** for trusting a bearer caller's self-declared executor kind.

### Candidates considered

| # | Candidate | Summary |
| --- | --- | --- |
| A | Identity-only parity (QA-proposed, literal) | Notify whenever `activity*log.actor*user*id is distinct from runs.executor*user_id`. Agent with its own service account notifies; agent borrowing the starter's PAT is suppressed. |
| B | Agent-as-proxy | An agent acting on the starter's behalf **is** the starter's action → suppress. |
| C | Channel-aware parity (A, refined) | Suppress only when the actor id matches the starter ***and*** the terminal call arrived through an interactive cookie session. Any bearer/PAT-borne terminal event notifies the starter. |
| D | Executor-mode keyed | Notify whenever `runs.executor_mode <> 'human'`, ignoring actor identity. |

### Scoring

Criteria weights: ***Product value 25 · Precedent consistency 25 · Risk of user-visible surprise 20 · Implementation cost 15 · Reversibility 15*** (total 100). Risk is weighted above cost because a missed terminal notification is silent — the user cannot tell a suppressed notification from a system that never fired.

| Candidate | Product value (25) | Precedent (25) | Risk (20) | Impl cost (15) | Reversibility (15) | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- |
| A — identity-only | 18 | 20 | 12 | 15 | 13 | ***78*** |
| B — agent-as-proxy | 5 | 5 | 4 | 15 | 13 | ***42*** |
| ***C — channel-aware**** | ****25**** | ****23**** | ****19**** | ****11**** | ****13**** | ****91*** |
| D — executor-mode keyed | 12 | 10 | 6 | 13 | 11 | ***52*** |

***Reasoning per candidate******:***

- ***A (78)**** — Correct in direction and cheapest to build (pure SQL, no plumbing), and it satisfies AC Scenarios 2, 3 and 5 outright. Loses product value and risk points because it silently fails AC Scenarios 1 and 4 whenever the agent runs on the starter's own PAT, which ADR-0001 Path B makes the **default* shape of agent execution here. The failure mode is invisible: Elena simply never hears back, and nothing logs an error.
- ***B (42)*** — Contradicts three ratified fields (AC Scenarios 1 and 4, the executor-parity business rule, the workflow narrative) and destroys the story's stated business value: the whole point is that Elena stops babysitting a run she delegated. Scores low on precedent too — BK-212's own header commits to reading the ratified text literally, and the literal text says "person". Rejected.
- ***C (91)**** — Satisfies all five AC scenarios including the headline delegation case. Highest precedent score: it reuses `principal.via` exactly as `POST /api/v1/runs` already does, rather than inventing a new signal, and keeps BK-212's `is distinct from` comparison as the base clause. Loses 4 points on implementation cost against A — it needs one parameter added to `bunkai*finish*run` / `bunkai*abort*run` and carried into the event payload — and 2 on precedent for widening those two RPC signatures. Note this parameter is ****not**** an identity claim: it says **how** the caller connected, never **who* they are, so it sits outside ADR-0012's actor-bind class. Worst case a bearer caller self-declares and receives a notification about its own action — self-inflicted and harmless, the same trust model already shipped for `executor_mode`.
- ***D (52)**** — Rejected on a factual mismatch. `executor*mode` is stamped at ****start**** (`0031*runs.sql:82`) and describes intent, not who actually ended the run. Two concrete breakages: a cookie-started run is **forced* to `'human'` (`app/api/v1/runs/route.ts:66`), so Elena starting in the UI and handing off to an agent would still read `'human'` and suppress; and a run declared `'agent'` that Elena then finishes manually herself would notify, breaking AC Scenario 5.

### Decision — Candidate C

***Ruling******:****** an agent or API caller that ends a run is a distinct executor and DOES notify the starter, even when it authenticates as the starter's own user. Self-suppression is scoped to the starter ending her own run through an interactive session.***

Implementable rule for the notification trigger on the `run.finished` / `run.aborted` event:

> Create a notification for `runs.executor*user*id` (the starter) ***unless both*** of the following hold:
1. the terminal event's `actor*user*id` ***is not distinct from**** `runs.executor*user*id`, ****and***
2. the terminal call arrived through an ***interactive cookie session*** (`principal.via === 'cookie'`).

If either condition fails — a different actor, ***or*** a bearer/PAT-borne call — the notification is created.

Exact identity comparison in SQL, mirroring `0056*bug*event_notifications.sql:175`:

```sql
-- suppress iff same person AND interactive session
if v*starter*id is not distinct from new.actor*user*id
   and (new.payload ->> 'actor_via') = 'cookie'
then
  return new;  -- self-suppression (AC Scenario 5)
end if;
-- otherwise notify v*starter*id
```

Plumbing required (three touch points, all additive):

1. `bunkai*finish*run` and `bunkai*abort*run` take a new `p*actor*via text` parameter (values `'cookie'` / `'bearer'`), defaulted to `'cookie'` so the conservative behaviour is self-suppression if a caller omits it.
2. Both RPCs write it into the `run.finished` / `run.aborted` `activity*log` payload as `actor*via`.
3. `app/api/v1/runs/[id]/finish/route.ts` and `.../abort/route.ts` pass `principal.via` alongside the `principal.userId` they already pass (lines 46 and 50 respectively) — `principal` is already in scope at both call sites via `getAuth(ctx)`.

***Notes for the implementer******:***

- The `p*actor*via` parameter is a channel descriptor, not a caller-supplied identity, so ADR-0012's actor-bind invariant does not apply to it. The actor-bind question for `p*actor*user_id` on these two RPCs is a separate, pre-existing matter and is ***not*** in this story's scope.
- Recipient remains the starter only, per the 2026-07-11 N4 ratification. `runs.executor*user*id` is the starter (it is set from the creating actor at insert, `0031_runs.sql:402-407`), despite the column name reading as "executor".
- `notifications` already handles `entity*type = 'run'` in its visibility CASE (`0053*notifications.sql:252`), so the inbox read side needs no change for this — which also satisfies the "silent removal on access loss" rule from Q1.
- Reuse BK-212's `source*event*id` idempotency constraint (`notifications*source*event*recipient*key`, `0056:119`) so a replayed terminal event cannot double-notify.

### Precedent cited

- `supabase/migrations/0056*bug*event*notifications.sql:175` — the `is distinct from new.actor*user_id` self-exclusion clause (BK-212, shipped)
- `supabase/migrations/0056*bug*event_notifications.sql:33-36` — the read-the-ratified-text-literally doctrine
- `supabase/migrations/0056*bug*event*notifications.sql:113-119` — `source*event_id` idempotency
- `supabase/migrations/0031*runs.sql:82` and `:402-407` — `executor*user_id` is the starter, stamped at start
- `app/api/v1/runs/route.ts:66-68` — `principal.via` as the shipped interactive-vs-automated signal
- `app/api/v1/runs/[id]/finish/route.ts:46` · `app/api/v1/runs/[id]/abort/route.ts:50` — terminal-event actor plumbing
- `lib/api/principal.ts:37` — `via: 'cookie' | 'bearer'`
- `supabase/migrations/0053*notifications.sql:252` — inbox already resolves `entity*type = 'run'`
- ADR-0001 (Path B, PAT impersonates its owning user) · ADR-0004 (run snapshot, `executor_mode` stamped at start)

### Status

Q3 is ***closed***. BK-211 has no remaining unratified product question from this decision's scope. No design divergence: this ruling changes recipient selection only, and `master-design-plan.md` §4.13 specifies the inbox presentation, which is untouched.

---

### Ely - 8/6/2026, 3:20:33 PM

## AI Tech Lead — Decision: BK-211 run-terminal trigger availability and hook point

### The question

BK-211's shift-left close-out (2026-07-18) warns: **"there is no real run-terminal trigger to hook into until BK-30 ships. This story should not be picked up assuming the trigger already exists."** A later autonomous run claimed that warning was stale bookkeeping, but never verified it at code level. So: ***does a real run-terminal event (a run reaching a final verdict or being aborted) exist in the shipped system today, reachable by a real user — and if so, where does BK-211's notification hook belong?***

> ***INFO:*** Verified against the live database (project `fmbpikzpkafptqximhxn`) and the code merged to `staging`, not against ticket statuses. Read-only investigation: no DDL, no writes.

### Live schema evidence

| Fact | Evidence |
| --- | --- |
| `runs` table exists | 30-table `public` schema; `runs` present |
| Terminal states exist in the status domain | `runs*status*check`: `status IN ('running','passed','failed','aborted')` |
| Terminal states exist in live DATA | 66 `passed`, 23 `failed`, 5 `aborted`, 42 `running` |
| Abort reason is enforced, not optional | `runs*abort*reason*chk` — `aborted` requires a 3..500 char `abort*reason`; any other status requires it NULL |
| `notifications` table exists | `id`, `workspace*id`, `recipient*user*id`, `event*type`, `entity*type`, `entity*id`, `payload jsonb`, `read*at`, `created*at`, `source*event*id` |
| `notifications` idempotency | `UNIQUE (source*event*id, recipient*user*id)` |
| `notifications` RLS | SELECT gated by recipient + retained membership; UPDATE recipient-only; ***no INSERT policy for ***`authenticated` — rows arrive only from a `SECURITY DEFINER` producer |
| `notifications` real-time | already in the `supabase*realtime` publication (`0053*notifications.sql:154`) — the AC4 real-time path needs no new transport work (ADR-0010) |
| Deep-link resolver already handles runs | `lib/notifications/entity-routes.ts` has a `case 'run'` returning `/projects/{slug}/runs/{runId}` |
| Preference event type already exists | `notification*preferences.event*type` allows `run_lifecycle` (0062) — shipped by BK-213 with no producer yet |

***Highest applied migration number in the LIVE ledger******:****** ***`0065*atc*tags*cap*guard` (version `20260806060122`). Next free number is `0066`. Note the ledger is not strictly ordered by number — `0058*atc*title*min*length` was applied last by timestamp (`20260806094556`); `0066` is still the correct next number.

### Production write path for run-terminal — it exists and is user-reachable

The full chain, merged and live:

```
RunnerView "Finish run" / "Abort" button
  -> POST /api/v1/runs/{id}/finish   |   POST /api/v1/runs/{id}/abort
    -> finishRun() / abortRun()
      -> bunkai*finish*run() / bunkai*abort*run()   [SECURITY DEFINER]
        -> UPDATE runs SET status = passed|failed|aborted, finished_at = now()
        -> INSERT activity_log (action = 'run.finished' | 'run.aborted')
```

| Layer | Location |
| --- | --- |
| UI control (Finish) | `components/runs/RunnerView.tsx:583` — `data-testid="runner-finish-button"` |
| UI control (Abort) | `components/runs/RunnerView.tsx:597` — `data-testid="runner-abort-button"` |
| Page that renders it | `app/(app)/projects/[projectSlug]/runs/[runId]/page.tsx:127` |
| HTTP route (finish) | `app/api/v1/runs/[id]/finish/route.ts` |
| HTTP route (abort) | `app/api/v1/runs/[id]/abort/route.ts` |
| Client wrapper | `lib/supabase/rpc.ts:330` (`finishRun`) · `lib/supabase/rpc.ts:312` (`abortRun`) |
| Terminal write + audit | `supabase/migrations/0037*run*finish.sql` · `supabase/migrations/0036*run*abort.sql` |

***Reachable by a real user******:****** YES.**** Both buttons are rendered on the live run-detail page behind a member+ write gate; viewers simply do not see them. This is not a fixture-only path. The live `activity*log` confirms it has been exercised: ****89 ****`run.finished`**** rows and 2 ****`run.aborted`**** rows, all with a non-null ****`actor*user_id`****, latest 2026-08-05***.

***Starter identity******:****** persisted, but under a misleading column name.*** `runs` has NO `started*by` column. The starter is stored in `runs.executor*user*id`, which `bunkai*create*run` stamps as `p*actor*user*id` at start (`supabase/migrations/0031_runs.sql:390`) — for every executor mode, including `agent` and `ci`. So:

- recipient (the starter) = `runs.executor*user*id`
- actor (whoever closed it) = `activity*log.actor*user_id` on the terminal row
- self-suppression = the two being equal

Two implementation cautions on that column: the name says "executor" but the value is the STARTER, and the FK is `ON DELETE SET NULL` — 3 of the 94 terminal runs already carry NULL. The recipient array must be null-filtered, exactly as the bug producer already does.

***The BK-30 blocker claim is FALSIFIED at code level.*** `0036*run*abort` (BK-36) and `0037*run*finish` (BK-39) are both in the live ledger and both wired end-to-end to the UI. The 2026-07-18 warning was accurate when written and is now obsolete.

### BK-212 precedent mechanism

`supabase/migrations/0056*bug*event*notifications.sql` — ***an ****`AFTER INSERT ON activity*log`**** trigger*** (`activity*log*notify*bug*event` -> `bunkai*notify*bug*event()`), `SECURITY DEFINER`, with a `WHEN (new.entity*type = 'bug' AND new.action IN (...))` clause, writing `notifications` rows with `on conflict (source*event*id, recipient*user*id) do nothing`. Its stated rationale applies verbatim to runs: the producer RPC already writes its audit row in the same transaction as the mutation, so a trigger on that write gets the notification for free without the RPC needing to know the notification feature exists.

### Candidates scored

Scale 0-5 per criterion, higher is better (for cost and risk criteria, higher = cheaper / lower risk).

| Candidate | Correctness | BK-212 consistency | Cost | Reversibility | AuthZ risk | Testability | ***Total /30*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***A. ****`AFTER INSERT ON activity_log`**** trigger for ****`run.finished`**** / ****`run.aborted` | 5 | 5 | 5 | 5 | 5 | 5 | ****30*** |
| B. `AFTER UPDATE ON runs` trigger on the status transition | 1 | 2 | 4 | 5 | 3 | 4 | 19 |
| C. New RPC invoked from inside `bunkai*finish*run` / `bunkai*abort*run` | 5 | 3 | 2 | 2 | 3 | 5 | 20 |
| D. Application-layer insert in the two API route handlers | 2 | 1 | 3 | 4 | 2 | 3 | 15 |
| E. Defer until BK-30 ships a trigger | 0 | — | — | — | — | — | ***0 — premise falsified*** |

***Why A wins.**** Everything it needs is already on the `activity*log` row it fires on: `workspace*id`, `actor*user*id`, `entity*id` (the run), and a payload already carrying `verdict` (0037) or `reason` (0036). It runs inside the same transaction as the status update, so the notification cannot be lost. It touches no shipped RPC. Rollback is a single `DROP TRIGGER`. On ADR-0012: a trigger function takes ****no caller-supplied parameter of any kind***, so the actor-bind question is vacuous — 0056's header makes exactly this argument and it transfers unchanged. The actionable checklist items are result scoping (every inserted row scoped to `new.workspace*id`, recipient read only from `runs.executor*user*id` keyed by `new.entity_id`, never an external input) and a DB-integration isolation test.

***Why B fails decisively.*** An `AFTER UPDATE ON runs` trigger cannot identify the actor. The API routes call the RPCs through `createAdminClient()`, so `auth.uid()` is NULL inside the trigger, and `runs` carries no "last actor" column. Self-suppression — an explicit AC — would be unimplementable. This is the single most important negative finding in the scoring: the option that looks most direct is the one that silently breaks the story's headline rule.

***Why C loses.*** It requires re-creating two shipped `SECURITY DEFINER` functions on the run-execution critical path for a purely additive feature, and an RPC that takes a recipient or actor parameter is precisely the caller-supplied-identity shape ADR-0012 guards against. More migration risk, more authorization surface, no correctness gain over A.

***Why D loses.*** The insert would land in a separate transaction from the RPC: a finish that succeeds followed by a failed notification insert silently loses the event. It also splits notification production across two mechanisms and duplicates the logic in two route handlers.

### VERDICT — BUILDABLE

The run-terminal event genuinely exists in shipped code and is reachable by a real user through the live UI. BK-211 is not blocked by BK-30.

***Hook point (Approach A), for a new migration ****`0066`****:***

```
create trigger activity*log*notify*run*terminal
  after insert on public.activity_log
  for each row
  when (new.entity_type = 'run'
        and new.action in ('run.finished', 'run.aborted'))
  execute function public.bunkai*notify*run_terminal();
```

Inside `bunkai*notify*run*terminal()` (`SECURITY DEFINER`, `set search*path = ''`), mirroring `bunkai*notify*bug_event()`:

- Look up `runs.executor*user*id` (the starter), `runs.test*title`, and `projects.slug` by `new.entity*id`; return early if the run is not found, so this trigger can never raise out and roll back the run closure.
- Recipient = the starter, filtered for NULL, and ***excluded when it equals ***`new.actor*user*id` (the "no self-notification" AC).
- Payload: `title` (from `runs.test*title`), `project*slug`, `verdict` (from `new.payload`) or `reason` for aborts. `project_slug` is mandatory — `resolveNotificationHref` returns `null` without it, so the deep link would silently break.
- Insert with `entity*type = 'run'`, `entity*id = new.entity*id`, `source*event*id = new.id`, and `on conflict (source*event*id, recipient*user_id) do nothing`.

No schema change to `runs` and no change to `bunkai*finish*run` / `bunkai*abort*run` is needed. Real-time delivery and the deep link both work with zero additional plumbing, since `notifications` is already in the realtime publication and `entity-routes.ts` already routes `run`.

> ***WARNING:**** ****This ruling settles the TECHNICAL trigger-availability question only.**** It does not clear BK-211 for pickup on its own. The separate open item recorded against this story — ****Q3, self-suppression vs. executor parity**** (whether an agent finishing a run at the starter's own request counts as the starter's own action, QA-proposed and unratified since 2026-07-17) — is a product/business call, not a technical one. Under CLAUDE.md Rule #18 it belongs to the ****AI Product Owner / Business Analyst*** profile and should be dispatched there rather than treated as a blocker. Note that Q3 changes only the recipient predicate inside the trigger function above; it does not change the hook point, the mechanism, or any of the scoring.

---

### Ely - 8/6/2026, 3:22:59 PM

## AI Tech Lead — Decision: BK-211 run-terminal trigger availability and hook point (addendum + one retraction)

Addendum to the comment posted minutes ago in this same thread. Authored by the AI Tech Lead profile of the AI team that designs, specifies and builds Bunkai TMS, per CLAUDE.md Critical Rule #18 — not a human tech-lead sign-off.

That comment was written from the `.context/PBI/` cache, which was stale: it predates comments `12169`, `12173` and `12196`. Correcting it here rather than leaving a wrong claim standing.

### Retraction

My closing warning stated that Q3 (self-suppression vs. executor parity) is "unratified since 2026-07-17". ***That is wrong and is retracted.**** Q3 was ruled by the ****AI Product Owner*** in `12169` (2026-08-05) and re-ruled in detail in `12196` (2026-08-06): an agent or API caller that ends a run is a distinct executor and DOES notify the starter, even when it authenticates as the starter's own user; self-suppression is scoped to the starter ending her own run through an interactive session. No product question is open on this story.

### Prior ruling that governs, and what my verification adds

`12173` (AI Tech Lead, 2026-08-05) already ruled the two questions I was asked. It ***governs***; I am not re-deciding it. My run reached both conclusions independently from the live database and the merged code, which is worth recording as corroboration rather than duplication:

- Recipient is `runs.executor*user*id`, stamped by `bunkai*create*run` as `p*actor*user_id`. No schema change to `public.runs`.
- Hook is an `AFTER INSERT ON public.activity*log` trigger with a `when (new.entity*type = 'run' and new.action in ('run.finished','run.aborted'))` guard, mirroring the shipped `bunkai*notify*bug_event` (`0056`).

The one thing my run adds that was the actual question put to it: ***the BK-30 gate is falsified at code level, not merely at bookkeeping level.**** `0036*run*abort` and `0037*run*finish` are in the live ledger; `RunnerView.tsx:583` / `:597` render Finish and Abort on the live run-detail page; they POST to `app/api/v1/runs/[id]/finish|abort/route.ts`; and live `activity*log` holds 89 `run.finished` + 2 `run.aborted` rows, all attributed, latest 2026-08-05. This is a real user-reachable path, not a fixture-seeded column. ****Verdict******:****** BUILDABLE.*** Highest applied migration in the live ledger is `0065*atc*tags*cap_guard`; next free number is `0066`.

### New finding — `12196` supersedes `12173`'s suppression predicate, and that has a cost

This is the part neither comment can be read alone for, and it is a technical consequence a dev run will hit on day one.

`12173` ruled suppression on ***actor identity alone**** (`v*recipient is not distinct from new.actor*user*id`), and made a point of the trigger never reading `executor*mode` so the rule "cannot be violated by a later edit". `12196`, posted the next day, explicitly rejects that shape: it states the obvious identity-only implementation "produces the wrong answer for Scenario 1 under this codebase's own auth model", and rules suppression as ****same person AND interactive session***. The later product ruling wins. `12173`'s suppression snippet should be treated as superseded on that one predicate; everything else in `12173` stands.

***The mechanical problem******:****** the session kind is not available to the trigger today.*** Verified against the merged code:

| What the rule needs | What the shipped path provides |
| --- | --- |
| Interactive-vs-automated signal at finish/abort time | `principal.via` (`'cookie' | 'bearer'`) exists at the HTTP layer — `lib/api/principal.ts:37` — and the run-CREATE route already uses it (`app/api/v1/runs/route.ts:66-68`) |
| That signal reaching the trigger | ***Not available.*** `bunkai*finish*run(p*actor*user*id, p*run*id, p*verdict)` and `bunkai*abort*run(p*actor*user*id, p*run*id, p*reason)` take no session-kind parameter, and the `activity*log` payloads they write are `{verdict, skipped*steps}` and `{reason, skipped_steps}` |
| A fallback on the run row | ***Not usable.*** `runs.executor_mode` is declared at START and describes the intended executor, not how the terminal action was performed |

So implementing `12196` requires plumbing `via` from the two routes into the two RPCs and into the `activity*log` payload — which means `CREATE OR REPLACE` on both live `SECURITY DEFINER` functions. That is precisely the blast radius `12173` declined to pay for a `started*by` column, citing `0058*atc*title*min*length.sql`'s own header. It also invalidates the "modifies zero live functions" property that both `12173` and my earlier comment claimed for this story.

***Ruling on how to pay it, scored on the same six-criteria model (correctness · precedent · cost · reversibility · security/ADR-0012 · performance, 5 each, 30 max)******:***

| # | Candidate | Corr. | Prec. | Cost | Rev. | Sec. | Perf. | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ***A**** | ****Add an optional ****`p*via text default null`**** to both RPCs; route passes ****`principal.via`****; RPC projects it into the ****`activity*log`**** payload; trigger suppresses on ****`actor = starter AND payload->>'via' = 'cookie'` | 5 | 4 | 3 | 4 | 5 | 5 | ****26*** |
| B | Trigger reads `runs.executor_mode` as a proxy for how the run was closed | 1 | 3 | 5 | 5 | 4 | 5 | 23 |
| C | Route writes a second `activity_log` row carrying `via`, RPCs untouched | 2 | 1 | 3 | 4 | 2 | 3 | 15 |
| D | Application-layer notification insert in the two routes, no trigger | 2 | 1 | 3 | 4 | 2 | 3 | 15 |

***A wins.*** A defaulted parameter is an additive signature change: existing callers, including any PAT client calling the RPC directly, keep working and land on `null`, which reads as non-interactive and therefore notifies — the safe default under `12196`, since a missed terminal notification is silent and a surplus one is visible. The payload projection follows `0055`'s positive-projection convention. ADR-0012 is unaffected: `p*via` is not an identity or scope parameter, `p*actor*user*id` keeps its existing gate, and the trigger still takes no caller-supplied input at all.

***B is disqualified on correctness, not cost.*** `executor_mode` records the intent declared at start. A run started as `human` and finished by a CI PAT would suppress; a run started as `agent` and finished interactively by Elena herself would notify. Both are the exact inversions `12196` ruled against. It is the cheapest option and the wrong one.

***C and D*** reintroduce a second producer or a second transaction, the structures `12173` and `0056` both rejected.

### Net effect on the story

Still ***BUILDABLE***, still a single additive migration `0066` for the trigger, plus a `CREATE OR REPLACE` on `bunkai*finish*run` and `bunkai*abort*run` to carry `p*via` — a cost the estimate should absorb, since neither `12173` nor the 5-point estimate anticipated it. AC1's automation binding from `12173` stands unchanged: the property under test is actor-vs-starter (now qualified by session kind), never `executor*mode`.

---


_Synced from Jira by sync-jira-issues_
