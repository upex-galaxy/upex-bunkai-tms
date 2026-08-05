# Dev Roadmap — Bunkai TMS (ticket-level dependency plan)

> **What this is**: the single source of truth for the **execution order of the dev backlog, driven by dependencies** — at Jira-ticket granularity (BK-NN), across every epic.
> **Last sync**: 2026-08-04 (autonomous-delivery `story` run audit — BK-212 reconciled: §6 wrongly still listed PR #115 as `Open`/`In Review`; it merged to `origin/staging` on 2026-08-04 and is ancestor-verified. BK-255/256/257/258/259/260 (Home Dashboard cluster) all merged to `origin/staging` today via PRs #120-125 — this doc previously listed them `Backlog`/gate-cleared-but-unclaimed; corrected below. BK-47 (Time-to-Green) and BK-266 (Projects index) were found merged to `origin/staging` [PR #98, PR #119] but had never been added to this doc at all — added as coverage gaps. BK-213 claimed this run — see §6. Carries forward the 2026-08-03 BK-46/BK-49 reconciliation, the 2026-08-02 BK-42 ship, the 2026-08-01 autonomous-delivery `story` run + interactive BK-41 delivery, and the 2026-07-31 surgical Home Dashboard epic BK-254 addition; rest of the graph not re-sorted end to end)
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
| **ES4 (BK-44 Coverage)** | BK-45, BK-50 | BK-24 ✅, BK-30 ✅, **BK-31 (NOT complete — BK-43 above is unmerged)** | Hard-blocked regardless of refinement quality until epic BK-31 actually finishes (only BK-43 left). |
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
| BK-20 | Status is literally **BLOCKED** (not a pre-dev question) — QA run 6/30 FAILED 23/24 TCs, defect BK-187 ("response shape wrong") open in traceability. Resolve the defect before this can move at all. |
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
| BK-43 | ✅ Resolved (comment 12069) | **2026-08-03 autonomous-delivery `story` run: considered, NOT claimed.** Dependency-clear and refinement-resolved, but the acceptance criteria imply a genuinely new architectural surface for this codebase — an outbound integration to an unnamed "external tracker" with automatic sync-on-file, retry-on-failure, and a sync-failed UI state; no connector/webhook/retry pattern exists yet anywhere in this repo, and the target system isn't even named. This trips the scope-growth check (new architectural pattern, no reusable precedent) — deferred to a human-present `/sprint-development` session, not an unattended pick. |
| BK-45 | ⚠️ **NOT resolved** | Only 2 comments total exist on the issue (Benjamin Segovia's 2026-06-11 refinement + Ely's 2026-07-30 mockup note) — no ratification since. Quoting the 6/11 comment directly: *"Top blockers: (1) BK-24/BK-30/BK-31 still in Planificación — chain layers not sprintable yet. (2) 11 open PO/Dev questions in ATP DRAFT... @Ely please review open questions before sprint planning."* The AC field still carries 4 live `NEEDS PO/DEV CONFIRMATION` placeholders (empty-state copy, uncovered-indicator copy — none resolved). Do not autonomous-claim until a real ratification lands. Re-confirmed unresolved 2026-08-03. |
| BK-50 | Blocked on BK-45 | Exports the chain BK-45 renders — no BK-45 branch exists yet (not started), so BK-50 is transitively blocked regardless of its own readiness. Re-confirmed 2026-08-03. |
| BK-188 | N/A — not a codeable story | "QA Engineering Support — Complete Summary (Jun 2026)" — a QA reporting/summary artifact misfiled as `Story` type, not a feature to implement. Excluded from candidate consideration 2026-08-03; flag for PM to re-type or close. |
| ~~BK-209~~ | ✅ Resolved (comment 12070) | **SHIPPED 2026-08-03** — merged to staging via PR #113 (`feat/BK-209-notifications-inbox`), ancestor-verified. No longer Ready For Dev (now Ready For QA). Was the gate for the whole BK-208 cluster (BK-211/212/213/214). |
| ~~BK-264~~ | N/A — created mid-sprint, no refinement phase | **SHIPPED 2026-08-03** — merged to staging via PR #114 (`feat/BK-264-defect-triage`), ancestor-verified. Unblocked BK-212. |
| BK-211 | ⚠️ **Genuinely NOT resolved** | BK-209 gate is now CLEARED (merged 2026-08-03), so this is dependency-unblocked — but its own refinement is not: the "PO Ratification — 2026-07-11" comment (11407, blank one-liner) precedes the actual Q&A (11408) — the forward-dated blanket pattern this doc already flags as category (b). Q3 explicitly states *"pending PO ratification (since 2026-07-17)... still awaiting PO sign-off"* — an open question, not resolved. Do not autonomous-claim. |
| ~~BK-212~~ | ✅ Resolved (comment 11407+ chain) | **SHIPPED 2026-08-04** — merged to staging via PR #115 (`feat/BK-212-bug-notifications`), ancestor-verified. §6 previously listed this PR as still `Open`/`In Review` (stale as of 2026-08-03); corrected. No longer Ready For Dev. |
| BK-213 | ✅ **Resolved as of 2026-08-04** | Was flagged "Genuinely NOT resolved" on 2026-08-03 (Q3 non-retroactivity fixture left open). Re-checked live 2026-08-04: a genuine Dev/QA close-out comment (Carlos, 7/18) has since landed, closing every raised question with concrete reasoning; the one leftover item (test-fixture non-retroactivity) is explicitly triaged as non-blocking, not hidden or disclaimed. Dependencies BK-209 ✅ and BK-87 ✅ both merged. No existing branch/PR. Mockup exists (`settings-notifications.html`). Dev's own comment calls it "self-contained CRUD, no new code" — passes the scope-growth check. **Claimed by the 2026-08-04 autonomous-delivery `story` run.** |
| BK-211 | ⚠️ **Still NOT resolved** | Re-checked live 2026-08-04: BK-209 gate remains CLEARED, but Q3 ("pending PO ratification since 2026-07-17... still awaiting sign-off") is still open — no new comment since 2026-08-03. Also still hard-blocked: depends on BK-30 (Manual Execution & Runs), which remains in Planning with no real trigger to hook into yet. Do not autonomous-claim. |

**2026-08-03 run conclusion**: no story in the live Ready-For-Dev pool passed all eligibility gates (dependency-clear + genuinely refined + unclaimed + not oversized). Story-mode run ended empty — see run report.

**2026-08-04 run conclusion**: BK-213's refinement genuinely resolved since the prior day's check (see row above) — claimed and dispatched to `/sprint-development`. All other candidates unchanged from 2026-08-03 (BK-43 still deferred/scope-growth, BK-45/BK-211 still unresolved, BK-50 still transitively blocked, BK-188 still not a codeable story).

**Discovery, not yet fixed**: `bun run jira:sync-issues get <KEY> --include-comments` calls
`GET /rest/api/3/issue/{key}/comment` with no pagination params and no ordering assumption bug
visible in the code, yet independently and reproducibly omitted the single newest comment on
BK-42, BK-43, and (checked for completeness) BK-41 — each confirmed present, `visibility: public`,
via a direct `acli jira workitem comment list --paginate --json` call moments later. Root cause not
diagnosed (out of scope for this pass); flagged here so nobody trusts "no comments since X" from the
local cache alone without a live cross-check, and a follow-up ticket should investigate
`fetchComments()` in `scripts/sync-jira-issues.ts`.

> **Systemic pattern flagged 2026-08-01, still recurring 2026-08-03** (see escalation log): a recurring shift-left gap — stories reach `Ready For Dev`/`Ready For QA` via either (a) explicitly-disclaimed "simulated/practice" refinement answers, or (b) a blanket forward-dated "AI-as-PO" ratification comment that precedes the actual Q&A it claims to cover, or (c) a self-reversed claim of PO confirmation with no independent human artifact behind it. This is not one story's problem — it hit BK-3, BK-41, BK-42, BK-43, BK-90, BK-209, and (2026-08-03) BK-211, BK-212, BK-213 independently. Worth a process-level look, not a per-ticket fix.

### Edge-mapping TODO — stories seen on the board but not yet in the §3 graph

- **BK-98** "TMS-Projects | Tree / Table / Mind-map views in a hardened explorer" — lands the `EPIC-BK-008` "Views" surface as a story under BK-7; resolves part of the §2.1 ⚠️ "Views folded into BK-7" note in `master-implementation-plan.md`. Add a §3 edge if it gains downstream dependents.
- **BK-101** "🚀 TMS-Workspace | View the workspaces I belong to" — **Resolved (2026-06-20)**: BK-101 was a **duplicate** of BK-89 and has been **deleted from Jira** (user-confirmed). **BK-89 stands as the real story** — it keeps its ES2.5 edge, is not superseded. No further action.
- **BK-47** "TMS-Automation | Time-to-Green trend" — **found 2026-08-04, previously missing from this doc entirely.** ✅ SHIPPED — merged to `origin/staging` via PR #98 (aggregate of a slice chain on `feat/BK-47-...`), ancestor-verified. Add a §3 edge if it gains downstream dependents; none identified yet.
- **BK-266** "TMS-Projects | Projects index" — **found 2026-08-04, previously missing from this doc entirely.** ✅ SHIPPED — merged to `origin/staging` via PR #119, ancestor-verified. Add a §3 edge if it gains downstream dependents; none identified yet.

---

## 7. Maintenance protocol

- **Dependency edges (§2–§5)**: hand-maintained here. When a new story is refined, add its edge BEFORE it goes Ready For Dev.
- **Live status (§6)**: **never hand-maintained.** §6 is a query recipe, not a table. Do NOT paste status snapshots here — they rot in days. If someone needs status, they run Recipe A or B. The only hand-edited parts of §6 are the *local-only* lists (pre-dev blockers, edge-mapping TODO), which hold knowledge Jira does not store.
- **Cross-check against Jira issue-links** (validation, not authority): periodically diff §3 edge list vs Jira "blocks/is-blocked-by" links. **Local wins on structure** — Jira links are sparser and have no execution-sprint/mockup concept. Flag any Jira edge missing here, and any here missing in Jira (candidate to push up to Jira for traceability).
- **Relation to `/master-implementation-plan`** (decided 2026-06-19, do not re-litigate): that skill regenerates the epic-strategy layer (`master-implementation-plan.md`) from business-maps. It does NOT own this doc, and the two are **intentionally kept separate** — they consume different inputs (strategy ← business-maps; this doc ← Jira issue-links + local design context like mockup status), so one generator cannot produce both. Do not merge them. The two docs answer different questions: `master-implementation-plan.md` = "why this epic order" (strategy); this doc = "what ticket next + what unblocks it" (sequence).
- **Trigger to update**: a gate releases (story → dev-done), a new story enters refinement, a mockup lands (clears a 🔒), or a sprint closes.
