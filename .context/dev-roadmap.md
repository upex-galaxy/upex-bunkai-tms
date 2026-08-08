# Dev Roadmap — Bunkai TMS (ticket-level dependency plan)

> **What this is**: the single source of truth for the **execution order of the dev backlog, driven by dependencies** — at Jira-ticket granularity (BK-NN), across every epic.
> **Last sync**: 2026-08-08 (autonomous-delivery `story` run audit — **empty run, and every correction below is why it was empty.** **BK-45 SHIPPED**, not merely "claimed": PR #142 merged 2026-08-07T19:10Z, merge commit `f75709e`, ancestor-verified. The 2026-08-07 sync (PR #141, `f59c095`) was authored *before* that merge landed and never picked it up — the same under-reporting-its-own-day's-outcome gap flagged for BK-213 on 2026-08-04/05. Consequently **BK-50's dependency gate is RELEASED**, and every row calling it "blocked on BK-45" was stale. **BK-20's named blocker is resolved**: defect BK-187 merged 2026-08-06T20:08Z (`c0712e9`) — the §4 row still demanded its resolution. **BK-50 deferred on scope-growth, and its ratified plan is factually broken**: PO comment `11047` justified choosing Cloudflare R2 with *"R2 already exists in our stack"* — a recon of `origin/staging` found **zero object storage of any kind** (no R2, no `@aws-sdk`, no `.storage.from(`, no `@vercel/blob`, no bucket DDL in 68 migrations, no storage credentials), and **zero export precedent** (no CSV/PDF/`Content-Disposition`/`@media print`/download route/share link). Same failure shape as BK-43's superseded `secrets_ref` claim. See the 2026-08-08 run conclusion in §6. Carries forward the 2026-08-07 sync below.)
>
> **Prior sync**: 2026-08-07 (autonomous-delivery `story` run audit — **BK-45 claimed**, overturning a four-run "scope-growth" deferral on a 4-lens scored panel (A=293 / C=210 / B=107): its BK-31 dependency gate is bookkeeping that sibling stories BK-46/BK-47 already crossed on 2026-08-01, its 8-point estimate predates filters and export being carved into BK-48/BK-50, and its "not resolved" verdict counted 2 comments when live Jira has 4 — `12171` and `12176` decided all 11 open questions on 2026-08-05. **BK-211 reconciled**: the prior sync left it gate-stopped at an unmerged PR; PR #137 in fact merged 2026-08-06T22:31Z (`861c441`) with migrations `0066`+`0067` applied and ledger-verified, status `Ready For QA` — the operator's `migrations: unrestricted` change (PR #139) opened the gate the same evening. **BK-43's deferral reason corrected** — it stands, but "no connector/retry pattern exists in this repo" was false. **New cross-cutting finding**: the step-0 actor bind in every report RPC is inert on the admin-client call path, so per-CTE `project_id` scoping is the only real control. Carries forward the 2026-08-06 sync below.)
>
> **Prior sync**: 2026-08-06 (autonomous-delivery `story` run audit — **BK-211 delivered** to PR #137 after three runs of exclusion; its Q3 was ratified live 2026-08-05 19:08Z/19:27Z, ~18 min after the prior run ended, and the "hard-blocked on BK-30" claim is now falsified at code level rather than merely stale. **BK-205 reconciled**: SHIPPED via PR #132 (`5054716`) on 2026-08-05 at 20:20Z — the prior run's 18:40Z escalation was overtaken by a later session, not overruled; its §6 row is kept as history and marked superseded. **BK-188 dropped out of the pool** — now `Tech Story`/`Completed`, the prior runs' re-type recommendation was actioned. **`ATLASSIAN_URL` defect found**: a stale shell export pointed every `jira:sync-issues` run at the dead `upexgalaxy69` instance, so the PBI cache showed 3 of BK-211's 7 comments — see the 2026-08-06 run conclusion in §6. Carries forward the 2026-08-05 sync below.)
>
> **Prior sync**: 2026-08-05 (autonomous-delivery `story` run audit — **BK-213 reconciled**: §6 still recorded it only as "Claimed by the 2026-08-04 run"; it merged to `origin/staging` that same day via PR #127 (`2e91ad95`) and is ancestor-verified. The 2026-08-04 reconciliation PR #126 was cut *before* #127 landed and was never followed up, so the doc under-reported its own run's delivery. **BK-147, BK-148 and BK-265** found merged to `origin/staging` [PR #43, PR #49, PR #118] but never added to this doc at all — added as coverage gaps below, same class as the 2026-08-04 BK-47/BK-266 finds. **BK-205** added to §6: it entered the live `Ready For Dev` pool since the last sync and was judged NOT eligible for an unattended pick — see its row. **BK-211's** stale "hard-blocked on BK-30" claim corrected — BK-30's child stories are all shipped; the epic's `Planning` status is stale bookkeeping, not a functional gate. Carries forward the 2026-08-04 sync below.)
>
> **Prior sync**: 2026-08-04 (autonomous-delivery `story` run audit — BK-212 reconciled: §6 wrongly still listed PR #115 as `Open`/`In Review`; it merged to `origin/staging` on 2026-08-04 and is ancestor-verified. BK-255/256/257/258/259/260 (Home Dashboard cluster) all merged to `origin/staging` today via PRs #120-125 — this doc previously listed them `Backlog`/gate-cleared-but-unclaimed; corrected below. BK-47 (Time-to-Green) and BK-266 (Projects index) were found merged to `origin/staging` [PR #98, PR #119] but had never been added to this doc at all — added as coverage gaps. BK-213 claimed this run — see §6. Carries forward the 2026-08-03 BK-46/BK-49 reconciliation, the 2026-08-02 BK-42 ship, the 2026-08-01 autonomous-delivery `story` run + interactive BK-41 delivery, and the 2026-07-31 surgical Home Dashboard epic BK-254 addition; rest of the graph not re-sorted end to end)
> **Maintained by**: hand-authored synthesis. Live story status is **never frozen here** — it is queried on demand (see §6). See §7.

---

## 1. How to read this — authority split

> **TL;DR for the AI/human reading this — what this doc is, in one breath:**
> This doc answers **one question only: "which Jira ticket do we work next, and what is blocking it?"** It is NOT the strategy plan and it does NOT store live status.
> - Want **"why are we building epics in this order?"** → that is `master-implementation-plan.md` (strategy / epic altitude). Not here.
> - Want **"what ticket is next + what unblocks what?"** → **you are in the right doc** (§3 graph, §4 execution sprints, §5 mockup-gates). This is the part nothing else holds.
> - Want **"is BK-28 done yet / what's its current status?"** → **do not read it off this page.** Status changes daily and is never written here. Query it live with the recipe in **§6**.
>
> One-line rule: **§2–§5 are durable truth you can trust; live status is always a query, never a paste.**

This doc sits in a 3-layer roadmap stack. Each layer owns a different altitude:

```
.context/master-implementation-plan.md   EPIC / strategy   "what to build & why that order"   (derived from business-maps)
.context/dev-roadmap.md  ◄── THIS DOC     TICKET / sequence "what unblocks what, in what execution sprint"  (derived from Jira links + local design)
.context/PBI/.../implementation-plan.md   STORY / files     "how to build one ticket"           (derived by /sprint-development)
```

**Authority split — who is the source of truth for what:**

| Fact | Source of truth | Why |
|------|-----------------|-----|
| **Dependency edges** (A blocks B), execution sprints, mockup-gates | **THIS doc (local)** | Local design context (master-design-plan §8, schema topology, readiness audits) holds the *full* structure; Jira issue-links are sparse/partial. |
| Story **status** + **points** | **Jira** (snapshot in §6, dated) | Jira is live; §6 is a frozen photo — re-sync before trusting it. |
| Epic→story membership | Jira (`epic-tree.md` mirror) | Sync-owned. |
| Per-story file plan | `/sprint-development` | Out of scope here. |

Legend (used in §3–§6):
- `A ──> B` = A must be **dev-done** before B can start (hard gate).
- `A ··> B` = soft gate: B is buildable without A but low-value / partial until A lands.
- 🔒 mockup-gated = cannot start until the named mockup exists (Critical Rule #15 fidelity).
- ✅ dev-done · 🟢 ready · 🟡 gated · ⚪ backlog/estimation · 🧪 in QA/test.

---

## 2. Epic backbone — the schema-forced spine

Order below is **forced by entity topology** (`business-data-map.md §2`), not preference: no entity ships before the entities + RLS it depends on. This is the epic-level skeleton; §3 is the ticket-level detail hanging off it.

```
BK-1  Tenancy & Identity ──┬──> BK-7  Project & Module Hierarchy ──┬──> BK-12 User Stories & AC ──┐
   (workspace_id + RLS)    │        (project → module tree)        │                              ├──> BK-13 ATC Library
                           │                                       └──> BK-13 ATC Library ◄────────┘     (the differentiator)
                           │                                                  │
                           │                                                  └──> BK-24 Tests (chains of ATCs)
                           │                                                            │
                           │                                                            └──> BK-30 Manual Execution & Runs
                           │                                                                       │
                           │                                                                       └──> BK-31 Bugs & Defect Heatmap
                           │
                           ├──> BK-85 Account & Settings   (parallel once BK-1 done)
                           └──> BK-29 QA Credentials        (parallel, /qa page)

   BK-44 Coverage & Traceability ── reads ALL of the above (US→AC→ATC→Test→Run→Bug chain); last MVP epic.

   BK-254 Home Dashboard ── reads BK-30 (Runs), BK-31 (Bugs), BK-44 (Coverage) + BK-7/BK-13 (Projects/ATCs) as a landing-page aggregation; no new entities of its own.
```

| Epic | Title | Depends on | Phase |
|------|-------|-----------|-------|
| BK-1 | Tenancy & Identity (RLS) | — (foundation) | MVP S1 |
| BK-7 | Project & Module Hierarchy | BK-1 | MVP S2 |
| BK-12 | User Stories & AC | BK-7 | MVP S2/3 |
| BK-13 | ATC Library | BK-7 (+BK-12 for AC anchor) | MVP S3 |
| BK-24 | Tests (chains of ATCs) | BK-13 | MVP S4 |
| BK-30 | Manual Execution & Runs | BK-24 | MVP S4 |
| BK-31 | Bugs & Defect Heatmap | BK-30 | MVP S5 |
| BK-85 | Account & Settings | BK-1 | MVP (parallel) |
| BK-29 | QA Credentials (`/qa`) | BK-1 | MVP (parallel) |
| BK-44 | Coverage & Traceability | BK-13/24/30/31 | MVP S6/7 |
| BK-201 | Test Plans & Milestones | BK-24, BK-30 | Post-MVP P1 |
| BK-221 | Automation & CI Ingestion | BK-30 (BK-34/35/38/39), BK-88, BK-24 | Post-MVP P1 |
| BK-208 | Notifications Center | BK-30 (BK-36/39), BK-31, BK-87 | Post-MVP P1 |
| BK-210 | Team Chat | BK-1, BK-7, BK-208 (BK-209) | Post-MVP P2 |
| BK-224 | Billing & Plans | BK-1, BK-87 | Post-MVP P2 |
| BK-254 | Home Dashboard | BK-30, BK-31, BK-44 (reads across all three; no new entities) | MVP tail / P2 (seeded 2026-07-31) |

> **Post-MVP expansion epics (created in Jira 2026-07-11)** — 5 epics / 28 stories authored future-first (their ACs assume the full MVP chain is shipped). All stories sit in `Backlog` (deliberately NOT `Shift-Left QA` — they are roadmap stories, not refinement-ready), ~~all are 🔒 mockup-gated~~ mockups ✅ shipped 2026-07-30 (see §5), story points intentionally empty. **PO defaults ratified 2026-07-11** (delegated to AI-as-PO): all flagged Business-Rules decisions resolved — see the `## PO Ratification — 2026-07-11` Jira comment on each affected story; domain-glossary §3 gained the 17 new entity terms; master-design-plan §8 has the 28 US→Screen rows. Remaining pre-dev gate: mockups only. Full dependency edges live as Jira `Dependencies`/`Relates` links (49 links, direction-verified); §3.1 holds the compact summary. **Coming-soon epics (deliberately NOT created yet)**: Dashboards & Analytics, Data Import/Export, Entity Comments & Review — promote via `/product-management` when the frontier approaches.
>
> Phase-2 / Phase-3 epics (self-hosted bundle, agentic protocol, 3D mind-map, SSO, marketplace) remain **strategy-layer only** — see `master-implementation-plan.md §2`. Note: the former "CI adapters" strategy item is now partially ticket-broken as BK-221.

---

## 3. Story dependency graph — the core

The active frontier (Sprint-2 dev). This is the part Jira cannot express as a roadmap; it is the reason this doc exists.

```
                              ┌──────────────────────────────────────────────┐
   BK-27 Test Builder ✅ ─────┤ (dev-done — gate RELEASED, unblocks 7)        │
   (chain ATCs, 8 SP)         └──┬───────────────────────────────────────────┘
                                 ├──> BK-28 Test Reorder        (5)
                                 ├──> BK-33 Test Tags ✅         (8)   (dev-done — QA Approved)
                                 ├──> BK-22 ATC Usage report    (3)
                                 ├──> BK-23 ATC Duplicate       (5)
                                 ├──> BK-32 Test view expanded  (1)
                                 ├··> BK-21 ATC Propagation ✅  (5)     (dev-done — merged to staging, Ready For QA; contract ratified, ADR-0009)
                                 └──> BK-34 Start manual run ✅  (8) ──┬──> BK-35 Mark step pass/fail (5*) ⚪ Estimation
                                   (dev-done — gate RELEASED)          ├──> BK-36 Abort run ✅        (8)   (dev-done — merged to staging PR #59, Ready For QA)
                                                                       ├──> BK-37 Run history ✅      (5)   (dev-done — PRs #65+#66 merged to staging, Ready For QA; est. 1→5 by PO 2026-07-21)
                                                                       ├──> BK-38 Filter proj runs   (3) 🟢 (mockup ✅ 2026-07-30)
                                                                       └──> BK-39 Finish run verdict (5) 🟢

   INDEPENDENT (no BK-27 gate — parallel-safe):
     BK-20 ATC Search 🧪      BK-3 OAuth (8) 🟢 (AC synced)      BK-19 ATC Builder ✅   BK-18 ATC API ✅

   SETTINGS CLUSTER (epic BK-85):
     BK-86 Account/sign-out ✅ ──> BK-87 Settings hub (2) ✅ ──┬──> BK-88 Manage PATs (5) 🟢
        (dev-done — QA Approved)   (dev-done — Ready For QA)   └──> BK-89 View workspaces (2) 🟢 ──> BK-90 Leave workspace (5) 🟢
                                    └─ Settings mockup ✅ 2026-07-30 (§4.10, bk-85-account-settings/ 5-screen suite) — gate lifted for the whole cluster
```

### Flat edge list (the durable contract — validate against Jira §7)

| Blocker (must be dev-done) | Unblocks | Type | Reason |
|----------------------------|----------|------|--------|
| BK-27 Test Builder | BK-28, BK-33, BK-32 | hard | reorder/tags/view all operate on a Test's `test_steps`, created by BK-27 |
| BK-27 | BK-22 | hard | "Used in N tests" count reads `test_steps` rows |
| BK-27 | BK-23 | hard | duplicating an ATC must account for its test memberships |
| BK-27 | BK-21 | soft | propagation cascades edits *to tests*; pointless before tests exist |
| BK-27 | BK-34 | hard | a run executes a Test; no Test → no run |
| BK-34 Start manual run | BK-35, BK-36, BK-37, BK-38, BK-39 | hard | all operate on a `run` / `run_atc` / `run_step` row created by BK-34 |
| BK-34 Start manual run | BK-148 Project Environments | hard | env CRUD operates on the `project_environments` table + `runs.environment_id` FK created by BK-34 — **Relates BK-34 (gate satisfied: BK-34 merged to staging)** |
| BK-86 Account | BK-87 Settings hub | hard | BK-87 owns the topbar entry point BK-86 renders into |
| BK-87 Settings hub | BK-88 PATs, BK-89 Workspaces | hard | both are Settings sub-views; need the hub shell |
| BK-89 View workspaces | BK-90 Leave workspace | hard | leave action lives in the workspaces list + needs its active-workspace contract |
| BK-40 File defect from a failing run step | BK-258 TMS-Home \| Show open bug count and severity breakdown | hard | a queryable open-bug count needs bugs to exist first — BK-40 is the write path that creates them |
| BK-41 List and filter defects by module/status/severity | BK-258 TMS-Home \| Show open bug count and severity breakdown | hard | the severity breakdown needs a severity-filterable read surface, which BK-41 is the first to build |
| BK-46 Surface untested ACs/modules with not-run filter ✅ dev-done (merged to staging, PR #93 + 4-slice chain, ancestor-verified 2026-08-03) | BK-259 TMS-Home \| Show workspace test coverage summary ✅ **SHIPPED 2026-08-04** (PR #125) | hard | computing an overall coverage % needs the tested-vs-untested computation BK-46 builds first; no other Coverage story computes it. Both sides of this edge are now merged to `origin/staging`. |

**No incoming edge (start anytime, gated only by their own readiness):** BK-20, BK-3, BK-86, BK-255 (TMS-Home welcome banner) ✅ **SHIPPED 2026-08-04** (PR #120), BK-256 (TMS-Home active runs — reads BK-30, already dev-done in this graph) ✅ **SHIPPED 2026-08-04** (PR #122), BK-257 (TMS-Home recent projects) ✅ **SHIPPED 2026-08-04** (PR #121).

**Soft / informational only (not a sort-blocking edge):** BK-260 (TMS-Home condensed activity feed) — Jira `Relates` to BK-49 (Activity stream). BK-49's `feat/BK-49-activity-stream` branch (PR #83 + its 3-slice chain) is merged into `origin/staging`, ancestor-verified 2026-08-03 — BK-260 reuses BK-49's endpoint as a thin presentation layer. BK-260 itself ✅ **SHIPPED 2026-08-04** (PR #123).

### 3.1 Post-MVP expansion cluster — compact edge summary (full links live in Jira)

Created 2026-07-11. `A ──> B` = A depends on B (hard, Jira `Dependencies`); `··>` = soft (Jira `Relates`). ~~All 28 stories 🔒 mockup-gated (§5)~~ **Mockup gates LIFTED 2026-07-30** (§5 — every post-MVP screen set designed). The stories remain `Backlog` by deliberate roadmap decision (post-MVP frontier), not by design gate.

```
BK-201 Test Plans & Milestones:
  BK-202 Create plan ──> epic BK-24 ─┐   BK-205 Create milestone ──> (free)
  BK-203 Add/remove tests ──> BK-202 │   BK-206 Assign plans ──> BK-205, BK-204
  BK-204 Track progress ──> BK-203, epic BK-30
  BK-207 Close plan ──> BK-202  ··> BK-204

BK-221 Automation & CI Ingestion:
  BK-222 Submit automated run ──> BK-88, BK-34, BK-39        (entry point of the cluster)
  BK-223 Stream step results ──> BK-222, BK-88, BK-34, BK-39  ··> BK-35
  BK-226 Upload CI file ──> BK-222, BK-88
  BK-228 Commit/branch links ──> BK-226
  BK-225 Mode filter ──> BK-38  ··> BK-222, BK-227
  BK-227 Automation status ──> BK-27

BK-208 Notifications Center:
  BK-209 Inbox ✅ dev-done (2026-08-03) — merged to staging via PR #113 (feat/BK-209-notifications-inbox); notifications table+RLS+RPC, inbox API, bell/panel UI, realtime wiring. Ready For QA.
  BK-211 Run events ──> BK-209 ✅, BK-39, BK-36
  BK-212 Bug events ✅ dev-done (2026-08-03) — merged to staging via PR #115 (feat/BK-212-bug-notifications); activity_log-driven notify trigger + inbox rendering + deep link into run detail. Depended on BK-209 ✅ and BK-264 ✅ (added below — the epic BK-31 edge resolved to a concrete prerequisite story once planning found bug assignment/status-transition had no ticket at all). Ready For QA.
  BK-213 Preferences ──> BK-209 ✅, BK-87
  BK-214 Email digest ──> BK-209 ✅  ··> BK-213

BK-31 Bugs & Defect Heatmap (addendum, 2026-08-03):
  BK-264 TMS-Defect Triage (assign + status transition) ✅ dev-done (2026-08-03) — merged to staging via PR #114 (feat/BK-264-defect-triage); discovered mid-sprint as the missing prerequisite for BK-212 (bugs table had no assignee column and no status-transition write path). Linked as a Dependencies predecessor of BK-212 in Jira. Ready For QA.

BK-210 Team Chat:
  BK-215 Workspace channel ──> epic BK-1   (gate for the whole epic)
  BK-216 Project channel ──> BK-215, epic BK-7
  BK-217 Mentions ──> BK-215, BK-209       (cross-epic: Notifications inbox)
  BK-218 Rich entity links ──> BK-215  ··> epics BK-13/BK-24/BK-30
  BK-219 Edit/delete ──> BK-215            BK-220 Search ──> BK-215

BK-224 Billing & Plans:  (epic ──> epic BK-1)
  BK-229 View plan/usage ──> BK-87
  BK-230 Upgrade ──> BK-229    BK-232 Limit warnings ──> BK-229
  BK-231 Invoices ──> BK-230   BK-233 Downgrade/cancel ──> BK-230
```

### 3.2 Home Dashboard cluster (BK-254) — seeded 2026-07-31

Six stories, no new entities — Home is a landing-page aggregation over Runs/Bugs/Coverage/Projects. Mockup already shipped (`home.jsx`, master-design-plan §4.2 — no §5 gate needed). Full dependency edges live as Jira `Dependencies`/`Relates` links (4 links, direction-verified); the two hard edges also appear in the main flat edge list above.

```
BK-254 Home Dashboard:
  BK-255 Welcome banner        ✅ SHIPPED 2026-08-04 — merged to staging via PR #120, ancestor-verified.
  BK-256 Active runs table     ✅ SHIPPED 2026-08-04 — merged to staging via PR #122, ancestor-verified.
  BK-257 Recent projects       ✅ SHIPPED 2026-08-04 — merged to staging via PR #121, ancestor-verified.
  BK-258 Open bugs summary     ✅ SHIPPED 2026-08-04 — merged to staging via PR #124, ancestor-verified.
  BK-259 Coverage summary      ✅ SHIPPED 2026-08-04 — merged to staging via PR #125, ancestor-verified.
  BK-260 Condensed activity    ✅ SHIPPED 2026-08-04 — merged to staging via PR #123, ancestor-verified.
```

**Open design question (not a dependency, flagged for a human):** the `home.jsx` mockup shows a "SPRINT 24-Q2 · DAY 7/10" eyebrow line implying a Sprint/iteration entity. No such entity exists in the schema or in `business-data-map.md`. BK-255 deliberately does not build it — see its Out of Scope field and the `## Gap` comment on BK-255.

---

## 4. Execution sprints

An **Execution Sprint (ES)** is a gate-released batch: a set of stories safely workable in parallel once the prior ES's gates are dev-done. ES are dependency-driven batches, **not** calendar sprints and **not** the strategy-layer Master Sprints in `master-implementation-plan.md`.

> This table is **regenerated from the live dependency graph each run** — it is a derived projection of §3 + current gate state, not a hand-frozen plan. Status words below ("shipped", "done this cycle") describe gate-release events, not live Jira status (query that via §6).

| Exec Sprint | Stories | Gate released by | Notes |
|-------------|---------|------------------|-------|
| **ES0 ✅** | BK-27 | — | Shipped → QA Approved. Released the whole ES1 fan-out. |
| **ES1 ✅ (fully drained)** | ✅ all shipped: BK-28, BK-22, BK-23, BK-32, BK-20, **BK-33 Test Tags** | BK-27 ✅ | ES1 fan-out drained — reorder/usage/duplicate/view + ATC Search + Test Tags all landed (most QA Approved; BK-22/BK-23 dev-merged, awaiting QA — staging deploy gap per BK-142, code IS on staging). BK-86 (Account) also shipped → QA Approved; BK-3 (OAuth) now AC-synced + parallel. |
| **ES1.5 ✅ (BK-87 dev-done)** | BK-87 (after BK-86 ✅) ; **BK-21 ✅ (shipped)** | BK-86 ✅ ; BK-27 ✅ | **BK-87 ✅ dev-done 2026-07-30** — stacked 2-PR split (git-flow-master decision tree, 830-line forecast): PR1 shell/nav/auth-guard/identity (#63) + PR2 workspace list (#64), both merged to staging; 1 review BLOCKER (member-count RLS undercount) fixed pre-merge. Ready For QA, assigned to shift-left QA owner. **BK-21 ✅ dev-done 2026-06-25** — 10 contract Qs ratified (ADR-0009) + OpenAPI drift fixed; merged to staging (PR #57) + edit-path unified (PR #58); Ready For QA. |
| **ES2 ✅ (shipped)** | BK-34 Start manual run | BK-27 ✅ | **Shipped → QA Approved** — released the Runs tail (BK-35/36/37/38/39). |
| **ES2.5** | BK-88, BK-89 (after BK-87) | BK-87 | BK-88 mockup ✅ 2026-07-30 (`settings-tokens.html`) — remaining gate: its own 9 Qs. **BK-89 promoted to RFD 2026-06-24** but open Dev contract (add `role` to `GET /workspaces` + active-workspace transport) — resolve before coding; mockup ✅ (`settings-workspaces.html`). |
| **ES3 ✅ (fully drained 2026-07-31)** | BK-36 ✅, BK-37 ✅, BK-39 ✅, BK-38 ✅, BK-35 ✅, BK-90 ✅ — all shipped, all merged to staging, all Ready For QA / Ready For Release | BK-34 ✅ ; BK-89 ✅ | Entire ES3 fan-out drained in a single 2026-07-31 batch (avalanche-style run). BK-39 was actually the oldest of the batch (PR #60, merged 2026-06-25) — the roadmap had simply never been updated to reflect it. All six confirmed genuine `git merge-base --is-ancestor` hits against `origin/staging`, not tracker-status inference. |
| **ES2.5 ✅ (drained 2026-07-31)** | BK-88 ✅ | BK-87 ✅ | PRs #68+#70 merged to staging. Ready For QA. Shipped with 4 PO Qs + 1 security Q unanswered in-thread (see settings-cluster note in §3) — flagged for QA/PO follow-up, not a re-open trigger. |
| **ES4 (epic BK-31 Bugs)** | BK-41 ✅, **BK-42 ✅ (shipped 2026-08-02)** — both dev-done, merged to staging, Ready For QA ; BK-43 — refinement genuinely resolved (comment 12069, 2026-08-01), still `Ready For Dev`, not yet claimed | BK-40 ✅ ; BK-41/BK-42 for their own downstream (none yet) | BK-42: PR #108 merged (`c2fb9722`, ancestor-verified), migration `0052_defect_heatmap_report.sql` applied 2026-08-02. Only BK-43 remains before epic BK-31 (Bugs & Defect Heatmap) is fully drained. |
| **ES4 (BK-44 Coverage)** | BK-45, BK-50 | BK-24 ✅, BK-30 ✅ — **the BK-31 gate is CORRECTED (2026-08-07): it was bookkeeping, not a functional edge** | ~~Hard-blocked regardless of refinement quality until epic BK-31 actually finishes (only BK-43 left).~~ **Overturned 2026-08-07.** Nothing BK-45 reads depends on BK-43 existing: the traceability mockup contains zero external-tracker fields (`grep -niE "jira\|external\|sync\|tracker"` over all 1048 lines of `traceability-chain.html` → no matches), §4.7's defect column is internal `bugs` identity only, and `0046_bugs.sql:94-115` has no sync column — BK-43 can only ADD columns, never change what BK-45 reads. Decisive precedent: **BK-46 (PR #93) and BK-47 (PR #98), same epic BK-44, both merged 2026-08-01 while BK-31 was undrained** (BK-42 merged 2026-08-02). This row gated only BK-45/BK-50 and never BK-46/BK-47 — applied inconsistently inside one epic. ~~**BK-45 claimed 2026-08-07.** BK-50 remains genuinely blocked on BK-45's response shape.~~ **Both halves corrected 2026-08-08.** BK-45 did not stop at "claimed" — it **SHIPPED** the same day: PR #142, merge commit `f75709e`, ancestor-verified against `origin/staging`. **BK-50's gate is therefore RELEASED**: the `GET /api/v1/projects/{id}/traceability` response shape it exports is live on staging, and `components/traceability/TraceabilityChainView.tsx:32-37` states in its own header that it deliberately omitted the Export button as BK-50's scope. BK-50 is no longer dependency-blocked by anything — it is deferred on **scope-growth** instead (see its §6 row). Epic BK-44 now has BK-48 (`Shift-Left QA`) and BK-50 left. |
| **ES5 (BK-208 Notifications, post-MVP)** | BK-209 (first-of-cluster, "free" per §3.1) ; BK-211/212/213 (blocked on BK-209) | none (BK-209) ; BK-209 (rest) | BK-209 is dependency-clear and has all its refinement questions genuinely *answered* in-thread, but its "PO Ratification — 2026-07-11" comment was posted 11 minutes *before* the actual Q&A content it claims to ratify, by a different account than the one that answered — a blanket 28-story batch delegation, not per-story human sign-off. Also 13 SP (advisory) and first-of-epic (new notification substrate, no prior schema to extend) — oversized for an unattended pick per the scope-growth check. Flagged conditional: needs an explicit human "go" before either an autonomous or interactive run claims it. |
| **ES-HOME (seeded 2026-07-31)** | BK-255, BK-256, BK-257 — no upstream edges in this graph; BK-260 — soft-coupled to BK-49 ✅ merged to origin/staging, ancestor-verified 2026-08-03 | none (BK-30's read data already dev-done in this graph) | New Home Dashboard epic (BK-254). All 4 of these stories are now ✅ **SHIPPED 2026-08-04** (PRs #120-123). |
| **ES-HOME-UNBLOCKED (2026-08-03), all SHIPPED 2026-08-04** | BK-258 ✅ PR #124; BK-259 ✅ PR #125; BK-260 ✅ PR #123 | — (dependency layer cleared, then all three shipped) | All 3 of BK-254's dependency-gated stories are now merged to `origin/staging`, ancestor-verified. Previously this doc under-reported BK-46/BK-49 as unmerged, then under-reported these three as still-Backlog after their gates cleared; corrected 2026-08-04 after a direct `git merge-base --is-ancestor` check. |

---

## 5. Mockup-gate registry (Critical Rule #15)

A story whose primary screen has no mockup **cannot start** until the mockup lands (or a spec-only departure is ratified in master-design-plan §5 + ADR).

> **2026-07-30 — ALL GATES LIFTED.** A 10-batch Open Design fleet (MCP-driven Mode A, design
> system `user:bunkai`) shipped mockups for every gated screen — MVP and post-MVP. Batches live at
> `.context/designs/bunkai-test-management-tool/bk-*/` with per-screen specs in master-design-plan
> §4.6–§4.15 and §8 rows pointing at the concrete files. **No story in this roadmap is
> mockup-blocked anymore.** The registry below is kept as the historical record + file index.

| Mockup (was gated) | Screen ref | Unblocked | Mockup files (batch folder) |
|---------------|-----------|--------|--------|
| ✅ **Settings** (Account · PATs · Workspaces) | §4.10 | BK-87, BK-88, BK-89, BK-90 | `bk-85-account-settings/` — 5 screens (hub/account, tokens, workspaces, account-menu overlay, coming-soon pattern) |
| ✅ **Test Runs index** | §4.8 | BK-37, BK-38 | `bk-30-test-runs-index/` — test-runs-index, test-run-history |
| ✅ **Metrics** | §4.7 | epic BK-44 | `bk-44-metrics-coverage/` — metrics-dashboard, traceability-chain |
| ✅ **Bug Reports** (+ BK-42 heatmap as List/Heatmap toggle) | §4.6 | epic BK-31 | `bk-31-bug-reports/` — bug-reports-index, bug-detail |
| ✅ **Global ATC Library** | §4.9 | nav-completion (BK-20 ref) | `bk-13-atc-library-global/` — atc-library-global |
| ✅ **Test Plans & Milestones** | §4.11 | BK-202..BK-207 | `bk-201-test-plans-milestones/` — 3 screens |
| ✅ **Automation & CI** | §4.12 | BK-225..BK-228 (BK-222/223 API-first, UI-light) | `bk-221-automation-ci/` — 1 screen + 3 extension crops |
| ✅ **Notifications** | §4.13 | BK-209..BK-214 | `bk-208-notifications/` — 3 screens (prefs extends Settings hub) |
| ✅ **Team Chat** | §4.14 | BK-215..BK-220 | `bk-210-team-chat/` — 4 screens |
| ✅ **Billing** | §4.15 | BK-229..BK-233 | `bk-224-billing/` — 5 screens (extends Settings hub) |

> Mockups with screens already drawn (`login.jsx`, `app.jsx`, `project.jsx`, `editor.jsx`, `run.jsx`, `home.jsx`) cover every ES1/ES2 story. Only remaining conscious design gap: **BK-5 Members** (Settings shows it as "coming soon" — design when its frontier approaches). Post-MVP stories stay `Backlog` by deliberate roadmap decision, not by mockup gate.

---

## 6. Live status — query it, never freeze it

> **Why there is no status table here.** Story status (`Ready For Dev`, `In Progress`, `QA Approved`, …) and story points live in **Jira**, which changes every day. Any table pasted here goes stale within days and then actively *lies* to whoever reads it. So this section is a **recipe, not a photo**: run one of the two queries below to get *today's* truth. The durable structure — which ticket unblocks which (§3), execution sprints (§4), mockup-gates (§5) — is safe to trust as written; only status is volatile.

**Recipe A — refresh the local PBI cache** (writes files under `.context/PBI/`, good for offline reading):

```bash
bun run jira:sync-issues        # READ package.json for the exact script before running
# then read .context/PBI/epic-tree.md  — the epic→story index with status per story
```

**Recipe B — one-shot live query** (Atlassian MCP, nothing written to disk):

```
project = BK AND sprint in openSprints() AND issuetype = Story ORDER BY rank ASC
```

Useful fields: `summary, status, assignee, customfield_10016` (story points). Then cross-reference each `BK-NN` against the §3 graph + §4 execution sprints to see what is *actually* workable now.

**To answer "what is next to work?"** — run Recipe B, then pick the highest-ranked story where ALL of these hold:
1. its §3 blocker is already dev-done (`QA Approved` / `In Test` / merged), AND
2. its §5 mockup-gate (if any) is cleared, AND
3. its pre-dev blockers below (if any) are resolved.

### Per-story pre-dev blockers — LOCAL knowledge (NOT a Jira field; will NOT appear in a §6 query)

These are gating questions / contract decisions captured during shift-left refinement. A story can read `Ready For Dev` in Jira while still blocked by one of these. Clear before starting dev:

| Story | Pre-dev blocker (resolve first) |
|-------|----------------------------------|
| BK-3  | ~~Sync AC field to the 10 refined ACs.~~ **DONE (2026-06-24)** — AC field synced. **BUT (found 2026-08-01)**: the 10 blocker-question answers (PO/Dev/Design, dated 5/26) are all headed "simulated for QA engineering practice" with no ratification comment since. AC-sync ≠ refinement-resolved. Still not autonomous-eligible. |
| BK-20 | ~~Status is literally **BLOCKED** (not a pre-dev question) — QA run 6/30 FAILED 23/24 TCs, defect BK-187 ("response shape wrong") open in traceability. Resolve the defect before this can move at all.~~ **Blocker RESOLVED 2026-08-06, recorded here 2026-08-08.** BK-187 was fixed and merged to `origin/staging` via **PR #140** (`fix/BK-187-atc-search-spec-correction`), merge commit `c0712e9`, ancestor-verified. The named defect no longer exists as an open gap in code. This row had outlived its own blocker by two days — BK-187 shipped but was never recorded anywhere in this document. **Before treating BK-20 as claimable, re-verify its live Jira status and whether the failed QA run was re-executed** — a fixed defect is not the same as a re-passed run. |
| BK-41 | ~~No PO/Dev comment ever posted after moving to Ready For Dev.~~ **RESOLVED + SHIPPED (2026-08-01)** — 6 Qs ratified (comment 12071: BK-40 dependency confirmed merged, no PAT scope gate, SECURITY INVOKER via existing RLS not a new DEFINER+actor-param RPC, keyset pagination, severity-then-recency sort, multi-select filters). Merged to staging as 3 stacked slices (PRs #101 DB / #103 API / #105 UI). Ready For QA, assigned jesusgpythondev. |
| BK-42 | ~~No PO/Dev comment ever posted.~~ **RESOLVED (2026-08-01), SHIPPED (2026-08-02)** — 11 Qs ratified (comment 12068), incl. one real correction (AC-11's 403 → 404 non-disclosure convention). Merged to staging (PR #108, `c2fb9722`), migration `0052_defect_heatmap_report.sql` applied. Ready For QA, assigned jesusgpythondev. |
| BK-43 | ~~8 unanswered Open Questions, self-contradicted readiness claim.~~ **RESOLVED (2026-08-01)** — actually 9 Qs (comment 12069): sync target confirmed Jira Cloud (already named in project context, not invented), create-only one-way sync, dedup via existing `external_id`. Refinement status READY, still Ready For Dev. |
| BK-209 | Blanket forward-dated batch ratification, not per-story sign-off. **RE-VERIFIED (2026-08-01, comment 12070)** — independent per-story re-check found the real gap was worse than first flagged (Q&A posted 5 days after the ratification comment, not 11 minutes; all 3 roles answered by the same account). Every prior answer independently re-affirmed or corrected on its own merits; one new RLS pattern recommended (`SECURITY INVOKER` + `recipient_user_id = auth.uid()`, no actor-bind class at all). Refinement status READY at 13 SP, still Backlog/post-MVP (not yet promoted to this sprint's frontier). |
| BK-43 | 8 unanswered HIGH/MEDIUM "Open Questions for PO/Dev" (integration mechanism, retry policy, deletion semantics, auth, dedup) — self-estimated 1 SP and self-declared "Next: Ready For Dev" without answering any of them. |
| BK-209 | All refinement questions are genuinely *answered*, but the "PO Ratification — 2026-07-11" comment was posted 11 minutes *before* the Q&A it claims to ratify, by a different Jira account than the one that answered — a blanket batch delegation, not per-story sign-off. 13 SP, first-of-epic (new notification substrate). Needs explicit human "go." |
| BK-88 (informational, already shipped) | 4 PO Qs (revoked-token visibility, confirmation copy, expiry display, clipboard fallback) + 1 security Q raised 6/10 were never answered before merge — only the privilege-escalation bug (BK-135) got fixed. Not a re-open trigger; flagged for a QA/PO follow-up pass. |
| BK-90 (informational, already shipped) | 6/10 refinement answers explicitly labeled "practice-exercise... not real confirmations"; a 7/31 03:07 "confirmed by PO" comment was self-reversed 4 minutes later by the same author. Shipped anyway. Not a re-open trigger; flagged for QA follow-up. |
| Design §8 | ~~Add screen rows for BK-35 / 36 / 37 / 39.~~ **Resolved (2026-06-20)** — master-design-plan §8 already has screen rows for BK-35/36/37/38/39 (lines ~276–280). No action. |

### Current Ready-For-Dev pool (as of 2026-08-03)

Live-queried directly against Jira (`acli jira workitem view` + `acli jira workitem comment list`
per story — **not** the `jira:sync-issues` PBI cache; that cache was independently found to
silently drop each story's newest comment during this pass, which would have wrongly read BK-42
and BK-43 as unresolved — see the discovery note below). This is the actual `Ready For Dev` set
across the epics touched by this pass, superseding any narrower framing above.

| Story | Refinement status | Notes |
|-------|-------------------|-------|
| ~~BK-42~~ | ✅ Resolved (comment 12068) | **SHIPPED 2026-08-02** — no longer Ready For Dev. PR #108 merged to staging (`c2fb9722`), migration `0052_defect_heatmap_report.sql` applied, Ready For QA. Left in this table only as the historical record of why it was picked; see the pre-dev-blocker table above and the escalation log for the full trail. |
| BK-43 | ✅ Resolved (comment 12069) | **2026-08-03 autonomous-delivery `story` run: considered, NOT claimed.** Dependency-clear and refinement-resolved, but the acceptance criteria imply a genuinely new architectural surface for this codebase — an outbound integration to an unnamed "external tracker" with automatic sync-on-file, retry-on-failure, and a sync-failed UI state; ~~no connector/webhook/retry pattern exists yet anywhere in this repo~~, and the target system isn't even named. This trips the scope-growth check (new architectural pattern, no reusable precedent) — deferred to a human-present `/sprint-development` session, not an unattended pick. **Rationale CORRECTED 2026-08-07 — the deferral stands, the stated reason was factually wrong.** A connector/retry pattern DOES exist: `lib/jira/client.ts` (166 lines; exponential backoff `[1000,2000,4000,8000,16000]` at `:79`, `Retry-After` honoring `:87-96`, typed `JiraAuthError`/`JiraError` `:32-43`), plus a real async-job architecture — `0019_import_jobs.sql` (+ `0020` one-active-job index), `lib/jira/import-runner.ts` (295 lines), request-triggered `after(() => runImportJob(...))` at `app/api/v1/imports/route.ts:79-84`. The target IS named (Jira Cloud, comment `12069`). **What is genuinely absent, and is why it stays deferred**: (1) no outbound **write** — the client exports only `searchIssues`, and its `POST` at `:134` is `POST /search/jql`, a read; (2) no **per-workspace** third-party credential model — today it is one global `ATLASSIAN_*` triple (`lib/env.ts:36-38`), and a multi-tenant TMS needs a new secrets model, which is a security posture and an ADR, not a story detail; (3) no `external_id`/`sync_status` on `bugs`; (4) no time-based retry primitive anywhere (no cron, no `pg_cron`, no `supabase/functions/` — the only async trigger is request-scoped `after()`). Also: comment `12069`'s "dedup via **existing** `external_id`" is wrong — `external_id` lives on `user_stories` (`0003_authoring.sql:20`, unique index `0016:22-24`), not on bugs. Comparable inbound sync BK-17 is ~1400-1500 lines and BK-43 needs strictly more, against a **1-point** estimate. |
| ~~BK-45~~ | ⚠️ **NOT resolved** — ***superseded, see the 2026-08-07 row below*** | ~~Only 2 comments total exist on the issue~~ (Benjamin Segovia's 2026-06-11 refinement + Ely's 2026-07-30 mockup note) — no ratification since. Quoting the 6/11 comment directly: *"Top blockers: (1) BK-24/BK-30/BK-31 still in Planificación — chain layers not sprintable yet. (2) 11 open PO/Dev questions in ATP DRAFT... @Ely please review open questions before sprint planning."* The AC field still carries 4 live `NEEDS PO/DEV CONFIRMATION` placeholders (empty-state copy, uncovered-indicator copy — none resolved). Do not autonomous-claim until a real ratification lands. Re-confirmed unresolved 2026-08-03. |
| ~~BK-50~~ | ~~Blocked on BK-45~~ | ~~Exports the chain BK-45 renders — no BK-45 branch exists yet (not started), so BK-50 is transitively blocked regardless of its own readiness. Re-confirmed 2026-08-03.~~ ***Superseded — see the 2026-08-08 row below.*** |
| **BK-50** | ⚠️ **Refinement resolved on paper; the ratified plan rests on infrastructure that does not exist** | **2026-08-08 autonomous-delivery `story` run: gate RELEASED, story DEFERRED on scope-growth.** The dependency block is genuinely gone — BK-45 merged `f75709e`, ancestor-verified — and the shift-left is real: comments `11047` (PO) and `11048` (Dev) answer all six blocking questions from `11044`. So this is neither dependency-blocked nor refinement-blocked. **It fails on as-built reality instead.** Comment `11047` chose "static HTML in Cloudflare R2 behind a no-login signed URL" and justified it with *"Cloudflare R2 already exists in our stack for file storage — no new infrastructure."* **That premise is false.** A recon of `origin/staging` found **no object storage in any form** — zero hits for R2, `@aws-sdk`, `S3Client`, presigned/`getSignedUrl`, `.storage.from(`, `@vercel/blob`; no storage SDK in `package.json`; no bucket DDL across all 68 migrations; no storage credentials in `.env.example` or `.env` — and **no export precedent whatsoever** (no CSV, no PDF lib, no `Content-Disposition`, no `@media print`, no download route, no share-link or token-gated public page). This is the identical failure shape to BK-43's 2026-08-01 ratification asserting a `secrets_ref` column that did not exist, superseded on 2026-08-05 by comment `12170`: **a ratification comment is not evidence about the codebase.** Building it as ratified needs (1) an R2 bucket plus access keys — **credentials an unattended run cannot provision, so it fails closed at the first credential step** (anti-pattern A13 forbids improvising one); (2) a new storage SDK and env vars across three Vercel scopes; (3) an `export_jobs` migration with RLS; (4) **the app's first anonymous data-access surface** — `middleware.ts:10-11` gates everything but `/login,/auth,/api/auth`, and `0068:318` explicitly revokes the traceability RPC from `public` and `anon`, so serving a full evidence chain to an anon caller is a new security posture, not the application of a ratified pattern; (5) cleanup cron where none exists (no `pg_cron`, no `supabase/functions`, no Vercel cron); (6) a server-side static-render path with no precedent, plus an ADR for both the storage choice and the anonymous-access model. **What DOES exist and is directly reusable**: the data source (`bunkai_report_story_traceability`, `0068:98-131`), the async-job pattern (`0019_import_jobs.sql`, `after()` at `app/api/v1/imports/route.ts:82`, atomic claim at `lib/jira/import-runner.ts:48-56` — though it has no retry and no scheduling), and the chain-rendering components. **Also unresolved in the ticket text**: AC Scenario E2 requires an unauthenticated link view be **rejected 403/404**, the exact opposite of ratified decision `11047` Q3 — a QA engineer building from the AC field would assert the wrong outcome. An attributed AI PO + AI Tech Lead ruling was published to the ticket by this run to settle the v1 scope and correct the R2 premise. **Needs a human-present session** for the credential provisioning and the anonymous-access posture regardless of how the scope ruling lands. |
| BK-188 | N/A — not a codeable story | "QA Engineering Support — Complete Summary (Jun 2026)" — a QA reporting/summary artifact misfiled as `Story` type, not a feature to implement. Excluded from candidate consideration 2026-08-03; flag for PM to re-type or close. |
| ~~BK-209~~ | ✅ Resolved (comment 12070) | **SHIPPED 2026-08-03** — merged to staging via PR #113 (`feat/BK-209-notifications-inbox`), ancestor-verified. No longer Ready For Dev (now Ready For QA). Was the gate for the whole BK-208 cluster (BK-211/212/213/214). |
| ~~BK-264~~ | N/A — created mid-sprint, no refinement phase | **SHIPPED 2026-08-03** — merged to staging via PR #114 (`feat/BK-264-defect-triage`), ancestor-verified. Unblocked BK-212. |
| BK-211 | ⚠️ **Genuinely NOT resolved** | BK-209 gate is now CLEARED (merged 2026-08-03), so this is dependency-unblocked — but its own refinement is not: the "PO Ratification — 2026-07-11" comment (11407, blank one-liner) precedes the actual Q&A (11408) — the forward-dated blanket pattern this doc already flags as category (b). Q3 explicitly states *"pending PO ratification (since 2026-07-17)... still awaiting PO sign-off"* — an open question, not resolved. Do not autonomous-claim. |
| ~~BK-212~~ | ✅ Resolved (comment 11407+ chain) | **SHIPPED 2026-08-04** — merged to staging via PR #115 (`feat/BK-212-bug-notifications`), ancestor-verified. §6 previously listed this PR as still `Open`/`In Review` (stale as of 2026-08-03); corrected. No longer Ready For Dev. |
| BK-213 | ✅ **Resolved as of 2026-08-04** | Was flagged "Genuinely NOT resolved" on 2026-08-03 (Q3 non-retroactivity fixture left open). Re-checked live 2026-08-04: a genuine Dev/QA close-out comment (Carlos, 7/18) has since landed, closing every raised question with concrete reasoning; the one leftover item (test-fixture non-retroactivity) is explicitly triaged as non-blocking, not hidden or disclaimed. Dependencies BK-209 ✅ and BK-87 ✅ both merged. No existing branch/PR. Mockup exists (`settings-notifications.html`). Dev's own comment calls it "self-contained CRUD, no new code" — passes the scope-growth check. **Claimed by the 2026-08-04 autonomous-delivery `story` run.** |
| ~~BK-213~~ | ✅ Resolved | **SHIPPED 2026-08-04** — merged to `origin/staging` via PR #127 (`feature/BK-213-notification-preferences`), merge commit `2e91ad95`, ancestor-verified 2026-08-05. Migration `0062_notification_preferences.sql` (new table + RLS) applied. No longer Ready For Dev (now Ready For QA, assigned to the shift-left QA owner). The row above recorded only the *claim*; this row records the *delivery* — the 2026-08-04 reconciliation PR #126 merged before #127 landed and never picked it up. |
| BK-211 | ⚠️ **Still NOT resolved** | Re-checked live 2026-08-04: BK-209 gate remains CLEARED, but Q3 ("pending PO ratification since 2026-07-17... still awaiting sign-off") is still open — no new comment since 2026-08-03. Also still hard-blocked: depends on BK-30 (Manual Execution & Runs), which remains in Planning with no real trigger to hook into yet. Do not autonomous-claim. |
| BK-211 | ⚠️ **Still NOT resolved (2026-08-05)** — but the *reason* is narrower than the row above says | Re-checked live 2026-08-05: Q3 ("QA-proposed, pending PO ratification since 2026-07-17") is **still open** — no ratifying comment has landed since; the only newer activity is the 2026-07-30 mockup link. That alone disqualifies it. **Correction to the row above**: the companion claim "hard-blocked on BK-30, still in Planning" is *stale bookkeeping, not a functional gate* — BK-30's child stories (BK-34/35/36/37/38/39) are all dev-done and ancestor-verified, and §3.1's own edge list for BK-211 names its real dependencies as BK-209 ✅, BK-39 ✅, BK-36 ✅ — all merged. The epic ticket's `Planning` status simply was never advanced. So BK-211 is **dependency-clear and refinement-blocked**, not dependency-blocked. Still: do not autonomous-claim until Q3 gets a real PO sign-off. |
| ~~BK-205~~ | ✅ **Superseded by delivery — the row below is stale** | **SHIPPED 2026-08-05** — merged to `origin/staging` via PR #132 (`feature/BK-205-milestones-create-with-target-date`), merge commit `5054716`, ancestor-verified 2026-08-06. Live status `Ready For QA`. **Timeline matters here, because the row below reads as a live refusal and is not one**: the 2026-08-05 `story` run escalated BK-205 at 18:40Z and ended; the code merged at 20:20Z the same evening from a *different, later session*. The escalation was overtaken by events, not overruled and not ignored. Its five evidence points were accurate when written — the fifth (`no milestones table exists at all`) is precisely what PR #132 changed. Keep the row below as the historical record of why an unattended run declined it; do not read it as current state. |
| ~~BK-188~~ | N/A — left the pool on its own | Re-checked live 2026-08-06: BK-188 is now type **`Tech Story`**, status **`Completed`**. The three prior runs' "misfiled `Story`, flag for PM to re-type or close" recommendation has been actioned. No longer a candidate, no longer needs flagging. |
| BK-205 | ⚠️ **NOT genuinely resolved — nominal Ready For Dev** | **Entered the live pool since the 2026-08-04 sync. Considered and NOT claimed by the 2026-08-05 autonomous-delivery `story` run**, on a 3-lens scored judge panel (2-1 against; the lone dissent addressed only *size*, and conceded the spec ambiguities in its own risk section). Dependency-clear (§3.1 marks it `──> (free)`), mockup exists (`milestones-board.html`), and the work itself is a normal-sized additive pick (~1.3-1.6x BK-213, one new table, dense reusable CRUD precedent in `0032_project_environments_crud.sql` + the environments UI). It fails on **refinement authenticity**, not scope: (1) the live description carries, twice, *"Treat every decision below as a strong starting draft, not a final sign-off — the real stakeholders should confirm or override **before Ready For Dev**"* — a precondition never met; the AC field is still headed "Shift-Left DRAFT" with two scenarios tagged *"DRAFT, pending real PO sign-off"*. (2) Comment `12163` raised blocker C1 saying it *"needs a real PO/Dev/Design decision before Ready For Dev... not AI inference"*; comment `12164`, same non-human author ~10 min later, closed it by exactly that inference, and the same account transitioned `Estimation -> Ready For Dev` 24 minutes after closing its own blocker. Last human (PO) touch: 2026-07-30. (3) C1's resolution is a **deliberate mockup departure** (ship without BK-206's attach-plans/readiness UI) with **zero §5 Divergences row and no ADR** — Critical Rule #15 requires that ratification *first*. (4) The cited backing artifact `shift-left-refinement.md` does not exist in the repo despite four citations. (5) The internal-whitespace ratification is justified as matching *"Backend's already-built `UNIQUE(project_id, lower(trim(name)))` index"* — verified live: **no `milestones` table exists at all**. Needs a human PO/Design ratification pass before any run claims it. |
| BK-211 | ✅ **RESOLVED as of 2026-08-06 — every row above is superseded** | **Claimed and delivered to PR by the 2026-08-06 autonomous-delivery `story` run.** Three prior runs excluded this story for "Q3 unratified since 2026-07-17". That is no longer true, and the reason it took three runs to notice is itself a finding — see the `ATLASSIAN_URL` note below. Q3 was ratified live on **2026-08-05 at 19:08Z / 19:27Z** (comments `12169` AI Product Owner, `12173` AI Tech Lead) — i.e. roughly 18 minutes *after* the 2026-08-05 run had already ended at 18:50Z. **That run's exclusion was therefore correct at the moment it was made**; the ratification simply landed later the same evening, from the same session that shipped BK-205. This run added `12196` (AI PO, Q3 re-ruled with a channel-aware predicate) and `12197`/`12198` (AI Tech Lead, buildability + the superseding cost). **The "hard-blocked on BK-30" claim is now falsified at code level, not merely called stale bookkeeping**: the terminal path is real and user-reachable — `RunnerView.tsx:583/597` -> `finish\|abort/route.ts` -> `bunkai_finish_run`/`bunkai_abort_run` -> `activity_log` `run.finished`/`run.aborted`, with 89 `run.finished` + 2 `run.aborted` rows live. Delivered as **PR #137**, review-clean (0 BLOCKER/MAJOR/MINOR/NIT), **deliberately NOT merged** — it stops at the migration gate (see below). |
| ~~BK-211~~ | ✅ **SHIPPED — the gate opened and a later session finished it** | **Reconciled 2026-08-07.** The row above is the last word of the 2026-08-06 run, which ended while the story was still gate-stopped; it reads as an unmerged PR and is no longer current. Reality: **PR #137 merged to `origin/staging` 2026-08-06T22:31:07Z**, merge commit `861c441`, branch `feature/BK-211-run-terminal-notifications` ancestor-verified with **0 commits ahead** and an empty diffstat. **Both migrations were applied and re-verified**: the live ledger carries `0066_run_event_notifications` (20260806222747) and `0067_run_finish_abort_via` (20260806222820), corroborated independently by Jira comment `12201`. Live status `Ready For QA`, assigned to the shift-left QA owner. **There is no half-shipped state** — the concern that the code could land without its schema did not materialize. What unblocked it was a policy change, not a workaround: the operator set `migrations: unrestricted` the same evening (PR #139), which covers the `CREATE OR REPLACE` rewrite `0067` needed. |
| **BK-45** | ✅ **CLAIMED 2026-08-07 — a 3-run deferral overturned on evidence** | **Claimed by the 2026-08-07 autonomous-delivery `story` run** after a 4-lens scored judge panel returned **A(claim)=293 / C(claim+gates)=210 / B(defer)=107** — A and C both mean claim, only B meant defer. All three premises of the standing "scope-growth" deferral failed: **(1) dependency** — the BK-31 gate is bookkeeping (see the ES4 row above; siblings BK-46/BK-47 already crossed it on 2026-08-01); **(2) size** — the 8-point estimate is stale by construction, because `out-of-scope.md` and `master-design-plan.md:244-245` put filtering in **BK-48** and export in **BK-50** on this same mockup file, so ~half of it is not BK-45's; its own surface is 6 render states, 7 ACs, **zero mutating actions, 1 additive migration, no new tables/columns, no new ADR**, projecting to ~1800-2600 insertions / 14-18 files — BK-46 scale (2287/16), the *bottom* of the measured 1900-4200 band; **(3) refinement** — the row above says "only 2 comments total exist"; **live Jira has 4**. Comments `12171` (AI Product Owner / BA) and `12176` (AI Tech Lead), both 2026-08-05, decide **all 11 open questions plus the 4 AC placeholders plus EC11**, none of them un-decidable-without-a-human. Shift-left genuinely ran (comment `11275`, 2026-06-11, 7 Gherkin scenarios + 23 test outlines, **no practice disclaimer**), and the blocker was open 6/11→8/05 — **55 days**, not the minutes-later self-ratification pattern that disqualified BK-205. |
| ~~**BK-45**~~ | ✅ **SHIPPED — the row above stops at "claimed" and is no longer current** | **Reconciled 2026-08-08.** The row above is the last word of the 2026-08-07 run as it stood mid-run; the story went on to merge the **same day**. **PR #142 merged 2026-08-07T19:10:05Z**, merge commit `f75709e`, branch `feature/BK-45-us-bug-traceability-chain`, `git merge-base --is-ancestor` verified against `origin/staging`. Migration **`0068_story_traceability_report.sql`** applied; live status **`QA Approved`**, assigned to the shift-left owner. Shipped surface: the `bunkai_report_story_traceability(p_actor_user_id, p_user_story_id)` RPC, `GET /api/v1/projects/{id}/traceability?story={id}`, and `components/traceability/TraceabilityChainView.tsx`. **Why the doc missed it**: the 2026-08-07 reconciliation PR #141 (`f59c095`) merged at 19:17Z — *seven minutes after* `f75709e` — but its content was authored before that merge and never picked it up. **This is the third occurrence of the same pattern** (BK-213 on 2026-08-04, BK-211 on 2026-08-06, BK-45 now): a run reconciles the roadmap, then ships a story, and the reconciliation it already cut under-reports its own run's outcome. **A run that both reconciles this doc and ships a story must write its roadmap commit LAST, or amend it after the story merges.** **Benign ledger anomaly to expect**: the live ledger holds two `0068` rows (`0068_story_traceability_report` and `..._v2`) against one file on disk, because the migration was applied twice; the final live definition matches the committed file, byte-diffed. A ledger-vs-disk audit will flag it — expected, not drift. |

**2026-08-03 run conclusion**: no story in the live Ready-For-Dev pool passed all eligibility gates (dependency-clear + genuinely refined + unclaimed + not oversized). Story-mode run ended empty — see run report.

**2026-08-04 run conclusion**: BK-213's refinement genuinely resolved since the prior day's check (see row above) — claimed and dispatched to `/sprint-development`. All other candidates unchanged from 2026-08-03 (BK-43 still deferred/scope-growth, BK-45/BK-211 still unresolved, BK-50 still transitively blocked, BK-188 still not a codeable story). **BK-213 subsequently merged to `origin/staging` via PR #127 the same day** — recorded in the table above on 2026-08-05, since PR #126 had already been cut when it landed.

**2026-08-05 run conclusion**: **empty run — no story claimed.** Live pool was 6 (BK-43, BK-45, BK-50, BK-188, BK-205, BK-211); all six dropped. BK-43 (scope-growth deferral, unchanged), BK-45 (11 open questions, unchanged), BK-50 (transitively blocked, unchanged), BK-188 (not a codeable story, unchanged), BK-211 (Q3 still unratified — though its BK-30 blocker claim was corrected as stale, see row above), and **BK-205** — the only new candidate — judged NOT eligible on refinement authenticity by a scored judge panel (see its row). The run's deliverable was this reconciliation instead. An empty run is the designed outcome when nothing is genuinely unblocked; the alternative would have been to build a story whose product decisions no human has ratified.

**2026-08-06 run conclusion**: **BK-211 claimed, built, and delivered to PR #137 — stopped at the migration gate, deliberately unmerged.** Live pool was 4, not 6: BK-188 has left it (now `Tech Story` / `Completed`) and BK-205 has shipped. Of the remaining four — BK-43 (scope-growth deferral, unchanged: a whole outbound-integration surface behind a 1-point estimate), BK-45 (scope-growth: 8 points, highest in the pool, a brand-new Traceability screen), BK-50 (**the one legitimate dependency block** — needs BK-45's assembled-chain response shape, and BK-45 has no merge commit on staging), BK-211 was selected.

Two things about this run are worth carrying forward, because they change how the previous three runs should be read:

1. **The governing rule changed between runs.** Commit `5125a9c` ("align decision authority with CLAUDE.md Rule #18") merged 2026-08-06 07:22 — *after* the 2026-08-05 run. Under the older rules an unratified product question was an escalation; under Rule #18 it is work to do. Several exclusions in the rows above were correct under the rules in force when written and would be decided rather than deferred today. ~~**BK-43 and BK-45 are NOT in that category** — they fail the scope-growth check, which Rule #18 does not override.~~ **Half of this is withdrawn (2026-08-07): BK-43 does fail the scope-growth check; BK-45 does not, and was claimed.** Rule #18 was never the reason BK-45 became eligible — the deferral simply rested on three premises that measurement contradicts (see its row above). The lesson worth carrying: a deferral repeated across runs acquires the *appearance* of a settled finding while nobody re-tests it. This one had been restated four times without anyone opening the mockup's `out-of-scope.md` or counting the live comments.
2. ~~**BK-211's delivery is gated on a migration, and the gate is doing its job.**~~ **Resolved the same evening — see BK-211's SHIPPED row above.** The paragraph below was accurate when written and is kept as the record of why the run stopped; it is not current state. Both migrations were applied 2026-08-06T22:27-22:28Z and PR #137 merged at 22:31Z, after the operator raised the policy to `migrations: unrestricted` (PR #139), which covers the `CREATE OR REPLACE` rewrite that `0067` required. Original text follows.
   **BK-211's delivery is gated on a migration, and the gate is doing its job.** The ratified suppression predicate (`12196`) needs the interactive-vs-automated session signal to reach the trigger. `principal.via` exists at the HTTP layer but does not reach the DB, and `runs.executor_mode` is not a usable proxy (it is stamped at run *start* and describes intent, not how the run was closed). So the story requires adding `p_via` to `bunkai_finish_run` and `bunkai_abort_run` — a **rewrite of two live `SECURITY DEFINER` functions**. `.agents/project.yaml` sets `migrations: autonomous`, which covers **additive DDL only** and still stops for drop/rename/rewrite. Both migration files (`0066_run_event_notifications.sql` additive, `0067_run_finish_abort_via.sql` rewrite) are written and committed; **neither is applied**. Applying only the additive one would leave the trigger reading a `via` nothing writes, silently breaking AC Scenario 5 — so nothing was applied at all, rather than half.

> **`ATLASSIAN_URL` — the defect that made three runs read a dead Jira, discovered 2026-08-06.** `.env:41` and `.agents/project.yaml:32` both correctly name `upexgalaxy71.atlassian.net`. The **shell environment** of these routine sessions carries a stale export pointing at the pre-migration `upexgalaxy69` instance, and Bun will not let `.env` override an already-set process var. So `bun run jira:sync-issues` silently rebuilt `.context/PBI/` from the **dead** instance, exit code 0, no warning. `acli` was never affected (it authenticates to site 71 independently) — which is exactly why live queries and comment posting always worked while the cache quietly rotted. Measured blast radius on BK-211: **3 cached comments vs 7 live**, and the 4 missing ones were the entire 2026-08-05 ratification set. Any run that had trusted the cache would have re-excluded BK-211 indefinitely. **Every sync must be prefixed** `ATLASSIAN_URL=https://upexgalaxy71.atlassian.net/ bun run jira:sync-issues ...` until the operator clears the stale export from the profile that launches these routines and restarts the session (`/jira-instance-migration` covers this class of change). **A future run finding the PBI cache disagreeing with live Jira should check this env var before concluding a ticket is unrefined.**

**2026-08-07 run conclusion**: **BK-45 claimed and dispatched — the pool's longest-standing deferral overturned.** Live pool was exactly **3** (BK-43 1pt, BK-45 8pt, BK-50 5pt); BK-211 has left it (shipped, `Ready For QA`). Nothing was in flight anywhere: **zero open PRs, zero unmerged branches carrying a BK key**, zero items `In Progress`. Of the three — **BK-43** stays deferred (architectural novelty plus a per-workspace-credential security posture; its stated rationale was factually wrong and is corrected in its row above), **BK-50** is the one genuine dependency block (it exports the chain BK-45 renders, and BK-45 is not yet on staging), and **BK-45 was selected** on a 4-lens panel — see its row.

Three things from this run change how the rows above should be read:

1. **A repeated deferral is not a verified one.** BK-45 was deferred four times on premises nobody re-tested: a dependency edge that its own sibling stories had already crossed, a point estimate that predated the carve-out of filters and export into BK-48/BK-50, and a "not resolved" verdict counted from 2 comments when live Jira had 4. Each restatement made the next one cheaper to write. **When a candidate is dropped for the same reason two runs running, the reason itself is what the next run should audit** — not the ticket.
2. **The step-0 actor bind in every report RPC is inert on the real call path, and this is a live finding, not a BK-45 detail.** All three shipped report RPCs open with `if auth.uid() is not null and auth.uid() <> p_actor_user_id then raise ... 'project_not_found'` (`0048:69-71`, `0049:161-162`, `0052:101-102`) — but the routes reach them through `createAdminClient()` (`app/api/v1/projects/[id]/coverage/route.ts:29`), so `auth.uid()` is NULL and the guard short-circuits, exactly as `0049:47-52` documents. **The most-copied line is the least protective one.** The load-bearing control is the per-CTE `project_id = p_project_id` predicate — per-query judgment, not mechanically copyable, and precisely what failed live in `0047`. Compounding it, **`project` is not an RLS boundary anywhere in this schema** (`0049:36-44`), so a missing predicate leaks across projects *inside* a workspace with no backstop. Every future report RPC inherits this; it belongs in ADR-0012's orbit, not in one story's plan.
3. **Two claims in the record were wrong and are corrected here.** The escalation log's 2026-08-06 assertion that ruleset `bypass_actors` is `null` and "nobody bypasses, admin or not" is false as read on 2026-08-07 — it is `[{actor_type: "OrganizationAdmin", bypass_mode: "always"}]`, and `current_user_can_bypass` is `"always"` for the automation account. And BK-43's "no connector/webhook/retry pattern exists yet anywhere in this repo" is false — `lib/jira/client.ts` plus `0019_import_jobs.sql` and `after()`-triggered `lib/jira/import-runner.ts` are exactly that pattern.

> **Ticket hygiene, surfaced not fixed (2026-08-07)**: BK-45 still carries **10 literal `NEEDS PO/DEV CONFIRMATION` strings** in its field text — 4 in Acceptance Criteria, 6 in the ATP — although comments `12171` and `12176` resolved every one of them on 2026-08-05. Not overwritten by this run: rewriting the AC field wholesale risks clobbering the 7 ratified Gherkin scenarios, and a field rewrite is a heavier act than the defect warrants. Flagged for whoever runs QA on it, so the stale placeholders are not mistaken for live gaps.
>
> This also puts a boundary on the "systemic shift-left gap" pattern flagged above. That pattern is real and BK-205's changelog evidence stands. But **BK-211 was not an instance of it** — its ratification genuinely existed and was simply invisible to the cache. Two different failures that produce the identical symptom ("story looks unratified"), and they need different fixes: one is a process question about who may close a shift-left blocker, the other is one stale environment variable.

**Discovery, not yet fixed**: `bun run jira:sync-issues get <KEY> --include-comments` calls
`GET /rest/api/3/issue/{key}/comment` with no pagination params and no ordering assumption bug
visible in the code, yet independently and reproducibly omitted the single newest comment on
BK-42, BK-43, and (checked for completeness) BK-41 — each confirmed present, `visibility: public`,
via a direct `acli jira workitem comment list --paginate --json` call moments later. Root cause not
diagnosed (out of scope for this pass); flagged here so nobody trusts "no comments since X" from the
local cache alone without a live cross-check, and a follow-up ticket should investigate
`fetchComments()` in `scripts/sync-jira-issues.ts`.

> **Systemic pattern flagged 2026-08-01, still recurring 2026-08-03** (see escalation log): a recurring shift-left gap — stories reach `Ready For Dev`/`Ready For QA` via either (a) explicitly-disclaimed "simulated/practice" refinement answers, or (b) a blanket forward-dated "AI-as-PO" ratification comment that precedes the actual Q&A it claims to cover, or (c) a self-reversed claim of PO confirmation with no independent human artifact behind it. This is not one story's problem — it hit BK-3, BK-41, BK-42, BK-43, BK-90, BK-209, and (2026-08-03) BK-211, BK-212, BK-213 independently. Worth a process-level look, not a per-ticket fix.
>
> **Still recurring 2026-08-05, and now with a measurable cost.** BK-205 is the clearest instance yet, because the self-ratification is visible in the changelog rather than only inferable: the same non-human account raised a blocker as *"needs a real PO/Dev/Design decision... not AI inference"*, closed it by inference ten minutes later, and transitioned the story `Estimation -> Ready For Dev` twenty-four minutes after that — with the story's own description still instructing that the real stakeholders confirm *"before Ready For Dev"*. The cost is no longer hypothetical: this pattern is now the **sole** reason the 2026-08-05 story run shipped nothing, since BK-205 was otherwise dependency-clear, mockup-ready and correctly sized. Each occurrence also quietly converts a *product* decision into an *implementation* one — BK-205's C1 ratifies a mockup departure that Critical Rule #15 says needs a §5 row plus an ADR first. The process fix (who is allowed to close a shift-left blocker, and what artifact proves it) is worth more than any single ticket it is currently costing.

### Edge-mapping TODO — stories seen on the board but not yet in the §3 graph

- **BK-98** "TMS-Projects | Tree / Table / Mind-map views in a hardened explorer" — lands the `EPIC-BK-008` "Views" surface as a story under BK-7; resolves part of the §2.1 ⚠️ "Views folded into BK-7" note in `master-implementation-plan.md`. Add a §3 edge if it gains downstream dependents.
- **BK-101** "🚀 TMS-Workspace | View the workspaces I belong to" — **Resolved (2026-06-20)**: BK-101 was a **duplicate** of BK-89 and has been **deleted from Jira** (user-confirmed). **BK-89 stands as the real story** — it keeps its ES2.5 edge, is not superseded. No further action.
- **BK-47** "TMS-Automation | Time-to-Green trend" — **found 2026-08-04, previously missing from this doc entirely.** ✅ SHIPPED — merged to `origin/staging` via PR #98 (aggregate of a slice chain on `feat/BK-47-...`), ancestor-verified. Add a §3 edge if it gains downstream dependents; none identified yet.
- **BK-266** "TMS-Projects | Projects index" — **found 2026-08-04, previously missing from this doc entirely.** ✅ SHIPPED — merged to `origin/staging` via PR #119, ancestor-verified. Add a §3 edge if it gains downstream dependents; none identified yet.
- **BK-147** "persistent app shell + route-driven workbench tabs" — **found 2026-08-05, previously missing from this doc entirely (zero mentions).** ✅ SHIPPED — merged to `origin/staging` via PR #43 (2026-06-19), ancestor-verified. Notable as a coverage gap because it is the shell every later workbench-tab story renders into (ADR-0003), so it is an implicit upstream of much of §3 without ever appearing as an edge.
- **BK-148** "Project Environments" — **found 2026-08-05, previously missing as its own entry.** ✅ SHIPPED — merged to `origin/staging` via PR #49 (2026-06-21), ancestor-verified. The doc referenced it only obliquely, inside BK-34's gate note at §4 ("env CRUD operates on the `project_environments` table"), and never gave it a shipped-status line of its own despite it being one of the earliest-shipped stories in the graph. Its `0032_project_environments_crud.sql` migration is now the reference precedent for per-project case-insensitive-unique-name CRUD (cited in BK-205's §6 row).
- **BK-265** "reach Runs, Bugs and Metrics from a project sub-nav" — **found 2026-08-05, previously missing from this doc entirely (zero mentions).** ✅ SHIPPED — merged to `origin/staging` via PR #118 (2026-08-04), ancestor-verified. Owns `project-sub-nav.tsx`, so any future story adding a project-scoped section (e.g. BK-205 Milestones, BK-202 Test Plans) extends its nav array — worth an edge once one of those is claimed.

---

**2026-08-08 run conclusion**: **empty run — no story claimed, and the pool is now structurally exhausted rather than merely blocked.** Live `Ready For Dev` pool is **2** (BK-43 1pt, BK-50 5pt); BK-45 has left it (shipped, `QA Approved`). Nothing was in flight anywhere: **zero open PRs, zero unmerged branches carrying a BK key**. The one `--no-merged` branch (`claude/gifted-visvesvaraya-422167`) holds a single commit that is a merge *of* staging into itself — no unique code, its BK-42 work shipped separately via PR #108. All 51 PRs merged in the last 10 days verify as ancestors of `origin/staging`, **including four (#94-#97) based on an internal chain branch rather than staging** — the exact shape the ancestry check exists to catch, and each one legitimately passed because its parent chain branch was itself merged. No tracker/git status lie this run.

Both remaining candidates were dropped, and the interesting fact is that they were dropped for **the same structural reason**:

1. **BK-43** — deferral stands, following the record rather than re-deriving it. Its own latest refinement (comments `12170` AI PO and `12177` AI Tech Lead, both 2026-08-05) concludes it is *"not implementable as written"* at 1 SP and must be split into BK-43a/b/c. **Those tickets do not exist**, and BK-43 was never moved off `Ready For Dev` after that verdict. The gap is ticket administration; inventing the split is not an unattended run's job.
2. **BK-50** — gate released, deferred on scope-growth. Its ratified plan assumes a Cloudflare R2 bucket that does not exist, and it needs the app's first anonymous data-access surface. Full evidence in its §6 row above.

**The systemic finding, which matters more than either ticket**: both remaining stories are external-integration work whose ratified plans assume credentials and infrastructure the repo does not have (BK-43: a per-workspace third-party secrets model; BK-50: object storage plus anonymous access). **An unattended run cannot provision a credential — it fails closed by design (A13) — so neither is deliverable by this routine at any point in the future, no matter how many times it fires.** Two consecutive story runs have now flagged shrinking supply; this one identifies the shape of the shortage rather than just its size. **Supply, not selection, is what empties this routine now.** Unsticking it needs one of: a human-present session to provision R2 credentials and rule on the anonymous-snapshot posture; `/product-management` materializing BK-43a/b/c; or `discovery` mode producing stories that build on existing infrastructure.

**A method note worth keeping**: this run's near-miss was the roadmap itself. It called BK-50 "blocked on BK-45" when BK-45 had merged the day before, and BK-50 was the only candidate whose gate had actually moved. **A roadmap that says "blocked" over shipped work is the error class that empties a run** — reconciling before selecting is not bookkeeping, it is what made the selection correct.

---

## 7. Maintenance protocol

- **Dependency edges (§2–§5)**: hand-maintained here. When a new story is refined, add its edge BEFORE it goes Ready For Dev.
- **Live status (§6)**: **never hand-maintained.** §6 is a query recipe, not a table. Do NOT paste status snapshots here — they rot in days. If someone needs status, they run Recipe A or B. The only hand-edited parts of §6 are the *local-only* lists (pre-dev blockers, edge-mapping TODO), which hold knowledge Jira does not store.
- **Cross-check against Jira issue-links** (validation, not authority): periodically diff §3 edge list vs Jira "blocks/is-blocked-by" links. **Local wins on structure** — Jira links are sparser and have no execution-sprint/mockup concept. Flag any Jira edge missing here, and any here missing in Jira (candidate to push up to Jira for traceability).
- **Relation to `/master-implementation-plan`** (decided 2026-06-19, do not re-litigate): that skill regenerates the epic-strategy layer (`master-implementation-plan.md`) from business-maps. It does NOT own this doc, and the two are **intentionally kept separate** — they consume different inputs (strategy ← business-maps; this doc ← Jira issue-links + local design context like mockup status), so one generator cannot produce both. Do not merge them. The two docs answer different questions: `master-implementation-plan.md` = "why this epic order" (strategy); this doc = "what ticket next + what unblocks it" (sequence).
- **Trigger to update**: a gate releases (story → dev-done), a new story enters refinement, a mockup lands (clears a 🔒), or a sprint closes.
