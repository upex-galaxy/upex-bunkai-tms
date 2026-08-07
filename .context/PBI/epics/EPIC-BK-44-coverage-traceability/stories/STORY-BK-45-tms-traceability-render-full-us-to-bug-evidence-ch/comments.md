# Comments for BK-45

[View in Jira](https://jira.upexgalaxy.com/browse/BK-45)

---

### Benjamin Segovia - 6/11/2026, 1:19:15 PM

Shift-Left QA refinement completed (2026-06-11). AC field updated with 7 refined scenarios. ATP DRAFT field updated with 23 test outlines. Story ready for estimation. Top blockers: (1) [https://jira.upexgalaxy.com/browse/BK-24#icft=BK-24](https://jira.upexgalaxy.com/browse/BK-24#icft=BK-24)/[https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30](https://jira.upexgalaxy.com/browse/BK-30#icft=BK-30)/[https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31](https://jira.upexgalaxy.com/browse/BK-31#icft=BK-31) still in Planificación — chain layers not sprintable yet. (2) 11 open PO/Dev questions in ATP DRAFT. SP recommendation: 8 (or split BK-45a SP3 + BK-45b SP5). @Ely please review open questions before sprint planning.

---

### Ely - 7/30/2026, 1:28:28 PM

Mockup — Traceability chain (US→bug evidence). Source: .context/designs/bunkai-test-management-tool/bk-44-metrics-coverage/traceability-chain.html · spec: master-design-plan §4.7



---

### Ely - 8/5/2026, 4:10:57 PM

## AI Product Owner / Business Analyst — decision pass on BK-45

> ***INFO:**** This comment is authored by the ****AI Product Owner / Business Analyst**** profile of the same AI team that designs, specifies and builds Bunkai TMS, under `CLAUDE.md` Critical Rule #18 (AI-led decision authority). It is ****not**** a human PO sign-off. It closes ****all 11 open questions**** raised in Benjamin Segovia's 2026-06-11 refinement (7 for PO, 4 for Dev, carried in the ATP field §6), ****all 4 live ****`NEEDS PO/DEV CONFIRMATION`**** placeholders**** in the Acceptance Criteria field, and edge case ****EC11****. Each ruling enumerates alternatives, scores them, and states the reasoning. Where a question is genuinely a mechanism call, the product constraint is stated and the mechanism is handed to the ****AI Tech Lead***.

### The 2026-06-11 top blocker is STALE — verified against the live board

That refinement recorded: **"Top blockers****:**** (1) BK-24/BK-30/BK-31 still in Planificación — chain layers not sprintable yet."** That was true in June. It is not true now.

| Chain layer | Delivering stories | Live status | Shipped schema |
| --- | --- | --- | --- |
| Tests | BK-27, BK-28, BK-32, BK-33 | Ready For Release | `0024*tests.sql`, `test*steps` |
| Runs | BK-34, BK-35, BK-36, BK-37, BK-38, BK-39 | Ready For Release / QA Approved / Ready For QA | `0031*runs.sql` — `runs`, `run*atcs`, `run_steps` |
| Defects | BK-40, BK-41, BK-42, BK-264 | Ready For QA | `0046*bugs.sql`, `0054*bug*assignment*status.sql` |
| AC to ATC binding | BK-18, BK-21 | shipped | `atc*acceptance*criteria` (M:N) |

The parent Epics still read "Planning", but their children have all shipped — the Epic status is the stale signal, not the work. ***Every one of the five chain layers exists in the database today.*** BK-45 is unblocked, and the mockup gate lifted on 2026-07-30 (design plan §4.7). The remaining blockers were the questions below, which this comment closes.

---

## AI Product Owner — Decision: "(A4 + V1) — Route and entry point: Where is the traceability view accessible from in the UI? Is it a dedicated route (e.g., /user-stories/{id}/traceability), a panel on the existing story page, or a modal?"

***Decision******:****** a dedicated project-scoped route, ****`/projects/[projectSlug]/traceability`****, with the user story selected inside the view (deep-linkable via a query parameter). Not a modal, not a panel on the story page.***

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Dedicated project-scoped route (chosen)**** | 5 | 5 | 4 | 4 | 5 | ****23*** |
| Nested under the story: `/user-stories/{id}/traceability` | 4 | 2 | 4 | 4 | 4 | 18 |
| Panel inside the existing story editor | 2 | 3 | 4 | 5 | 3 | 17 |
| Modal over the story list | 1 | 2 | 5 | 5 | 3 | 16 |

***Rationale.*** Three sources converge. Design plan §4.7 assigns `traceability-chain.html` the route `/projects/[projectSlug]/traceability` and gives Traceability its own nav item. The live app's information architecture is uniformly project-scoped — every sibling screen (`/projects/[projectSlug]/metrics`, `/bugs`, `/runs`, `/tests`, `/atcs`) lives at that depth and there is no `/user-stories/{id}` route anywhere in `app/(app)/`, so the nested alternative would invent a route family for one screen. And the mockup's own filter bar (module, verdict, date range) is a project-wide affordance that only makes sense on a project-scoped screen. Per Rule #14, the live IA wins over a hypothetical nesting.

***Two entry points, both required******:*** the Traceability nav item (lands on the screen with a story selector), and deep links from the metrics dashboard — design plan §4.7 already specifies "Each section links out to `traceability-chain.html`", so the coverage-gap and recovery-cycle tables must link a story straight into its chain.

***For automation******:*** the URL under test is `/projects/{projectSlug}/traceability?story={userStoryId}`. That shape is now stable and test authors can bind to it.

---

## AI Product Owner — Decision: "(A2) — 'Latest' run definition: What defines the 'latest' run result when multiple runs exist for the same Test? Last executed*at DESC? Last created*at DESC? Is there a tiebreaker when timestamps collide?"

***Decision******:****** the latest run is the most recently STARTED run of that Test, ordered by ****`runs.started_at`**** descending — regardless of outcome, and regardless of whether it has finished.*** A run still in progress IS the latest run and renders as such.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Most recently started, any status (chosen)**** | 5 | 5 | 5 | 4 | 4 | ****23*** |
| Most recently ***finished*** run (ignore in-flight) | 3 | 3 | 4 | 4 | 4 | 18 |
| Most recent run with a terminal verdict, excluding aborted | 3 | 2 | 3 | 4 | 3 | 15 |
| Most recent ***failing*** run, else most recent overall | 1 | 1 | 3 | 4 | 2 | 11 |

***Rationale.*** The screen answers "what is the current evidence position of this story", and the honest answer for a Test that started running two minutes ago is "it is running", not the stale verdict from yesterday. `0031*runs.sql` makes `started*at` non-null while `finished*at` is nullable and only set at finish (BK-39) — so ordering by `finished*at` cannot even see an in-flight run, and aborted runs may never get one. The codebase has already committed to this ordering: `runs*test*id*started*at*idx on public.runs (test*id, started*at desc)` exists in `0031*runs.sql` L92. Choosing anything else would mean querying against the grain of the one index built for exactly this access pattern.

***Product consequence (this is what ATP negative outline 6 is about).*** A run in `running` state must render as a distinct in-flight state, never as a pass, a fail, or a "no run yet". The mockup's `--running` treatment on the metrics screen is the established grammar to reuse.

***Handed to the AI Tech Lead******:*** the collision tiebreaker — see the dedicated ruling below.

---

## AI Product Owner — Decision: "(A3) — Defect link source: Which entity does a defect link to? run*result*id, run*id, or directly to user*story_id?"

***Decision******:****** ****`run*id`****, with ****`run*step*id`**** available for step-level precision. Settled by the shipped schema, not by preference — there is no ****`run*result_id`**** in this product.***

`0046*bugs.sql` L93-L106 is explicit. A defect carries `project*id` and `module*id` as mandatory, and `run*id`, `run*step*id`, `atc_id` as ***nullable provenance links only***. There is no path from a defect to a user story except through that provenance chain, and a defect may legitimately have none of it (a standalone defect filed outside a run — the mockup's "Filed manually." state).

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Join on ****`run_id`**** (chosen — matches shipped schema)**** | 5 | 5 | 5 | 5 | 5 | ****25*** |
| Join on `atc_id` instead | 3 | 3 | 5 | 4 | 2 | 17 |
| Add a direct `user*story*id` on defects | 3 | 1 | 1 | 2 | 2 | 9 |

***Rationale and the scoping rule this creates.**** Because `bugs.run_id` points at a run and a run belongs to a ****Test****, and a Test may chain ATCs drawn from more than one user story, a naive join surfaces defects that have nothing to do with the story being traced. That is exactly edge case ****EC9***, and it is a real leak of irrelevant context, not a theoretical one.

***Binding product rule******:**** a defect appears in a story's chain ****only when its provenance resolves back into that story's own chain**** — that is, the defect's `run*step*id`/`atc_id` provenance resolves to an ATC bound to one of this story's acceptance criteria. A defect raised during the same run against a **different* story's ATC does not appear. Defects with no run provenance (standalone) never appear in any chain; they live on the Bug Reports screen.

***Product consequence******:*** the "Defects" column of the mockup's grid is per-ATC-row, not per-run. The mockup already renders it that way, and `bugs.run*step*id` is the field that makes it exact.

---

## AI Product Owner — Decision: "(G3 + AC-04) — Partial coverage indicator: What should the chain show for an AC that has no ATCs? An 'uncovered' badge? A dimmed empty row? Confirm exact copy or data-testid." — also resolves the AC-04 placeholder "exact 'uncovered' indicator copy or component"

***Decision******:****** the frozen mockup's uncovered strip, copy verbatim.*** Not a badge, not a dimmed row.

- Primary label: `Uncovered · 0 ATCs bound`
- Full strip copy on the AC row: ***"Uncovered · 0 ATCs bound******:****** no verification exists for this criterion. Bind an ATC in the Test Cases screen to start a chain."***
- Visual treatment: the `--fail` strip, structurally distinct from the "no data yet" dotted `--skipped` pill.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Mockup uncovered strip, verbatim (chosen)**** | 5 | 5 | 5 | 5 | 5 | ****25*** |
| Neutral "No ATCs" badge | 3 | 2 | 5 | 5 | 4 | 19 |
| Dimmed empty row with no label | 1 | 1 | 5 | 5 | 3 | 15 |
| Invent new copy | 2 | 1 | 4 | 4 | 3 | 14 |

***Rationale.**** Rule #15 makes the mockup the contract and it already resolves this at a level of detail QA could not have known was available in June — the strip does not merely label the gap, it tells the reader what to do about it and where. The `--fail` tone is the deliberate signal that an uncovered acceptance criterion is a ****quality gap***, not a neutral absence, which is exactly the distinction the whole screen exists to draw. Re-picking copy here would violate the no-re-invent clause of Rule #15.

***For automation******:*** anchor assertions on the mockup's stable `data-od-id` / class hook (`uncovered-strip`), not on the prose, so a future copy edit does not break the suite. The prose above is the shipping copy; the hook is the contract.

---

## AI Product Owner — Decision: "(A7 + AC-05) — Role gate: Which workspace roles can access the traceability view? All authenticated members (viewer+), or is it restricted to member / admin / owner only?"

***Decision******:****** viewer and above. Any authenticated member of the workspace that owns the project can read the chain. No additional gate.***

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Viewer+ (chosen)**** | 5 | 5 | 5 | 4 | 5 | ****24*** |
| Member+ (exclude viewers) | 2 | 2 | 5 | 4 | 4 | 17 |
| Admin/owner only | 1 | 1 | 5 | 3 | 4 | 14 |
| Public/shareable link | 1 | 1 | 2 | 2 | 1 | 7 |

***Rationale.**** The role model in `business-data-map.md` §RLS defines `viewer` as "read-only across every table in the workspace" under the inheritance `viewer ⊂ member ⊂ admin ⊂ owner`. The traceability chain is a pure read over data a viewer can already read row by row; gating the **assembled* view above the level of its own components would be incoherent — the viewer could reconstruct it by hand from screens they can already open. Restricting it would also break the primary use case: handing an auditor or a stakeholder a viewer seat is precisely how this feature is meant to be consumed inside the workspace.

The story's existing AC-05 (unauthenticated redirects to login; cross-workspace returns 403 with zero data rendered) is ***ratified unchanged***. Tenant isolation is the hard boundary; role level is not.

---

## AI Product Owner — Decision: "(G6 + negative-14) — Archived User Story behavior: If a QA Lead navigates to the traceability view for a soft-archived story, what should happen? 404, an 'archived' banner, or full chain visible read-only?"

***Decision******:****** the full chain renders read-only, with an "archived" banner on the story header. Not a 404.***

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Full chain + archived banner (chosen)**** | 5 | 4 | 4 | 5 | 4 | ****22*** |
| 404 | 1 | 2 | 5 | 4 | 3 | 15 |
| Redirect to the story list with a toast | 2 | 2 | 4 | 5 | 4 | 17 |
| Chain renders, no banner | 3 | 3 | 5 | 5 | 2 | 18 |

***Rationale.*** This screen's stated purpose is answering audit and coverage questions, and archived work is the material an audit most often asks about. Returning 404 would destroy the evidence trail at precisely the moment it is needed, and it would be inconsistent with the product's own posture elsewhere: runs are immutable snapshots preserved specifically so history survives later edits (ADR-0004, ADR-0009). Archiving a story is a backlog-hygiene act, not a retention decision.

The banner is not decoration — without it a reader could mistake an archived story's stale coverage for current coverage, which is the one way this screen can actively mislead.

***Boundary that stays hard******:**** archived is not the same as cross-workspace. AC-05's 403 rule is untouched, and `archived_at IS NULL` filtering on ACs and ATCs **within* the chain (AC-06) also stays — an archived story shows its own archived state, but its chain still excludes archived criteria and archived ATCs. Ratified as written.

---

## AI Product Owner — Decision: "(SP Challenge) — Story Points: BK-45 currently has no SP estimate ... this story is not ready for sprint planning until its upstream dependencies deliver working schemas. Recommend SP = 5-8 once dependencies are unblocked, or split into: [BK-45a SP3 + BK-45b SP5]"

***Decision******:****** BK-45 stays a SINGLE story at 8 SP. Do not split it. The dependency condition attached to that estimate is now satisfied.***

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Single story, 8 SP (chosen)**** | 5 | 4 | 3 | 4 | 4 | ****20*** |
| Split: chain query (3) + chain UI (5) | 3 | 2 | 3 | 3 | 3 | 14 |
| Split by layer (AC to ATC first, Run to Defect later) | 1 | 1 | 3 | 3 | 2 | 10 |
| Reduce to 5 SP as one story | 3 | 3 | 3 | 4 | 2 | 15 |

***Rationale, and why this differs from my BK-43 slicing call.**** A slice must be independently shippable and independently valuable. BK-45's value proposition is literally "the full chain ****in one read***" — a half-chain is not a smaller version of that promise, it is a different and worse product. The query/UI split fails the same test in the other direction: a chain endpoint nobody can see ships zero user value and lands as unverified code. Contrast BK-43, where each proposed slice does stand alone (a configured integration, then defects reaching Jira, then durable recovery). Different stories, different answers, same criterion.

8 SP is the top of QA's own recommended band, which is right given the five-layer join, a screen that does not exist yet, and eight distinct rendering states in the mockup's states strip.

***Sequencing******:*** BK-45 should ship before BK-48 (filter the chain) and before BK-50 (export the chain) — both render into the same screen and both consume this story's output.

---

## AI Product Owner — Decision: "(G4 + EC6) — Query strategy for chain assembly: Will a single SQL JOIN query assemble the full 5-layer chain, or will the frontend make multiple sequential API calls (one per layer)?"

***Decision (product surface)******:****** one request, one response, one render. The screen must not fetch per layer, and must not fetch per row.*** The exact SQL/RPC shape is the AI Tech Lead's call; the constraint is not.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Single purpose-built chain endpoint (chosen)**** | 5 | 5 | 3 | 4 | 5 | ****22*** |
| Per-layer sequential API calls from the client | 1 | 1 | 4 | 4 | 1 | 11 |
| Client-side assembly from existing list endpoints | 2 | 2 | 3 | 4 | 2 | 13 |
| Materialized view refreshed on write | 3 | 2 | 1 | 2 | 3 | 11 |

***Rationale.*** The story title is the requirement: "in one read". A layered fetch produces a screen that assembles itself visibly, layer by layer, which is the hand-assembly experience the feature exists to eliminate. The codebase also has clear precedent for purpose-built report RPCs at exactly this shape — `0048*project*coverage*report.sql`, `0049*recovery*cycle*report.sql`, `0052*defect*heatmap_report.sql` — so this is the established pattern here, not a new one.

***Product-level performance bar (binding, hand this to the Tech Lead)******:*** the number of database round trips must not grow with the number of acceptance criteria, ATCs, tests or runs on the story. EC6's "50+ ATC rows" case must cost the same number of round trips as a single-ATC story.

---

## AI Product Owner — Decision: "(A5 + EC3) — ATC deduplication across ACs: If an ATC is bound to 2 ACs on the same story, does it appear in each AC's chain segment (duplicated) or only once with multi-AC labels?"

***Decision******:****** it appears under EACH acceptance criterion it is bound to. Repetition is correct and intentional — do not deduplicate.***

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Repeat under each bound AC (chosen)**** | 5 | 5 | 5 | 5 | 5 | ****25*** |
| Show once, tag it with all its ACs | 2 | 2 | 3 | 4 | 3 | 14 |
| Show once under the first AC only | 1 | 1 | 4 | 4 | 2 | 12 |

***Rationale.**** The screen's unit of reading is the ****acceptance criterion****, not the ATC — the mockup builds one card per AC and the reader's question is always "is **this* criterion verified". An AC that is genuinely covered by a shared ATC must show as covered; showing the ATC once elsewhere and leaving the second AC visually bare would read as an uncovered criterion, which would be flatly wrong. `atc*acceptance*criteria` is an M:N join precisely so one ATC can satisfy several criteria; rendering the join faithfully is rendering the truth.

***EC3 is narrower than QA feared, and the schema is why.**** ADR-0009 §3 froze `user*story*id` as ****immutable**** on an ATC — an ATC belongs to exactly one user story for life and can only be re-bound **within** that story's criteria. So the "ATC reused across stories" scenario cannot arise at the AC-binding layer at all. It can only arise one layer down, where a ****Test**** chains ATCs from several stories — and that is handled by the defect-scoping rule ruled above, plus the same rule applied to the Test and Run columns: those columns are ****context*** showing where this story's ATC was executed, not a claim that the whole Test belongs to this story.

---

## AI Product Owner — Decision: "(EC7) — Ghost ATCs after module archive: Confirm that the traceability query always filters archived_at IS NULL on ATCs, or whether a recently archived ATC could briefly appear in the chain before the filter propagates."

***Decision (product rule)******:****** archived is archived, everywhere in the chain, with no grace window.*** An archived acceptance criterion or ATC is absent from the chain on the very next read after archiving — including when it was archived as a cascade from a module subtree archive, and including when its parent module is archived but the ATC row was missed.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Filter on the entity's own archive state, plus its module's (chosen)**** | 5 | 5 | 4 | 5 | 5 | ****24*** |
| Filter on the ATC's own `archived_at` only | 3 | 4 | 5 | 5 | 3 | 20 |
| Show archived rows with a strikethrough | 2 | 1 | 4 | 5 | 3 | 15 |
| Accept a brief window of ghost rows | 1 | 2 | 5 | 5 | 2 | 15 |

***Rationale.**** The existing AC-06 already requires archived criteria and ATCs to be absent; this ruling closes the gap QA identified, which is that an ATC can be orphaned under an archived module without its own `archived_at` being set. Belt-and-braces filtering costs one predicate and eliminates a whole class of "ghost coverage" — an ATC that appears to verify a criterion but lives in a module the team has retired. Since a ghost row makes the chain **overstate* coverage, it is the more dangerous direction of error for a screen whose whole job is telling the truth about coverage. There is no product case for a grace window.

***Handed to the AI Tech Lead******:*** whether that means an extra join predicate, an existing cascade guarantee, or a corrective backfill. The product rule is "no ghosts, no window".

---

## AI Product Owner — Decision: "(EC8) — Run tiebreaker for 'latest': If two runs have the same executed_at, what is the tiebreaker for determining the 'latest' to display? id DESC?"

***Decision (product surface)******:****** the ordering must be TOTAL and STABLE — the same story must never render two different "latest" runs on two consecutive loads. Which column breaks the tie is the AI Tech Lead's call.***

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Require a deterministic tiebreaker, delegate the column (chosen)**** | 5 | 5 | 5 | 5 | 5 | ****25*** |
| Leave the sort non-deterministic | 1 | 1 | 5 | 5 | 1 | 13 |
| Show all runs tied at the same timestamp | 2 | 1 | 3 | 4 | 3 | 13 |
| Prefer the worse verdict on a tie | 2 | 1 | 4 | 4 | 2 | 13 |

***Rationale.*** This is not a product question — no user has a preference about which of two same-millisecond runs is shown. What users absolutely do have a stake in is that the answer does not flicker: a coverage screen that reports pass on one refresh and fail on the next destroys trust in every other number on the page, and would make the ATP's integration outlines untestable. So the product states the invariant and delegates the column.

***Handed to the AI Tech Lead*** with a note that `runs (test*id, started*at desc)` is already the indexed access path, so the tiebreaker should ride that index rather than force a separate sort.

---

## AI Product Owner — Decision: AC-02 placeholder — "NEEDS PO/DEV CONFIRMATION — 'no data yet' must be confirmed as exact UI copy or replaced with a data-testid."

***Decision******:****** "no data yet" is NOT the shipping copy. The frozen mockup uses LAYER-SPECIFIC copy, and that is what ships.***

| Chain position | Shipping copy |
| --- | --- |
| ATC exists, no Test chains it | `No test written yet` in the Test column; `Awaiting test` in the Run and Defect columns downstream |
| Test exists, never run | `No run recorded yet` in the Run column; `Awaiting first run` in the Defect column downstream |
| Run exists, no defect raised | `None linked` in the Defect column |

Treatment for all three: the dotted `--skipped` pill from design plan §4.7 — deliberately and visually distinct from the `--fail` uncovered strip.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Layer-specific mockup copy (chosen)**** | 5 | 5 | 4 | 5 | 5 | ****24*** |
| Uniform "No data yet" everywhere | 2 | 1 | 5 | 5 | 4 | 17 |
| Blank cells with a legend | 1 | 1 | 5 | 5 | 3 | 15 |
| Copy left to the developer, tests bind to `data-testid` only | 2 | 2 | 5 | 4 | 3 | 16 |

***Rationale.*** The mockup answered this more precisely than the question anticipated. A single "no data yet" string is technically honest and practically useless: it does not tell the reader whether the gap is a missing test, a test that has never been executed, or a clean run with nothing to report. Those are three different actions for the QA Lead, and the layer-specific copy names them. The downstream "Awaiting test" / "Awaiting first run" wording additionally stops a single upstream gap from reading as three independent failures cascading across the row.

***On the data-testid half of the question******:*** both. Ship the copy above, and anchor automated assertions on the stable element hooks rather than the prose, so copy refinement never breaks the suite.

---

## AI Product Owner — Decision: AC-03 and AC-07 placeholders — "exact empty-state copy must be defined" (no coverage) and "exact empty-state copy" (zero acceptance criteria)

***Decision******:****** two DISTINCT empty states, both frozen in the mockup, both shipping verbatim. They must never collapse into one message.***

***AC-07 — story has zero acceptance criteria******:***

- Heading: ***"No acceptance criteria yet"***
- Body: ***"This story has no acceptance criteria defined, so there is nothing for the chain to trace. This is different from a coverage gap******:****** criteria are authored first, in the story editor, and the chain builds from there."***

***AC-03 — story has acceptance criteria but zero ATCs bound anywhere******:***

- Heading: ***"No coverage anywhere on this story."***
- Body: ***"N acceptance criteria exist, but none of them has an ATC bound. There is no chain to trace yet******:****** every criterion below is an open verification gap."***
- And each criterion still renders, each carrying the `Uncovered · 0 ATCs bound` strip. This state is ***not*** a blank screen.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Two distinct mockup states, verbatim (chosen)**** | 5 | 5 | 4 | 5 | 5 | ****24*** |
| One generic "Nothing to show" state | 1 | 1 | 5 | 5 | 3 | 15 |
| Two states, newly written copy | 3 | 1 | 4 | 4 | 3 | 15 |
| Zero-AC case redirects to the story editor | 2 | 2 | 4 | 4 | 2 | 14 |

***Rationale.**** These two states look identical (an empty chain) and mean opposite things. "No criteria" is an authoring gap owned by the product side — nothing is wrong with QA's coverage, the requirement was never written down. "No coverage" is a QA gap with criteria already waiting. Merging them would send readers to fix the wrong thing, and the mockup's body copy for each explicitly draws the distinction ("This is different from a coverage gap"). Note also that AC-03's current wording says "zero chain rows are rendered" — the mockup ****supersedes*** this: criteria still render, each marked uncovered, because listing the open gaps is the useful output. Recording that as a deliberate AC correction, not a divergence.

***A third empty state exists and must not be confused with either******:**** the filtered-zero-match state ("Filters excluded everything" / "The data is still there: this is a filter result, not a coverage gap"). That one belongs to ****BK-48***, not BK-45, but BK-45's implementation must leave room for it rather than making the empty state exclusive.

---

## AI Product Owner — Decision: EC11 — "User Story is in draft status (not ready*to*test) — is the traceability view accessible? ... must confirm — NEEDS PO/DEV CONFIRMATION"

***Decision******:****** yes, fully accessible. Story lifecycle status does NOT gate this view, at any status.***

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***No lifecycle gate at any status (chosen)**** | 5 | 5 | 5 | 5 | 4 | ****24*** |
| Gate to ready-to-test and beyond | 2 | 2 | 4 | 4 | 3 | 15 |
| Accessible but with a "draft" warning banner | 4 | 3 | 4 | 5 | 4 | 20 |
| Draft stories show only the AC layer | 1 | 1 | 3 | 4 | 2 | 11 |

***Rationale.*** Opening the chain on a draft story is one of the more valuable uses of this screen — it is how a QA Lead sees, before the story is handed over, that three of five criteria have nothing bound. Gating it would withhold the information at the exact moment acting on it is cheapest, which inverts the shift-left posture the whole product is built around. The zero-AC and zero-coverage empty states above already handle the draft case gracefully, so no new state is needed. The runner-up (a draft banner) scored respectably but adds a component the mockup does not carry, and Rule #15 forbids inventing UI on the fly; if it later proves needed it arrives as its own change.

This differs from the archived-story ruling above, where a banner ***is*** warranted — an archived story can mislead a reader into treating stale coverage as current, whereas a draft story's incompleteness is self-evident from the chain itself.

---

## AI Product Owner — Decision: Does BK-45 constrain BK-50, and is BK-50 genuinely dependent on BK-45 shipping first?

***Decision******:****** YES on both counts. The dependency is REAL, it is a legitimate blocker under Rule #18(a), and it STAYS.***

BK-50's own PO decision comment (2026-07-10) states the coupling in its own words: **"BK-45 (chain assembly) must produce a data contract (JSON) that the export service can consume to render the HTML. The export service should NOT re-query the database — it should accept the assembled chain as input, render it, and ship it to R2."** BK-50's export flow is defined as **"trigger → call BK-45 chain assembly → render HTML → upload to R2 → return signed URL"**. BK-50 does not merely follow BK-45 — it ***invokes*** it.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Keep the dependency; BK-45 ships first (chosen)**** | 5 | 5 | 5 | 5 | 5 | ****25*** |
| Build BK-50 in parallel against a mocked contract | 3 | 2 | 2 | 3 | 1 | 11 |
| Give BK-50 its own independent chain query | 2 | 1 | 1 | 2 | 1 | 7 |
| Merge BK-50 into BK-45 | 2 | 2 | 2 | 3 | 3 | 12 |

***Rationale.*** The runner-up — duplicating the chain query inside the export service — is the classic wrong answer here and worth naming explicitly: two implementations of the same five-layer join will drift, and the day they drift the exported audit pack disagrees with the screen it claims to be a snapshot of. That is a correctness failure in the one artifact whose entire purpose is being trustworthy. Parallel development against a mocked contract is only slightly better, since the contract is precisely what does not exist yet.

***How my BK-45 rulings constrain BK-50 — hand these to whoever picks up BK-50******:***

1. The chain contract BK-50 consumes must carry the ***rendered semantics***, not raw rows: the three distinct "no data yet" states, the uncovered marker, and the two distinct empty states. An export that flattens them loses the exact distinctions the chain exists to draw.
2. Archived-story handling propagates: an export taken from an archived story's chain must carry the archived marker into the artifact.
3. The defect-scoping rule propagates verbatim. An export must not leak a defect from another story's chain into this story's audit pack — same rule, higher stakes, because the artifact leaves the system.
4. "Latest run" is resolved at assembly time and frozen in the export. BK-50's decision already establishes that the moment of export is the moment the assembly query completed; my started-at ordering is what that moment resolves.
5. A run in flight at export time must serialize as in-flight, not as a verdict. An audit pack must never assert a result that had not happened.

***BK-50 should not be scheduled into a sprint before BK-45 is merged.*** That is the sequencing call, and it is unchanged.

---

## Handover to the AI Tech Lead

| # | Handed over | Binding product constraint |
| --- | --- | --- |
| 1 | Chain-assembly query/RPC shape | One request per screen load. Round-trip count must not scale with AC / ATC / Test / Run counts (EC6, 50+ ATCs). Report-RPC precedent: `0048`, `0049`, `0052`. |
| 2 | Tiebreaker column for same-timestamp runs | Ordering must be total and stable across reloads. Should ride the existing `runs (test*id, started*at desc)` index. |
| 3 | Archived-entity filtering, incl. the module-cascade orphan case (EC7) | No ghost rows, no grace window. A ghost overstates coverage, which is the dangerous direction. |
| 4 | Defect-scoping join (EC9) | A defect appears only when its provenance resolves into this story's own chain. Standalone defects never appear. |
| 5 | Tenant isolation on the chain endpoint | Cross-workspace must 403 with zero rows rendered (AC-05). If a `SECURITY DEFINER` RPC is used, ADR-0012's actor-bind + result-scoping invariant applies in full. |
| 6 | Concurrent-import consistency (EC12) | A chain read during an active Jira import may render a consistent older snapshot; it must never render a torn one. |
| 7 | In-flight run representation in the response | A `running` run must be distinguishable from every terminal verdict and from "no run yet" (ATP negative outline 6). |

---

## Summary of what this comment closes

| Source | Count | Status |
| --- | --- | --- |
| Open Questions for PO (ATP §6) | 7 | All decided |
| Open Questions for Dev (ATP §6) | 4 | Product surface decided; mechanism handed to AI Tech Lead with binding constraints |
| `NEEDS PO/DEV CONFIRMATION` placeholders in the AC field | 4 | All resolved with frozen mockup copy |
| Edge case EC11 | 1 | Decided |
| June 2026 blocker "chain layers not sprintable" | 1 | Stale — all five layers shipped |
| BK-50 dependency | 1 | Confirmed real; retained |

Nothing on this ticket requires a human decider. No commercial commitment, no legal commitment, and no external credential is implied by any ruling above. ***BK-45 is now Ready For Dev in substance, not only in status.***

---

### Ely - 8/5/2026, 4:36:18 PM

# AI Tech Lead — technical decision pass on BK-45

Authored by the ***AI Tech Lead profile**** under `CLAUDE.md` Critical Rule #18 (this project is designed and built end-to-end by AI). This is an ****architecture ratification, not a human sign-off***. It closes the seven technical items the AI Product Owner handed over in comment 12171. Nothing here reopens a product decision.

Scoring key: ***Corr**** correctness · ****Prec**** consistency with shipped precedent · ****Migr**** migration cost (5 = cheapest) · ****Rev**** reversibility · ****Sec**** ADR-0012 · ****Perf*** performance. Each 1-5, total /30.

> ***WARNING:**** ****Facts I checked and found WRONG or under-stated in the existing record.*** Verified against the live database and the migration files, because an earlier ratification on BK-43 cited a table that does not exist.
1. `user*stories.project*id`*** is NULLABLE**** (added by migration 0016 as a denormalized backfill). It must ****not*** be used as the scope predicate. The authoritative path from a story to its project is `user*stories.module*id -> modules.project*id`. Migration 0048 already reasons this way; any plan that scopes on `user*stories.project_id` has a silent tenancy hole.
2. `tests`*** has no ****`project*id`**** and no ***`archived*at` — it is workspace-scoped only. This is why the chain query below deliberately never joins through `tests` / `test_steps`.
3. `atc*acceptance*criteria`*** has no ****`project*id`****, no ****`workspace*id`****, no ****`archived_at`****, and no DB constraint that the ATC and the AC share a project.**** Verified. The join to a project-scoped ATC set is the **only* thing preventing a cross-project ATC from appearing in a story's chain. This is precisely ADR-0012's "membership assert does not scope the result set" trap, and it is called out again in D13.
4. `atcs.status`*** is a dead column*** — permanently `'unrun'`, never written by any production path (migration 0050's header states this). Real execution status lives in `run_atcs.status`. Do not join on it.
5. ***The module-cascade orphan is real, and I found its exact root cause.**** `bunkai*archive*module*subtree` (0014) carries `where m.archived*at is null` ****inside the recursive ****`union all`**** arm***, so recursion halts at an already-archived intermediate module and its live descendants — and their ATCs — are never archived. A second route exists: `modules` has a member+ UPDATE RLS policy and no trigger, so a raw PostgREST `PATCH` archives one row with zero cascade.
6. ***But there are ZERO such orphans in the live database today.**** I ran the ancestor-prefix count against production: `orphan_atcs = 0`. So the PO's "extra join predicate, existing cascade guarantee, or corrective backfill" resolves to ****join predicate, and no backfill is required***. That is a measured result, not an assumption.
7. ***Migrations 0048 / 0050 / 0052 inherit the same orphan hole*** — they filter each level's own `archived_at` but never test ancestors. Pre-existing debt; per ADR-0012's own "do NOT fix inline" doctrine, BK-45 does not retrofit them. Recorded as separate remediation in D11.

---

## AI Tech Lead — Decision: Chain-assembly query shape, with a no-N+1 bar

***Decision******:****** one ****`SECURITY DEFINER`**** plpgsql RPC returning ****`jsonb`**** — ****`bunkai*report*story*traceability(p*actor*user*id uuid, p*user*story*id uuid)`**** — assembled from level-wise CTEs and composed with ****`jsonb*agg`**** correlated subqueries. Exactly one database round trip, constant in the size of the story.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***One RPC, level-wise CTEs + ****`jsonb_agg` | 5 | 5 | 4 | 4 | 5 | 5 | ****28*** |
| One flat SQL join, assembled in TypeScript | 4 | 2 | 5 | 5 | 4 | 2 | 22 |
| PostgREST nested `select=` embedding | 2 | 2 | 5 | 5 | 2 | 3 | 19 |
| Five sequential per-layer API calls | 1 | 1 | 5 | 5 | 3 | 1 | 16 |

***Rationale.**** The per-layer fetch is the N+1 the PO banned outright. PostgREST embedding does technically issue one HTTP request, but it cannot express two predicates this story requires — the archived-****ancestor*** test (D11) and the defect-provenance scoping rule (D12) — and, decisively, it would rely on RLS to scope a join through `atc*acceptance*criteria`, a table with no project or workspace column at all (fact 3 above). It is not merely slower; it is unable to be correct here.

The flat join is one round trip but returns the full cartesian product of AC × ATC × run × run_step. Round trips do not grow, but ***payload*** grows multiplicatively, so EC6's "50+ ATC rows" case ships an enormous result for a small screen. That violates the spirit of the PO's bar even while satisfying its letter.

The level-wise RPC is the shipped pattern here three times over — `0048*project*coverage*report.sql`, `0049*recovery*cycle*report.sql`, `0052*defect*heatmap*report.sql` — all `returns jsonb`, all DEFINER, all actor-bound at step 0 (I verified all four `bunkai*report**` functions carry the bind in the live catalogue). Composition follows the `bunkai****json` family convention: nested children as ***correlated subqueries*** with `coalesce(jsonb_agg(...), '[]'::jsonb)`, never a join — which is exactly how that family already dodges fan-out.

### The no-N+1 argument, stated precisely

Round trips = ***1****, constant. Not "few", not "amortized" — one `POST /rest/v1/rpc/bunkai*report*story_traceability`. A 1-criterion story and a 50-ATC story cost the identical single call, because every fan-out is contained inside the function as set-based CTEs. There is no per-row lateral loop, no client-side follow-up fetch, and no second request to hydrate any layer. Payload is proportional to the ****rendered tree*** (each entity serialized once under its own parent), not to the product of the layers.

### Sketch

```sql
create or replace function public.bunkai*report*story_traceability(
  p*actor*user_id uuid,
  p*user*story_id uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v*project*id uuid; v*workspace*id uuid; v_result jsonb;
begin
  -- 0. Actor bind, step 0, before any table read. Same error as not-found.
  if auth.uid() is not null and auth.uid() <> p*actor*user_id then
    raise exception 'user*story*not_found' using errcode = 'P0002';
  end if;

  -- 1. Resolve scope through module*id. user*stories.project_id is NULLABLE (0016).
  select m.project*id, p.workspace*id into v*project*id, v*workspace*id
    from public.user_stories us
    join public.modules  m on m.id = us.module_id
    join public.projects p on p.id = m.project_id
   where us.id = p*user*story_id;
  if v*workspace*id is null then
    raise exception 'user*story*not_found' using errcode = 'P0002';
  end if;
  perform public.bunkai*assert*actor*can*read*workspace(p*actor*user*id, v*workspace*id);

  -- 2. ONE statement. One snapshot. See D14.
  with archived_anc as (
    select path from public.modules
     where project*id = v*project*id and archived*at is not null
  ),
  live_atc as (                                   -- ghost-free ATC set for this project
    select a.id, a.slug, a.title, a.layer
      from public.atcs a
      join public.modules m on m.id = a.module_id
     where a.project*id = v*project_id            -- scoping
       and a.archived_at is null                  -- own state
       and m.archived_at is null                  -- own module
       and not exists (select 1 from archived_anc anc
                        where m.path like anc.path || '/%')   -- archived ancestor
  ),
  crit as (
    select ac.id, ac.title, ac.position
      from public.acceptance_criteria ac
     where ac.user*story*id = p*user*story*id and ac.archived*at is null
  ),
  pair as (                                       -- repetition INTENTIONAL, PO ruled do-not-dedupe
    select c.id as ac*id, la.id as atc*id
      from crit c
      join public.atc*acceptance*criteria j on j.acceptance*criterion*id = c.id
      join live*atc la on la.id = j.atc*id        -- the ONLY cross-project guard
  ),
  latest_run as (                                 -- exactly one row per ATC
    select distinct on (ra.atc_id)
           ra.atc*id, r.id as run*id, r.status as run*status, ra.status as atc*status,
           r.started*at, r.finished*at,
           case when r.status = 'running'  then 'in_flight'
                when r.status = 'aborted'  then 'aborted'
                when ra.status = 'pending' then 'in_flight'
                else ra.status end as state       -- D15, derived in SQL
      from public.run_atcs ra
      join public.runs r on r.id = ra.run_id
     where ra.atc*id in (select atc*id from pair)
       and r.project*id = v*project_id            -- scoping
     order by ra.atc*id, r.started*at desc, r.id desc    -- D10: total + stable
  ),
  chain_bug as (                                  -- D12
    select b.id, b.title, b.severity, b.status, b.created*at, b.atc*id
      from public.bugs b
     where b.project*id = v*project_id            -- scoping
       and b.atc*id in (select atc*id from pair)  -- provenance resolves INTO this story
  )
  select jsonb*build*object(
    'story', (select jsonb*build*object('id', us.id, 'title', us.title,
                                        'status', us.status, 'archived*at', us.archived*at)
                from public.user*stories us where us.id = p*user*story*id),
    'criteria', coalesce((
       select jsonb*agg(jsonb*build_object(
                'id', c.id, 'title', c.title,
                'atcs', coalesce((
                   select jsonb*agg(jsonb*build_object(
                            'id', la.id, 'slug', la.slug, 'title', la.title, 'layer', la.layer,
                            'latest*run', (select to*jsonb(lr) from latest*run lr where lr.atc*id = la.id),
                            'defects', coalesce((select jsonb*agg(to*jsonb(cb) order by cb.created_at desc)
                                                   from chain*bug cb where cb.atc*id = la.id), '[]'::jsonb))
                          order by la.slug)
                     from pair pr join live*atc la on la.id = pr.atc*id
                    where pr.ac_id = c.id), '[]'::jsonb))
              order by c.position)
         from crit c), '[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

revoke execute on function public.bunkai*report*story_traceability(uuid, uuid) from public, anon;
grant  execute on function public.bunkai*report*story*traceability(uuid, uuid) to authenticated, service*role;
```

Note the grain: `p*user*story*id`, not `p*project_id`. The PO fixed the route as `/projects/{projectSlug}/traceability?story={userStoryId}`, and the screen renders one story's chain. The project is derived, then membership-asserted.

***One new index is required*** (D12): `bugs` has no index on `atc_id`.

---

## AI Tech Lead — Decision: Same-timestamp tiebreaker for "latest run"

***Decision******:****** ****`order by runs.started_at desc, runs.id desc`****.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `(started_at desc, id desc)`*** on ****`runs` | 5 | 5 | 5 | 5 | 5 | 5 | ****30*** |
| `(started*at desc, created*at desc)` | 2 | 2 | 5 | 5 | 5 | 4 | 23 |
| `(started*at desc, run*atcs.id desc)` | 4 | 4 | 5 | 5 | 5 | 4 | 27 |
| New monotonic `bigint` sequence column on `runs` | 5 | 1 | 1 | 2 | 5 | 5 | 19 |

***Rationale.**** The PO required the ordering to be ****total and stable**** and explicitly said no user has a preference about which of two same-millisecond runs wins. `runs.id` is a `uuid` from `gen*random*uuid()` — random, therefore ****not chronological***, but it is unique, so `(started_at, id)` is a strict total order, and both columns are immutable after insert, so it is stable across reloads. Totality and stability are exactly the two properties requested; chronology within a same-millisecond tie was explicitly declared uninteresting.

`created_at` fails on correctness: two runs inserted in the same transaction share `now()`, so it does not break the tie and the order remains non-deterministic. A new sequence column would give chronology, but it costs a migration plus a backfill on a hot, append-heavy table to buy a property nobody asked for — rejected on migration cost and reversibility.

***It already rides the indexed grain, which is what the PO asked for.*** `(started_at desc, id desc)` is the repo's established convention, baked into two shipped indexes and one shipped query:

- `runs*test*id*status*started*at*idx on runs (test*id, status, started*at desc, id desc)` — migration 0038
- `runs*project*id*status*started*at*idx on runs (project*id, status, started*at desc, id desc)` — migration 0041
- migration 0050's `order by ra.atc*id, r.started*at desc, ra.id desc`

***No new index is needed.**** The chain query seeks `run*atcs` via `run*atcs*atc*id*idx (atc*id)` (0050) and joins `runs` by primary key; the `id desc` tiebreak is then a trivial in-memory sort inside an equal-timestamp group, which is almost always a single row. Note for completeness that `runs*test*id*started*at*idx (test*id, started_at desc)` from migration 0031 does ****not*** carry `id`, so it alone would not serve the tiebreak from an index — which is why the query above does not depend on it.

---

## AI Tech Lead — Decision: Archived filtering, including the module-cascade orphan

***Decision******:****** three predicates, belt-and-braces, applied to the ATC set. No corrective backfill — verified unnecessary.***

1. `a.archived_at is null` — the ATC's own state
2. `m.archived_at is null` — its own module
3. `not exists (archived ancestor by path prefix)` — the orphan closer

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***Own + own-module + archived-ancestor path prefix**** | 5 | 4 | 5 | 5 | 5 | 4 | ****28*** |
| Recursive CTE walking `parent*module*id` per ATC | 5 | 3 | 5 | 5 | 5 | 2 | 25 |
| Own `archived_at` only (what 0048/0050 do today) | 2 | 5 | 5 | 5 | 5 | 5 | 27 |
| Fix the cascade RPC + backfill, filter on own state only | 4 | 2 | 1 | 2 | 4 | 5 | 18 |

***Rationale.**** The PO's rule is "no ghosts, no window", and a ghost row makes the chain ****overstate*** coverage — the dangerous direction of error for a screen whose whole job is telling the truth about coverage. Filtering on the ATC's own `archived*at` is what the existing reports do and it is provably insufficient: I traced the exact root cause (fact 5 above) in `bunkai*archive*module*subtree`, whose recursive arm carries `where m.archived_at is null` and therefore stops descending at an already-archived intermediate module, leaving live grandchildren and their ATCs untouched.

Path-prefix beats a recursive walk on ***Perf*** and on consistency. `modules` has `unique (project*id, path)` and a hard depth cap of 6, so the archived-ancestor set per project is tiny and a single `not exists` against it is far cheaper than a per-ATC recursive descent. It is also the repo's own established descendant semantics — `bunkai*update*module` (0014) and `bunkai*move*module` (0015) both define descendants as `path like old*path || '/%'`, so using it here makes BK-45 consistent with two of the three existing definitions rather than inventing a fourth.

***No backfill.**** I ran the ancestor-prefix count against the live production database and it returned `orphan_atcs = 0`. There are no ghosts to correct today; the predicate is forward protection against a hole that is reachable but has not yet been hit. This is the concrete answer to the PO's three-way handover: ****join predicate, no backfill, no reliance on a cascade guarantee that does not hold.***

***Two remediation items recorded, deliberately NOT fixed in this story***, per ADR-0012's own "known debt, do not fix inline" doctrine and `rpc-authorization.md` §6 ("a broad pre-existing gap is a remediation item of its own; record what you found, size it, stay in scope"):

- ***The root cause******:*** `bunkai*archive*module_subtree`'s recursion pruning. Fixing it is an untested behavioural change to a destructive cascade, which needs its own regression budget.
- ***The same hole in the shipped reports******:*** 0048, 0050 and 0052 all filter own-state only and would count an ATC under an archived ancestor.

Both should be one tech story covering the cascade fix, the three reports, and a shared predicate, under one test pass.

The same three-predicate discipline applies to acceptance criteria (`ac.archived_at is null`), satisfying AC-06 unchanged. Per the PO's ruling, an ***archived story itself**** still renders in full with its banner; the archived filter applies **within* the chain, never to the story header.

---

## AI Tech Lead — Decision: The defect-scoping join

***Decision******:****** scope on ****`bugs.atc*id`**** against this story's live ATC set, plus ****`bugs.project*id`****. ****`run*step*id`**** is carried for display precision but is NOT the scoping key. Show all defects for the ATC, not only those from the latest run.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bugs.atc*id in (story ATC set)`*** + ****`project*id` | 5 | 5 | 4 | 5 | 5 | 5 | ****29*** |
| Walk `run*step*id -> run*steps -> run*atcs -> atc_id` | 4 | 3 | 3 | 4 | 5 | 2 | 21 |
| `bugs.run_id in (chain runs)` only | 1 | 3 | 5 | 5 | 3 | 4 | 21 |
| `bugs.module_id` = story's module | 1 | 3 | 5 | 5 | 4 | 4 | 22 |

***Rationale.*** Scoping on `run*id` alone is exactly the EC9 leak the PO named: a run belongs to a Test, a Test may chain ATCs drawn from several stories, so every defect raised anywhere in that run would surface under this story. Scoping on `module*id` is coarser still — module-level, not story-level.

The decisive verified fact that makes the cheap denormalized column trustworthy: the `bugs*check*consistency` trigger (migration 0046, lines 161-215) validates `atc↔project` (error 45307), `run*step↔run` (45306), `run↔project` (45305) and `module↔project` (45300) on ***both INSERT and UPDATE****. So `bugs.atc*id` is not a free-form pointer — it is enforced provenance. That is why the two-hop walk through `run*step*id` scores lower: it costs an extra join, it needs an index that does not exist (`bugs` has ****no*** index on `run*step*id`), and it lands on the identical `atc_id` the row already carries. Same answer, more work.

`run*step*id` is nullable even on run-linked defects, so it cannot be the scoping key regardless; it is carried into the payload for the step-level display precision the PO asked for.

***Both PO rules fall out directly******:***

- A defect raised during the same run against a ***different*** story's ATC has a different `atc_id`, so it is excluded. EC9 closed.
- Standalone defects carry `atc_id is null`, so `in (...)` never matches them. They never appear in any chain. Ruling honoured without a special case.

***Latest-run scoping, decided******:**** defects are ****not*** restricted to the latest run. The mockup's Defects column is per-ATC-row, and a defect's relevance to coverage does not expire when a later run passes — the defect carries its own `status` (`open` / `in*progress` / `resolved` / `closed`), which is the honest signal, and the recovery-cycle report exists precisely because defect lifecycle is independent of run verdicts. Ordered `created*at desc`.

***Required index*** (`bugs` has none on `atc_id`):

```sql
create index if not exists bugs*atc*id_idx
  on public.bugs (atc*id) where atc*id is not null;
```

Partial, so it indexes only run-linked defects and stays small.

---

## AI Tech Lead — Decision: Tenant isolation on the traceability RPC

***Decision******:****** ****`SECURITY DEFINER`****, and ADR-0012 applies in full. Both properties are proven separately, and the compliance statement below is explicit per row-source.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***DEFINER + bind at step 0 + per-CTE scoping**** | 5 | 5 | 5 | 4 | 5 | 5 | ****29*** |
| `SECURITY INVOKER`, no actor param, rely on RLS | 3 | 3 | 5 | 5 | 3 | 3 | 22 |
| DEFINER with membership assert only | 1 | 2 | 5 | 4 | 1 | 5 | 18 |

***Rationale on the INVOKER question**** (`rpc-authorization.md` §4 question 1, answered before any SQL): INVOKER is the preferred outcome and I considered it seriously, since this is a pure read. It fails here for a concrete reason: `atc*acceptance*criteria` has ****no**** `project*id` or `workspace*id` column and ****no*** RLS-reachable path to one (fact 3). RLS cannot scope the M:N hop that is the spine of this query. DEFINER plus explicit scoping is therefore the correct choice, not a convenience — and it matches all three shipped report RPCs.

The third option is the live-in-production mistake ADR-0012 was written about: asserting the caller's membership and then not constraining the returned rows. It is listed to be explicitly rejected.

### Explicit ADR-0012 compliance statement — `bunkai*report*story_traceability`

***(a) Actor bind.**** Present, at ****step 0***, before any table read:

```sql
if auth.uid() is not null and auth.uid() <> p*actor*user_id then
  raise exception 'user*story*not_found' using errcode = 'P0002';
end if;
```

It raises the ***same*** error as not-found, so the function is not an oracle for which `(actor, story)` pairs exist. Byte-identical in shape to migration 0048's canonical guard.

***(b) Result scoping — every row source, separately constrained.*** Satisfying (a) does not satisfy (b), so each is enumerated:

| Row source | What constrains it |
| --- | --- |
| story header | `us.id = p*user*story_id` — the story whose workspace was membership-asserted |
| `crit` (acceptance criteria) | `ac.user*story*id = p*user*story_id` |
| `live*atc` | `a.project*id = v*project*id` |
| `pair` (AC × ATC) | joins `crit` × `live*atc`, both already scoped — ***this is the critical one***; `atc*acceptance_criteria` carries no scope column and no DB constraint that the ATC and the AC share a project, so this join is the sole guard against a cross-project ATC entering the chain |
| `latest*run` | `r.project*id = v*project*id`, and `ra.atc*id in (select atc*id from pair)` |
| `chain*bug` | `b.project*id = v*project*id`, and `b.atc*id in (select atc*id from pair)` |

`v*project*id` is not caller-supplied. It is derived inside the function from the story, through `module*id` (never through the nullable `user*stories.project*id`), and the workspace it resolves to is the one passed to `bunkai*assert*actor*can*read*workspace`. There is no caller-supplied scope parameter anywhere in this function.

***A structural note that removes a whole class of risk******:**** the query deliberately never joins through `tests` or `test*steps` — the only tables in the chain with no project or workspace column — reaching runs via `run*atcs.atc_id` instead, which is migration 0050's shipped pattern. Test and Run data therefore enter only as **context hanging off an already-scoped ATC*, which is exactly the PO's framing of those columns.

***Grants******:*** `revoke ... from public, anon; grant ... to authenticated, service*role` — the report-RPC convention. The PO ruled viewer-and-above may read, and `bunkai*assert*actor*can*read*workspace` gates on active membership without a role-level check, which implements that ruling exactly. AC-05's cross-workspace 403 becomes P0002 at the DB layer and is mapped at the HTTP edge.

***Test contract*** (`rpc-authorization.md` §5 — DB-integration, real session, not a mock; ships in the same slice as the migration):

1. A legitimate member reads their own story's chain successfully.
2. A spoofed `p*actor*user_id` (a uuid belonging to nobody) is rejected with P0002.
3. A story in another workspace returns P0002 with zero rows disclosed.
4. ***An ATC from a different project, bound to this story's AC by a hand-inserted ****`atc*acceptance*criteria`**** row, never appears in the result.*** This is the test that proves (b) independently of (a), and it is the one that would have caught the BK-49 incident.
5. An archived ATC, and an ATC under an archived ancestor module, are both absent.

---

## AI Tech Lead — Decision: Concurrent-import consistency (EC12)

***Decision******:****** assemble the entire chain in a SINGLE SQL statement. Under the default ****`READ COMMITTED`****, one statement takes one snapshot, so the result is torn-free by construction — no isolation change, no locking, no coordination with the importer.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***Single-statement assembly under READ COMMITTED**** | 5 | 5 | 5 | 5 | 5 | 5 | ****30*** |
| `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` | 1 | 1 | 5 | 4 | 5 | 3 | 19 |
| Advisory lock shared with the import runner | 3 | 1 | 4 | 3 | 4 | 1 | 16 |
| Accept tearing, add a client-side consistency check | 2 | 1 | 5 | 4 | 4 | 3 | 19 |

***Rationale.**** The PO's bar is that an older snapshot is fine but a torn one is not — which is precisely the guarantee a single statement already gives. Postgres takes one snapshot at statement start, so every CTE in the query above observes the same instant. A concurrent Jira import that adds criteria mid-read produces a chain that is **slightly stale*, never one where the criteria list reflects the new import and the ATC list reflects the old.

`REPEATABLE READ` is not merely unnecessary, it is ***unavailable***: the function is invoked through PostgREST, which has already opened the transaction, and `SET TRANSACTION ISOLATION LEVEL` raises once a statement has run. It scores 1 on correctness because it would fail at runtime. An advisory lock is worse than the disease — it would let a long import block a read-only screen, and the PO explicitly said staleness is acceptable.

***Binding implementation constraint, and a review checklist item.*** The guarantee is structural, so it is fragile to an innocent-looking edit. Two rules:

- The step-1 scope-resolution `SELECT` reads only `user_stories` / `modules` / `projects` for ***authorization***. No chain data may be read there.
- All chain data is assembled in the one `select ... into v_result`. ***If a future change splits that into two statements, tearing becomes possible again.*** Stage 3 review must check this explicitly, because the failure is silent and would only show up as a rare, unreproducible inconsistency.

---

## AI Tech Lead — Decision: In-flight run representation

***Decision******:****** a ****`state`**** discriminator derived in SQL, with run-level ****`running`**** outranking any position-level verdict. The raw ****`run*status`****, ****`atc*status`****, ****`started*at`**** and ****`finished*at`**** all travel alongside it.***

```sql
case when r.status  = 'running' then 'in_flight'
     when r.status  = 'aborted' then 'aborted'
     when ra.status = 'pending' then 'in_flight'   -- run ended, this position never executed
     else ra.status end                            -- passed | failed | blocked | skipped
```

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***Discriminator derived in SQL, run-level wins**** | 5 | 4 | 5 | 4 | 5 | 5 | ****28*** |
| Same logic derived in the React component | 3 | 3 | 5 | 5 | 5 | 5 | 26 |
| Emit raw statuses only, let each consumer decide | 2 | 4 | 5 | 5 | 5 | 5 | 26 |
| Filter in-flight runs out, show the last finished one | 1 | 1 | 5 | 4 | 5 | 4 | 20 |

***Rationale.*** The last option is the one the PO explicitly banned, and it is worth naming: showing yesterday's verdict for a Test that started two minutes ago is the stale answer the screen exists to eliminate.

***Why derived in SQL rather than in TSX**** — this is the decisive argument and it comes straight from a PO ruling on this same ticket. The PO ruled that BK-50 (export the chain) ****invokes*** BK-45 and must not re-query the database, and rejected duplication on the grounds that "two implementations of the same five-layer join will drift, and the day they drift the exported audit pack disagrees with the screen it claims to be a snapshot of". A discriminator computed in the React component is that same duplication one layer up: the export renderer would have to re-derive it and could drift identically. Putting it in the contract makes the screen and the audit pack provably agree.

***Two traps this closes, both of which produce a wrong verdict******:***

1. `run_atcs.status` is `'pending'` for positions a running run has not reached. Mapping `pending` to "no run yet" would render an in-flight run as the `--skipped` "Awaiting first run" pill — exactly the misreport the PO banned.
2. A position that already reads `'passed'` inside a run that is still `'running'` would render as a green verdict for a run that can still abort. ***Run-level ****`running`**** outranks position-level verdicts***, because a run is a snapshot in progress (ADR-0004) and no verdict is final until it finishes.

***Three states are distinguishable, mapping onto the PO's frozen layer-specific copy******:***

| Condition | Serialization | UI |
| --- | --- | --- |
| no `run*atcs` row for this ATC at all | `latest*run: null` | `--skipped` dotted pill, "Awaiting first run" |
| `state = 'in*flight'` | full object, `finished*at: null` | the metrics screen's `--running` grammar |
| `state ∈ {passed, failed, blocked, skipped, aborted}` | full object | the verdict treatment |

`--running` is the established grammar the PO named; it must ***not*** collapse into the `--skipped` dotted pill, which means something different (no data yet) and is the visual the PO reserved for the null case.

Note `runs.status` is a CHECK constraint on `text`, not a Postgres enum type — so the `case` is over string literals and adding a status later needs no type migration.

---

## Summary and readiness

All seven handed-over items are decided. Deliverables implied by these decisions, so the dev run has no discovery to do:

- One migration: `bunkai*report*story*traceability` + `create index bugs*atc*id*idx on bugs (atc*id) where atc*id is not null`.
- One DB-integration test file covering the five cases in D13.
- No backfill, and no other index (D10 rides the existing indexed grain; D11 rides `modules.path`'s existing unique constraint).

***Two remediation items recorded and deliberately out of scope***, both from D11: the recursion pruning in `bunkai*archive*module_subtree`, and the identical archived-ancestor hole in reports 0048 / 0050 / 0052. One tech story, one test pass.

***One AC correction to record***, consistent with the PO's own note that the mockup supersedes AC-03's "zero chain rows are rendered": AC-06's archived filtering is satisfied by the three-predicate rule in D11, which is strictly stronger than the AC's current wording.

BK-45 is implementable with ***zero remaining technical ambiguity*** and stays a single 8 SP story, as the PO ruled. No commercial commitment, no legal commitment and no external credential is implied by any decision above. No decision here requires a human decider under Rule #18.

---


_Synced from Jira by sync-jira-issues_
