# Comments for BK-43

[View in Jira](https://jira.upexgalaxy.com/browse/BK-43)

---

### Nahuel Gomez - 6/29/2026, 11:29:24 PM

## Shift-Left QA Refinement — 2026-06-29

### Quality Gaps Found

| ***Gap**** | ****Severity*** |
| --- | --- |
| Integration mechanism undefined (polling/event/webhook?) | HIGH |
| No Gherkin ACs | HIGH |
| Retry policy undefined | HIGH |
| Field mapping undefined | HIGH |
| Sync on update unaddressed | HIGH |
| Deletion semantics undefined | HIGH |
| Authentication mechanism undefined | MEDIUM |
| Duplicate detection | MEDIUM |

### Open Questions for PO

1. ***Sync on update:*** When a Bunkai bug is edited, should the change propagate to the external tracker?
2. ***Deletion semantics:*** If a Bunkai bug is deleted, should the external issue also be deleted?
3. ***External tracker:*** Confirm Jira Cloud?
4. ***Field mapping:*** severity→priority, module→component, evidence→attachment?

### Open Questions for Dev

1. ***Integration mechanism:*** DB event trigger, pg_cron poller, or event bus webhook?
2. ***Retry policy:*** max retries, backoff formula, permanent failure threshold
3. ***Deduplication key:*** external_id field, content hash, or idempotency key?
4. ***Rate limiting:*** Expected external API limits, 429 backoff strategy
5. ***Auth refresh:*** How does admin update expired credentials?

### ATP DRAFT — 13 outlines

1. TDS01 — New defect auto-syncs
2. TDS02 — Fire-and-forget on network failure
3. TDS03 — Failed sync auto-retried
4. TDS04 — Sync-failed badge + retry button
5. TDS05 — One-way: no reverse sync
6. TDS06 — Workspace without integration — no sync
7. TDS07 — Duplicate prevention
8. TDS08 — Permanent auth failure stops retries
9. TDS09 — Bug update propagates (if confirmed)
10. TDS10 — Deletion does not delete external
11. TDS11 — Rate limit backoff
12. TDS12 — Field mapping accuracy
13. TDS13 — Workspace isolation

Full refinement: `shift-left-bk43.md` in QA repo.

---

### Nahuel Gomez - 7/3/2026, 5:32:24 PM

## QA Refinements (Shift-Left Analysis)

### Quality Gaps Found

| ***Gap**** | ****Severity*** |
| --- | --- |
| Integration mechanism undefined (polling/event/webhook?) | HIGH |
| No Gherkin ACs | HIGH |
| Retry policy undefined | HIGH |
| Field mapping undefined | HIGH |
| Sync on update unaddressed | HIGH |
| Deletion semantics undefined | HIGH |
| Authentication mechanism undefined | MEDIUM |
| Duplicate detection | MEDIUM |

### Open Questions for PO

1. ***Sync on update:*** When a Bunkai bug is edited, should the change propagate to the external tracker?
2. ***Deletion semantics:*** If a Bunkai bug is deleted, should the external issue also be deleted?
3. ***External tracker:*** Confirm Jira Cloud?
4. ***Field mapping:*** severity→priority, module→component, evidence→attachment?

### Open Questions for Dev

1. ***Integration mechanism:*** DB event trigger, pg_cron poller, or event bus webhook?
2. ***Retry policy:*** max retries, backoff formula, permanent failure threshold
3. ***Deduplication key:*** external_id field, content hash, or idempotency key?
4. ***Rate limiting:*** Expected external API limits, 429 backoff strategy
5. ***Auth refresh:*** How does admin update expired credentials?

### ATP DRAFT — 13 outlines

ATP DRAFT lives in the 🧪 Acceptance Test Plan (ATP) field. Covers 13 outlines (7 positive, 4 negative/error, 2 boundary). Full detail in customfield_10067.

---

### Nahuel Gomez - 7/10/2026, 8:25:35 PM

1. 

****Story Points:**** 1 SP
****Rationale:**** Shift-left refinement complete (13 AC outlines across 4 categories: 7 positive, 4 negative/error, 2 boundary). Low complexity — one-way sync integration with existing defect filing workflow ([https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40](https://jira.upexgalaxy.com/browse/BK-40#icft=BK-40)). ATP published to field.

****Estimated by:**** Nahuel Gomez
****Date:**** 2026-07-10
****Next:**** Ready For Dev

---

### Nahuel Gomez - 7/10/2026, 8:57:55 PM

## Estimation Completed

***Story Points:*** 1 SP
***ATP:*** Published to field (26 outlines)
***Rationale:*** Shift-left refinement complete. Low complexity — one-way sync integration.

***Estimated by:**** Nahuel Gomez | ****Date:*** 2026-07-10

---

### Nahuel Gomez - 7/22/2026, 9:01:24 PM

## Automation — 14 KATA ATCs written

14 Test issues created and linked to [BK-43](https://jira.upexgalaxy.com/browse/BK-43) with KATA-compliant automated tests in the QA engineering repo:

| ***Test**** | ****ATC**** | ****Scenario**** | ****Status*** |
| --- | --- | --- | --- |
| [BK-234](https://jira.upexgalaxy.com/browse/BK-234) | TDS01 | New defect auto-syncs | Candidate |
| [BK-235](https://jira.upexgalaxy.com/browse/BK-235) | TDS02 | Fire-and-forget on network failure | Candidate |
| [BK-236](https://jira.upexgalaxy.com/browse/BK-236) | TDS03 | Failed sync auto-retried | Candidate |
| [BK-237](https://jira.upexgalaxy.com/browse/BK-237) | TDS04 | Sync-failed state | Candidate |
| [BK-238](https://jira.upexgalaxy.com/browse/BK-238) | TDS05 | One-way: no reverse sync | Candidate |
| [BK-239](https://jira.upexgalaxy.com/browse/BK-239) | TDS06 | Workspace without integration | Candidate |
| [BK-240](https://jira.upexgalaxy.com/browse/BK-240) | TDS07 | Duplicate prevention | Candidate |
| [BK-241](https://jira.upexgalaxy.com/browse/BK-241) | TDS08 | Permanent auth failure stops retries | Candidate |
| [BK-242](https://jira.upexgalaxy.com/browse/BK-242) | TDS09 | Bug update propagates | Candidate |
| [BK-243](https://jira.upexgalaxy.com/browse/BK-243) | TDS10 | Deletion does not delete external | Candidate |
| [BK-244](https://jira.upexgalaxy.com/browse/BK-244) | TDS11 | Rate limit backoff | Candidate |
| [BK-245](https://jira.upexgalaxy.com/browse/BK-245) | TDS12 | Field mapping accuracy | Candidate |
| [BK-246](https://jira.upexgalaxy.com/browse/BK-246) | TDS13 | Workspace isolation | Candidate |
| [BK-247](https://jira.upexgalaxy.com/browse/BK-247) | TDS14 | External link back to Bunkai | Candidate |

All tests are tagged `@critical @defect-sync` and included in the CI regression + smoke pipeline. Results auto-sync to Xray via AUTO_SYNC.

***Next:*** When the Defect Sync API ships to staging, run the regression suite — results will flow to Xray and flip these tests from Candidate to Automated.

PR: [https://github.com/nelgoez/bunkai-qa-engineering/pull/1](https://github.com/nelgoez/bunkai-qa-engineering/pull/1)

---

### Nahuel Gomez - 7/22/2026, 9:26:10 PM

## PR #1 Merged — Automation Code on `main`

14 KATA ATCs now on the default branch. CI pipeline green (including pre-existing [BK-169](https://jira.upexgalaxy.com/browse/BK-169) fix).

| ***Key**** | ****Status**** | ****QA Assignee*** |
| --- | --- | --- |
| [BK-234](https://jira.upexgalaxy.com/browse/BK-234) — [BK-247](https://jira.upexgalaxy.com/browse/BK-247) | Candidate → AUTOMATED (once feature ships) | Ely |

***Next:*** Once [BK-43](https://jira.upexgalaxy.com/browse/BK-43) defect sync endpoints deploy to staging, running regression will execute these ATCs and sync results to Xray automatically.

---

### Ely - 7/30/2026, 1:28:25 PM

Mockup — Bug detail — Jira sync status states. Source: .context/designs/bunkai-test-management-tool/bk-31-bug-reports/bug-detail.html · spec: master-design-plan §4.6



---

### Ely - 8/1/2026, 7:17:44 PM

## PO + Dev Ratification — explicit live authorization, 2026-08-01

Delegated by Ely (project owner) in a live conversation on 2026-08-01, NOT a blanket forward-dated batch comment. AI-authored, grounded in the evidence cited below. Answers are decisive engineering/product calls where within scope; anything genuinely requiring the human owner is flagged explicitly, not guessed.

> ***INFO:**** The 2026-06-29 / 2026-07-03 shift-left comments list ****9*** explicit Open Questions (4 for PO, 5 for Dev), not 8 — quoting all 9 verbatim below for completeness. All are answered; none require escalation to Ely.

### Evidence reviewed before deciding

- `.context/business/business-data-map.md` §6 "External Integrations > Jira (Atlassian)" — the outbound bug-sync direction is already architected: `bugs.external*id` + `bugs.external*url` + `jira*sync*status`, an `integrations` row with `kind=jira` + `config` + `secrets_ref`, a "Jira bug-sync worker" fired on `bugs` INSERT, and a `jira-bug-sync-retry` cron (every 5 min, exponential backoff) already named in §5.
- `.context/master-implementation-plan.md` — "Jira REST — Sprint 3 (inbound import) + Sprint 5 (outbound sync)" names a ***Jira Cloud**** sandbox tenant explicitly. GitHub Issues + Linear sync are explicitly ****Phase 3***, out of scope here.
- `.context/design/master-design-plan.md` §4.6 — `bug-detail.html` mockup already specs the "External tracker panel" with exactly four states: default (synced + linked run), standalone (no tracker attempted), sync-failed (badge + failure-reason card), no-integration-configured (panel absent, no error).
- `.context/ADR/ADR-0012-rpc-authorization-invariant.md` + `.claude/skills/sprint-development/references/rpc-authorization.md` — actor-bind + result-scoping invariant for any `SECURITY DEFINER` function.
- BK-43's own description/DoD (already Ready For Dev before this pass) — confirms one-way direction, non-blocking filing, sync-failed state, auto-retry.

***Conclusion on the authority boundary***: no sub-question below requires a new vendor choice (Jira Cloud is already the named target in project docs), a new credential-storage mechanism (`secrets_ref` on the `integrations` row is already established, shared with the BK-009 import direction), or a new data-exposure posture (the sync's approved purpose is to expose defect content externally; no broader leak surface was found). All 9 are decided below.

---

### Open Questions for PO

***1. "Sync on update******:****** When a Bunkai bug is edited, should the change propagate to the external tracker?"***
Decision: ***No — BK-43 is create-only sync.**** The DoD bullets only describe create-time behavior (filed → sent automatically, synced/sync-failed states, retry). None mentions edit-triggered re-sync, and `business-data-map.md`'s worker is documented as firing "on `bugs` INSERT" only, not UPDATE. ATP outline TDS09 ("Bug update propagates") is explicitly marked "(if confirmed)" in QA's own draft — now confirmed ****out of scope*** for this 1 SP story. Add an explicit Out of Scope line rather than leaving it silently unaddressed. Update-propagation is a follow-up story if the team wants it later.

***2. "Deletion semantics******:****** If a Bunkai bug is deleted, should the external issue also be deleted?"***
Decision: ***No — deletion never propagates.*** Consistent with the DoD's own one-way invariant ("never the reverse") and QA's ATP outline TDS10 ("Deletion does not delete external"), which already assumed this. Also, `business-data-map.md` §4.4 models `bugs.status` as a state machine (open/in_progress/resolved/closed/reopened) with no delete transition — Bugs are not hard-deleted in this system, so the question is close to moot; if a future admin hard-delete is added, it still must not cascade externally.

***3. "External tracker******:****** Confirm Jira Cloud?"***
Decision: ***Confirmed — Jira Cloud.*** Already named, not a new choice: `business-data-map.md` §6 documents the full Jira REST push/pull integration (`integrations.kind=jira`), and `master-implementation-plan.md` names "a Jira Cloud sandbox tenant for development." GitHub Issues / Linear sync are explicitly deferred to Phase 3 (`master-implementation-plan.md` lines 573/710) and are not this story. Per the authority boundary in this delegation, if the target had NOT already been named anywhere in project context, this specific sub-question would have been flagged to Ely instead of decided — it did not need to be, because it already was.

***4. "Field mapping******:****** severity→priority, module→component, evidence→attachment?"***
Decision: ***severity → Jira ****`priority`****. Module → embedded as full path text in the Jira issue body (NOT a Jira ****`component`****). Evidence/attachments → NOT synced in this story.*** Reasoning: Jira `components` must be pre-provisioned per target project and auto-creating them adds a fragile external dependency the 1 SP scope doesn't budget for; embedding the module's full path in the issue description (next to the required Bunkai backlink, per `business-data-map.md`'s "backlinks Jira issue body") gives engineers the same context without that coupling. Evidence attachments are excluded from sync scope — no DoD bullet requires it, and it narrows the sync's data-exposure surface rather than widening it (a conservative call, not one that needs escalation).

### Open Questions for Dev

***5. "Integration mechanism******:****** DB event trigger, pg******_******cron poller, or event bus webhook?"***
Decision: ***Neither a DB trigger nor pg*************cron — a fire-and-forget async call from the same API route right after the ****`bugs`**** INSERT commits, backed by the already-named ****`jira-bug-sync-retry`**** Vercel Cron sweep (every 5 min) for anything that didn't land synchronously.*** This matches the existing "Async Workers / Incoming Webhooks" pattern in `business-data-map.md` §5 (same shape as `run-timeout-sweeper` / `idempotency-cleanup`) and the project's MVP infra note that "MVP uses Vercel Cron with serverless functions" — there is no pg*cron or dedicated event-bus infra in this stack to reach for instead. This also satisfies the DoD's "filing never waits on or fails because of the sync" requirement directly: the initial attempt is async/non-blocking, and the cron is the safety net.

***6. "Retry policy******:****** max retries, backoff formula, permanent failure threshold"***
Decision: ***5 attempts, exponential backoff (5 min → 15 min → 45 min → 2 h → 6 h, i.e. roughly ×3 per step, capped), then flip to a terminal ****`failed`**** state with a manual "Retry" action in the UI*** — matching the mockup's sync-failed state (badge + failure-reason card) and QA's TDS08 ("permanent auth failure stops retries"). Auth failures (see Q9) skip the backoff ladder and go terminal immediately rather than burning retries against credentials that won't change on their own.

***7. "Deduplication key******:****** external******_******id field, content hash, or idempotency key?"***
Decision: `bugs.external*id` (nullable until first successful sync) as the dedup signal — reuses the same field `business-data-map.md` already documents for the inbound-import direction's dedup, applied symmetrically here: never create a second Jira issue for a bug whose `external*id` is already set. Additionally wrap the actual Jira-create call using the project's existing `idempotency_keys` mechanism (ADR-0002) to close the race window between two overlapping cron sweeps. No new dedup concept introduced — both mechanisms already exist in this codebase.

***8. "Rate limiting******:****** Expected external API limits, 429 backoff strategy"***
Decision: ***429 responses fold into the same retry/backoff path as Q6*** — respect `Retry-After` when Jira sends it, otherwise fall back to the standard backoff step. At the realistic volume for a QA team's manual defect filing (not bulk import), no dedicated rate-limiter/queue-throttle is warranted at this scope; revisit only if usage data shows otherwise.

***9. "Auth refresh******:****** How does admin update expired credentials?"***
Decision: ***No new credential UX is built in BK-43.*** Credential storage already goes through `secrets_ref` on the shared `integrations` row (`business-data-map.md` §6), the same row the BK-009 Jira import direction uses — BK-43 reuses it, it does not invent a new one. On a sync auth failure (401/403), mark the bug's sync state terminal-failed immediately (no retry burn — see Q6) with an "authentication failed" reason in the mockup's failure-reason card; once the admin re-saves the integration config (existing/future Settings flow, out of this story's scope), the next `bugs` INSERT or cron sweep naturally uses the refreshed credentials. Building a dedicated credential-rotation screen is not this story's job.

---

### Technical note for Stage 1 (binding, not a new decision)

If the sync worker's write-back to `bugs.external*id` / `external*url` / `jira*sync*status` is implemented as a `SECURITY DEFINER` RPC taking a caller-supplied identity or workspace-scope parameter, it is subject to `ADR-0012`'s actor-bind + result-scoping invariant (`.claude/skills/sprint-development/references/rpc-authorization.md`). Since this worker runs server-side (cron/service-role, not a user-invoked call), the `auth.uid() IS NULL` branch of the actor-bind guard applies — but ***result scoping still applies***: the sweep must only touch bugs whose `integrations` row (and thus `secrets_ref`) belongs to the same workspace as the bug being synced. Answer the six-question checklist in Stage 1 Technical Decisions before writing the migration, per the ADR's binding enforcement point.

---

***Refinement status******:****** READY***

---

### Ely - 8/5/2026, 4:10:55 PM

## AI Product Owner / Business Analyst — decision pass on BK-43

> ***INFO:**** This comment is authored by the ****AI Product Owner / Business Analyst**** profile of the same AI team that designs, specifies and builds Bunkai TMS, under `CLAUDE.md` Critical Rule #18 (AI-led decision authority). It is ****not**** a human PO sign-off and must not be read as one. Every ruling below enumerates its alternatives, scores them, and states the reasoning. Integration ****architecture**** (worker shape, retry mechanics, backoff maths) is deliberately ****not**** decided here — it is handed to the ****AI Tech Lead*** at the end, with the product constraints these rulings impose.

### Evidence read before deciding

| Source | What it settled |
| --- | --- |
| `.context/PRD/mvp-scope.md` L107 + L108 | GitHub Issues sync, Linear sync and bidirectional Jira sync are ***Phase 3***; Jira Data Center is Enterprise/Phase 3. Only Jira Cloud one-way is in the MVP band. |
| `.context/master-implementation-plan.md` L385, L389 | "Jira REST — Sprint 3 (inbound import) + Sprint 5 (outbound sync)", lead-time item is a ***Jira Cloud sandbox tenant***. |
| `lib/jira/client.ts` L116-L124 (shipped, BK-17 Ready For Release) | The live Jira client authenticates from ***deployment-level env vars**** `ATLASSIAN*URL` / `ATLASSIAN*EMAIL` / `ATLASSIAN*API*TOKEN`. There is ****no*** per-workspace credential row. |
| `supabase/migrations/0046*bugs.sql` L93-L121 | The shipped `bugs` table has `module*id`, `run*id`, `run*step*id`, `atc*id`, `status`. It has ***no**** `external*id`, ****no**** `external*url`, ****no*** `jira*sync*status`. |
| Full migration scan `0001`-`0063` | There is ***no**** `integrations` table and no `secrets_ref` anywhere. The `integrations` row described in `business-data-map.md` §6 is a **planned* model, not as-built. |
| `.context/design/master-design-plan.md` §4.6 + `bk-31-bug-reports/bug-detail.html` | The frozen mockup specifies exactly four External-tracker panel states and their literal copy. |
| `.context/business/domain-glossary.md` §3 | Bug = native defect anchored to Module + ATC + Run, "optional one-way Jira sync". |

> ***WARNING:**** ****Correction to the 2026-08-01 ratification comment on this ticket.**** That comment answered Q9 by saying BK-43 "reuses `secrets_ref` on the shared `integrations` row". Against the as-built code that is false: neither the table nor the column exists, and the shipped Jira import reads a single deployment-wide credential instead. The rulings below are grounded in the migrations and `lib/jira/client.ts`, not in the planned data map. Where this comment and the 2026-08-01 comment disagree, ****this one supersedes it***.

---

## AI Product Owner — Decision: Which external tracker is the target, and is it configurable or fixed?

***Decision******:****** Jira Cloud, FIXED for v1 — not user-selectable, not a provider abstraction.**** The product exposes no tracker picker. What **is** configurable per project is the destination ****Jira project key**** and an ****enabled*** flag (see the slicing ruling below for where that lands).

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Jira Cloud, fixed (chosen)**** | 5 | 5 | 5 | 4 | 5 | ****24*** |
| Provider-agnostic adapter (Jira + GitHub + Linear) | 3 | 1 | 1 | 5 | 2 | 12 |
| Jira, but site/credentials configurable per workspace | 4 | 2 | 2 | 4 | 2 | 14 |
| Generic outgoing webhook, team maps fields themselves | 2 | 1 | 3 | 4 | 2 | 12 |

***Rationale.**** This was never an open choice — it was an unread one. The PRD puts GitHub Issues and Linear sync in Phase 3, the implementation plan names a Jira Cloud sandbox as the only integration lead-time item, and a Jira Cloud REST client already ships in `lib/jira/client.ts` for the inbound import. Building a provider abstraction now is speculative generality against a roadmap that explicitly defers the second provider by two phases. Fixing on Jira Cloud is also cheaply reversible: the second provider arrives as a new story that introduces the abstraction **at the point a second implementation exists to abstract over*, which is the only moment the abstraction can be designed correctly.

***Per-workspace credentials are explicitly out.*** The shipped import proves the deployment-wide credential model is the working precedent. Introducing per-workspace secret storage inside a sync story would drag in secret-at-rest encryption, rotation and a credentials UI — a security-shaped surface that deserves its own story and its own ADR, not a bullet in a sync ticket.

---

## AI Product Owner — Decision: What triggers a sync?

***Decision******:****** creation only.*** A defect is queued for sync at the moment it is filed, and only then. Nothing else in the product initiates a sync: not a status change, not an edit, not a schedule, not a user gesture.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***On creation only (chosen)**** | 4 | 5 | 5 | 5 | 5 | ****24*** |
| On creation + on any subsequent edit | 5 | 2 | 2 | 3 | 2 | 14 |
| On creation + on status transition only | 4 | 3 | 3 | 4 | 3 | 17 |
| Scheduled sweep of all unsynced defects, no create-time attempt | 2 | 2 | 4 | 4 | 3 | 15 |

***Rationale.**** Every Definition-of-Done bullet on this story describes create-time behavior. `business-rules.md` says "sync runs automatically on filing"; `workflow.md` narrates a single create-and-forget arc. Nothing in the story asks for edit propagation. Crucially, the destination is a ****Jira issue an engineer is actively working***: pushing Bunkai edits over it after handoff means Bunkai silently overwrites a field a developer may have deliberately changed — which is bidirectional-sync semantics smuggled in through the back door, and bidirectional sync is Phase 3 by the PRD.

The retry sweep is ***not**** a second trigger. Retrying a defect that has never reached Jira is the **same* create attempt, resumed. That is the mechanism the AI Tech Lead owns, not a product-visible event.

---

## AI Product Owner — Decision: Do edits after the first sync propagate? (resolves ATP marker TDS09)

***Decision******:****** No. Update propagation is OUT OF SCOPE and the ATP outline TDS09 is retired, not deferred.**** The `(NEEDS PO CONFIRMATION)` marker on TDS09 is hereby resolved to ****NO***.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***No propagation; add explicit Out-of-Scope line (chosen)**** | 4 | 5 | 5 | 5 | 5 | ****24*** |
| Propagate title + description only | 3 | 2 | 3 | 3 | 2 | 13 |
| Propagate everything the create call sent | 3 | 1 | 2 | 3 | 1 | 10 |
| Post a Jira comment noting "updated in Bunkai" instead of editing fields | 4 | 3 | 4 | 5 | 4 | 20 |

***Rationale.**** Same reasoning as the trigger ruling: a synced defect belongs to the engineer working it in Jira, and one-way-write-after-handoff is where "one-way sync" quietly becomes a conflict-resolution problem. The runner-up (a "changed in Bunkai" Jira comment) scored well and is genuinely attractive — it is additive, never overwrites, and preserves the human handoff — but it is a **new** product behavior nobody has asked for, and it belongs in a follow-up story rather than being invented inside a sync ticket. Note that `bug-detail.html` is a ****read-only*** record with no edit controls (design plan §4.6), so in the current shipped surface there is barely an edit path to propagate from.

***Action for QA******:**** delete TDS09 from the ATP and re-scope the linked ATC ****BK-242**** (`BK-43-TDS09: Synced defect update triggers re-sync`) as invalid-by-decision. Add to `out-of-scope.md`: **"Propagating post-creation edits of a synced defect to the external tracker."*

---

## AI Product Owner — Decision: What happens on delete? (resolves ATP marker TDS10)

***Decision******:****** deletion never propagates, and the question is close to moot — Bunkai does not hard-delete defects.**** The `(NEEDS PO CONFIRMATION)` marker on TDS10 is resolved to ****the external item is NOT deleted***, exactly as QA's outline already assumed.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Never propagate deletion (chosen)**** | 5 | 5 | 5 | 4 | 5 | ****24*** |
| Delete the Jira issue too | 1 | 1 | 3 | 1 | 1 | 7 |
| Transition the Jira issue to a cancelled/closed status | 3 | 2 | 2 | 3 | 2 | 12 |
| Post a Jira comment saying the Bunkai defect was removed | 3 | 3 | 4 | 5 | 4 | 19 |

***Rationale.**** Destroying an engineer's Jira issue from a QA tool is an irreversible cross-system side effect with no undo, triggered by an action the QA Lead may not realize is destructive. It fails the one-way invariant in spirit even while satisfying it in direction. Separately, `0054*bug*assignment*status.sql` models the defect lifecycle as a forward status machine (`open` to `in*progress` to `resolved` to `closed`) with no delete transition — so in the shipped product a defect is closed, not deleted. TDS10 stays in the ATP as a ****guard test*** (assert the external item survives), not as a pending question.

---

## AI Product Owner — Decision: What is the dedup key, from a product standpoint?

***Decision******:****** "already synced" is a property of the defect, not a computed similarity.**** Product rule: ****a defect that carries an external reference is never sent again.*** One Bunkai defect maps to at most one Jira issue, forever, and the presence of the stored external reference is the whole test.

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Stored external reference on the defect (chosen)**** | 5 | 5 | 5 | 5 | 4 | ****24*** |
| Content hash of title + steps | 2 | 1 | 2 | 4 | 2 | 11 |
| Search Jira for a matching backlink before creating | 3 | 2 | 2 | 4 | 2 | 13 |
| No dedup — accept occasional duplicates | 1 | 1 | 5 | 5 | 1 | 13 |

***Rationale.**** Content-hash dedup answers a question nobody is asking. Two genuinely distinct defects with the same title are two defects, and merging them would be a product bug, not a feature. The only duplicate this story can actually produce is **the same defect sent twice* because a retry raced a first attempt — which is an identity problem, not a similarity problem, and identity is what a stored reference expresses. This mirrors the inbound direction, where `user*stories.external*id` (`0003_authoring.sql` L20-L21, unique-indexed in `0016`) already carries "this row corresponds to that Jira issue".

***Product consequence the Tech Lead must honor******:*** the user must never see two Jira issues for one defect, including across a retry race. Closing the race window between concurrent attempts is a mechanism call, handed over below.

---

## AI Product Owner — Decision: What does the user SEE when a sync fails?

***Decision******:****** exactly the four states frozen in ****`bug-detail.html`****, with its literal copy — and NO manual retry control.***

| State | What renders (frozen mockup copy) |
| --- | --- |
| Synced | Pass-tone badge "Synced to Jira", a button carrying the external key (e.g. `KTN-482`) that opens the Jira issue, and the line "Last synced `<timestamp>`". |
| Sync failed | Fail-tone badge "Sync failed", then "Jira rejected the last push (`<reason>`) at `<timestamp>`.", then "The defect is fully saved in Bunkai and stays usable. Sync retries automatically once the connection is fixed in Settings." |
| Not configured | The External tracker panel is ***absent entirely*** — no badge, no error, no empty panel. |
| Standalone defect | Unaffected by sync state; the Origin panel shows "Filed manually." |

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Mockup copy verbatim, no manual retry (chosen)**** | 5 | 5 | 5 | 5 | 5 | ****25*** |
| Mockup copy + a "Retry now" button (QA's TDS04 assumption) | 3 | 2 | 3 | 4 | 3 | 15 |
| Toast at filing time when the sync fails | 1 | 1 | 4 | 5 | 2 | 13 |
| Silent failure, visible only to admins | 1 | 2 | 5 | 4 | 2 | 14 |

***Rationale.**** Under Rule #15 the mockup is the contract and it is unambiguous here. On the manual retry button specifically, three independent sources agree it should not exist: the Definition of Done says a sync-failed defect "is retried later ****without the Lead doing anything****"; the mockup's own failure copy tells the user retries happen automatically and points them at Settings for the actual fix; and design-plan §4.6 states `bug-detail.html` carries ****no*** edit or transition controls. A retry button would also be misleading in the dominant failure mode — the mockup's own example reason is `401 Unauthorized`, which no amount of re-pressing will fix.

***Action for QA******:**** ATP outline ****TDS04**** currently reads "sync-failed badge + retry button". Amend it to "sync-failed badge + failure-reason card, no manual retry control", and re-scope linked ATC ****BK-237*** accordingly. This overrides the 2026-08-01 comment's answer to Q6, which specified a manual Retry action in the UI.

***One deliberate divergence to record.*** The failure copy says retries resume "once the connection is fixed in Settings", but no Settings surface for this integration exists yet (`app/(app)/settings/` has account, notifications, tokens, workspaces — nothing for trackers). The copy stays as frozen; the Settings surface is delivered by the first slice below. Recording this here as a §5-style spec note rather than editing frozen copy.

---

## AI Product Owner — Decision: Which defect fields carry over to the Jira issue?

***Decision******:****** severity maps to Jira ****`priority`****. Module carries as its full path text inside the issue body. Evidence attachments do NOT sync in v1. The Bunkai backlink is mandatory.***

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Severity to priority; module as body text; no attachments (chosen)**** | 4 | 4 | 5 | 5 | 5 | ****23*** |
| Full mapping incl. module to Jira `component` and evidence to attachments | 5 | 2 | 1 | 3 | 2 | 13 |
| Backlink only, everything else lives in Bunkai | 2 | 3 | 5 | 5 | 5 | 20 |
| Severity to a Jira label instead of priority | 3 | 2 | 4 | 5 | 4 | 18 |

***Rationale.*** A Jira `component` must be pre-provisioned in the destination project; auto-creating components makes an external write dependency out of what should be a single issue-create call, and it fails noisily on projects where the QA account lacks project-admin rights. The module's full path in the body gives the engineer identical information with none of the coupling — and the body already has to carry the backlink, so no new surface is introduced. Evidence attachments stay out because no DoD bullet asks for them and every synced attachment is a copy of QA evidence leaving Bunkai's access boundary; narrowing that surface in v1 is the conservative default and remains freely reversible.

***Priority ladder (binding)******:*** P1 to Highest, P2 to High, P3 to Medium, P4 to Low. If the destination project's priority scheme lacks a name, fall back to Medium rather than failing the sync — a defect that lands with an approximate priority beats a defect that never lands.

---

## AI Product Owner — Decision: Is BK-43 still oversized after these rulings, and how should it be sliced?

***Decision******:****** YES, still oversized — decisively so. BK-43 as written is not a 1 SP story and should not enter a sprint as one. Slice it into three sequential stories.***

The deferral reason recorded against this ticket ("scope-growth in unattended runs") was correct, and the rulings above narrow the **behavior** without shrinking the **delivery surface**. What the story actually requires, verified against migrations and live code:

| Required piece | Exists today? |
| --- | --- |
| Sync-state columns on `bugs` (external ref, external URL, sync status, failure reason) | No — `0046_bugs.sql` has none of them |
| A place to store the destination Jira project key + an enabled flag | No — no `integrations` table, no tracker settings route |
| A Jira issue-create call | Partly — `lib/jira/client.ts` authenticates and reads; it does not write |
| A non-blocking dispatch after filing | Pattern exists — `after()` in `app/api/v1/imports/route.ts` |
| A retry sweep | No — no cron, no job table for this |
| The External tracker panel on the bug record | No — `bug-detail.html` has no route yet at all |

| Candidate | Product value | Precedent fit | Impl. cost | Reversibility | Risk | Total /25 |
| --- | --- | --- | --- | --- | --- | --- |
| ***Three slices, sequential (chosen)**** | 5 | 5 | 4 | 5 | 5 | ****24*** |
| Keep as one story, re-estimate to 8 SP | 3 | 2 | 2 | 3 | 2 | 12 |
| Two slices (config+create, then retry+UI) | 4 | 4 | 4 | 4 | 4 | 20 |
| Ship create-only, drop retry entirely from v1 | 2 | 1 | 5 | 4 | 3 | 15 |

***Proposed slices, in execution order******:***

1. ***BK-43a — TMS-Defect Sync | Point a project at a Jira destination.**** A project-level tracker setting: destination Jira project key, an enable toggle, and a connection check against the deployment credential. Delivers the noun "the integration is enabled" that every other bullet in this story leans on, and the Settings destination the frozen failure copy already points users to. **No sync behavior at all.* Estimated 3 SP.
2. ***BK-43b — TMS-Defect Sync | Send a newly filed defect to Jira.*** Sync-state columns on `bugs`, the issue-create call with the field mapping ruled above, the mandatory backlink, non-blocking dispatch at filing, and the never-send-twice rule. Covers ATP outlines TDS01, TDS02, TDS05, TDS06, TDS07, TDS12, TDS13, TDS14. Estimated 3 SP.
3. ***BK-43c — TMS-Defect Sync | Recover a failed sync and show its state.*** The retry sweep, terminal-failure semantics, and the four External-tracker panel states on the defect record. Covers TDS03, TDS04, TDS08, TDS11. Estimated 3 SP.

***Why this order and not another.**** Slice 1 is a genuine hard dependency, not a convenience: this story's own `out-of-scope.md` excludes "configuring or connecting the external tracker integration itself", yet ****no story anywhere on the board delivers it*** — the closest, BK-17 Jira Import, only ever reads and needs no destination. Without slice 1 there is no answer to "which Jira project does this issue go in", and the enablement condition in AC-1 and AC-6 has no referent. Under Rule #18 that unowned gap would be a legitimate blocker; naming it as slice 1 converts it into a sequence, which is the product call and is why it is made here rather than escalated.

Slice 2 before slice 3 because a failed sync is only observable once a sync exists, and slice 2 alone is already shippable value: defects reach engineering. Slice 3 is what makes the promise durable.

> ***INFO:**** I cannot create these tickets from this profile (this pass is comment-only). Recommend `/product-management` materializes BK-43a/b/c and re-parents the 14 linked ATCs per the coverage split above. Until then, treat ****BK-43 as NOT sprint-ready at 1 SP***.

---

## Handover to the AI Tech Lead

The following are architecture calls, deliberately ***not*** decided here. Each carries the product constraint it must satisfy.

| # | Question handed over | Binding product constraint from this pass |
| --- | --- | --- |
| 1 | Dispatch mechanism for the create-time attempt (Next.js `after()` vs DB trigger vs queue) | Filing must never block on, or fail because of, the sync. `app/api/v1/imports/route.ts` already establishes `after()` as this codebase's non-blocking-work precedent. |
| 2 | Retry mechanism, cadence, attempt ceiling, backoff curve | Recovery must be automatic and require zero user action. There is ***no*** user-facing retry control to fall back on. No pg_cron and no queue infra exist in this stack today. |
| 3 | Terminal-failure classification | An authentication failure must reach the terminal state promptly rather than burning the retry ladder — the frozen failure copy tells the user to fix it in Settings, so the state must be honest quickly. Reason strings surface verbatim to users (mockup example: `401 Unauthorized`); keep them short and non-leaky. |
| 4 | Race-proofing "never send twice" across concurrent attempts | Product invariant: one defect, at most one Jira issue, ever. `idempotency_keys` (ADR-0002) exists in this codebase. |
| 5 | Schema shape for sync state on `bugs` | Must express: never attempted, in flight, synced (with external key + URL), terminally failed (with a displayable reason). Four panel states depend on it being distinguishable. |
| 6 | Where the destination project key and enabled flag live (slice BK-43a) | Project-scoped, not workspace-scoped — Bunkai Projects map to Jira projects. Credentials stay deployment-level; do ***not*** introduce per-workspace secret storage inside this feature. |
| 7 | `SECURITY DEFINER` exposure of the sync write-back | ADR-0012's actor-bind + result-scoping invariant applies. The sweep runs service-side with no `auth.uid()`, so result scoping carries the whole burden: a sweep must only ever touch defects in the project whose tracker setting it is using. |
| 8 | Rate-limit handling (Jira 429) | Product-invisible. A rate-limited sync is a delayed sync, never a failed one, and must not surface the fail badge. |

---

## ATP marker disposition — the two live `(NEEDS PO CONFIRMATION)` markers

| Outline | Marker text | Ruling | Effect on the linked ATC |
| --- | --- | --- | --- |
| TDS09 | "Then the change propagates (NEEDS PO CONFIRMATION)" | ***Resolved******:****** NO.**** Post-creation edits do not propagate; add an explicit Out-of-Scope line. | ****BK-242*** — retire; invalid by decision |
| TDS10 | "Then the external item is NOT deleted (NEEDS PO CONFIRMATION)" | ***Resolved******:****** CONFIRMED.**** Deletion never propagates. Outline is now a guard test, not a question. | ****BK-243*** — keep as-is; assumption ratified |
| TDS04 | (no marker, but contradicts the frozen mockup) | ***Amended******:**** no manual retry control. Badge + failure-reason card only. | ****BK-237*** — update expected result |

No question on this ticket requires a human decider. No commercial commitment, no legal commitment, and no new external account is implied: the Jira Cloud credential surface this feature uses is the one BK-17 already ships against.

---

### Ely - 8/5/2026, 4:41:18 PM

# AI Tech Lead — technical decision pass on BK-43

Authored by the ***AI Tech Lead profile**** under `CLAUDE.md` Critical Rule #18 (this project is designed and built end-to-end by AI). This is an ****architecture ratification, not a human sign-off***. It closes the eight items the AI Product Owner handed over in comment 12170 and assigns each to the slice that owns it. Nothing here reopens a product decision.

Scoring key for every table below: ***Corr**** correctness · ****Prec**** consistency with shipped precedent · ****Migr**** migration cost (5 = cheapest) · ****Rev**** reversibility · ****Sec**** ADR-0012 / credential posture · ****Perf*** performance. Each scored 1-5, total /30.

> ***WARNING:**** ****Facts I checked and found WRONG or missing in the existing record.*** Every load-bearing claim below was verified against the live database or a file, because the 2026-08-01 ratification (comment 12069) cited a table that does not exist.
1. ***There is no ****`integrations`**** table at all.**** The PO found `integrations.secrets*ref` missing; it is broader than that. `grep -rn "integrations" supabase/migrations/` returns ****zero hits***, and live `information*schema.tables` for `public` has no such relation. The earlier ratification's storage plan has no referent whatsoever.
2. `bugs`*** carries no sync columns today*** — 17 live columns ending at `assignee*user*id`. No `external*issue*key`, no `sync_state`. Slice b ships them.
3. ***AC-6 says "workspace"; ****`business-rules.md`**** says "project".**** The PO's handover says project-scoped, so project wins. ****AC-6 needs amending*** to "the project". Flagging, not editing.
4. ***The frozen mockup has no queued/pending state*** — `bug-detail.html` models exactly three `sync.state` values (`synced` / `failed` / `none`). AC-2 forces an async send, which necessarily has a fourth, pre-terminal state. §5 divergence under Rule #15, see D5.
5. ***ATP outline TDS08 contradicts the frozen mockup.*** TDS08 wants "retries stop after threshold"; the mockup promises retries resume "once the connection is fixed in Settings", i.e. indefinitely. D2/D3 resolve this in the mockup's favour, as Rule #15 requires.
6. `pg*cron`*** and ****`pgmq`**** are available on this instance but NOT installed*** (`installed*version: null`, as is `pg_net`). "No cron, no queue" is true as-shipped, but it is an install decision, not a platform limit. D2 declines to install them anyway, on credential-posture grounds — reasoned, not assumed.
7. `feature_flags`*** cannot host this flag*** (see D6 for the verified detail).

---

## AI Tech Lead — Decision: What dispatches the create-time sync attempt?

***Decision******:****** ****`after()`**** from ****`next/server`****, fired inside ****`POST /api/v1/bugs`**** once the 201 is flushed — but ****`after()`**** is a latency optimization, NOT the durability mechanism.*** Durability comes from the sync state persisted on the `bugs` row in the same transaction as the bug itself. If the lambda dies mid-flight, the row is still `pending` and the slice-c sweep collects it.

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `after()`*** post-flush + persisted state**** | 5 | 5 | 5 | 5 | 5 | 4 | ****29*** |
| Enqueue only, no create-time attempt; sweep does everything | 5 | 4 | 5 | 5 | 5 | 2 | 26 |
| Synchronous inline call before returning 201 | 1 | 2 | 5 | 5 | 5 | 1 | 19 |
| DB trigger on `bugs` calling `pg_net` async HTTP | 3 | 1 | 2 | 2 | 1 | 3 | 12 |

***Rationale.*** The synchronous variant is disqualified outright by AC-2 ("created in Bunkai successfully without waiting for sync") — it makes Jira's availability a dependency of filing a defect, the exact coupling the story exists to remove. The `pg_net` trigger scores worst on the criterion that matters most: it requires Jira credentials inside the database (Vault), contradicting the PO's deployment-level ruling, and installs two extensions to make one HTTP call.

Enqueue-only is genuinely close and more conservative. It loses on ***Perf**** alone, but the loss is user-visible: a defect would not reach Jira until the next sweep tick (up to 5 minutes), sluggish against AC-1's "sent automatically". Firing `after()` gives the common case sub-second delivery at zero durability cost, **because the persisted row guarantees eventual delivery either way*. That is the whole decision: `after()`'s well-known non-durability is irrelevant when it is not the thing being relied on.

`app/api/v1/imports/route.ts:82` is the shipped precedent and the shape carries over — `after(async () => { await attemptBugSync(data.id); });` immediately before the `201` return. `attemptBugSync` must swallow every error and record it on the row; an exception escaping `after()` must never affect the already-flushed 201.

***Slice******:****** b.***

---

## AI Tech Lead — Decision: Retry cadence, ceiling and backoff, and what actually runs the sweep

***Decision******:****** a Vercel Cron job every 5 minutes hitting a ****`CRON_SECRET`****-guarded internal route, which drains a bounded batch of due rows. Per-defect exponential backoff with jitter, capped at 6 hours. No ceiling on retry count for retryable failures — the cap is on frequency, not on attempts.***

### What runs it

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***Vercel Cron to a ****`CRON_SECRET`****-guarded route**** | 5 | 3 | 5 | 5 | 5 | 4 | ****27*** |
| Opportunistic sweep piggybacked on each new create | 2 | 4 | 5 | 5 | 5 | 4 | 25 |
| `pg*cron` + `pg*net` calling Jira from Postgres | 4 | 1 | 2 | 2 | 1 | 3 | 13 |
| Scheduled GitHub Action hitting the endpoint | 4 | 1 | 3 | 4 | 2 | 4 | 18 |

***Rationale.**** The opportunistic sweep is the tempting zero-infrastructure answer and it fails on the one criterion that decides the story: it only fires when someone files another defect. A project that files one defect, fails to sync it, then goes quiet for a week never retries — breaking `business-rules.md`'s "retried automatically until they succeed, with no manual action required" in precisely the scenario a QA Lead would notice. ****I keep it as an additive accelerant*** (the same `after()` that syncs a new bug also drains up to 5 due rows for that project), but it cannot be the mechanism.

`pg*cron` + `pg*net` scores worst for the same reason as the trigger in D1 — credentials in the database. A scheduled GitHub Action works but makes production runtime behaviour depend on CI, duplicates the Atlassian secret into a second store, and has zero precedent (`.github/workflows/` does not exist here).

Vercel Cron loses points on ***Prec**** honestly: no `vercel.json` exists today and `CRON*SECRET` appears nowhere. That is new infrastructure. But it is the platform-native mechanism for the platform the app already deploys to, it is one file plus one route, and it is reversible by deleting four lines. Verified: this project deploys under the ****team*** account `upexgalaxy-saiotest` (`.vercel/project.json` carries `orgId: team*...`), so minute-granularity cron is available and the Hobby once-per-day restriction does not apply.

New `vercel.json` in slice c: `{ "crons": [{ "path": "/api/v1/internal/jira-sync-sweep", "schedule": "**/5 ** ** ** *" }] }`. The route rejects any request whose `Authorization` header is not `Bearer ${CRON*SECRET}`, before any other work. `CRON*SECRET` joins `.env.example` and `cli/doctor.ts` as a day-zero variable.

### Cadence, backoff and ceiling

`sync*next*attempt*at = now() + least(2 ^ sync*attempts, 360) minutes, ± 20% jitter`

| Attempt | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Delay | 2m | 4m | 8m | 16m | 32m | 64m | 128m | 256m | 6h floor |

Jitter is mandatory, not cosmetic: without it a Jira outage that fails 200 defects at once makes all 200 retry in the same tick forever, converging into a self-inflicted rate-limit storm.

***No retry-count ceiling for retryable failures.*** This resolves the TDS08-versus-mockup conflict in the mockup's favour, as Rule #15 requires: the frozen copy promises "Sync retries automatically once the connection is fixed in Settings", and the business rule says "until they succeed". A counted ceiling silently breaks both. The 6-hour floor bounds the cost — a permanently misconfigured project costs four Jira calls per defect per day, negligible, and self-heals the moment the config is fixed.

***Action for QA******:**** re-scope ****TDS08*** from "retries stop after threshold" to "retries decay to a 6-hour floor and never stop while the failure is retryable; only a terminal classification stops them".

Batch bound: 50 rows per tick, ordered `sync*next*attempt_at asc`, so one tick cannot exceed the function timeout.

***Slice******:****** c.***

---

## AI Tech Lead — Decision: Terminal-failure classification, and what a user reads verbatim

***Decision******:****** three internal tiers driving cadence, collapsing into the single ****`failed`**** state the mockup froze. Auth failures are terminal-fast in the sense that matters — displayed on attempt 1 and removed from the exponential ramp — but still retried at the floor, because the frozen copy promises they self-heal.***

| Tier | Triggers | Counted? | Cadence | UI |
| --- | --- | --- | --- | --- |
| `transient` | 429, 408, 5xx, network / timeout / DNS | yes (429 excepted, see D8) | exponential ramp | `failed` from attempt 3 |
| `blocked` | ***401, 403**** | yes | parks straight at the 6h floor | `failed` ****immediately*** |
| `terminal` | 400, 404, 405, 410, 422, any other 4xx | n/a | ***no further attempts*** | `failed` immediately |

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***Three tiers, collapsed to one UI state**** | 5 | 4 | 5 | 5 | 5 | 5 | ****29*** |
| Two tiers, auth as a hard terminal stop | 3 | 4 | 5 | 5 | 5 | 5 | 27 |
| `instanceof JiraAuthError` only (copy the import-runner) | 2 | 5 | 5 | 5 | 4 | 3 | 24 |
| Single tier, everything retries forever | 2 | 3 | 5 | 5 | 4 | 3 | 22 |

***Rationale.**** Copying `lib/jira/import-runner.ts` verbatim is the highest-precedent option and it is not good enough: its classification is a single `fatal instanceof JiraAuthError ? 'jira*unauthorized' : 'job*failed'`, and the two branches are ****behaviourally identical*** — both mark the job failed with no retry. It is a label, not a policy. This story needs a policy.

Making auth a hard terminal stop is the intuitive reading of "auth failures must go terminal fast", and I am deliberately not taking it. A 401 here is almost always a deployment credential problem affecting **every** defect in **every** project at once, fixed centrally. If 401 permanently kills the sync, rotating an expired Atlassian token leaves every defect filed during the outage stranded forever with no way back — and there is no manual retry control, by the PO's ruling. The frozen copy promises the opposite. So `blocked` gets the **visibility** of terminal (seen on attempt 1, no three-retry silence) and the **cost** of terminal (no ramp, straight to the floor) without the unrecoverability. That is what "terminal fast" should mean in a product with no manual retry.

404 ***is*** hard-terminal: `destination*project*key` names a Jira project that does not exist, which no waiting fixes and which the user repairs in slice a's Settings surface — at which point the row is re-queued by the config write (see D6).

### Reason strings are user-visible, so treat them as untrusted output

The mockup renders the reason verbatim (`Jira rejected the last push (401 Unauthorized) at ...`), and Jira error bodies can echo request content and, on some failure modes, fragments of the request URL. Binding rules: store `"<status> <canonical reason phrase>"` as the base; append Jira's structured `errorMessages[0]` ***only***, never the raw body, truncated to 200 characters; strip anything matching a credential or a URL containing userinfo before storing. The schema CHECK in D5 bounds the column at 300 characters so a pathological body cannot bloat the row.

***Slice******:****** b**** owns the classifier (the create-time attempt needs it). ****Slice c*** owns the cadence policy that consumes it.

---

## AI Tech Lead — Decision: Race-proofing "one defect, at most one Jira issue, ever"

***Decision******:****** a column-level guarantee on ****`bugs`**** — a partial unique index plus an atomic compare-and-set claim. NOT the ADR-0002 ****`idempotency_keys`**** table.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***CAS claim + partial unique index on ****`bugs` | 5 | 5 | 4 | 4 | 5 | 5 | ****28*** |
| ADR-0002 `idempotency_keys` | 2 | 3 | 5 | 4 | 5 | 4 | 23 |
| Postgres advisory lock around the Jira call | 2 | 1 | 5 | 5 | 4 | 4 | 21 |
| Search Jira before every create | 2 | 2 | 5 | 5 | 4 | 1 | 19 |

***Rationale — why ****`idempotency*keys`**** is the wrong tool, stated explicitly since it was handed to me as a candidate.**** ADR-0002 scopes keys as `(user*id, endpoint, key)` with a ****24-hour TTL***, driven by a caller-supplied `Idempotency-Key` header. Three mismatches, each fatal alone:

1. The PO's rule is "one Jira issue, ***forever***". A 24h TTL cannot express forever — ADR-0002 itself accepts that "a replay after 25h creates a second entity".
2. The sweep has ***no user and no header***. It runs as service-role on a cron tick. There is no `user_id` to scope to and no client to supply a key.
3. It deduplicates **HTTP requests**; the thing being deduplicated here is an **outbound side effect on a row**. Bending the shared helper would change its contract for `POST /api/v1/tests` and `POST /api/v1/runs`, its two live consumers — which ADR-0002 explicitly forbids ("never an ad-hoc variant").

The right guarantee is that "already synced" is a ***property of the defect***, exactly as the PO ruled. So it lives on the defect:

```sql
create unique index if not exists bugs*external*issue*key*uniq
  on public.bugs (external*issue*key) where external*issue*key is not null;
```

and the claim is an atomic compare-and-set, mirroring `import-runner.ts`'s `.eq('status','queued')` claim and `idempotency_keys`' own `failed -> pending` reclaim:

```sql
update public.bugs
   set sync*state = 'syncing', sync*claimed*at = now(), sync*attempts = sync_attempts + 1
 where id = p*bug*id
   and sync_state in ('pending','failed')
   and external*issue*key is null
   and (sync*next*attempt*at is null or sync*next*attempt*at <= now())
returning id;
```

Exactly one concurrent worker gets a row back; every other gets zero rows and returns without touching Jira. Once `external*issue*key` is non-null the predicate can never match again — that is the "ever", structural rather than temporal.

***The one real hole, and how it closes.*** A worker that claims, POSTs to Jira, then dies before writing the key back leaves the row `syncing` while a Jira issue exists. Two mechanisms:

- ***Lease reclaim.*** The sweep also collects `sync*state = 'syncing' and sync*claimed_at < now() - interval '10 minutes'`.
- ***Reclaim-path search only.**** That is the **only* window in which a duplicate is possible, so the reclaim path — and only it, never the hot path — issues one narrow JQL lookup before re-creating. Every issue Bunkai creates carries the label `bunkai-<bug*id>`; labels are exactly matchable, so the lookup is `project = "<KEY>" AND labels = "bunkai-<bug*id>"`. A hit adopts the existing issue instead of creating a second one.

That is why "search Jira before every create" scores 19 rather than being adopted wholesale: on the hot path it doubles Jira traffic and is racy anyway (Jira's search index lags writes), but as a rare reclaim check it is exactly right.

***Slice******:****** b**** (index, CAS, label). ****Slice******:****** c*** (lease reclaim and the JQL adoption path).

---

## AI Tech Lead — Decision: Schema shape for sync state on `bugs`

***Decision******:****** columns directly on ****`bugs`****. One migration, shipped whole in slice b, even though slice c is the first consumer of half of them.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***Columns on ****`bugs` | 5 | 5 | 4 | 4 | 5 | 5 | ****28*** |
| 1:1 `bug*sync*state` side table | 5 | 3 | 3 | 4 | 5 | 3 | 23 |
| Generic `outbound*sync*jobs` table | 4 | 2 | 2 | 3 | 5 | 3 | 19 |

***Rationale.**** Sync state is single-valued per defect and read on ****every*** bug-detail open and bug-list render, so a side table buys a join on the hot path and nothing else. The generic job table is the same speculative generality the PO rejected when fixing on Jira Cloud — one provider, one entity type, one destination. `bugs` already carries its provenance links (`run*id`, `run*step*id`, `atc*id`) as columns on the row; sync state follows that established style.

```sql
alter table public.bugs
  add column if not exists sync*state text not null default 'not*applicable'
    check (sync*state in ('not*applicable','pending','syncing','synced','failed')),
  add column if not exists external*issue*key   text,
  add column if not exists external*issue*url   text,
  add column if not exists sync_attempts        int not null default 0,
  add column if not exists sync*last*error      text,
  add column if not exists sync*last*attempt_at timestamptz,
  add column if not exists sync*next*attempt_at timestamptz,
  add column if not exists sync*claimed*at      timestamptz,
  add column if not exists synced_at            timestamptz;

alter table public.bugs
  add constraint bugs*synced*has_key
    check (sync*state <> 'synced' or external*issue_key is not null),
  add constraint bugs*sync*error_bounded
    check (sync*last*error is null or char*length(sync*last_error) <= 300);

-- Partial: indexes only the unsynced tail, so the sweep is O(due), not O(bugs).
create index if not exists bugs*sync*due_idx
  on public.bugs (sync*next*attempt_at)
  where sync_state in ('pending','failed','syncing');
```

### Mapping to the frozen panel states

| Panel state in `bug-detail.html` | `sync_state` | Backing columns |
| --- | --- | --- |
| panel hidden, `sync.state = "none"` | `not_applicable` | AC-6 + "carries no sync state". The ***default***, so a defect filed with the integration off is correct with zero extra writes. |
| `✓ Synced to Jira` + key + timestamp | `synced` | `external*issue*key`, `external*issue*url`, `synced_at` |
| `⚠ Sync failed` + verbatim reason card | `failed` | `sync*last*error`, `sync*last*attempt_at` |
| ***not in the mockup*** — in flight | `pending`, `syncing` | §5 divergence, below |

> ***NOTE:**** ****§5 spec-only divergence, recorded per Rule #15.**** The frozen mockup models three `sync.state` values and no queued state; AC-2 mandates an async send, which necessarily has a pre-terminal state. Rather than invent copy, ****the panel renders the ****`synced`**** treatment's layout with the badge reusing the in-flight grammar already established on the metrics screen***, and the state is typically visible for under a second. No new component, no re-picked tokens. UI-only, no backend cost, so per Rule #15 it is corrected toward fidelity rather than used to justify a schema change.

`bunkai*bug*json` gains the sync object via a `create or replace` in the same migration — the established evolution convention for that family. It stays `language sql`, `stable`, and ***not*** `security definer`; it is not an authorization boundary and must not become one.

***Slice******:****** b*** ships the entire block. Splitting one `ALTER TABLE` across slices would mean two migrations against the same hot table for no benefit; the retry columns are inert until c consumes them.

---

## AI Tech Lead — Decision: Where the destination Jira project key and enabled flag live

***Decision******:****** a new project-scoped table ****`project*tracker*settings`****, modelled on ****`project_environments`****. It has no column a secret could occupy, so the no-per-workspace-credentials ruling is enforced structurally rather than by discipline.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `project*tracker*settings`*** (project-scoped child)**** | 5 | 5 | 4 | 5 | 5 | 5 | ****29*** |
| Two columns on `projects` | 4 | 3 | 5 | 4 | 4 | 4 | 24 |
| Env-var-only mapping, no DB row | 1 | 3 | 5 | 3 | 5 | 5 | 22 |
| `feature_flags` (the existing table) | 1 | 1 | 2 | 3 | 3 | 3 | 13 |

***Rationale.**** `feature*flags` scores 13 on verified facts, not impressions: its `scope` CHECK admits only `'global'` and `'workspace'`, it has ****no ****`project*id`**** column****, its paired null-consistency CHECK would reject a third scope value, it has no client write policy, and ****nothing in ****`lib/`**** or ****`app/`**** reads it*** — it exists only in migration 0009 and in generated types. Using it means altering two CHECKs, adding a column, re-deriving the unique key, and building the read path from scratch: strictly more work than a new table, for a worse fit, and it smuggles a typed contract into an untyped `payload` bag.

Env-var-only is disqualified by slice a's existence: the frozen copy points the user at Settings to fix the connection, and a QA Lead cannot edit a Vercel environment variable.

Columns on `projects` is cheapest and genuinely viable. It loses on ***Prec**** and ****Rev***: `projects` is read on nearly every request, and there is no clean place to hang the next integration field (issue type, default labels, component) without further column creep on a hot table. `project_environments` (migration 0031) is the shipped precedent for exactly this shape — a project-scoped child holding configuration, cascade-deleted, RLS'd by joining to `projects`.

```sql
create table if not exists public.project*tracker*settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  provider   text not null default 'jira*cloud' check (provider = 'jira*cloud'),
  destination*project*key text not null
    check (destination*project*key = btrim(destination*project*key)
           and destination*project*key ~ '^[A-Z][A-Z0-9_]{1,9}$'),
  issue*type*name text not null default 'Bug'
    check (issue*type*name = btrim(issue*type*name)
           and char*length(issue*type_name) between 1 and 60),
  enabled    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Three deliberate choices:

- `project_id`*** as the primary key*** makes 1:1 structural. No "which of these two rows wins" question can arise.
- `provider`*** pinned by CHECK to one value**** records the PO's fixed-on-Jira ruling **in the schema*. Widening it later is a one-line CHECK change, making literal the cheap reversibility the PO's rationale claimed.
- ***No ****`secrets*ref`****, no ****`credentials`****, no ****`api*token`****, no ****`base*url`****.**** Credentials continue to resolve from `ATLASSIAN*URL` / `ATLASSIAN*EMAIL` / `ATLASSIAN*API_TOKEN` via `@lib/env`, deployment-level, identical to the shipped BK-17 import. ****Binding rule******:****** any future column here that would hold a secret, or a pointer to one, requires its own ADR first.*** That guardrail keeps the PO's ruling from eroding one convenient column at a time.

***Role gate — a call the PO did not make, so I make it******:****** admin+ writes, viewer+ reads.**** Redirecting where a workspace's defect data flows externally is a workspace-settings-shaped act with external blast radius, not a test-authoring act. Reads follow the `project*environments` SELECT policy. Writes go through a `SECURITY DEFINER` RPC `bunkai*upsert*project*tracker_settings`, actor-bound at step 0 per ADR-0012, asserting admin+ before any write. ****Product-visible; the PO may override it and I will implement whatever they rule.***

***One consequence to wire in slice a******:*** when `enabled` flips false to true, or `destination*project*key` changes, the write RPC re-queues that project's stranded defects in the same transaction:

```sql
update public.bugs
   set sync*state = 'pending', sync*next*attempt*at = now(), sync*last*error = null
 where project*id = p*project_id
   and external*issue*key is null
   and sync*state in ('failed','not*applicable');
```

This is what makes the frozen copy ("retries automatically once the connection is fixed in Settings") literally true, and it is why a hard-terminal 404 in D3 is safe.

***Slice******:****** a.***

---

## AI Tech Lead — Decision: ADR-0012 result-scoping on a sweep that has no `auth.uid()`

***Decision******:****** delete the identity parameter entirely and narrow the grant to ****`service_role`****. The sweep's claim function is not callable by any signed-in user, so there is no actor to bind and nothing to spoof.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***No actor param; ****`grant execute to service_role`**** only**** | 5 | 5 | 5 | 5 | 5 | 5 | ****30*** |
| Plain SQL from the route via the admin client, no RPC | 4 | 3 | 5 | 5 | 3 | 4 | 24 |
| `p*actor*user_id` + canonical bind, granted to `authenticated` | 3 | 4 | 5 | 4 | 2 | 5 | 23 |
| Service-role function taking a `p*workspace*id` filter | 2 | 2 | 5 | 4 | 1 | 5 | 19 |

***Rationale.**** `rpc-authorization.md` §2 is explicit that the strongest fix is deleting the parameter: **"a function that cannot be told who the caller is cannot be lied to."* ADR-0012 names `bunkai*list*activity` as the worked example of removing the class instead of defending against it. A background sweep is the purest case — it has no user, so an actor parameter would be pure liability.

The third option is the trap, worth naming because it is what a careful engineer reaches for. Adding `p*actor*user_id` and the canonical guard **looks** like compliance, but for a service-role caller `auth.uid()` is NULL, so the bind short-circuits and does nothing — while `grant ... to authenticated` leaves the function directly callable via PostgREST by any signed-in user, who could then drive the sweep. That is strictly worse than no guard, because it reads as guarded. ADR-0012's failure mode restated: ***the presence of a bind is not the same as the bind doing anything.***

### Explicit ADR-0012 compliance statement — `bunkai*claim*bug*syncs(p*limit int)`

***(a) Actor bind.**** Not applicable **by construction*, which is the sanctioned outcome rather than an exemption. The function accepts no identity or tenant parameter. The reachability guard replaces it:

```sql
revoke execute on function public.bunkai*claim*bug_syncs(int) from public, anon, authenticated;
grant  execute on function public.bunkai*claim*bug*syncs(int) to service*role;
```

`authenticated` is revoked deliberately. ADR-0012's audit found all 22 unguarded live functions were granted to `authenticated`, which is exactly what made them directly exploitable via PostgREST. This one is not.

***(b) Result scoping — every returned row, separately constrained.**** The scope asserted is not a caller-supplied tenant boundary; it is a per-row property. Each returned row is constrained by a predicate on ****its own*** `project_id`:

```sql
where b.sync_state in ('pending','failed')
  and b.external*issue*key is null
  and b.sync*next*attempt_at <= now()
  and exists (select 1 from public.project*tracker*settings s
               where s.project*id = b.project*id and s.enabled)
```

The decisive property: ***the destination Jira project key is resolved per row, from that row's own ****`project*tracker*settings`****, never from a batch-level or caller-supplied parameter.*** There is no scope variable here that could be widened, mis-set or spoofed to make workspace A's defect land in workspace B's Jira project. Cross-tenant misdelivery is structurally unreachable, not merely defended against.

***No new read surface.**** The UI reads sync state through the already-membership-gated `bunkai*bug*json` and `bunkai*list*project_bugs`. Slice c adds ****zero*** new DEFINER functions readable by `authenticated`, so it adds nothing to ADR-0012's closed set of 22.

***Test contract**** — ships in the same slice as the migration, per ADR-0012 enforcement point 2, against the real database rather than a mock: (1) a real authenticated session calling `bunkai*claim*bug*syncs` gets `42501 permission denied`; (2) a bug whose project has `enabled = false` is never returned; (3) a bug in a project with ****no*** settings row is never returned; (4) two concurrent claims of one row — exactly one wins; (5) slice a's write RPC rejects a spoofed `p*actor*user*id` and rejects a non-admin actor.

***Slice******:****** c*** (the sweep function and its tests). The grant discipline binds slice a's write RPC too.

---

## AI Tech Lead — Decision: Jira 429 handling, product-invisible

***Decision******:****** a 429 is a reschedule, never a failure. It does not increment ****`sync*attempts`****, never sets ****`sync*state = 'failed'`****, and is therefore invisible in the UI — the defect stays in the in-flight treatment. Plus a per-tick circuit breaker.***

| Candidate | Corr | Prec | Migr | Rev | Sec | Perf | ***Total*** |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ***Reschedule, uncounted, + per-tick circuit breaker**** | 5 | 3 | 5 | 5 | 5 | 5 | ****28*** |
| Count 429 as a normal transient failure | 2 | 4 | 5 | 5 | 5 | 4 | 25 |
| Reuse `searchIssues`' in-process blocking backoff | 2 | 5 | 5 | 5 | 5 | 1 | 23 |

***Rationale.**** Counting a 429 would push a healthy defect toward the 6-hour floor during a busy hour and, worse, display `⚠ Sync failed` for something merely queued behind rate limits. The PO's constraint is that a rate-limited sync is **delayed, never failed*; the only way to honour it is to leave both `sync*attempts` and `sync*state` untouched:

```
on 429:  sync*next*attempt_at = now() + coalesce(least(Retry-After, 1 hour), backoff)
         sync_state           = 'pending'    -- back to the queue, not to 'failed'
         sync_attempts        = unchanged
         sync*last*error      = unchanged    -- nothing user-facing changes
```

`Retry-After` is honoured and ***capped at 1 hour*** — an unparseable or hostile header must not park a defect indefinitely.

***The outbound client must NOT inherit ****`searchIssues`****' 429 behaviour.**** `lib/jira/client.ts` sleeps in-process through `BACKOFF_SCHEDULE = [1000, 2000, 4000, 8000, 16000]`, up to ~31 seconds, then throws. Defensible for a paging import; for the outbound create it burns serverless wall-clock while holding a claimed row, and the cost multiplies across a 50-row batch. The new `createIssue` path performs ****at most one HTTP attempt per invocation*** and returns 429 as a reschedule signal — a deliberate, documented departure from the sibling function in the same file.

***Per-tick circuit breaker.*** The first 429 in a tick aborts the remainder of that tick; untouched rows keep their `sync*next*attempt_at` and are picked up next tick. Without it, a rate-limited deployment spends its whole batch collecting 429s and makes the limit worse.

***A gap worth closing while here******:**** `searchIssues` retries 429 but does ****not*** retry 5xx at all. The outbound path classifies 5xx as `transient` (D3) and retries it. Noted so the asymmetry between the two clients in one file is recorded as intentional, not accidental drift.

***Slice******:****** b**** (client contract). ****Slice******:****** c*** (breaker and reschedule policy).

---

## Slice assignment summary

| # | Decision | a — point a project at a destination | b — send a newly filed defect | c — recover a failed sync |
| --- | --- | --- | --- | --- |
| 1 | Dispatch via `after()` |  | ✓ |  |
| 2 | Cron, cadence, backoff |  |  | ✓ |
| 3 | Failure classification |  | ✓ classifier | ✓ cadence policy |
| 4 | One-issue-ever guarantee |  | ✓ index + CAS + label | ✓ lease reclaim + JQL adoption |
| 5 | Sync-state schema |  | ✓ whole migration | ✓ consumes |
| 6 | Destination key + enabled flag | ✓ |  |  |
| 7 | ADR-0012 on the sweep | ✓ write-RPC guard |  | ✓ claim function |
| 8 | 429 handling |  | ✓ client contract | ✓ breaker + reschedule |

***Independent implementability.*** Slice a ships alone: a Settings surface configuring a destination, nothing consuming it yet. Slice b ships on top of a and delivers the PO's stated value — defects reach engineering — with failures sitting inert. Slice c makes the promise durable. No slice reaches backwards into a predecessor's migration.

***Sequencing note.**** BK-43 as a single ticket is ****not*** implementable as written; it is implementable only once a, b and c exist as tickets, because these decisions are partitioned across them and slice a delivers a surface the parent ticket's own `out-of-scope.md` disclaims. That is a ticket-administration action, not an engineering one.

---

## What this comment closes

All eight handed-over items are decided, with no remaining technical ambiguity. Two follow-ups, neither blocking:

- ***QA******:**** amend ATP outline ****TDS08*** (retries do not stop on a count) per D2, and note the reason-string bound from D3.
- ***PO/BA******:**** amend ****AC-6***'s "workspace" to "project", and optionally overrule the admin+ write gate in D6.

No commercial commitment, no legal commitment, no new external account and no new credential surface is implied by any decision above — the Atlassian credentials used are the deployment-level ones BK-17 already ships against. No decision here requires a human decider under Rule #18.

---


_Synced from Jira by sync-jira-issues_
